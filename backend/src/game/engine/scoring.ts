/**
 * Punktacja i ranking.
 *
 * Mnożnik stosujemy przy KAŻDYM doliczeniu, nie na końcu — TV pokazuje wtedy
 * realną pulę, a nie liczbę, która na koniec nagle się podwaja.
 */
import { GameState, QuestionState, RankingEntry, Uuid } from '@cue/shared';
import { activeTeams } from './state';

export function poolIncrement(weight: number, multiplier: 1 | 2): number {
  return weight * multiplier;
}

export function awardPool(state: GameState, q: QuestionState, teamId: Uuid): void {
  const team = state.teams.find((t) => t.id === teamId);
  if (!team) return;
  team.score += q.pool;
  team.questionsWon += 1;
  q.awardedTo = teamId;
  q.awardedAmount = q.pool;
}

/**
 * Ranking z tie-breakiem: punkty → wygrane pytania → wygrane wyścigi.
 * Przy pełnym remisie obie drużyny są współzwycięzcami — przy stole chcesz mieć
 * argument, a nie automatyczne losowanie.
 */
export function ranking(state: GameState): RankingEntry[] {
  const sorted = activeTeams(state)
    .slice()
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.questionsWon !== a.questionsWon) return b.questionsWon - a.questionsWon;
      if (b.racesWon !== a.racesWon) return b.racesWon - a.racesWon;
      return a.name.localeCompare(b.name, 'pl');
    });

  const entries: RankingEntry[] = [];
  let place = 0;
  let prev: { score: number; questionsWon: number; racesWon: number } | null = null;

  for (const [i, team] of sorted.entries()) {
    const sameAsPrev =
      prev !== null &&
      prev.score === team.score &&
      prev.questionsWon === team.questionsWon &&
      prev.racesWon === team.racesWon;
    if (!sameAsPrev) place = i + 1;
    prev = { score: team.score, questionsWon: team.questionsWon, racesWon: team.racesWon };
    entries.push({
      teamId: team.id,
      name: team.name,
      color: team.color,
      score: team.score,
      place,
      isWinner: false,
    });
  }

  for (const e of entries) e.isWinner = e.place === 1;
  return entries;
}

export function winners(state: GameState): RankingEntry[] {
  return ranking(state).filter((e) => e.isWinner);
}
