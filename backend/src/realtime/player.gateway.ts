import { Logger, UseFilters } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import {
  Ack,
  BuzzReq,
  ClockReportReq,
  ClockSyncReq,
  ClockSyncRes,
  NS,
  PlayJoinReq,
  PlayJoinRes,
  PlayerView,
} from '@cue/shared';
import { Namespace, Socket } from 'socket.io';
import { ClockSyncService } from '../buzzer/clock-sync.service';
import { BuzzerService } from '../buzzer/buzzer.service';
import { WsExceptionFilter } from '../common/filters/ws-exception.filter';
import { GameActionError, GameService } from '../game/game.service';
import { BroadcastService } from './broadcast.service';
import { PresenceService } from './presence.service';

@UseFilters(WsExceptionFilter)
@WebSocketGateway({ namespace: NS.PLAY, cors: { origin: true } })
export class PlayerGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('PlayerGateway');

  constructor(
    private readonly games: GameService,
    private readonly broadcast: BroadcastService,
    private readonly buzzer: BuzzerService,
    private readonly clocks: ClockSyncService,
    private readonly presence: PresenceService,
  ) {}

  afterInit(namespace: Namespace): void {
    this.broadcast.register(NS.PLAY, namespace);
    this.logger.log('Namespace /play gotowy');
  }

  async handleConnection(socket: Socket): Promise<void> {
    const deviceToken = socket.handshake.auth?.deviceToken as string | undefined;
    if (!deviceToken) return;

    const team = await this.games.teamByToken(deviceToken).catch(() => null);
    if (!team) return;
    await this.attach(socket, team.id, deviceToken);
  }

  handleDisconnect(socket: Socket): void {
    const teamId = socket.data.teamId as string | undefined;
    if (!teamId) return;
    this.presence.disconnect(teamId, socket.id);
    // Kropka obecności na TV i u admina musi zgasnąć od razu, a nie przy
    // najbliższej akcji — prowadzący podejmuje decyzje właśnie na jej podstawie.
    void this.republish();
  }

  /**
   * Obecność nie jest częścią stanu gry, więc jej zmiana nie wywołuje broadcastu
   * sama z siebie. Po podłączeniu i rozłączeniu telefonu rozsyłamy stan ręcznie.
   */
  private async republish(): Promise<void> {
    const input = await this.games.publishInput().catch(() => null);
    if (input) this.broadcast.publish(input);
  }

  /**
   * Wejście do gry albo powrót po reconnekcie. Drużyna ma dokładnie jeden
   * aktywny telefon — drugi z tym samym tokenem eksmituje pierwszy, bo dwa
   * grzybki jednej drużyny to podwójna szansa w wyścigu.
   */
  @SubscribeMessage('play:join')
  async join(@MessageBody() req: PlayJoinReq, @ConnectedSocket() socket: Socket): Promise<Ack<PlayJoinRes>> {
    const deviceToken = (socket.handshake.auth?.deviceToken as string | undefined) ?? undefined;
    try {
      const result = await this.games.joinTeam(deviceToken, req.teamName);
      const view = await this.attach(socket, result.teamId, result.deviceToken);
      return {
        ok: true,
        seq: result.seq,
        data: { teamId: result.teamId, deviceToken: result.deviceToken, view, seq: result.seq },
      };
    } catch (error) {
      if (error instanceof GameActionError) return { ok: false, code: error.code, error: error.message };
      throw error;
    }
  }

  @SubscribeMessage('play:rename')
  async rename(@MessageBody() req: { name: string }, @ConnectedSocket() socket: Socket): Promise<Ack> {
    const teamId = socket.data.teamId as string | undefined;
    if (!teamId) return { ok: false, code: 'UNAUTHORIZED', error: 'Najpierw dołącz do gry' };
    try {
      const result = await this.games.apply({
        type: 'TEAM_RENAME',
        at: Date.now(),
        actor: 'player',
        actorId: teamId,
        payload: { teamId, name: req.name },
      });
      return { ok: true, seq: result.seq };
    } catch (error) {
      if (error instanceof GameActionError) return { ok: false, code: error.code, error: error.message };
      throw error;
    }
  }

  /**
   * Naciśnięcie grzybka. Znacznik czasu pochodzi z telefonu (pointerdown), więc
   * zajęty wątek renderowania nie zakłamuje pomiaru; serwer przelicza go na swoją
   * oś przez zgłoszony offset i dopiero wtedy porównuje zawodników.
   */
  @SubscribeMessage('play:buzz')
  async buzz(@MessageBody() req: BuzzReq, @ConnectedSocket() socket: Socket): Promise<Ack> {
    const teamId = socket.data.teamId as string | undefined;
    const teamName = (socket.data.teamName as string | undefined) ?? '';
    if (!teamId) return { ok: false, code: 'UNAUTHORIZED', error: 'Najpierw dołącz do gry' };

    this.presence.touch(teamId);
    const result = await this.buzzer.press({
      teamId,
      teamName,
      raceId: req.raceId,
      clientTs: req.clientTs,
      offsetMs: req.offsetMs,
      rttMs: req.rttMs,
    });

    if (!result.ok) return { ok: false, code: result.code, error: result.error };
    return { ok: true, seq: 0 };
  }

  /** Echo czasu serwera — telefon liczy z tego offset metodą NTP-lite. */
  @SubscribeMessage('clock:sync')
  sync(@MessageBody() req: ClockSyncReq): Ack<ClockSyncRes> {
    return { ok: true, seq: 0, data: { t0: req.t0, t1: Date.now() } };
  }

  @SubscribeMessage('clock:report')
  report(@MessageBody() req: ClockReportReq, @ConnectedSocket() socket: Socket): Ack {
    const teamId = socket.data.teamId as string | undefined;
    if (!teamId) return { ok: false, code: 'UNAUTHORIZED', error: 'Najpierw dołącz do gry' };
    const { drifted } = this.clocks.report(teamId, req.offsetMs, req.rttMs, req.stdDevMs);
    // Skok zegara (telefon spał) unieważnia estymatę — prosimy o świeży pomiar.
    if (drifted) socket.emit('play:sync-request');
    return { ok: true, seq: 0 };
  }

  @SubscribeMessage('play:resync')
  async resync(@ConnectedSocket() socket: Socket): Promise<Ack<{ view: PlayerView }>> {
    const teamId = socket.data.teamId as string | undefined;
    if (!teamId) return { ok: false, code: 'UNAUTHORIZED', error: 'Najpierw dołącz do gry' };
    const input = await this.games.publishInput();
    return { ok: true, seq: input.seq, data: { view: this.broadcast.playerView(input, teamId) } };
  }

  private async attach(socket: Socket, teamId: string, deviceToken: string): Promise<PlayerView> {
    const previous = this.presence.socketOf(teamId);
    if (previous && previous !== socket.id) {
      const old = socket.nsp.sockets.get(previous);
      if (old) this.broadcast.evict(old, 'Drużyna została przejęta przez inne urządzenie');
    }

    const input = await this.games.publishInput();
    const team = input.state.teams.find((t) => t.id === teamId);
    socket.data.teamId = teamId;
    socket.data.teamName = team?.name ?? '';
    socket.data.deviceToken = deviceToken;
    socket.join(`team:${teamId}`);
    this.presence.connect(teamId, socket.id);

    const view = this.broadcast.playerView(input, teamId);
    socket.emit('play:state', { seq: input.seq, view, sounds: [] });
    // Pomiary zegara sprzed dołączenia nie mają do czego przypisać drużyny,
    // więc prosimy o świeże — inaczej grzybek zostałby zablokowany na „synchronizację".
    socket.emit('play:sync-request');
    socket.emit('play:buzzer', {
      raceId: view.raceId,
      armed: view.armed,
      reason: view.armedReason,
      openedAt: input.state.question?.race?.openedAt ?? null,
    });
    await this.republish();
    return view;
  }
}
