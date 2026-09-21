import { Injectable } from '@nestjs/common';
import {
  GameState,
  NS,
  PlayerView,
  RaceResultView,
  SoundKey,
  UndoEntry,
  Uuid,
} from '@cue/shared';
import { Namespace, Socket } from 'socket.io';
import { BuzzerService } from '../buzzer/buzzer.service';
import { projectAdmin, projectPlayer, projectTv } from '../game/engine/projections';
import { PresenceService } from './presence.service';

export interface PublishInput {
  gameId: Uuid;
  state: GameState;
  seq: number;
  sounds: SoundKey[];
  undoStack: UndoEntry[];
  joinUrl: string;
  spareQuestions: number;
}

/**
 * Jedno miejsce, w którym stan zamienia się w trzy różne widoki.
 * Każda rola dostaje własną projekcję — TV nigdy nie zobaczy tekstu
 * nieodsłoniętej odpowiedzi, nawet jeśli ktoś podsłuchuje WebSocket.
 */
@Injectable()
export class BroadcastService {
  private namespaces = new Map<string, Namespace>();
  private lastPublish: PublishInput | null = null;
  private readonly lastRaceByTeam = new Map<Uuid, PlayerView['lastRace']>();

  constructor(
    private readonly presence: PresenceService,
    private readonly buzzer: BuzzerService,
  ) {}

  register(name: string, namespace: Namespace): void {
    this.namespaces.set(name, namespace);
  }

  publish(input: PublishInput): void {
    this.lastPublish = input;
    void this.buzzer.syncWithState(input.gameId, input.state);

    const ctx = this.contextOf(input);
    this.namespaces.get(NS.TV)?.emit('tv:state', {
      seq: input.seq,
      view: projectTv(input.state, ctx),
      sounds: input.sounds,
    });
    this.namespaces.get(NS.ADMIN)?.emit('admin:state', {
      seq: input.seq,
      view: projectAdmin(input.state, ctx),
      sounds: input.sounds,
    });
    this.publishPlayers(input);
  }

  /** Każdy telefon dostaje własny widok — stan grzybka zależy od drużyny. */
  private publishPlayers(input: PublishInput): void {
    const players = this.namespaces.get(NS.PLAY);
    if (!players) return;

    for (const [, socket] of players.sockets) {
      const teamId = socket.data.teamId as Uuid | undefined;
      if (!teamId) continue;
      const view = this.playerView(input, teamId);
      socket.emit('play:state', { seq: input.seq, view, sounds: [] });
      socket.emit('play:buzzer', {
        raceId: view.raceId,
        armed: view.armed,
        reason: view.armedReason,
        openedAt: input.state.question?.race?.openedAt ?? null,
      });
    }
  }

  tvView(input: PublishInput) {
    return projectTv(input.state, this.contextOf(input));
  }

  adminView(input: PublishInput) {
    return projectAdmin(input.state, this.contextOf(input));
  }

  playerView(input: PublishInput, teamId: Uuid): PlayerView {
    const raceId = input.state.question?.race?.id ?? null;
    return projectPlayer(input.state, {
      ...this.contextOf(input),
      teamId,
      pressedInRace: this.buzzer.hasPressed(teamId, raceId),
      lockedOut: this.buzzer.isLockedOut(teamId),
      clockReady: this.buzzer.clockReady(teamId),
      lastRace: this.lastRaceByTeam.get(teamId) ?? null,
    });
  }

  private contextOf(input: PublishInput) {
    return {
      seq: input.seq,
      gameId: input.gameId,
      presence: this.presence.snapshot(input.state.teams.map((t) => t.id)),
      undoStack: input.undoStack,
      joinUrl: input.joinUrl,
      spareQuestions: input.spareQuestions,
    };
  }

  /** Wynik wyścigu: adminowi z milisekundami do rozstrzygania sporów, graczom skrótowo. */
  raceResult(result: RaceResultView): void {
    this.namespaces.get(NS.ADMIN)?.emit('admin:race', result);

    const winnerName = result.presses.find((p) => p.teamId === result.winnerTeamId)?.teamName ?? '';
    const players = this.namespaces.get(NS.PLAY);
    if (!players) return;

    for (const [, socket] of players.sockets) {
      const teamId = socket.data.teamId as Uuid | undefined;
      if (!teamId) continue;
      const payload = {
        raceId: result.raceId,
        won: result.winnerTeamId === teamId,
        winnerTeamName: winnerName,
      };
      this.lastRaceByTeam.set(teamId, payload);
      socket.emit('play:race-result', payload);
    }
  }

  /** Dźwięk bez zmiany stanu — np. gdy admin kliknie już odsłoniętą odpowiedź. */
  sound(keys: SoundKey[]): void {
    this.namespaces.get(NS.TV)?.emit('tv:sound', { keys });
  }

  evict(socket: Socket, reason: string): void {
    socket.emit('play:evicted', { reason });
    socket.disconnect(true);
  }

  /** Snapshot dla klienta, który właśnie się podłączył albo wrócił po przerwie. */
  latest(): PublishInput | null {
    return this.lastPublish;
  }
}
