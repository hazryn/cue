/**
 * Projekcje stanu per rola.
 *
 * Bezpieczeństwo przez redakcję danych, nie przez ukrywanie eventów: TV nigdy nie
 * dostaje tekstów nieodsłoniętych odpowiedzi, bo WS da się podsłuchać. Ma to
 * krytyczne znaczenie w finale — gracz 2 wraca do pokoju i patrzy na ten ekran.
 */
import type {
  FinalFsm,
  FinalSlotResult,
  GameConfig,
  GamePhase,
  Ms,
  QuestionFsm,
  QuestionHistoryEntry,
  RaceKind,
  TeamState,
  Uuid,
} from './state';

export type Role = 'tv' | 'admin' | 'player';

// ------------------------------------------------------------------- wspólne

export interface TeamView {
  id: Uuid;
  name: string;
  color: string;
  score: number;
  connected: boolean;
}

export interface RaceView {
  id: Uuid;
  kind: RaceKind;
  eligible: Uuid[];
  openedAt: Ms;
}

/** Slot rundy głównej. `text` i `weight` są null dopóki slot nie jest odsłonięty. */
export interface SlotView {
  position: number;
  revealed: boolean;
  text: string | null;
  weight: number | null;
  revealedBy: Uuid | null;
}

// ------------------------------------------------------------------ TV

export interface TvQuestionView {
  fsm: QuestionFsm;
  index: number;
  total: number;
  /** null dopóki admin nie odsłoni treści pytania */
  text: string | null;
  multiplier: 1 | 2;
  slots: SlotView[];
  pool: number;
  controllingTeamId: Uuid | null;
  stealingTeamId: Uuid | null;
  strikes: number;
  triedTeamIds: Uuid[];
  race: RaceView | null;
  awardedTo: Uuid | null;
  awardedAmount: number;
  forfeited: boolean;
}

/** Slot finału widziany przez TV — treść i punkty tylko po odsłonięciu w F_REVEAL. */
export interface TvFinalSlotView {
  player: 1 | 2;
  qIdx: number;
  /** Czy odpowiedź została w ogóle udzielona (wypełniony slot) */
  answered: boolean;
  revealed: boolean;
  result: FinalSlotResult | null;
  text: string | null;
  points: number | null;
  /** Slot odsłonięty ostatnio — podświetlony na planszy */
  current: boolean;
}

export interface TvFinalView {
  fsm: FinalFsm;
  teamId: Uuid;
  teamName: string;
  p1Name: string;
  p2Name: string;
  turn: 1 | 2 | null;
  qCursor: number;
  questionCount: number;
  /** Treść bieżącego pytania — tylko podczas trwającej tury */
  currentQuestionText: string | null;
  /**
   * Przy odsłanianiu: pytanie, do którego należy ostatnio odsłonięta odpowiedź
   * (przed pierwszym kliknięciem — pierwsze pytanie). Bez tego widz widzi
   * „LODÓWKA 32" i nie pamięta, o co było pytanie.
   */
  revealQuestionText: string | null;
  slots: TvFinalSlotView[];
  revealCursor: number;
  total: number;
  threshold: number;
  won: boolean | null;
}

export interface TvView {
  role: 'tv';
  seq: number;
  phase: GamePhase;
  teams: TeamView[];
  question: TvQuestionView | null;
  final: TvFinalView | null;
  history: QuestionHistoryEntry[];
  ranking: RankingEntry[];
  joinUrl: string;
}

export interface RankingEntry {
  teamId: Uuid;
  name: string;
  color: string;
  score: number;
  place: number;
  isWinner: boolean;
}

// ---------------------------------------------------------------- ADMIN

export interface AdminAnswerView {
  id: Uuid;
  text: string;
  weight: number;
  position: number;
  revealed: boolean;
  revealedBy: Uuid | null;
}

export interface AdminQuestionView {
  fsm: QuestionFsm;
  index: number;
  total: number;
  questionId: Uuid;
  text: string;
  note: string | null;
  multiplier: 1 | 2;
  questionRevealed: boolean;
  answers: AdminAnswerView[];
  pool: number;
  controllingTeamId: Uuid | null;
  stealingTeamId: Uuid | null;
  strikes: number;
  triedTeamIds: Uuid[];
  race: RaceView | null;
  awardedTo: Uuid | null;
  awardedAmount: number;
  forfeited: boolean;
}

export interface AdminFinalAnswerView {
  id: Uuid;
  text: string;
  weight: number;
  position: number;
  /** Ustawione, gdy tę odpowiedź zajął gracz 1 — ostrzeżenie o duplikacie */
  takenByPlayer1: boolean;
  takenByPlayer2: boolean;
}

export interface AdminFinalView {
  fsm: FinalFsm;
  teamId: Uuid;
  teamName: string;
  p1Name: string;
  p2Name: string;
  turn: 1 | 2 | null;
  qCursor: number;
  questionCount: number;
  currentQuestionText: string | null;
  currentAnswers: AdminFinalAnswerView[];
  /** Pytanie slotu, który prowadzący odsłoni następnym kliknięciem */
  nextRevealQuestionText: string | null;
  slots: Array<{
    player: 1 | 2;
    qIdx: number;
    questionText: string | null;
    result: FinalSlotResult;
    answerId: Uuid | null;
    text: string | null;
    points: number;
    revealed: boolean;
  }>;
  duplicateBuzzes: number;
  revealCursor: number;
  total: number;
  threshold: number;
  won: boolean | null;
}

export interface UndoEntry {
  seq: number;
  type: string;
  actor: string;
  label: string;
  at: Ms;
}

export interface PresenceEntry {
  teamId: Uuid;
  connected: boolean;
  rttMs: number | null;
  clockOffsetMs: number | null;
  clockStdDevMs: number | null;
  lastSeenAt: Ms | null;
}

export interface AdminView {
  role: 'admin';
  seq: number;
  gameId: Uuid;
  phase: GamePhase;
  config: GameConfig;
  teams: TeamView[];
  qIndex: number;
  /** Pytania wybrane do rozdania — panel odtwarza z nich zaznaczenie w lobby */
  questionOrder: Uuid[];
  question: AdminQuestionView | null;
  final: AdminFinalView | null;
  history: QuestionHistoryEntry[];
  ranking: RankingEntry[];
  presence: PresenceEntry[];
  undoStack: UndoEntry[];
  /** Ile pytań głównych zostało jeszcze niewykorzystanych w wybranych pakietach */
  spareQuestions: number;
}

// --------------------------------------------------------------- PLAYER

export interface PlayerView {
  role: 'player';
  seq: number;
  phase: GamePhase;
  teamId: Uuid;
  teamName: string;
  teamColor: string;
  score: number;
  place: number | null;
  /** Czy grzybek jest aktywny */
  armed: boolean;
  armedReason: ArmedReason;
  raceId: Uuid | null;
  raceKind: RaceKind | null;
  /** Wynik ostatniego wyścigu z perspektywy tej drużyny */
  lastRace: { raceId: Uuid; won: boolean; winnerTeamName: string } | null;
  /** Czy ta drużyna właśnie odpowiada */
  hasControl: boolean;
  strikes: number;
  teams: TeamView[];
}

export type ArmedReason =
  | 'ARMED'
  | 'WAITING'
  | 'NOT_ELIGIBLE'
  | 'ALREADY_PRESSED'
  | 'LOCKED_OUT'
  | 'SYNCING'
  | 'GAME_NOT_RUNNING';

export type AnyView = TvView | AdminView | PlayerView;
