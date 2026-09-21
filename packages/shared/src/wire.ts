/**
 * Protokół WebSocket. Trzy namespace'y, bo różnią się autoryzacją:
 *   /tv    — bez auth, dostaje zredagowaną projekcję
 *   /admin — JWT w handshake
 *   /play  — deviceToken w handshake (capability drużyny)
 */
import type { Ms, Uuid } from './state';
import type { AdminView, PlayerView, TvView } from './views';
import type { SoundKey } from './sounds';

export const NS = { TV: '/tv', ADMIN: '/admin', PLAY: '/play' } as const;

export type ErrCode =
  | 'BAD_STATE'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'RACE_CLOSED'
  | 'FALSE_START'
  | 'NOT_ELIGIBLE'
  | 'ALREADY_PRESSED'
  | 'ALREADY_REVEALED'
  | 'GAME_FULL'
  | 'NAME_TAKEN'
  | 'NO_GAME'
  | 'CONFLICT'
  | 'INTERNAL';

export type Ack<T = undefined> =
  | { ok: true; seq: number; data?: T }
  | { ok: false; code: ErrCode; error: string };

// ------------------------------------------------------- server -> client

/** Każdy broadcast niesie seq; luka w numeracji = klient prosi o pełny snapshot. */
export interface StatePatch<V> {
  seq: number;
  view: V;
  /** Dźwięki do odtworzenia przy tej zmianie (tylko /tv i lokalnie /admin) */
  sounds: SoundKey[];
}

export interface BuzzerArm {
  raceId: Uuid | null;
  armed: boolean;
  reason: PlayerView['armedReason'];
  /** Serwerowy czas otwarcia wyścigu — telefon liczy własny falstart */
  openedAt: Ms | null;
}

export interface RacePressView {
  teamId: Uuid;
  teamName: string;
  adjustedMs: Ms;
  serverRecvMs: Ms;
  rttMs: number;
  deltaMs: number;
  rejectedReason: string | null;
}

export interface RaceResultView {
  raceId: Uuid;
  kind: string;
  winnerTeamId: Uuid | null;
  tiedTeamIds: Uuid[];
  presses: RacePressView[];
}

export interface ServerToTv {
  'tv:state': (p: StatePatch<TvView>) => void;
  'tv:sound': (p: { keys: SoundKey[] }) => void;
  'tv:reset': () => void;
}

export interface ServerToAdmin {
  'admin:state': (p: StatePatch<AdminView>) => void;
  'admin:race': (p: RaceResultView) => void;
  'admin:error': (p: { code: ErrCode; error: string }) => void;
}

export interface ServerToPlayer {
  'play:state': (p: StatePatch<PlayerView>) => void;
  'play:buzzer': (p: BuzzerArm) => void;
  'play:race-result': (p: { raceId: Uuid; won: boolean; winnerTeamName: string }) => void;
  'play:evicted': (p: { reason: string }) => void;
  'play:sync-request': () => void;
}

// ------------------------------------------------------- client -> server

export interface PlayJoinReq {
  /** Nazwa drużyny — wymagana przy pierwszym wejściu */
  teamName?: string;
}

export interface PlayJoinRes {
  teamId: Uuid;
  deviceToken: Uuid;
  view: PlayerView;
  seq: number;
}

export interface BuzzReq {
  raceId: Uuid;
  /** performance.timeOrigin + event.timeStamp, zaokrąglone */
  clientTs: Ms;
  /** Estymata offsetu zegara klienta względem serwera */
  offsetMs: number;
  rttMs: number;
}

export interface ClockSyncReq {
  t0: Ms;
}

export interface ClockSyncRes {
  t0: Ms;
  t1: Ms;
}

export interface ClockReportReq {
  offsetMs: number;
  rttMs: number;
  stdDevMs: number;
}

export interface ClientToPlayer {
  'play:join': (req: PlayJoinReq, ack: (r: Ack<PlayJoinRes>) => void) => void;
  'play:rename': (req: { name: string }, ack: (r: Ack) => void) => void;
  'play:buzz': (req: BuzzReq, ack: (r: Ack) => void) => void;
  'clock:sync': (req: ClockSyncReq, ack: (r: Ack<ClockSyncRes>) => void) => void;
  'clock:report': (req: ClockReportReq, ack: (r: Ack) => void) => void;
  'play:resync': (req: Record<string, never>, ack: (r: Ack<{ view: PlayerView }>) => void) => void;
}

/** Akcja admina: dowolny event silnika bez pól wypełnianych po stronie serwera. */
export interface AdminActionReq {
  type: string;
  payload?: Record<string, unknown>;
  /** Idempotencja — chroni przed podwójnym tapnięciem na telefonie */
  clientOpId: Uuid;
  /** Optimistic concurrency: odrzuć, jeśli ktoś inny zdążył zmienić stan */
  expectedSeq?: number;
}

export interface ClientToAdmin {
  'admin:action': (req: AdminActionReq, ack: (r: Ack) => void) => void;
  'admin:undo': (req: { expectedSeq: number }, ack: (r: Ack) => void) => void;
  'admin:resync': (req: Record<string, never>, ack: (r: Ack<{ view: AdminView }>) => void) => void;
}

export interface ClientToTv {
  'tv:hello': (req: Record<string, never>, ack: (r: Ack<{ view: TvView }>) => void) => void;
}
