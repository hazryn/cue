/**
 * Undo opiera się na założeniu, że replay logu daje identyczny stan jak gra
 * na żywo. Gdyby reduktor sięgnął po Date.now() albo losowość, to założenie
 * pada i undo zaczyna po cichu psuć punktację.
 */
import { GameEvent, GameState } from '@cue/shared';
import { replay } from '../reducer';
import { initialState } from '../state';
import { makeQuestion, tick } from './helpers';

function scriptedGame(): { events: GameEvent[]; seed: GameState } {
  const questions = Array.from({ length: 10 }, (_, i) => makeQuestion(`q${i}`, [40, 30, 20, 10]));
  const seed = initialState();
  for (const q of questions) seed.questions[q.id] = q;

  const events: GameEvent[] = [
    { type: 'TEAM_JOIN', at: tick(), actor: 'player', payload: { teamId: 't0', name: 'Czerwoni', color: '#f00' } },
    { type: 'TEAM_JOIN', at: tick(), actor: 'player', payload: { teamId: 't1', name: 'Zieloni', color: '#0f0' } },
    { type: 'TEAM_JOIN', at: tick(), actor: 'player', payload: { teamId: 't2', name: 'Niebiescy', color: '#00f' } },
    {
      type: 'ADMIN_SETUP_GAME',
      at: tick(),
      actor: 'admin',
      payload: { questionOrder: questions.map((q) => q.id), finalQuestionIds: [] },
    },
    { type: 'ADMIN_START_GAME', at: tick(), actor: 'admin', payload: {} },
    { type: 'ADMIN_OPEN_RACE', at: tick(), actor: 'admin', payload: { raceId: 'r1' } },
    { type: 'RACE_RESOLVED', at: tick(), actor: 'system', payload: { raceId: 'r1', winnerTeamId: 't1', tiedTeamIds: [] } },
    { type: 'ADMIN_HIT', at: tick(), actor: 'admin', payload: { answerId: 'q0-a0' } },
    { type: 'ADMIN_MISS', at: tick(), actor: 'admin', payload: {} },
    { type: 'ADMIN_HIT', at: tick(), actor: 'admin', payload: { answerId: 'q0-a2' } },
    { type: 'ADMIN_MISS', at: tick(), actor: 'admin', payload: {} },
    { type: 'ADMIN_MISS', at: tick(), actor: 'admin', payload: {} },
  ];
  return { events, seed };
}

describe('replay', () => {
  it('odtworzenie logu daje dokładnie ten sam stan', () => {
    const { events, seed } = scriptedGame();
    const live = replay(seed, events);
    const again = replay(seed, events);
    expect(again).toEqual(live);
  });

  it('cofnięcie ostatniej akcji = replay logu bez niej', () => {
    const { events, seed } = scriptedGame();
    const full = replay(seed, events);
    const undone = replay(seed, events.slice(0, -1));

    expect(full.question!.strikes).toBe(3);
    expect(undone.question!.strikes).toBe(2);
    expect(undone.question!.fsm).toBe('Q_CONTROL');
    expect(full.question!.fsm).toBe('Q_STEAL_RACE_OPEN');
  });

  it('stan wejściowy nie jest mutowany przez reduktor', () => {
    const { events, seed } = scriptedGame();
    const snapshot = JSON.stringify(seed);
    replay(seed, events);
    expect(JSON.stringify(seed)).toBe(snapshot);
  });
});
