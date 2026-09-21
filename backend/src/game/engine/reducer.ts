/**
 * Reduktor — jedyne miejsce, w którym zmienia się stan gry.
 *
 * Czysta funkcja: reduce(state, event) → { state, sounds }. Replay całego logu
 * od seq=1 musi dać dokładnie ten sam stan co sekwencja wywołań na żywo, dlatego
 * nigdy nie czyta zegara ani nie losuje — czas i identyfikatory przychodzą w evencie.
 */
import {
  FrozenQuestion,
  GameEvent,
  GamePhase,
  GameState,
  SoundKey,
} from '@cue/shared';
import {
  activeTeams,
  allSlotsRevealed,
  buildQuestionState,
  clone,
  findTeam,
} from './state';
import {
  applyContinue,
  applyForceControl,
  applyHit,
  applyMiss,
  applyRaceResolved,
  applyRevealOne,
  applyRevealRest,
  enterStealPhase,
} from './question.fsm';
import {
  applyFinalHit,
  applyFinalMiss,
  applyFinalPass,
  beginReveal,
  beginTurn,
  createFinalState,
  endTurn,
  pauseTimer,
  resumeTimer,
  revealNext,
  startAnswering,
  turnComplete,
} from './final.fsm';

export interface ReduceResult {
  state: GameState;
  sounds: SoundKey[];
}

export function reduce(state: GameState, event: GameEvent): ReduceResult {
  const draft = clone(state);
  const sounds: SoundKey[] = [];
  apply(draft, event, sounds);
  return { state: draft, sounds };
}

export function replay(initial: GameState, events: GameEvent[]): GameState {
  let state = initial;
  for (const event of events) state = reduce(state, event).state;
  return state;
}

function apply(state: GameState, event: GameEvent, sounds: SoundKey[]): void {
  switch (event.type) {
    // ---------------------------------------------------------------- lobby
    case 'TEAM_JOIN':
      state.teams.push({
        id: event.payload.teamId,
        name: event.payload.name.trim(),
        color: event.payload.color,
        score: 0,
        removed: false,
        racesWon: 0,
        questionsWon: 0,
      });
      return;

    case 'TEAM_RENAME': {
      const team = findTeam(state, event.payload.teamId);
      if (team) team.name = event.payload.name.trim();
      return;
    }

    case 'TEAM_KICK': {
      const team = findTeam(state, event.payload.teamId);
      if (team) team.removed = true;
      return;
    }

    case 'ADMIN_SETUP_GAME':
      state.questionOrder = event.payload.questionOrder;
      return;

    case 'ADMIN_START_GAME':
      state.phase = GamePhase.MAIN_ROUND;
      state.qIndex = 0;
      state.startedAt = event.at;
      state.question = buildQuestionState(state, state.questionOrder[0], 0);
      sounds.push('game_start');
      return;

    case 'ADMIN_RESET_GAME':
      resetToLobby(state);
      return;

    // --------------------------------------------------------- runda główna
    case 'ADMIN_OPEN_RACE': {
      const q = state.question!;
      const eligible =
        q.fsm === 'Q_STEAL_RACE_OPEN'
          ? activeTeams(state)
              .filter((t) => !q.triedTeamIds.includes(t.id))
              .map((t) => t.id)
          : activeTeams(state).map((t) => t.id);
      q.race = {
        id: event.payload.raceId,
        kind: q.fsm === 'Q_STEAL_RACE_OPEN' ? 'STEAL' : 'MAIN',
        eligible,
        openedAt: event.at,
        closesAt: null,
      };
      q.fsm = q.race.kind === 'STEAL' ? 'Q_STEAL_RACE_OPEN' : 'Q_RACE_OPEN';
      // Pytanie odsłania się razem z odblokowaniem grzybków: prowadzący czyta je
      // na głos w tym samym momencie, więc osobne kliknięcie byłoby tylko
      // dodatkową rzeczą do zapomnienia przy stole.
      if (!q.questionRevealed) {
        q.questionRevealed = true;
        sounds.push('question_reveal');
      }
      sounds.push('race_open');
      return;
    }

    case 'ADMIN_CANCEL_RACE': {
      const q = state.question!;
      q.race = null;
      q.fsm = q.triedTeamIds.length > 0 ? 'Q_STEAL_RACE_OPEN' : 'Q_IDLE';
      return;
    }

    case 'RACE_RESOLVED':
      applyRaceResolved(
        state,
        state.question!,
        event.payload.winnerTeamId,
        event.payload.tiedTeamIds,
        sounds,
        event.at,
      );
      return;

    case 'RACE_TIMEOUT': {
      const q = state.question!;
      q.race = null;
      q.fsm = q.triedTeamIds.length > 0 ? 'Q_STEAL_RACE_OPEN' : 'Q_IDLE';
      sounds.push('timeout');
      return;
    }

    case 'ADMIN_HIT':
      applyHit(state, state.question!, event.payload.answerId, sounds);
      return;

    case 'ADMIN_MISS':
      applyMiss(state, state.question!, sounds, event.at);
      return;

    case 'ADMIN_FORCE_CONTROL':
      applyForceControl(state, state.question!, event.payload.teamId, sounds);
      return;

    case 'ADMIN_PASS_TO_STEAL': {
      const q = state.question!;
      q.strikes = 3;
      if (q.controllingTeamId && !q.triedTeamIds.includes(q.controllingTeamId)) {
        q.triedTeamIds.push(q.controllingTeamId);
      }
      enterStealPhase(state, q, sounds, event.at);
      return;
    }

    case 'ADMIN_REVEAL_ONE':
      applyRevealOne(state.question!, event.payload.answerId, sounds);
      return;

    case 'ADMIN_REVEAL_REST':
      applyRevealRest(state.question!, sounds);
      return;

    case 'ADMIN_CONTINUE':
      applyContinue(state.question!);
      return;

    case 'ADMIN_NEXT_QUESTION':
      nextQuestion(state, sounds);
      return;

    case 'ADMIN_SKIP_QUESTION': {
      const replacement = event.payload.question as FrozenQuestion;
      state.questions[replacement.id] = replacement;
      state.questionOrder[state.qIndex] = replacement.id;
      state.question = buildQuestionState(state, replacement.id, state.qIndex);
      sounds.push('transition');
      return;
    }

    case 'ADMIN_ADJUST_SCORE': {
      const team = findTeam(state, event.payload.teamId);
      if (team) team.score += event.payload.delta;
      return;
    }

    case 'ADMIN_GOTO_LEADERBOARD':
    case 'ADMIN_SKIP_TO_LEADERBOARD':
      state.phase = GamePhase.LEADERBOARD;
      state.question = null;
      sounds.push('leaderboard', 'winner');
      return;

    // ---------------------------------------------------------------- finał
    case 'ADMIN_START_FINAL':
      // Pytania finałowe mogą pochodzić spoza pakietów rundy głównej, więc event
      // przynosi ich zamrożone kopie — inaczej panel i telewizor zostają z pustką.
      for (const question of (event.payload.questions ?? []) as FrozenQuestion[]) {
        state.questions[question.id] = question;
      }
      state.phase = GamePhase.FINAL;
      state.final = createFinalState(
        state,
        event.payload.teamId,
        event.payload.p1Name,
        event.payload.p2Name,
        event.payload.questionIds,
      );
      sounds.push('final_intro');
      return;

    case 'ADMIN_FINAL_BEGIN_TURN':
      beginTurn(state, state.final!, event.payload.player, sounds);
      return;

    case 'ADMIN_FINAL_START_TIMER':
      startAnswering(state.final!, sounds);
      return;

    case 'ADMIN_FINAL_PAUSE':
      pauseTimer(state.final!, event.at);
      return;

    case 'ADMIN_FINAL_RESUME':
      resumeTimer(state.final!, event.at);
      return;

    case 'FINAL_TIMER_EXPIRED':
      endTurn(state.final!, sounds, true);
      return;

    case 'ADMIN_FINAL_HIT':
      applyFinalHit(state, state.final!, event.payload.answerId, sounds);
      if (turnComplete(state.final!)) endTurn(state.final!, sounds, false);
      return;

    case 'ADMIN_FINAL_MISS':
      applyFinalMiss(state.final!, sounds, event.payload.text);
      if (turnComplete(state.final!)) endTurn(state.final!, sounds, false);
      return;

    case 'ADMIN_FINAL_PASS':
      applyFinalPass(state.final!, sounds);
      return;

    case 'ADMIN_FINAL_END_TURN':
      endTurn(state.final!, sounds, false);
      return;

    case 'ADMIN_FINAL_BEGIN_REVEAL':
      beginReveal(state.final!);
      return;

    case 'ADMIN_FINAL_REVEAL_NEXT':
      revealNext(state, state.final!, sounds);
      return;

    // ----------------------------------------------------------- zakończenie
    case 'ADMIN_FINISH':
      state.phase = GamePhase.FINISHED;
      state.finishedAt = event.at;
      return;

    case 'ADMIN_ABORT':
      state.phase = GamePhase.ABORTED;
      state.finishedAt = event.at;
      return;
  }
}

/**
 * Powrót do lobby: punktacja i przebieg znikają, ale drużyny zostają — telefony
 * są już połączone i nikt nie chce wpisywać nazw drugi raz. Wybrane pytania też
 * zostają, więc powtórka to jedno kliknięcie „Rozpocznij grę".
 */
function resetToLobby(state: GameState): void {
  state.phase = GamePhase.LOBBY;
  state.qIndex = 0;
  state.question = null;
  state.final = null;
  state.history = [];
  state.startedAt = null;
  state.finishedAt = null;
  for (const team of state.teams) {
    team.score = 0;
    team.racesWon = 0;
    team.questionsWon = 0;
  }
}

/**
 * Domknięcie pytania: zapis do historii, a potem albo tabela wyników między
 * pytaniami, albo ranking końcowy po ostatnim.
 */
function nextQuestion(state: GameState, sounds: SoundKey[]): void {
  if (state.phase === GamePhase.ROUND_SUMMARY) {
    state.qIndex += 1;
    state.phase = GamePhase.MAIN_ROUND;
    state.question = buildQuestionState(state, state.questionOrder[state.qIndex], state.qIndex);
    sounds.push('transition');
    return;
  }

  const q = state.question;
  if (q) {
    state.history.push({
      qIndex: state.qIndex,
      questionId: q.questionId,
      winnerTeamId: q.awardedTo,
      pool: q.awardedAmount,
      forfeited: q.forfeited,
    });
  }

  const isLast = state.qIndex >= state.config.questionsPerGame - 1;
  if (isLast) {
    state.phase = GamePhase.LEADERBOARD;
    state.question = null;
    sounds.push('leaderboard', 'winner');
    return;
  }

  state.phase = GamePhase.ROUND_SUMMARY;
  sounds.push('scores');
}

export { allSlotsRevealed };
