/**
 * Final FSM.
 *
 * Dwie tury tej samej piątki pytań. Gracz 2 jest wyprowadzany z pokoju na czas
 * tury gracza 1, a potem nie może powtarzać odpowiedzi partnera. Tury nie mają
 * limitu czasu — tempo nadaje prowadzący.
 * Punkty pozostają ukryte do fazy F_REVEAL — patrz projections.ts.
 */
import { FinalSlot, FinalState, GameState, SoundKey, Uuid } from '@cue/shared';
import { questionById } from './state';

export function createFinalState(
  state: GameState,
  teamId: Uuid,
  p1Name: string,
  p2Name: string,
  questionIds: Uuid[],
): FinalState {
  const slots: FinalSlot[] = [];
  for (const player of [1, 2] as const) {
    for (let qIdx = 0; qIdx < questionIds.length; qIdx++) {
      slots.push({
        player,
        qIdx,
        result: 'UNANSWERED',
        answerId: null,
        customText: null,
        points: 0,
        revealed: false,
      });
    }
  }
  return {
    fsm: 'F_SETUP',
    teamId,
    questionIds,
    p1Name,
    p2Name,
    turn: null,
    qCursor: 0,
    timer: { totalMs: 0, remainingMs: 0, deadlineAt: null, running: false },
    slots,
    duplicateBuzzes: 0,
    revealCursor: 0,
    total: 0,
  };
}

export function slotOf(final: FinalState, player: 1 | 2, qIdx: number): FinalSlot | undefined {
  return final.slots.find((s) => s.player === player && s.qIdx === qIdx);
}

export function beginTurn(state: GameState, final: FinalState, player: 1 | 2, sounds: SoundKey[]): void {
  final.turn = player;
  final.qCursor = 0;
  final.timer = { totalMs: 0, remainingMs: 0, deadlineAt: null, running: false };
  final.fsm = player === 1 ? 'F_P1_READY' : 'F_P2_READY';
  sounds.push('final_intro');
}

/**
 * Start tury — bez zegara. Prowadzący na telefonie nie nadążał jednocześnie
 * pilnować czasu i zaznaczać odpowiedzi, więc tura kończy się po ostatnim
 * pytaniu albo ręcznie („Zakończ turę"). Zdarzenie wciąż nazywa się
 * ADMIN_FINAL_START_TIMER, żeby stare logi dało się odtworzyć przy cofaniu.
 */
export function startAnswering(final: FinalState, sounds: SoundKey[]): void {
  final.timer.deadlineAt = null;
  final.timer.running = false;
  final.fsm = final.turn === 1 ? 'F_P1_RUNNING' : 'F_P2_RUNNING';
  sounds.push('final_timer_start');
}

export function pauseTimer(final: FinalState, at: number): void {
  if (final.timer.deadlineAt !== null) {
    final.timer.remainingMs = Math.max(0, final.timer.deadlineAt - at);
  }
  final.timer.deadlineAt = null;
  final.timer.running = false;
  final.fsm = final.turn === 1 ? 'F_P1_PAUSED' : 'F_P2_PAUSED';
}

export function resumeTimer(final: FinalState, at: number): void {
  final.timer.deadlineAt = at + final.timer.remainingMs;
  final.timer.running = true;
  final.fsm = final.turn === 1 ? 'F_P1_RUNNING' : 'F_P2_RUNNING';
}

export function endTurn(final: FinalState, sounds: SoundKey[], expired: boolean): void {
  if (final.turn === null) return;
  for (const slot of final.slots) {
    if (slot.player === final.turn && slot.result === 'PASS') slot.result = 'UNANSWERED';
  }
  final.timer.running = false;
  final.timer.deadlineAt = null;
  if (expired) {
    final.timer.remainingMs = 0;
    sounds.push('final_time_up');
  }
  final.fsm = final.turn === 1 ? 'F_P1_DONE' : 'F_P2_DONE';
}

/** Czy odpowiedź jest już zajęta przez gracza 1 (duplikat w turze gracza 2). */
export function isDuplicate(final: FinalState, answerId: Uuid): boolean {
  return final.slots.some((s) => s.player === 1 && s.result === 'HIT' && s.answerId === answerId);
}

export function applyFinalHit(
  state: GameState,
  final: FinalState,
  answerId: Uuid,
  sounds: SoundKey[],
): void {
  if (final.turn === null) return;

  if (final.turn === 2 && isDuplicate(final, answerId)) {
    // Brzęczyk, ale pytanie zostaje — gracz próbuje dalej albo mówi „pas".
    final.duplicateBuzzes += 1;
    sounds.push('duplicate_buzz');
    return;
  }

  const slot = slotOf(final, final.turn, final.qCursor);
  if (!slot) return;
  const question = questionById(state, final.questionIds[final.qCursor]);
  const weight = question?.answers.find((a) => a.id === answerId)?.weight ?? 0;

  slot.result = 'HIT';
  slot.answerId = answerId;
  slot.customText = null;
  slot.points = weight;
  // Neutralne potwierdzenie — ten sam dźwięk co przy błędzie, żeby gracz 2
  // nie wywnioskował po dźwięku, czy trafił.
  sounds.push('final_ok');
  advanceCursor(final);
}

/**
 * Odpowiedź, której nie ma na liście: zero punktów, ale zapisujemy jej treść.
 * Przy odsłanianiu widz zobaczy, co gracz powiedział — bez tego plansza pokazuje
 * puste miejsce i nikt nie pamięta, o co poszło.
 */
export function applyFinalMiss(final: FinalState, sounds: SoundKey[], text?: string): void {
  if (final.turn === null) return;
  const slot = slotOf(final, final.turn, final.qCursor);
  if (!slot) return;
  slot.result = 'MISS';
  slot.answerId = null;
  slot.customText = text?.trim() ? text.trim() : null;
  slot.points = 0;
  sounds.push('final_ok');
  advanceCursor(final);
}

export function applyFinalPass(final: FinalState, sounds: SoundKey[]): void {
  if (final.turn === null) return;
  const slot = slotOf(final, final.turn, final.qCursor);
  if (!slot) return;
  if (slot.result === 'UNANSWERED') slot.result = 'PASS';
  sounds.push('final_pass');
  advanceCursor(final);
}

/**
 * Kolejne pytanie: najpierw nietknięte w przód, potem pominięte (PASS) od początku.
 * Gdy wszystko rozstrzygnięte — tura kończy się sama.
 */
export function advanceCursor(final: FinalState): void {
  if (final.turn === null) return;
  const count = final.questionIds.length;
  const resultAt = (idx: number) => slotOf(final, final.turn as 1 | 2, idx)?.result ?? 'UNANSWERED';

  for (let i = final.qCursor + 1; i < count; i++) {
    if (resultAt(i) === 'UNANSWERED') {
      final.qCursor = i;
      return;
    }
  }
  for (let i = 0; i < count; i++) {
    if (resultAt(i) === 'UNANSWERED' || resultAt(i) === 'PASS') {
      final.qCursor = i;
      return;
    }
  }
  final.qCursor = count - 1;
}

export function turnComplete(final: FinalState): boolean {
  if (final.turn === null) return false;
  return final.slots
    .filter((s) => s.player === final.turn)
    .every((s) => s.result === 'HIT' || s.result === 'MISS');
}

export function beginReveal(final: FinalState): void {
  final.fsm = 'F_REVEAL';
  final.revealCursor = 0;
  final.total = 0;
}

export function revealNext(state: GameState, final: FinalState, sounds: SoundKey[]): void {
  const ordered = orderedSlots(final);
  const slot = ordered[final.revealCursor];
  if (!slot) return;
  slot.revealed = true;
  final.total += slot.points;
  final.revealCursor += 1;
  sounds.push(slot.points > 0 ? 'final_reveal' : 'final_reveal_zero');

  if (final.revealCursor >= ordered.length) {
    final.fsm = 'F_RESULT';
    sounds.push(final.total >= state.config.finalThreshold ? 'final_win' : 'final_lose');
  }
}

/** Kolejność odsłaniania: najpierw komplet gracza 1, potem gracza 2. */
export function orderedSlots(final: FinalState): FinalSlot[] {
  return final.slots
    .slice()
    .sort((a, b) => (a.player !== b.player ? a.player - b.player : a.qIdx - b.qIdx));
}
