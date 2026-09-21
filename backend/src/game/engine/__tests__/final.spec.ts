import { GameState } from '@cue/shared';
import { projectTv } from '../projections';
import { apply, makeQuestion, startedGame, tick } from './helpers';

const FINAL_QUESTIONS = Array.from({ length: 5 }, (_, i) =>
  makeQuestion(`f${i}`, [35, 25, 15, 10, 5, 4, 3, 2, 1, 1], 'FINAL'),
);

function gameAtFinal(): { state: GameState; teamId: string } {
  const { state, teamIds } = startedGame({ finalQuestions: FINAL_QUESTIONS });
  let s: GameState = { ...state, phase: 'LEADERBOARD', question: null };
  s = apply(s, {
    type: 'ADMIN_START_FINAL',
    at: tick(),
    actor: 'admin',
    payload: {
      teamId: teamIds[0],
      p1Name: 'Ania',
      p2Name: 'Bartek',
      questionIds: FINAL_QUESTIONS.map((q) => q.id),
    },
  });
  return { state: s, teamId: teamIds[0] };
}

const beginTurn = (s: GameState, player: 1 | 2) =>
  apply(s, { type: 'ADMIN_FINAL_BEGIN_TURN', at: tick(), actor: 'admin', payload: { player } });
const startTimer = (s: GameState) =>
  apply(s, { type: 'ADMIN_FINAL_START_TIMER', at: tick(), actor: 'admin', payload: {} });
const fhit = (s: GameState, answerId: string) =>
  apply(s, { type: 'ADMIN_FINAL_HIT', at: tick(), actor: 'admin', payload: { answerId } });
const fpass = (s: GameState) =>
  apply(s, { type: 'ADMIN_FINAL_PASS', at: tick(), actor: 'admin', payload: {} });

describe('finał — tura gracza', () => {
  it('trafienia zapisują wagi i przesuwają kursor pytań', () => {
    let s = startTimer(beginTurn(gameAtFinal().state, 1));
    s = fhit(s, 'f0-a0');

    const slot = s.final!.slots.find((x) => x.player === 1 && x.qIdx === 0)!;
    expect(slot.result).toBe('HIT');
    expect(slot.points).toBe(35);
    expect(s.final!.qCursor).toBe(1);
  });

  it('pas wraca na koniec tury do pominiętych pytań', () => {
    let s = startTimer(beginTurn(gameAtFinal().state, 1));
    s = fpass(s);
    expect(s.final!.qCursor).toBe(1);

    for (let i = 1; i < 5; i++) s = fhit(s, `f${i}-a0`);
    expect(s.final!.qCursor).toBe(0);
    expect(s.final!.fsm).toBe('F_P1_RUNNING');
  });

  it('komplet rozstrzygniętych pytań sam kończy turę', () => {
    let s = startTimer(beginTurn(gameAtFinal().state, 1));
    for (let i = 0; i < 5; i++) s = fhit(s, `f${i}-a0`);

    expect(s.final!.fsm).toBe('F_P1_DONE');
    expect(s.final!.timer.running).toBe(false);
  });

  it('tura nie ma limitu czasu — kończy ją ostatnia odpowiedź albo prowadzący', () => {
    const s = startTimer(beginTurn(gameAtFinal().state, 1));
    expect(s.final!.fsm).toBe('F_P1_RUNNING');
    expect(s.final!.timer.running).toBe(false);
    expect(s.final!.timer.deadlineAt).toBeNull();

    const ended = apply(s, { type: 'ADMIN_FINAL_END_TURN', at: tick(), actor: 'admin', payload: {} });
    expect(ended.final!.fsm).toBe('F_P1_DONE');
  });
});

describe('finał — duplikaty', () => {
  it('duplikat brzęczy, ale nie zużywa pytania — gracz próbuje dalej', () => {
    let s = startTimer(beginTurn(gameAtFinal().state, 1));
    s = fhit(s, 'f0-a0');
    for (let i = 1; i < 5; i++) s = fhit(s, `f${i}-a0`);
    s = startTimer(beginTurn(s, 2));

    const before = s.final!.qCursor;
    const dup = apply(s, { type: 'ADMIN_FINAL_HIT', at: tick(), actor: 'admin', payload: { answerId: 'f0-a0' } });

    expect(dup.final!.qCursor).toBe(before);
    expect(dup.final!.duplicateBuzzes).toBe(1);
    expect(dup.final!.slots.find((x) => x.player === 2 && x.qIdx === 0)!.result).toBe('UNANSWERED');

    const other = fhit(dup, 'f0-a1');
    expect(other.final!.slots.find((x) => x.player === 2 && x.qIdx === 0)!.points).toBe(25);
    expect(other.final!.qCursor).toBe(1);
  });

  it('gracz 2 może spasować duplikat i przejść do kolejnego pytania', () => {
    let s = startTimer(beginTurn(gameAtFinal().state, 1));
    for (let i = 0; i < 5; i++) s = fhit(s, `f${i}-a0`);
    s = startTimer(beginTurn(s, 2));
    s = apply(s, { type: 'ADMIN_FINAL_HIT', at: tick(), actor: 'admin', payload: { answerId: 'f0-a0' } });
    s = fpass(s);

    expect(s.final!.qCursor).toBe(1);
  });
});

describe('finał — odsłanianie i próg', () => {
  function playBothTurns(pickIdx: (player: 1 | 2, q: number) => number): GameState {
    let s = startTimer(beginTurn(gameAtFinal().state, 1));
    for (let i = 0; i < 5; i++) s = fhit(s, `f${i}-a${pickIdx(1, i)}`);
    s = startTimer(beginTurn(s, 2));
    for (let i = 0; i < 5; i++) s = fhit(s, `f${i}-a${pickIdx(2, i)}`);
    return apply(s, { type: 'ADMIN_FINAL_BEGIN_REVEAL', at: tick(), actor: 'admin', payload: {} });
  }

  it('suma narasta slot po slocie, a przekroczenie progu daje nagrodę', () => {
    // gracz 2 celuje w inne odpowiedzi niż partner — inaczej wpada w duplikaty
    let s = playBothTurns((player) => (player === 1 ? 0 : 1));
    expect(s.final!.total).toBe(0);

    for (let i = 0; i < 10; i++) {
      s = apply(s, { type: 'ADMIN_FINAL_REVEAL_NEXT', at: tick(), actor: 'admin', payload: {} });
    }

    expect(s.final!.fsm).toBe('F_RESULT');
    expect(s.final!.total).toBe(300); // 5x35 (gracz 1) + 5x25 (gracz 2)
    expect(s.final!.total >= s.config.finalThreshold).toBe(true);
  });

  it('próg nagrody to 100 punktów — dokładnie 100 wystarcza', () => {
    // 5 × 15 (gracz 1) + 5 × 5 (gracz 2) = 100
    let s = playBothTurns((player) => (player === 1 ? 2 : 4));
    for (let i = 0; i < 10; i++) {
      s = apply(s, { type: 'ADMIN_FINAL_REVEAL_NEXT', at: tick(), actor: 'admin', payload: {} });
    }
    expect(s.config.finalThreshold).toBe(100);
    expect(s.final!.total).toBe(100);

    const ctx = { seq: 1, gameId: 'g', presence: new Map(), undoStack: [], joinUrl: '', spareQuestions: 0 };
    expect(projectTv(s, ctx).final!.won).toBe(true);
  });

  it('odsłaniamy najpierw komplet gracza 1, potem gracza 2', () => {
    let s = playBothTurns((player) => (player === 1 ? 0 : 1));
    for (let i = 0; i < 5; i++) {
      s = apply(s, { type: 'ADMIN_FINAL_REVEAL_NEXT', at: tick(), actor: 'admin', payload: {} });
    }

    const revealed = s.final!.slots.filter((x) => x.revealed);
    expect(revealed).toHaveLength(5);
    expect(revealed.every((x) => x.player === 1)).toBe(true);
  });
});

describe('finał — szczelność ekranu TV', () => {
  it('w turze gracza 2 telewizor nie zdradza ani treści, ani wyników gracza 1', () => {
    let s = startTimer(beginTurn(gameAtFinal().state, 1));
    for (let i = 0; i < 5; i++) s = fhit(s, `f${i}-a0`);
    s = startTimer(beginTurn(s, 2));

    const tv = projectTv(s, {
      seq: 1,
      gameId: 'g',
      presence: new Map(),
      undoStack: [],
      joinUrl: '',
      spareQuestions: 0,
    });

    const p1Slots = tv.final!.slots.filter((x) => x.player === 1);
    expect(p1Slots).toHaveLength(5);
    expect(p1Slots.every((x) => x.text === null)).toBe(true);
    expect(p1Slots.every((x) => x.points === null)).toBe(true);
    expect(p1Slots.every((x) => x.result === null)).toBe(true);
    // widz ma wiedzieć, że sloty są zajęte — to nie zdradza odpowiedzi
    expect(p1Slots.every((x) => x.answered)).toBe(true);
    expect(tv.final!.total).toBe(0);
    expect(JSON.stringify(tv)).not.toContain('Odpowiedź 0');
  });

  it('po odsłonięciu treść i punkty stają się widoczne', () => {
    let s = startTimer(beginTurn(gameAtFinal().state, 1));
    for (let i = 0; i < 5; i++) s = fhit(s, `f${i}-a0`);
    s = startTimer(beginTurn(s, 2));
    for (let i = 0; i < 5; i++) s = fhit(s, `f${i}-a1`);
    s = apply(s, { type: 'ADMIN_FINAL_BEGIN_REVEAL', at: tick(), actor: 'admin', payload: {} });
    s = apply(s, { type: 'ADMIN_FINAL_REVEAL_NEXT', at: tick(), actor: 'admin', payload: {} });

    const tv = projectTv(s, {
      seq: 1,
      gameId: 'g',
      presence: new Map(),
      undoStack: [],
      joinUrl: '',
      spareQuestions: 0,
    });
    const first = tv.final!.slots[0];
    expect(first.revealed).toBe(true);
    expect(first.text).toBe('Odpowiedź 0');
    expect(first.points).toBe(35);
  });

  it('przy odsłanianiu telewizor pokazuje pytanie, do którego należy odpowiedź', () => {
    let s = startTimer(beginTurn(gameAtFinal().state, 1));
    for (let i = 0; i < 5; i++) s = fhit(s, `f${i}-a0`);
    s = startTimer(beginTurn(s, 2));
    for (let i = 0; i < 5; i++) s = fhit(s, `f${i}-a1`);
    s = apply(s, { type: 'ADMIN_FINAL_BEGIN_REVEAL', at: tick(), actor: 'admin', payload: {} });

    const ctx = { seq: 1, gameId: 'g', presence: new Map(), undoStack: [], joinUrl: '', spareQuestions: 0 };
    // Przed pierwszym kliknięciem: pierwsze pytanie, jeszcze bez podświetlenia
    expect(projectTv(s, ctx).final!.revealQuestionText).toBe('Pytanie f0');

    // Odsłonięcia idą: gracz 1 pyt. 1–5, potem gracz 2 pyt. 1–5 — szóste to pierwsze pytanie gracza 2
    for (let i = 0; i < 6; i++) {
      s = apply(s, { type: 'ADMIN_FINAL_REVEAL_NEXT', at: tick(), actor: 'admin', payload: {} });
    }
    const tv = projectTv(s, ctx).final!;
    expect(tv.revealQuestionText).toBe('Pytanie f0');
    const current = tv.slots.filter((slot) => slot.current);
    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({ player: 2, qIdx: 0 });
  });
});
