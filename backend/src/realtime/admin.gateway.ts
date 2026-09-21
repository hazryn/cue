import { Logger, UseFilters } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Ack, AdminActionReq, AdminView, GameEvent, NS } from '@cue/shared';
import { Namespace, Socket } from 'socket.io';
import { randomUUID } from 'node:crypto';
import { AuthService } from '../auth/auth.service';
import { WsExceptionFilter } from '../common/filters/ws-exception.filter';
import { GameActionError, GameService } from '../game/game.service';
import { BroadcastService } from './broadcast.service';

@UseFilters(WsExceptionFilter)
@WebSocketGateway({ namespace: NS.ADMIN, cors: { origin: true } })
export class AdminGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger('AdminGateway');
  /** clientOpId → seq: podwójny tap na telefonie nie może wykonać akcji dwa razy */
  private readonly recentOps = new Map<string, number>();

  constructor(
    private readonly games: GameService,
    private readonly broadcast: BroadcastService,
    private readonly auth: AuthService,
  ) {}

  afterInit(namespace: Namespace): void {
    this.broadcast.register(NS.ADMIN, namespace);
    // Odrzucenie przed zdarzeniem connection — nieautoryzowany socket nigdy nie
    // wchodzi do namespace'u, więc nie zobaczy nawet jednego broadcastu.
    namespace.use((socket, next) => {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!this.auth.verify(token)) return next(new Error('UNAUTHORIZED'));
      socket.data.role = 'admin';
      next();
    });
    this.logger.log('Namespace /admin gotowy');
  }

  async handleConnection(socket: Socket): Promise<void> {
    const input = await this.games.publishInput().catch(() => null);
    if (input) socket.emit('admin:state', { seq: input.seq, view: this.broadcast.adminView(input), serverTime: Date.now(), sounds: [] });
  }

  @SubscribeMessage('admin:action')
  async action(@MessageBody() req: AdminActionReq, @ConnectedSocket() socket: Socket): Promise<Ack> {
    if (socket.data.role !== 'admin') return { ok: false, code: 'UNAUTHORIZED', error: 'Brak uprawnień' };

    const cached = this.recentOps.get(req.clientOpId);
    if (cached !== undefined) return { ok: true, seq: cached };

    try {
      const event = {
        type: req.type,
        at: Date.now(),
        actor: 'admin',
        payload: await this.buildPayload(req),
      } as GameEvent;

      const result = await this.games.apply(event, req.expectedSeq);
      this.recentOps.set(req.clientOpId, result.seq);
      setTimeout(() => this.recentOps.delete(req.clientOpId), 30_000).unref();
      return { ok: true, seq: result.seq };
    } catch (error) {
      if (error instanceof GameActionError) {
        // Kliknięcie w odsłoniętą odpowiedź nie jest błędem admina ani X-em —
        // to sygnał „to już mamy", więc TV ma o tym zabrzęczeć.
        if (error.code === 'ALREADY_REVEALED') this.broadcast.sound(['already_revealed']);
        return { ok: false, code: error.code, error: error.message };
      }
      throw error;
    }
  }

  @SubscribeMessage('admin:undo')
  async undo(@MessageBody() req: { expectedSeq: number }): Promise<Ack> {
    try {
      const result = await this.games.undo(req.expectedSeq);
      return { ok: true, seq: result.seq };
    } catch (error) {
      if (error instanceof GameActionError) return { ok: false, code: error.code, error: error.message };
      throw error;
    }
  }

  @SubscribeMessage('admin:resync')
  async resync(): Promise<Ack<{ view: AdminView }>> {
    const input = await this.games.publishInput();
    return { ok: true, seq: input.seq, data: { view: this.broadcast.adminView(input) } };
  }

  /**
   * Dopełnienie payloadu po stronie serwera: identyfikator wyścigu nadaje serwer
   * (żeby dwa urządzenia admina nie utworzyły dwóch), a podmiana pytania dobiera
   * zapasowe pytanie razem z jego zamrożoną treścią.
   */
  private async buildPayload(req: AdminActionReq): Promise<Record<string, unknown>> {
    const payload = { ...(req.payload ?? {}) };
    if (req.type === 'ADMIN_OPEN_RACE' && !payload.raceId) payload.raceId = randomUUID();
    if (req.type === 'ADMIN_SKIP_QUESTION' && !payload.question) {
      return { ...payload, ...(await this.games.prepareSkipPayload()) };
    }
    if (req.type === 'ADMIN_START_FINAL' && Array.isArray(payload.questionIds)) {
      return { ...payload, questions: await this.games.freezeQuestions(payload.questionIds as string[]) };
    }
    return payload;
  }
}
