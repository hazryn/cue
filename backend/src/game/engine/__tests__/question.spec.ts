import { canApply } from '../guards';
import { ranking } from '../scoring';
import { apply, hit, makeQuestion, miss, startedGame, strikeOut, tick, winRace } from './helpers';

describe('runda główna — kontrola i punkty', () => {
  it('trafienie dolicza wagę do puli i odsłania slot', () => {
    const { state, teamIds } = startedGame();
    let s = winRace(state, teamIds[0]);
    s = hit(s, 'q0-a0');

    expect(s.question!.pool).toBe(40);
    expect(s.question!.slots[0].revealed).toBe(true);
    expect(s.question!.slots[0].revealedBy).toBe(teamIds[0]);
    expect(s.question!.fsm).toBe('Q_CONTROL');
  });

  it('domknięcie planszy przed trzecim X daje pełną pulę bez fazy przejęcia', () => {
    const { state, teamIds } = startedGame();
    let s = winRace(state, teamIds[0]);
    for (const a of ['q0-a0', 'q0-a1', 'q0-a2', 'q0-a3']) s = hit(s, a);

    expect(s.question!.fsm).toBe('Q_AWARD');
    expect(s.question!.awardedTo).toBe(teamIds[0]);
    expect(s.teams[0].score).toBe(100);
    expect(s.teams[0].questionsWon).toBe(1);
  });

  it('mnożnik x2 obowiązuje od szóstego pytania', () => {
    const { state, teamIds } = startedGame();
    let s = state;
    // przewiń do pytania o indeksie 5 (szóstego)
    for (let i = 0; i < 5; i++) {
      s = winRace(s, teamIds[0]);
      for (const a of [`q${i}-a0`, `q${i}-a1`, `q${i}-a2`, `q${i}-a3`]) s = hit(s, a);
      s = apply(s, { type: 'ADMIN_CONTINUE', at: tick(), actor: 'admin', payload: {} });
      s = apply(s, { type: 'ADMIN_NEXT_QUESTION', at: tick(), actor: 'admin', payload: {} });
      s = apply(s, { type: 'ADMIN_NEXT_QUESTION', at: tick(), actor: 'admin', payload: {} });
    }

    expect(s.qIndex).toBe(5);
    expect(s.question!.multiplier).toBe(2);
    s = winRace(s, teamIds[1]);
    s = hit(s, 'q5-a0');
    expect(s.question!.pool).toBe(80);
  });

  it('kliknięcie w odsłoniętą odpowiedź nie jest X — guard odrzuca akcję', () => {
    const { state, teamIds } = startedGame();
    let s = winRace(state, teamIds[0]);
    s = hit(s, 'q0-a0');

    const verdict = canApply(s, { type: 'ADMIN_HIT', at: tick(), actor: 'admin', payload: { answerId: 'q0-a0' } });
    expect(verdict).toEqual({ ok: false, code: 'ALREADY_REVEALED', error: expect.any(String) });
    expect(s.question!.strikes).toBe(0);
  });
});

describe('przejęcie', () => {
  it('trzy X przy trzech drużynach otwierają wyścig między pozostałymi dwiema', () => {
    const { state, teamIds } = startedGame();
    let s = winRace(state, teamIds[0]);
    s = hit(s, 'q0-a0');
    s = strikeOut(s);

    expect(s.question!.fsm).toBe('Q_STEAL_RACE_OPEN');
    expect(s.question!.race!.kind).toBe('STEAL');
    expect(s.question!.race!.eligible).toEqual([teamIds[1], teamIds[2]]);
    expect(s.question!.pool).toBe(40);
  });

  it('grzybki przejęcia odblokowują się dopiero po odliczaniu 3-2-1', () => {
    const { state, teamIds } = startedGame();
    let s = winRace(state, teamIds[0]);
    s = strikeOut(s);

    const race = s.question!.race!;
    expect(race.armsAt! - race.openedAt).toBe(s.config.stealCountdownMs);
    expect(s.config.stealCountdownMs).toBe(3000);

    // Ponowne odblokowanie przez prowadzącego też zaczyna się od odliczania
    s = apply(s, { type: 'ADMIN_CANCEL_RACE', at: tick(), actor: 'admin', payload: {} });
    const at = tick();
    s = apply(s, { type: 'ADMIN_OPEN_RACE', at, actor: 'admin', payload: { raceId: 'again' } });
    expect(s.question!.race!.armsAt).toBe(at + 3000);
  });

  it('zwykły wyścig o pytanie startuje bez odliczania', () => {
    const { state } = startedGame();
    const at = tick();
    const s = apply(state, { type: 'ADMIN_OPEN_RACE', at, actor: 'admin', payload: { raceId: 'r1' } });
    expect(s.question!.race!.armsAt).toBe(at);
  });

  it('przy dwóch drużynach przejęcie idzie od razu do drugiej, bez wyścigu', () => {
    const { state, teamIds } = startedGame({ teams: ['Czerwoni', 'Zieloni'] });
    let s = winRace(state, teamIds[0]);
    s = hit(s, 'q0-a0');
    s = strikeOut(s);

    expect(s.question!.fsm).toBe('Q_STEAL_ATTEMPT');
    expect(s.question!.stealingTeamId).toBe(teamIds[1]);
    expect(s.question!.race).toBeNull();
  });

  it('trafienie przejmującego dolicza wagę własnej odpowiedzi do puli', () => {
    const { state, teamIds } = startedGame({ teams: ['Czerwoni', 'Zieloni'] });
    let s = winRace(state, teamIds[0]);
    s = hit(s, 'q0-a0');
    s = strikeOut(s);
    s = hit(s, 'q0-a1');

    expect(s.question!.awardedTo).toBe(teamIds[1]);
    expect(s.teams[1].score).toBe(70);
  });

  it('przejęcie przy zerowej puli wciąż ma wartość — liczy się waga trafienia', () => {
    const { state, teamIds } = startedGame({ teams: ['Czerwoni', 'Zieloni'] });
    let s = strikeOut(winRace(state, teamIds[0]));
    expect(s.question!.pool).toBe(0);

    s = hit(s, 'q0-a0');
    expect(s.teams[1].score).toBe(40);
  });

  it('nieudane przejęcie oddaje szansę trzeciej drużynie', () => {
    const { state, teamIds } = startedGame();
    let s = strikeOut(winRace(state, teamIds[0]));
    s = winRace(s, teamIds[1]);
    expect(s.question!.fsm).toBe('Q_STEAL_ATTEMPT');

    s = miss(s);
    expect(s.question!.fsm).toBe('Q_STEAL_ATTEMPT');
    expect(s.question!.stealingTeamId).toBe(teamIds[2]);
  });

  it('gdy spudłują wszystkie drużyny, pula przepada i odsłaniamy pojedynczo', () => {
    const { state, teamIds } = startedGame();
    let s = winRace(state, teamIds[0]);
    s = hit(s, 'q0-a0');
    s = strikeOut(s);
    s = miss(winRace(s, teamIds[1]));
    s = miss(s);

    expect(s.question!.fsm).toBe('Q_FORFEIT_REVEAL');
    expect(s.question!.forfeited).toBe(true);
    expect(s.question!.pool).toBe(0);
    expect(s.teams.every((t) => t.score === 0)).toBe(true);

    s = apply(s, { type: 'ADMIN_REVEAL_ONE', at: tick(), actor: 'admin', payload: { answerId: 'q0-a1' } });
    expect(s.question!.slots[1].revealed).toBe(true);
    expect(s.question!.fsm).toBe('Q_FORFEIT_REVEAL');

    s = apply(s, { type: 'ADMIN_REVEAL_REST', at: tick(), actor: 'admin', payload: {} });
    expect(s.question!.fsm).toBe('Q_CLOSED');
  });
});

describe('wyścig', () => {
  it('otwarcie grzybków odsłania pytanie na telewizorze', () => {
    const { state } = startedGame();
    expect(state.question!.questionRevealed).toBe(false);

    const opened = apply(state, {
      type: 'ADMIN_OPEN_RACE',
      at: tick(),
      actor: 'admin',
      payload: { raceId: 'r0' },
    });

    expect(opened.question!.questionRevealed).toBe(true);
    expect(opened.question!.fsm).toBe('Q_RACE_OPEN');
  });

  it('remis otwiera dogrywkę tylko między remisującymi', () => {
    const { state, teamIds } = startedGame();
    let s = apply(state, { type: 'ADMIN_OPEN_RACE', at: tick(), actor: 'admin', payload: { raceId: 'r1' } });
    s = apply(s, {
      type: 'RACE_RESOLVED',
      at: tick(),
      actor: 'system',
      payload: { raceId: 'r1', winnerTeamId: null, tiedTeamIds: [teamIds[0], teamIds[2]] },
    });

    expect(s.question!.fsm).toBe('Q_RACE_OPEN');
    expect(s.question!.race!.kind).toBe('TIEBREAK');
    expect(s.question!.race!.eligible).toEqual([teamIds[0], teamIds[2]]);
  });

  it('wygrany wyścig liczy się do tie-breaku w rankingu', () => {
    const { state, teamIds } = startedGame();
    const s = winRace(state, teamIds[1]);
    expect(s.teams[1].racesWon).toBe(1);
  });
});

describe('ranking', () => {
  it('przy równych punktach rozstrzyga liczba wygranych pytań', () => {
    const { state, teamIds } = startedGame();
    let s = winRace(state, teamIds[0]);
    for (const a of ['q0-a0', 'q0-a1', 'q0-a2', 'q0-a3']) s = hit(s, a);
    s = apply(s, {
      type: 'ADMIN_ADJUST_SCORE',
      at: tick(),
      actor: 'admin',
      payload: { teamId: teamIds[1], delta: 100, reason: 'test' },
    });

    const table = ranking(s);
    expect(table[0].teamId).toBe(teamIds[0]);
    expect(table[0].place).toBe(1);
    expect(table[1].place).toBe(2);
  });
});

describe('domykanie pytań', () => {
  it('po ostatnim pytaniu wchodzimy na ranking końcowy', () => {
    const questions = Array.from({ length: 2 }, (_, i) => makeQuestion(`q${i}`, [50, 50]));
    const { state, teamIds } = startedGame({ questions });
    let s = { ...state, config: { ...state.config, questionsPerGame: 2 } };

    for (let i = 0; i < 2; i++) {
      s = winRace(s, teamIds[0]);
      s = hit(hit(s, `q${i}-a0`), `q${i}-a1`);
      s = apply(s, { type: 'ADMIN_CONTINUE', at: tick(), actor: 'admin', payload: {} });
      s = apply(s, { type: 'ADMIN_NEXT_QUESTION', at: tick(), actor: 'admin', payload: {} });
      if (i === 0) s = apply(s, { type: 'ADMIN_NEXT_QUESTION', at: tick(), actor: 'admin', payload: {} });
    }

    expect(s.phase).toBe('LEADERBOARD');
    expect(s.history).toHaveLength(2);
    expect(s.question).toBeNull();
  });
});

describe('wyzerowanie gry', () => {
  it('przywraca lobby, kasuje punkty i zostawia drużyny', () => {
    const { state, teamIds } = startedGame();
    let s = winRace(state, teamIds[0]);
    s = hit(s, 'q0-a0');
    expect(s.teams[0].racesWon).toBe(1);

    s = apply(s, { type: 'ADMIN_RESET_GAME', at: tick(), actor: 'admin', payload: {} });

    expect(s.phase).toBe('LOBBY');
    expect(s.question).toBeNull();
    expect(s.history).toHaveLength(0);
    expect(s.qIndex).toBe(0);
    expect(s.teams).toHaveLength(3);
    expect(s.teams.every((t) => t.score === 0 && t.racesWon === 0 && t.questionsWon === 0)).toBe(true);
    // Pytania zostają wybrane, żeby powtórka była jednym kliknięciem
    expect(s.questionOrder).toHaveLength(10);
  });

  it('nie da się wyzerować gry, która jeszcze nie wystartowała', () => {
    const { state } = startedGame();
    const lobby = { ...state, phase: 'LOBBY' as const };
    const verdict = canApply(lobby, { type: 'ADMIN_RESET_GAME', at: tick(), actor: 'admin', payload: {} });
    expect(verdict).toEqual({ ok: false, code: 'BAD_STATE', error: expect.any(String) });
  });

  it('po wyzerowaniu gra startuje od pierwszego pytania', () => {
    const { state, teamIds } = startedGame();
    let s = winRace(state, teamIds[1]);
    s = hit(s, 'q0-a0');
    s = apply(s, { type: 'ADMIN_RESET_GAME', at: tick(), actor: 'admin', payload: {} });
    s = apply(s, { type: 'ADMIN_START_GAME', at: tick(), actor: 'admin', payload: {} });

    expect(s.phase).toBe('MAIN_ROUND');
    expect(s.qIndex).toBe(0);
    expect(s.question!.pool).toBe(0);
    expect(s.question!.slots.every((slot) => !slot.revealed)).toBe(true);
  });
});

describe('narzędzia ratunkowe prowadzącego', () => {
  it('kontrolę można przyznać ręcznie jeszcze przed wyścigiem', () => {
    const { state, teamIds } = startedGame();
    expect(state.question!.fsm).toBe('Q_IDLE');

    const event = {
      type: 'ADMIN_FORCE_CONTROL' as const,
      at: tick(),
      actor: 'admin' as const,
      payload: { teamId: teamIds[2] },
    };
    expect(canApply(state, event)).toEqual({ ok: true });

    const s = apply(state, event);
    expect(s.question!.fsm).toBe('Q_CONTROL');
    expect(s.question!.controllingTeamId).toBe(teamIds[2]);
    expect(s.question!.strikes).toBe(0);
  });
});
