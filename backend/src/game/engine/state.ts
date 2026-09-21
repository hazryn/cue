/**
 * Konstrukcja i odczyt stanu gry. Czysty TypeScript — żadnych importów
 * z NestJS ani TypeORM, żeby cała logika była testowalna bez bazy.
 */
import {
  DEFAULT_CONFIG,
  FrozenQuestion,
  GameConfig,
  GamePhase,
  GameState,
  QuestionState,
  RaceState,
  TeamState,
  Uuid,
} from '@cue/shared';

export const TEAM_COLORS = ['#f43f5e', '#22c55e', '#3b82f6', '#eab308', '#a855f7'];

export function initialState(config: Partial<GameConfig> = {}): GameState {
  return {
    version: 1,
    phase: GamePhase.LOBBY,
    config: { ...DEFAULT_CONFIG, ...config },
    teams: [],
    questionOrder: [],
    questions: {},
    qIndex: 0,
    question: null,
    final: null,
    history: [],
    startedAt: null,
    finishedAt: null,
  };
}

/** Drużyny biorące udział w grze (nieusunięte). Kolejność = kolejność dołączenia. */
export function activeTeams(state: GameState): TeamState[] {
  return state.teams.filter((t) => !t.removed);
}

export function findTeam(state: GameState, teamId: Uuid): TeamState | undefined {
  return state.teams.find((t) => t.id === teamId && !t.removed);
}

export function nextColor(state: GameState): string {
  const used = new Set(state.teams.map((t) => t.color));
  return TEAM_COLORS.find((c) => !used.has(c)) ?? TEAM_COLORS[state.teams.length % TEAM_COLORS.length];
}

/** Normalizacja nazwy drużyny do wykrywania kolizji: bez ogonków, bez wielkości liter. */
export function slugifyTeamName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/\s+/g, ' ');
}

export function currentQuestion(state: GameState): FrozenQuestion | null {
  if (!state.question) return null;
  return state.questions[state.question.questionId] ?? null;
}

export function questionById(state: GameState, id: Uuid): FrozenQuestion | null {
  return state.questions[id] ?? null;
}

/** Mnożnik zamrażany przy starcie pytania — zmiana configu w trakcie nie rozjedzie replayu. */
export function multiplierForIndex(state: GameState, qIndex: number): 1 | 2 {
  return qIndex >= state.config.multiplierFromIndex ? (state.config.multiplier as 2) : 1;
}

export function buildQuestionState(state: GameState, questionId: Uuid, qIndex: number): QuestionState {
  const q = state.questions[questionId];
  if (!q) throw new Error(`Brak zamrożonej kopii pytania ${questionId}`);
  return {
    fsm: 'Q_IDLE',
    questionId,
    multiplier: multiplierForIndex(state, qIndex),
    questionRevealed: false,
    slots: q.answers
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((a) => ({ answerId: a.id, revealed: false, revealedBy: null })),
    pool: 0,
    controllingTeamId: null,
    stealingTeamId: null,
    strikes: 0,
    triedTeamIds: [],
    race: null,
    awardedTo: null,
    awardedAmount: 0,
    forfeited: false,
  };
}

/** Drużyny uprawnione do wyścigu przejęcia: te, które jeszcze nie próbowały. */
export function stealCandidates(state: GameState, q: QuestionState): TeamState[] {
  return activeTeams(state).filter((t) => !q.triedTeamIds.includes(t.id));
}

export function allSlotsRevealed(q: QuestionState): boolean {
  return q.slots.every((s) => s.revealed);
}

export function answerWeight(question: FrozenQuestion, answerId: Uuid): number {
  return question.answers.find((a) => a.id === answerId)?.weight ?? 0;
}

/**
 * Moment, od którego grzybki przyjmują naciśnięcia. Przejęcie zaczyna się
 * odliczaniem 3-2-1, żeby drużyny zdążyły wziąć telefony do ręki — wcześniejsze
 * naciśnięcie to falstart. Stany sprzed wprowadzenia pola nie mają `armsAt`.
 */
export function raceArmsAt(race: RaceState): number {
  return race.armsAt ?? race.openedAt;
}

export function stealArmsAt(state: GameState, at: number): number {
  return at + (state.config.stealCountdownMs ?? DEFAULT_CONFIG.stealCountdownMs);
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}
