/**
 * Eventy silnika gry — jedyne wejście do reduktora i jedyna rzecz zapisywana
 * w game_event. Każdy event jest w pełni serializowalny: replay logu od seq=1
 * musi dać dokładnie ten sam stan (stąd `at` w payloadzie zamiast Date.now()
 * wewnątrz reduktora).
 */
import type { Ms, Uuid } from './state';

export type Actor = 'admin' | 'player' | 'system';

interface Base<T extends string, P = Record<string, never>> {
  type: T;
  /** Czas wystąpienia — reduktor nigdy nie czyta zegara sam */
  at: Ms;
  actor: Actor;
  /** team.id dla eventów gracza */
  actorId?: Uuid;
  payload: P;
}

// ------------------------------------------------------------------- lobby

export type TeamJoinEvent = Base<'TEAM_JOIN', { teamId: Uuid; name: string; color: string }>;
export type TeamRenameEvent = Base<'TEAM_RENAME', { teamId: Uuid; name: string }>;
export type TeamKickEvent = Base<'TEAM_KICK', { teamId: Uuid }>;
export type SetupGameEvent = Base<
  'ADMIN_SETUP_GAME',
  { questionOrder: Uuid[]; finalQuestionIds: Uuid[] }
>;
export type StartGameEvent = Base<'ADMIN_START_GAME'>;
/** Powrót do lobby z wyzerowaną punktacją — gra od nowa tym samym składem. */
export type ResetGameEvent = Base<'ADMIN_RESET_GAME'>;

// ------------------------------------------------------------ runda główna

export type OpenRaceEvent = Base<'ADMIN_OPEN_RACE', { raceId: Uuid }>;
export type CancelRaceEvent = Base<'ADMIN_CANCEL_RACE'>;
/** Wynik rozstrzygnięty przez BuzzerService (poza reduktorem — zależy od zegarów). */
export type RaceResolvedEvent = Base<
  'RACE_RESOLVED',
  { raceId: Uuid; winnerTeamId: Uuid | null; tiedTeamIds: Uuid[] }
>;
export type RaceTimeoutEvent = Base<'RACE_TIMEOUT', { raceId: Uuid }>;
export type HitEvent = Base<'ADMIN_HIT', { answerId: Uuid }>;
export type MissEvent = Base<'ADMIN_MISS'>;
export type ForceControlEvent = Base<'ADMIN_FORCE_CONTROL', { teamId: Uuid }>;
export type PassToStealEvent = Base<'ADMIN_PASS_TO_STEAL'>;
export type RevealOneEvent = Base<'ADMIN_REVEAL_ONE', { answerId: Uuid }>;
export type RevealRestEvent = Base<'ADMIN_REVEAL_REST'>;
export type ContinueEvent = Base<'ADMIN_CONTINUE'>;
export type NextQuestionEvent = Base<'ADMIN_NEXT_QUESTION'>;
export type SkipQuestionEvent = Base<
  'ADMIN_SKIP_QUESTION',
  { replacementQuestionId: Uuid; question: unknown }
>;
export type AdjustScoreEvent = Base<
  'ADMIN_ADJUST_SCORE',
  { teamId: Uuid; delta: number; reason: string }
>;

// ------------------------------------------------------------------- finał

export type StartFinalEvent = Base<
  'ADMIN_START_FINAL',
  {
    teamId: Uuid;
    p1Name: string;
    p2Name: string;
    questionIds: Uuid[];
    /** Zamrożone kopie pytań finałowych — mogą pochodzić spoza pakietów rundy głównej */
    questions?: unknown[];
  }
>;
export type FinalBeginTurnEvent = Base<'ADMIN_FINAL_BEGIN_TURN', { player: 1 | 2 }>;
export type FinalStartTimerEvent = Base<'ADMIN_FINAL_START_TIMER'>;
export type FinalPauseEvent = Base<'ADMIN_FINAL_PAUSE'>;
export type FinalResumeEvent = Base<'ADMIN_FINAL_RESUME'>;
export type FinalTimerExpiredEvent = Base<'FINAL_TIMER_EXPIRED'>;
export type FinalHitEvent = Base<'ADMIN_FINAL_HIT', { answerId: Uuid }>;
/** `text` to odpowiedź gracza spoza listy — zero punktów, ale widz ma ją zobaczyć */
export type FinalMissEvent = Base<'ADMIN_FINAL_MISS', { text?: string }>;
export type FinalPassEvent = Base<'ADMIN_FINAL_PASS'>;
export type FinalEndTurnEvent = Base<'ADMIN_FINAL_END_TURN'>;
export type FinalBeginRevealEvent = Base<'ADMIN_FINAL_BEGIN_REVEAL'>;
export type FinalRevealNextEvent = Base<'ADMIN_FINAL_REVEAL_NEXT'>;

// -------------------------------------------------------------- zakończenie

export type StartFinalPhaseEvent = Base<'ADMIN_GOTO_LEADERBOARD'>;
/** Skrót testowy: domyka rundę główną i przechodzi prosto do rankingu */
export type SkipToLeaderboardEvent = Base<'ADMIN_SKIP_TO_LEADERBOARD'>;
export type FinishEvent = Base<'ADMIN_FINISH'>;
export type AbortEvent = Base<'ADMIN_ABORT'>;

export type GameEvent =
  | TeamJoinEvent
  | TeamRenameEvent
  | TeamKickEvent
  | SetupGameEvent
  | StartGameEvent
  | ResetGameEvent
  | OpenRaceEvent
  | CancelRaceEvent
  | RaceResolvedEvent
  | RaceTimeoutEvent
  | HitEvent
  | MissEvent
  | ForceControlEvent
  | PassToStealEvent
  | RevealOneEvent
  | RevealRestEvent
  | ContinueEvent
  | NextQuestionEvent
  | SkipQuestionEvent
  | AdjustScoreEvent
  | StartFinalEvent
  | FinalBeginTurnEvent
  | FinalStartTimerEvent
  | FinalPauseEvent
  | FinalResumeEvent
  | FinalTimerExpiredEvent
  | FinalHitEvent
  | FinalMissEvent
  | FinalPassEvent
  | FinalEndTurnEvent
  | FinalBeginRevealEvent
  | FinalRevealNextEvent
  | StartFinalPhaseEvent
  | SkipToLeaderboardEvent
  | FinishEvent
  | AbortEvent;

export type GameEventType = GameEvent['type'];

/** Etykiety do stosu undo na ekranie admina. */
export const EVENT_LABELS: Record<GameEventType, string> = {
  TEAM_JOIN: 'Drużyna dołączyła',
  TEAM_RENAME: 'Zmiana nazwy drużyny',
  TEAM_KICK: 'Usunięcie drużyny',
  ADMIN_SETUP_GAME: 'Wybór pytań',
  ADMIN_START_GAME: 'Start gry',
  ADMIN_RESET_GAME: 'Wyzerowanie gry',
  ADMIN_OPEN_RACE: 'Otwarcie grzybków',
  ADMIN_CANCEL_RACE: 'Anulowanie wyścigu',
  RACE_RESOLVED: 'Rozstrzygnięcie grzybka',
  RACE_TIMEOUT: 'Nikt nie nacisnął',
  ADMIN_HIT: 'Trafiona odpowiedź',
  ADMIN_MISS: 'Błędna odpowiedź (X)',
  ADMIN_FORCE_CONTROL: 'Ręczne przyznanie kontroli',
  ADMIN_PASS_TO_STEAL: 'Przejście do przejęcia',
  ADMIN_REVEAL_ONE: 'Odsłonięcie odpowiedzi',
  ADMIN_REVEAL_REST: 'Odsłonięcie reszty',
  ADMIN_CONTINUE: 'Dalej',
  ADMIN_NEXT_QUESTION: 'Następne pytanie',
  ADMIN_SKIP_QUESTION: 'Podmiana pytania',
  ADMIN_ADJUST_SCORE: 'Korekta punktów',
  ADMIN_START_FINAL: 'Start finału',
  ADMIN_FINAL_BEGIN_TURN: 'Start tury gracza',
  ADMIN_FINAL_START_TIMER: 'Start zegara',
  ADMIN_FINAL_PAUSE: 'Pauza zegara',
  ADMIN_FINAL_RESUME: 'Wznowienie zegara',
  FINAL_TIMER_EXPIRED: 'Koniec czasu',
  ADMIN_FINAL_HIT: 'Odpowiedź zarejestrowana',
  ADMIN_FINAL_MISS: 'Błąd w finale',
  ADMIN_FINAL_PASS: 'Pas',
  ADMIN_FINAL_END_TURN: 'Koniec tury',
  ADMIN_FINAL_BEGIN_REVEAL: 'Start odsłaniania',
  ADMIN_FINAL_REVEAL_NEXT: 'Odsłonięcie punktów',
  ADMIN_GOTO_LEADERBOARD: 'Ranking końcowy',
  ADMIN_SKIP_TO_LEADERBOARD: 'Przewinięcie do finału',
  ADMIN_FINISH: 'Zakończenie gry',
  ADMIN_ABORT: 'Przerwanie gry',
};
