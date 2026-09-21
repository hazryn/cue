/**
 * Question FSM — runda główna.
 *
 * Wszystkie funkcje mutują przekazany draft stanu (reducer klonuje przed wywołaniem)
 * i dopisują dźwięki do listy. Zero I/O, zero zegara — czas przychodzi w evencie.
 */
import { GameState, QuestionState, SoundKey, Uuid } from '@cue/shared';
import {
  allSlotsRevealed,
  answerWeight,
  currentQuestion,
  findTeam,
  stealArmsAt,
  stealCandidates,
} from './state';
import { awardPool, poolIncrement } from './scoring';

export function openRace(q: QuestionState, raceId: Uuid, kind: 'MAIN' | 'STEAL' | 'TIEBREAK', eligible: Uuid[], at: number): void {
  q.race = { id: raceId, kind, eligible, openedAt: at, closesAt: null };
  q.fsm = kind === 'STEAL' ? 'Q_STEAL_RACE_OPEN' : 'Q_RACE_OPEN';
}

/** Trafienie drużyny kontrolującej. */
export function applyHit(state: GameState, q: QuestionState, answerId: Uuid, sounds: SoundKey[]): void {
  const question = currentQuestion(state);
  if (!question) return;
  const slot = q.slots.find((s) => s.answerId === answerId);
  if (!slot || slot.revealed) return;

  const teamId = q.fsm === 'Q_STEAL_ATTEMPT' ? q.stealingTeamId : q.controllingTeamId;
  slot.revealed = true;
  slot.revealedBy = teamId;
  q.pool += poolIncrement(answerWeight(question, answerId), q.multiplier);

  const isTopAnswer = question.answers.find((a) => a.id === answerId)?.position === 0;
  sounds.push(isTopAnswer ? 'hit_top' : 'hit');

  if (q.fsm === 'Q_STEAL_ATTEMPT') {
    // Przejmujący trafił: bierze narosłą pulę wraz z wagą własnej odpowiedzi.
    if (q.stealingTeamId) awardPool(state, q, q.stealingTeamId);
    q.fsm = 'Q_AWARD';
    sounds.push('steal_win', 'pool_award');
    return;
  }

  if (allSlotsRevealed(q)) {
    // Plansza domknięta przed trzecim X — szczyt emocji rundy, własny jingiel.
    if (q.controllingTeamId) awardPool(state, q, q.controllingTeamId);
    q.fsm = 'Q_AWARD';
    sounds.push('board_clear', 'pool_award');
  }
}

/** Błędna odpowiedź. W Q_CONTROL dokłada X, w Q_STEAL_ATTEMPT kończy próbę przejęcia. */
export function applyMiss(state: GameState, q: QuestionState, sounds: SoundKey[], at: number): void {
  if (q.fsm === 'Q_STEAL_ATTEMPT') {
    if (q.stealingTeamId && !q.triedTeamIds.includes(q.stealingTeamId)) {
      q.triedTeamIds.push(q.stealingTeamId);
    }
    q.stealingTeamId = null;
    sounds.push('steal_fail');
    enterStealPhase(state, q, sounds, at);
    return;
  }

  q.strikes += 1;
  sounds.push(q.strikes === 1 ? 'strike_1' : q.strikes === 2 ? 'strike_2' : 'strike_3');

  if (q.strikes >= 3) {
    if (q.controllingTeamId && !q.triedTeamIds.includes(q.controllingTeamId)) {
      q.triedTeamIds.push(q.controllingTeamId);
    }
    enterStealPhase(state, q, sounds, at);
  }
}

/**
 * Wejście w fazę przejęcia z auto-przejściami:
 *   0 kandydatów → pula przepada,
 *   1 kandydat   → od razu jego próba (przypadek dwóch drużyn, bez wyścigu),
 *   2+           → wyścig grzybkowy między nimi.
 */
export function enterStealPhase(state: GameState, q: QuestionState, sounds: SoundKey[], at: number): void {
  const candidates = stealCandidates(state, q);
  q.race = null;

  if (candidates.length === 0) {
    q.fsm = 'Q_FORFEIT_REVEAL';
    q.forfeited = true;
    q.pool = 0;
    sounds.push('pool_lost');
    return;
  }

  if (candidates.length === 1) {
    q.stealingTeamId = candidates[0].id;
    q.fsm = 'Q_STEAL_ATTEMPT';
    sounds.push('steal_open');
    return;
  }

  q.fsm = 'Q_STEAL_RACE_OPEN';
  q.stealingTeamId = null;
  q.race = {
    id: `${q.questionId}:steal:${at}`,
    kind: 'STEAL',
    eligible: candidates.map((c) => c.id),
    openedAt: at,
    armsAt: stealArmsAt(state, at),
    closesAt: null,
  };
  sounds.push('steal_open');
}

/** Rozstrzygnięcie wyścigu przez BuzzerService (zwycięzca albo remis do dogrywki). */
export function applyRaceResolved(
  state: GameState,
  q: QuestionState,
  winnerTeamId: Uuid | null,
  tiedTeamIds: Uuid[],
  sounds: SoundKey[],
  at: number,
): void {
  const race = q.race;
  if (!race) return;

  if (!winnerTeamId && tiedTeamIds.length > 1) {
    // Różnica poniżej dokładności pomiaru — uczciwa dogrywka zamiast rzutu monetą.
    q.race = { id: `${race.id}:tb:${at}`, kind: 'TIEBREAK', eligible: tiedTeamIds, openedAt: at, closesAt: null };
    q.fsm = race.kind === 'STEAL' ? 'Q_STEAL_RACE_OPEN' : 'Q_RACE_OPEN';
    sounds.push('tiebreak');
    return;
  }

  if (!winnerTeamId) return;

  const team = findTeam(state, winnerTeamId);
  if (team) team.racesWon += 1;
  q.race = null;
  sounds.push('buzz_win');

  if (race.kind === 'STEAL') {
    q.stealingTeamId = winnerTeamId;
    q.fsm = 'Q_STEAL_ATTEMPT';
  } else {
    q.controllingTeamId = winnerTeamId;
    q.strikes = 0;
    q.fsm = 'Q_CONTROL';
  }
}

/** Pojedyncze odsłonięcie w fazie prezentacji (bez punktów dla kogokolwiek). */
export function applyRevealOne(q: QuestionState, answerId: Uuid, sounds: SoundKey[]): void {
  const slot = q.slots.find((s) => s.answerId === answerId);
  if (!slot || slot.revealed) return;
  slot.revealed = true;
  slot.revealedBy = null;
  sounds.push('reveal_single');
  if (allSlotsRevealed(q)) q.fsm = 'Q_CLOSED';
}

export function applyRevealRest(q: QuestionState, sounds: SoundKey[]): void {
  for (const slot of q.slots) {
    if (!slot.revealed) {
      slot.revealed = true;
      slot.revealedBy = null;
    }
  }
  sounds.push('reveal_single');
  q.fsm = 'Q_CLOSED';
}

/** Po przyznaniu puli: jeśli zostały nieodsłonięte odpowiedzi, pokazujemy je widzom. */
export function applyContinue(q: QuestionState): void {
  q.fsm = allSlotsRevealed(q) ? 'Q_CLOSED' : 'Q_FORFEIT_REVEAL';
}

export function applyForceControl(state: GameState, q: QuestionState, teamId: Uuid, sounds: SoundKey[]): void {
  q.race = null;
  if (q.fsm === 'Q_STEAL_RACE_OPEN' || q.fsm === 'Q_STEAL_RACE_RESOLVING') {
    q.stealingTeamId = teamId;
    q.fsm = 'Q_STEAL_ATTEMPT';
  } else {
    q.controllingTeamId = teamId;
    q.strikes = 0;
    q.fsm = 'Q_CONTROL';
  }
  sounds.push('buzz_win');
}
