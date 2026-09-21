/**
 * Bramki przejść FSM. Odrzucony event NIE trafia do logu — dlatego np. kliknięcie
 * w już odsłonięty slot wraca jako ALREADY_REVEALED i jest tylko sygnałem dla
 * admina i TV, a nie zmianą stanu (i nie jest X — patrz docs/design.md §6.2).
 */
import { ErrCode, GameEvent, GamePhase, GameState, QuestionFsm } from '@cue/shared';
import { activeTeams, findTeam, slugifyTeamName } from './state';

export type GuardResult = { ok: true } | { ok: false; code: ErrCode; error: string };

const OK: GuardResult = { ok: true };
const fail = (code: ErrCode, error: string): GuardResult => ({ ok: false, code, error });

const RACE_STATES: QuestionFsm[] = ['Q_RACE_OPEN', 'Q_RACE_RESOLVING', 'Q_STEAL_RACE_OPEN', 'Q_STEAL_RACE_RESOLVING'];

export function canApply(state: GameState, event: GameEvent): GuardResult {
  if (state.phase === 'ABORTED' && event.type !== 'ADMIN_ABORT') {
    return fail('BAD_STATE', 'Gra została przerwana');
  }

  switch (event.type) {
    // ---------------------------------------------------------------- lobby
    case 'TEAM_JOIN': {
      const joinable =
        state.phase === GamePhase.LOBBY ||
        (state.phase === GamePhase.MAIN_ROUND && state.qIndex === 0);
      if (!joinable) return fail('GAME_FULL', 'Gra już trwa — można tylko obserwować');
      if (activeTeams(state).length >= 3) return fail('GAME_FULL', 'Komplet trzech drużyn');
      const slug = slugifyTeamName(event.payload.name);
      if (!slug) return fail('VALIDATION', 'Pusta nazwa drużyny');
      if (slug.length > 24) return fail('VALIDATION', 'Nazwa może mieć maksymalnie 24 znaki');
      if (activeTeams(state).some((t) => slugifyTeamName(t.name) === slug)) {
        return fail('NAME_TAKEN', 'Taka drużyna już gra');
      }
      return OK;
    }
    case 'TEAM_RENAME': {
      if (!findTeam(state, event.payload.teamId)) return fail('NOT_FOUND', 'Nie ma takiej drużyny');
      const slug = slugifyTeamName(event.payload.name);
      if (!slug) return fail('VALIDATION', 'Pusta nazwa drużyny');
      if (activeTeams(state).some((t) => t.id !== event.payload.teamId && slugifyTeamName(t.name) === slug)) {
        return fail('NAME_TAKEN', 'Taka drużyna już gra');
      }
      return OK;
    }
    case 'TEAM_KICK':
      if (state.phase !== GamePhase.LOBBY) return fail('BAD_STATE', 'Drużyny można usuwać tylko w lobby');
      return findTeam(state, event.payload.teamId) ? OK : fail('NOT_FOUND', 'Nie ma takiej drużyny');

    case 'ADMIN_SETUP_GAME':
      if (state.phase !== GamePhase.LOBBY) return fail('BAD_STATE', 'Pytania wybiera się przed startem');
      if (event.payload.questionOrder.length !== state.config.questionsPerGame) {
        return fail('VALIDATION', `Wybierz dokładnie ${state.config.questionsPerGame} pytań`);
      }
      return OK;

    case 'ADMIN_START_GAME':
      if (state.phase !== GamePhase.LOBBY) return fail('BAD_STATE', 'Gra już wystartowała');
      if (activeTeams(state).length < 2) return fail('VALIDATION', 'Potrzebne są co najmniej dwie drużyny');
      if (state.questionOrder.length !== state.config.questionsPerGame) {
        return fail('VALIDATION', 'Nie wybrano pytań do gry');
      }
      return OK;

    case 'ADMIN_RESET_GAME':
      if (state.phase === GamePhase.LOBBY) return fail('BAD_STATE', 'Gra jeszcze nie wystartowała');
      return OK;

    // --------------------------------------------------------- runda główna
    case 'ADMIN_OPEN_RACE': {
      const g = requireQuestion(state, ['Q_IDLE', 'Q_STEAL_RACE_OPEN']);
      return g;
    }
    case 'ADMIN_CANCEL_RACE':
      return requireQuestion(state, RACE_STATES);
    case 'RACE_RESOLVED':
    case 'RACE_TIMEOUT': {
      const g = requireQuestion(state, RACE_STATES);
      if (!g.ok) return g;
      if (state.question!.race?.id !== event.payload.raceId) {
        return fail('RACE_CLOSED', 'Ten wyścig już nie obowiązuje');
      }
      return OK;
    }
    case 'ADMIN_HIT': {
      const g = requireQuestion(state, ['Q_CONTROL', 'Q_STEAL_ATTEMPT']);
      if (!g.ok) return g;
      const slot = state.question!.slots.find((s) => s.answerId === event.payload.answerId);
      if (!slot) return fail('NOT_FOUND', 'Nie ma takiej odpowiedzi');
      if (slot.revealed) return fail('ALREADY_REVEALED', 'Ta odpowiedź jest już odsłonięta');
      return OK;
    }
    case 'ADMIN_MISS':
      return requireQuestion(state, ['Q_CONTROL', 'Q_STEAL_ATTEMPT']);
    case 'ADMIN_FORCE_CONTROL': {
      // Także w Q_IDLE: gdy telefon drużyny padnie albo prowadzący chce przypisać
      // pytanie bez wyścigu, musi móc to zrobić bez otwierania grzybków.
      const g = requireQuestion(state, ['Q_IDLE', ...RACE_STATES, 'Q_CONTROL', 'Q_STEAL_ATTEMPT']);
      if (!g.ok) return g;
      return findTeam(state, event.payload.teamId) ? OK : fail('NOT_FOUND', 'Nie ma takiej drużyny');
    }
    case 'ADMIN_PASS_TO_STEAL':
      return requireQuestion(state, ['Q_CONTROL']);
    case 'ADMIN_REVEAL_ONE': {
      const g = requireQuestion(state, ['Q_FORFEIT_REVEAL']);
      if (!g.ok) return g;
      const slot = state.question!.slots.find((s) => s.answerId === event.payload.answerId);
      if (!slot) return fail('NOT_FOUND', 'Nie ma takiej odpowiedzi');
      if (slot.revealed) return fail('ALREADY_REVEALED', 'Ta odpowiedź jest już odsłonięta');
      return OK;
    }
    case 'ADMIN_REVEAL_REST':
      return requireQuestion(state, ['Q_FORFEIT_REVEAL']);
    case 'ADMIN_CONTINUE':
      return requireQuestion(state, ['Q_AWARD']);
    case 'ADMIN_NEXT_QUESTION': {
      if (state.phase === GamePhase.ROUND_SUMMARY) return OK;
      return requireQuestion(state, ['Q_CLOSED']);
    }
    case 'ADMIN_SKIP_QUESTION':
      return requireQuestion(state, ['Q_IDLE', 'Q_RACE_OPEN']);
    case 'ADMIN_ADJUST_SCORE':
      return findTeam(state, event.payload.teamId) ? OK : fail('NOT_FOUND', 'Nie ma takiej drużyny');

    case 'ADMIN_SKIP_TO_LEADERBOARD':
    case 'ADMIN_GOTO_LEADERBOARD':
      if (state.phase !== GamePhase.MAIN_ROUND && state.phase !== GamePhase.ROUND_SUMMARY) {
        return fail('BAD_STATE', 'Ranking pokazujemy po rundzie głównej');
      }
      return OK;

    // ---------------------------------------------------------------- finał
    case 'ADMIN_START_FINAL': {
      if (state.phase !== GamePhase.LEADERBOARD) return fail('BAD_STATE', 'Finał startuje po rundzie głównej');
      if (!findTeam(state, event.payload.teamId)) return fail('NOT_FOUND', 'Nie ma takiej drużyny');
      if (event.payload.questionIds.length !== state.config.finalQuestionCount) {
        return fail('VALIDATION', `Finał wymaga ${state.config.finalQuestionCount} pytań`);
      }
      // Bez treści pytań finał ruszyłby z pustą listą odpowiedzi u prowadzącego
      const carried = new Set(((event.payload.questions ?? []) as Array<{ id?: string }>).map((q) => q?.id));
      const missing = event.payload.questionIds.filter((id) => !state.questions[id] && !carried.has(id));
      if (missing.length > 0) return fail('NOT_FOUND', 'Brakuje treści wybranych pytań finałowych');
      return OK;
    }
    case 'ADMIN_FINAL_BEGIN_TURN': {
      const g = requireFinal(state, ['F_SETUP', 'F_P1_DONE']);
      if (!g.ok) return g;
      if (event.payload.player === 2 && state.final!.fsm !== 'F_P1_DONE') {
        return fail('BAD_STATE', 'Najpierw musi zagrać pierwszy gracz');
      }
      return OK;
    }
    case 'ADMIN_FINAL_START_TIMER':
      return requireFinal(state, ['F_P1_READY', 'F_P2_READY']);
    case 'ADMIN_FINAL_PAUSE':
      return requireFinal(state, ['F_P1_RUNNING', 'F_P2_RUNNING']);
    case 'ADMIN_FINAL_RESUME':
      return requireFinal(state, ['F_P1_PAUSED', 'F_P2_PAUSED']);
    case 'FINAL_TIMER_EXPIRED':
      return requireFinal(state, ['F_P1_RUNNING', 'F_P2_RUNNING']);
    case 'ADMIN_FINAL_HIT': {
      const g = requireFinal(state, ['F_P1_RUNNING', 'F_P2_RUNNING']);
      if (!g.ok) return g;
      const final = state.final!;
      const question = state.questions[final.questionIds[final.qCursor]];
      if (!question?.answers.some((a) => a.id === event.payload.answerId)) {
        return fail('NOT_FOUND', 'Ta odpowiedź nie należy do bieżącego pytania');
      }
      if (
        final.turn === 2 &&
        final.slots.some((s) => s.player === 2 && s.result === 'HIT' && s.answerId === event.payload.answerId)
      ) {
        return fail('ALREADY_REVEALED', 'Ta odpowiedź została już zapisana w tej turze');
      }
      return OK;
    }
    case 'ADMIN_FINAL_MISS':
    case 'ADMIN_FINAL_PASS':
      return requireFinal(state, ['F_P1_RUNNING', 'F_P2_RUNNING']);
    case 'ADMIN_FINAL_END_TURN':
      return requireFinal(state, ['F_P1_RUNNING', 'F_P1_PAUSED', 'F_P2_RUNNING', 'F_P2_PAUSED']);
    case 'ADMIN_FINAL_BEGIN_REVEAL':
      return requireFinal(state, ['F_P2_DONE']);
    case 'ADMIN_FINAL_REVEAL_NEXT':
      return requireFinal(state, ['F_REVEAL']);

    case 'ADMIN_FINISH':
      if (state.phase === GamePhase.FINISHED) return fail('BAD_STATE', 'Gra jest już zakończona');
      return OK;
    case 'ADMIN_ABORT':
      return OK;
    default:
      return fail('VALIDATION', 'Nieznany typ akcji');
  }
}

function requireQuestion(state: GameState, allowed: QuestionFsm[]): GuardResult {
  if (state.phase !== GamePhase.MAIN_ROUND || !state.question) {
    return fail('BAD_STATE', 'Runda główna nie jest w toku');
  }
  if (!allowed.includes(state.question.fsm)) {
    return fail('BAD_STATE', `Ta akcja nie jest teraz dostępna (${state.question.fsm})`);
  }
  return OK;
}

function requireFinal(state: GameState, allowed: string[]): GuardResult {
  if (state.phase !== GamePhase.FINAL || !state.final) return fail('BAD_STATE', 'Finał nie jest w toku');
  if (!allowed.includes(state.final.fsm)) {
    return fail('BAD_STATE', `Ta akcja nie jest teraz dostępna (${state.final.fsm})`);
  }
  return OK;
}
