/** Fabryki do testów silnika — bez bazy, bez Nesta. */
import { FrozenQuestion, GameEvent, GameState, Uuid } from '@cue/shared';
import { initialState } from '../state';
import { reduce } from '../reducer';

let clock = 1_700_000_000_000;
export const tick = (ms = 1000) => (clock += ms);

export function makeQuestion(id: string, weights: number[], kind: 'MAIN' | 'FINAL' = 'MAIN'): FrozenQuestion {
  return {
    id,
    kind,
    text: `Pytanie ${id}`,
    note: null,
    answers: weights.map((weight, position) => ({
      id: `${id}-a${position}`,
      text: `Odpowiedź ${position}`,
      weight,
      position,
    })),
  };
}

export interface HarnessOptions {
  teams?: string[];
  questions?: FrozenQuestion[];
  finalQuestions?: FrozenQuestion[];
}

/** Stan tuż po starcie gry: drużyny w komplecie, pytanie 1 załadowane. */
export function startedGame(opts: HarnessOptions = {}): { state: GameState; teamIds: Uuid[] } {
  const names = opts.teams ?? ['Czerwoni', 'Zieloni', 'Niebiescy'];
  const questions = opts.questions ?? Array.from({ length: 10 }, (_, i) => makeQuestion(`q${i}`, [40, 30, 20, 10]));

  let state = initialState();
  const teamIds: Uuid[] = [];

  names.forEach((name, i) => {
    const teamId = `team-${i}`;
    teamIds.push(teamId);
    state = apply(state, {
      type: 'TEAM_JOIN',
      at: tick(),
      actor: 'player',
      payload: { teamId, name, color: `#00000${i}` },
    });
  });

  for (const q of [...questions, ...(opts.finalQuestions ?? [])]) state.questions[q.id] = q;

  state = apply(state, {
    type: 'ADMIN_SETUP_GAME',
    at: tick(),
    actor: 'admin',
    payload: { questionOrder: questions.map((q) => q.id), finalQuestionIds: (opts.finalQuestions ?? []).map((q) => q.id) },
  });
  state = apply(state, { type: 'ADMIN_START_GAME', at: tick(), actor: 'admin', payload: {} });

  return { state, teamIds };
}

export function apply(state: GameState, event: GameEvent): GameState {
  return reduce(state, event).state;
}

export function soundsOf(state: GameState, event: GameEvent): string[] {
  return reduce(state, event).sounds;
}

/** Skrót: otwórz wyścig i przyznaj go wskazanej drużynie. */
export function winRace(state: GameState, teamId: Uuid, raceId = `race-${tick(0)}`): GameState {
  const opened = apply(state, { type: 'ADMIN_OPEN_RACE', at: tick(), actor: 'admin', payload: { raceId } });
  const actualRaceId = opened.question!.race!.id;
  return apply(opened, {
    type: 'RACE_RESOLVED',
    at: tick(),
    actor: 'system',
    payload: { raceId: actualRaceId, winnerTeamId: teamId, tiedTeamIds: [] },
  });
}

export const hit = (state: GameState, answerId: string): GameState =>
  apply(state, { type: 'ADMIN_HIT', at: tick(), actor: 'admin', payload: { answerId } });

export const miss = (state: GameState): GameState =>
  apply(state, { type: 'ADMIN_MISS', at: tick(), actor: 'admin', payload: {} });

export const strikeOut = (state: GameState): GameState => miss(miss(miss(state)));
