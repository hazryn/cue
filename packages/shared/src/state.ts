/**
 * Stan gry CUE — typy współdzielone przez backend i frontend.
 *
 * Źródłem prawdy jest GameState trzymany w kolumnie game.state (JSONB).
 * Wszystkie zmiany przechodzą przez czysty reduktor w backend/src/game/engine.
 */

export type Uuid = string;
/** Znacznik czasu w ms (Date.now()) */
export type Ms = number;

// ---------------------------------------------------------------- fazy gry

export const GamePhase = {
  LOBBY: 'LOBBY',
  MAIN_ROUND: 'MAIN_ROUND',
  ROUND_SUMMARY: 'ROUND_SUMMARY',
  LEADERBOARD: 'LEADERBOARD',
  FINAL: 'FINAL',
  FINISHED: 'FINISHED',
  ABORTED: 'ABORTED',
} as const;
export type GamePhase = (typeof GamePhase)[keyof typeof GamePhase];

export const QuestionFsm = {
  Q_IDLE: 'Q_IDLE',
  Q_RACE_OPEN: 'Q_RACE_OPEN',
  Q_RACE_RESOLVING: 'Q_RACE_RESOLVING',
  Q_CONTROL: 'Q_CONTROL',
  Q_STEAL_RACE_OPEN: 'Q_STEAL_RACE_OPEN',
  Q_STEAL_RACE_RESOLVING: 'Q_STEAL_RACE_RESOLVING',
  Q_STEAL_ATTEMPT: 'Q_STEAL_ATTEMPT',
  Q_AWARD: 'Q_AWARD',
  Q_FORFEIT_REVEAL: 'Q_FORFEIT_REVEAL',
  Q_CLOSED: 'Q_CLOSED',
} as const;
export type QuestionFsm = (typeof QuestionFsm)[keyof typeof QuestionFsm];

export const FinalFsm = {
  F_SETUP: 'F_SETUP',
  F_P1_READY: 'F_P1_READY',
  F_P1_RUNNING: 'F_P1_RUNNING',
  F_P1_PAUSED: 'F_P1_PAUSED',
  F_P1_DONE: 'F_P1_DONE',
  F_P2_READY: 'F_P2_READY',
  F_P2_RUNNING: 'F_P2_RUNNING',
  F_P2_PAUSED: 'F_P2_PAUSED',
  F_P2_DONE: 'F_P2_DONE',
  F_REVEAL: 'F_REVEAL',
  F_RESULT: 'F_RESULT',
} as const;
export type FinalFsm = (typeof FinalFsm)[keyof typeof FinalFsm];

export type RaceKind = 'MAIN' | 'STEAL' | 'TIEBREAK';

// ------------------------------------------------------------- dane pytań

/** Kopia pytania zamrożona przy starcie gry — edycja w katalogu nie rusza rozgrywki. */
export interface FrozenAnswer {
  id: Uuid;
  text: string;
  weight: number;
  position: number;
}

export interface FrozenQuestion {
  id: Uuid;
  kind: 'MAIN' | 'FINAL';
  text: string;
  note: string | null;
  answers: FrozenAnswer[];
}

// ----------------------------------------------------------------- drużyny

/**
 * Obecność (connected/rtt) celowo NIE jest częścią stanu gry — to dane ulotne,
 * trzymane w RAM przez PresenceService i doklejane dopiero w projekcji.
 * Gdyby były w stanie, każde mrugnięcie WiFi produkowałoby event w logu undo.
 */
export interface TeamState {
  id: Uuid;
  name: string;
  color: string;
  score: number;
  removed: boolean;
  /** Ile razy drużyna wygrała wyścig — tie-break w rankingu */
  racesWon: number;
  /** Ile pytań drużyna domknęła/przejęła — tie-break w rankingu */
  questionsWon: number;
}

// ------------------------------------------------------------ runda główna

export interface SlotState {
  answerId: Uuid;
  revealed: boolean;
  /** Drużyna, która odsłoniła slot (null = odsłonięte po przepadnięciu puli) */
  revealedBy: Uuid | null;
}

export interface RaceState {
  id: Uuid;
  kind: RaceKind;
  eligible: Uuid[];
  openedAt: Ms;
  /**
   * Od kiedy grzybki są aktywne. Przy przejęciu to openedAt + odliczanie 3-2-1,
   * przy zwykłym starcie pytania — openedAt. Starsze stany gry nie mają pola.
   */
  armsAt?: Ms;
  /** Koniec okna zbierania naciśnięć; null = okno jeszcze nie ruszyło */
  closesAt: Ms | null;
}

export interface QuestionState {
  fsm: QuestionFsm;
  questionId: Uuid;
  multiplier: 1 | 2;
  /** Czy treść pytania jest już widoczna na TV */
  questionRevealed: boolean;
  slots: SlotState[];
  /** Pula już przemnożona przez multiplier */
  pool: number;
  controllingTeamId: Uuid | null;
  stealingTeamId: Uuid | null;
  strikes: number;
  /** Drużyny, które miały już kontrolę lub próbę przejęcia */
  triedTeamIds: Uuid[];
  race: RaceState | null;
  awardedTo: Uuid | null;
  awardedAmount: number;
  forfeited: boolean;
}

// ------------------------------------------------------------------ finał

export type FinalSlotResult = 'HIT' | 'MISS' | 'PASS' | 'UNANSWERED';

export interface FinalSlot {
  player: 1 | 2;
  /** Indeks pytania w finalQuestionIds (0..4) */
  qIdx: number;
  result: FinalSlotResult;
  answerId: Uuid | null;
  /** Odpowiedź spoza listy, wpisana przez prowadzącego — zero punktów */
  customText: string | null;
  points: number;
  /** Odsłonięte w fazie F_REVEAL */
  revealed: boolean;
}

export interface FinalTimer {
  totalMs: number;
  remainingMs: number;
  /** Absolutny czas końca; null gdy zegar stoi */
  deadlineAt: Ms | null;
  running: boolean;
}

export interface FinalState {
  fsm: FinalFsm;
  teamId: Uuid;
  questionIds: Uuid[];
  p1Name: string;
  p2Name: string;
  turn: 1 | 2 | null;
  /** Które pytanie tury jest właśnie czytane (0..4) */
  qCursor: number;
  timer: FinalTimer;
  slots: FinalSlot[];
  /** Ile duplikatów zabrzęczało w turze gracza 2 (statystyka na TV) */
  duplicateBuzzes: number;
  revealCursor: number;
  total: number;
}

// ------------------------------------------------------------- konfiguracja

export interface GameConfig {
  /** Okno zbierania naciśnięć grzybka [ms] */
  raceWindowMs: number;
  /** Poniżej tej różnicy uznajemy remis i robimy dogrywkę [ms] */
  tiebreakThresholdMs: number;
  /** Blokada po falstarcie [ms] */
  falseStartLockoutMs: number;
  /** Odliczanie 3-2-1 przed odblokowaniem grzybków przy przejęciu [ms] */
  stealCountdownMs: number;
  /** Po tylu ms bez naciśnięcia zamykamy wyścig, żeby FSM nie wisiał [ms] */
  raceTimeoutMs: number;
  /** Od którego indeksu pytania (0-based) obowiązuje mnożnik */
  multiplierFromIndex: number;
  multiplier: number;
  questionsPerGame: number;
  finalQuestionCount: number;
  finalThreshold: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  raceWindowMs: 250,
  tiebreakThresholdMs: 10,
  falseStartLockoutMs: 500,
  stealCountdownMs: 3000,
  raceTimeoutMs: 60_000,
  multiplierFromIndex: 5,
  multiplier: 2,
  questionsPerGame: 10,
  finalQuestionCount: 5,
  // 200 jak w telewizji okazało się przy stole nieosiągalne nawet przy samych
  // najwyżej punktowanych odpowiedziach — pięć pytań daje zwykle ok. 90–110 na gracza
  finalThreshold: 100,
};

// -------------------------------------------------------------- pełny stan

export interface QuestionHistoryEntry {
  qIndex: number;
  questionId: Uuid;
  winnerTeamId: Uuid | null;
  pool: number;
  forfeited: boolean;
}

export interface GameState {
  version: 1;
  phase: GamePhase;
  config: GameConfig;
  teams: TeamState[];
  /** 10 uuid pytań rundy głównej, ustalone przy starcie */
  questionOrder: Uuid[];
  /** Zamrożone kopie pytań (główne + finałowe) */
  questions: Record<Uuid, FrozenQuestion>;
  qIndex: number;
  question: QuestionState | null;
  final: FinalState | null;
  history: QuestionHistoryEntry[];
  startedAt: Ms | null;
  finishedAt: Ms | null;
}
