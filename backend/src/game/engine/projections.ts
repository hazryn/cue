/**
 * Redakcja stanu per rola.
 *
 * TV nigdy nie dostaje tekstów nieodsłoniętych odpowiedzi — i to nie jest
 * kosmetyka. W finale gracz 2 wraca do pokoju i patrzy dokładnie na ten ekran;
 * gdyby projekcja przepuściła odpowiedzi gracza 1, cała runda byłaby do wyrzucenia.
 * WS da się podsłuchać, więc bezpieczeństwo opiera się na redakcji danych,
 * a nie na tym, czego frontend nie renderuje.
 */
import {
  AdminFinalAnswerView,
  AdminFinalView,
  AdminQuestionView,
  AdminView,
  ArmedReason,
  FinalState,
  GamePhase,
  GameState,
  PlayerView,
  PresenceEntry,
  RaceState,
  RaceView,
  SlotView,
  TeamView,
  TvFinalSlotView,
  TvFinalView,
  TvQuestionView,
  TvView,
  UndoEntry,
  Uuid,
} from '@cue/shared';
import { activeTeams, questionById, raceArmsAt } from './state';
import { orderedSlots } from './final.fsm';
import { ranking } from './scoring';

export interface ProjectionContext {
  seq: number;
  gameId: Uuid;
  presence: Map<Uuid, PresenceEntry>;
  undoStack: UndoEntry[];
  joinUrl: string;
  spareQuestions: number;
}

const connectedOf = (ctx: ProjectionContext, teamId: Uuid) => ctx.presence.get(teamId)?.connected ?? false;

function teamViews(state: GameState, ctx: ProjectionContext): TeamView[] {
  return activeTeams(state).map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    score: t.score,
    connected: connectedOf(ctx, t.id),
  }));
}

// -------------------------------------------------------------------- TV

export function projectTv(state: GameState, ctx: ProjectionContext): TvView {
  return {
    role: 'tv',
    seq: ctx.seq,
    phase: state.phase,
    teams: teamViews(state, ctx),
    question: tvQuestion(state),
    final: tvFinal(state),
    history: state.history,
    ranking: ranking(state),
    joinUrl: ctx.joinUrl,
  };
}

function tvQuestion(state: GameState): TvQuestionView | null {
  const q = state.question;
  if (!q) return null;
  const question = questionById(state, q.questionId);
  if (!question) return null;

  const slots: SlotView[] = q.slots.map((slot, i) => {
    const answer = question.answers.find((a) => a.id === slot.answerId);
    return {
      position: answer?.position ?? i,
      revealed: slot.revealed,
      text: slot.revealed ? (answer?.text ?? null) : null,
      weight: slot.revealed ? (answer?.weight ?? null) : null,
      revealedBy: slot.revealedBy,
    };
  });

  return {
    fsm: q.fsm,
    index: state.qIndex,
    total: state.config.questionsPerGame,
    text: q.questionRevealed ? question.text : null,
    multiplier: q.multiplier,
    slots,
    pool: q.pool,
    controllingTeamId: q.controllingTeamId,
    stealingTeamId: q.stealingTeamId,
    strikes: q.strikes,
    triedTeamIds: q.triedTeamIds,
    race: q.race ? raceView(q.race) : null,
    awardedTo: q.awardedTo,
    awardedAmount: q.awardedAmount,
    forfeited: q.forfeited,
  };
}

/** Faza, w której cokolwiek z odpowiedzi finałowych wolno pokazać na TV. */
function finalRevealPhase(final: FinalState): boolean {
  return final.fsm === 'F_REVEAL' || final.fsm === 'F_RESULT';
}

function tvFinal(state: GameState): TvFinalView | null {
  const final = state.final;
  if (!final) return null;
  const team = state.teams.find((t) => t.id === final.teamId);
  const revealing = finalRevealPhase(final);
  const currentQuestion = questionById(state, final.questionIds[final.qCursor] ?? '');
  // Pytanie pojawia się dopiero po „Start tury" — przed nim gracz jeszcze
  // siada przed telewizorem i nie powinien mieć czasu na zastanowienie.
  const turnRunning = ['F_P1_RUNNING', 'F_P1_PAUSED', 'F_P2_RUNNING', 'F_P2_PAUSED'].includes(final.fsm);
  const ordered = orderedSlots(final);
  // Ostatnio odsłonięty slot; przed pierwszym kliknięciem — pierwszy w kolejce
  const focus = revealing ? ordered[Math.max(final.revealCursor - 1, 0)] : undefined;

  const slots: TvFinalSlotView[] = ordered.map((slot) => {
    const answered = slot.result !== 'UNANSWERED' && slot.result !== 'PASS';
    // Wynik slotu gracza 1 ukrywamy, gdy przy TV siedzi już gracz 2.
    const resultVisible = revealing
      ? slot.revealed
      : final.turn !== null && slot.player === final.turn;
    const answer = slot.answerId
      ? currentAnswerText(state, final, slot.qIdx, slot.answerId)
      : slot.customText;

    return {
      player: slot.player,
      qIdx: slot.qIdx,
      answered,
      revealed: revealing && slot.revealed,
      result: resultVisible ? slot.result : null,
      text: revealing && slot.revealed ? answer : null,
      points: revealing && slot.revealed ? slot.points : null,
      // Także w F_RESULT: telewizor przez chwilę pokazuje ostatnie odsłonięcie, zanim wjedzie werdykt
      current: revealing && final.revealCursor > 0 && slot === focus,
    };
  });

  return {
    fsm: final.fsm,
    teamId: final.teamId,
    teamName: team?.name ?? '',
    p1Name: final.p1Name,
    p2Name: final.p2Name,
    turn: final.turn,
    qCursor: final.qCursor,
    questionCount: final.questionIds.length,
    currentQuestionText: turnRunning ? (currentQuestion?.text ?? null) : null,
    // Pytania nie są tajne — gracze je słyszeli — więc pokazujemy je bez ograniczeń
    revealQuestionText:
      revealing && focus ? questionTextOf(state, final, focus.qIdx) : null,
    slots,
    revealCursor: final.revealCursor,
    total: revealing ? final.total : 0,
    threshold: state.config.finalThreshold,
    won: final.fsm === 'F_RESULT' ? final.total >= state.config.finalThreshold : null,
  };
}

function questionTextOf(state: GameState, final: FinalState, qIdx: number): string | null {
  return questionById(state, final.questionIds[qIdx] ?? '')?.text ?? null;
}

function currentAnswerText(state: GameState, final: FinalState, qIdx: number, answerId: Uuid): string | null {
  const question = questionById(state, final.questionIds[qIdx]);
  return question?.answers.find((a) => a.id === answerId)?.text ?? null;
}

// ----------------------------------------------------------------- ADMIN

export function projectAdmin(state: GameState, ctx: ProjectionContext): AdminView {
  return {
    role: 'admin',
    seq: ctx.seq,
    gameId: ctx.gameId,
    phase: state.phase,
    config: state.config,
    teams: teamViews(state, ctx),
    qIndex: state.qIndex,
    questionOrder: state.questionOrder,
    question: adminQuestion(state),
    final: adminFinal(state),
    history: state.history,
    ranking: ranking(state),
    presence: activeTeams(state).map(
      (t) =>
        ctx.presence.get(t.id) ?? {
          teamId: t.id,
          connected: false,
          rttMs: null,
          clockOffsetMs: null,
          clockStdDevMs: null,
          lastSeenAt: null,
        },
    ),
    undoStack: ctx.undoStack,
    spareQuestions: ctx.spareQuestions,
  };
}

function adminQuestion(state: GameState): AdminQuestionView | null {
  const q = state.question;
  if (!q) return null;
  const question = questionById(state, q.questionId);
  if (!question) return null;

  return {
    fsm: q.fsm,
    index: state.qIndex,
    total: state.config.questionsPerGame,
    questionId: q.questionId,
    text: question.text,
    note: question.note,
    multiplier: q.multiplier,
    questionRevealed: q.questionRevealed,
    answers: question.answers
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((a) => {
        const slot = q.slots.find((s) => s.answerId === a.id);
        return {
          id: a.id,
          text: a.text,
          weight: a.weight,
          position: a.position,
          revealed: slot?.revealed ?? false,
          revealedBy: slot?.revealedBy ?? null,
        };
      }),
    pool: q.pool,
    controllingTeamId: q.controllingTeamId,
    stealingTeamId: q.stealingTeamId,
    strikes: q.strikes,
    triedTeamIds: q.triedTeamIds,
    race: q.race ? raceView(q.race) : null,
    awardedTo: q.awardedTo,
    awardedAmount: q.awardedAmount,
    forfeited: q.forfeited,
  };
}

function adminFinal(state: GameState): AdminFinalView | null {
  const final = state.final;
  if (!final) return null;
  const team = state.teams.find((t) => t.id === final.teamId);
  const question = questionById(state, final.questionIds[final.qCursor] ?? '');

  const currentAnswers: AdminFinalAnswerView[] = (question?.answers ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((a) => ({
      id: a.id,
      text: a.text,
      weight: a.weight,
      position: a.position,
      // Ostrzeżenie o duplikacie widoczne ZANIM admin kliknie.
      takenByPlayer1: final.slots.some(
        (s) => s.player === 1 && s.qIdx === final.qCursor && s.result === 'HIT' && s.answerId === a.id,
      ),
      takenByPlayer2: final.slots.some(
        (s) => s.player === 2 && s.qIdx === final.qCursor && s.result === 'HIT' && s.answerId === a.id,
      ),
    }));

  return {
    fsm: final.fsm,
    teamId: final.teamId,
    teamName: team?.name ?? '',
    p1Name: final.p1Name,
    p2Name: final.p2Name,
    turn: final.turn,
    qCursor: final.qCursor,
    questionCount: final.questionIds.length,
    currentQuestionText: question?.text ?? null,
    currentAnswers,
    nextRevealQuestionText:
      final.fsm === 'F_REVEAL'
        ? questionTextOf(state, final, orderedSlots(final)[final.revealCursor]?.qIdx ?? -1)
        : null,
    slots: orderedSlots(final).map((s) => ({
      player: s.player,
      qIdx: s.qIdx,
      questionText: questionTextOf(state, final, s.qIdx),
      result: s.result,
      answerId: s.answerId,
      text: s.answerId ? currentAnswerText(state, final, s.qIdx, s.answerId) : s.customText,
      points: s.points,
      revealed: s.revealed,
    })),
    duplicateBuzzes: final.duplicateBuzzes,
    revealCursor: final.revealCursor,
    total: final.total,
    threshold: state.config.finalThreshold,
    won: final.fsm === 'F_RESULT' ? final.total >= state.config.finalThreshold : null,
  };
}

// ---------------------------------------------------------------- PLAYER

export interface PlayerContext extends ProjectionContext {
  teamId: Uuid;
  /** Czy ta drużyna nacisnęła już grzybek w bieżącym wyścigu */
  pressedInRace: boolean;
  lockedOut: boolean;
  clockReady: boolean;
  lastRace: PlayerView['lastRace'];
}

export function projectPlayer(state: GameState, ctx: PlayerContext): PlayerView {
  const team = state.teams.find((t) => t.id === ctx.teamId);
  const q = state.question;
  const race = q?.race ?? null;
  const rank = ranking(state).find((r) => r.teamId === ctx.teamId);

  let armed = false;
  let reason: ArmedReason = 'WAITING';

  if (state.phase !== GamePhase.MAIN_ROUND || !race) {
    reason = state.phase === GamePhase.MAIN_ROUND ? 'WAITING' : 'GAME_NOT_RUNNING';
  } else if (!race.eligible.includes(ctx.teamId)) {
    reason = 'NOT_ELIGIBLE';
  } else if (ctx.pressedInRace) {
    reason = 'ALREADY_PRESSED';
  } else if (ctx.lockedOut) {
    reason = 'LOCKED_OUT';
  } else if (!ctx.clockReady) {
    reason = 'SYNCING';
  } else {
    armed = true;
    reason = 'ARMED';
  }

  return {
    role: 'player',
    seq: ctx.seq,
    phase: state.phase,
    teamId: ctx.teamId,
    teamName: team?.name ?? '',
    teamColor: team?.color ?? '#888888',
    score: team?.score ?? 0,
    place: rank?.place ?? null,
    armed,
    armedReason: reason,
    raceId: race?.id ?? null,
    raceKind: race?.kind ?? null,
    raceArmsAt: race ? raceArmsAt(race) : null,
    lastRace: ctx.lastRace,
    hasControl: q?.controllingTeamId === ctx.teamId || q?.stealingTeamId === ctx.teamId,
    strikes: q?.controllingTeamId === ctx.teamId ? (q?.strikes ?? 0) : 0,
    teams: teamViews(state, ctx),
  };
}

function raceView(race: RaceState): RaceView {
  return { id: race.id, kind: race.kind, eligible: race.eligible, openedAt: race.openedAt, armsAt: raceArmsAt(race) };
}
