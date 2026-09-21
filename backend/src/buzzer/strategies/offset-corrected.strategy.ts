import { Injectable } from '@nestjs/common';
import { PressRecord, RaceOutcome, ResolveStrategy, toView } from './resolve-strategy';

/**
 * Zwycięzcą jest najmniejszy clientTs + offset, czyli najwcześniejsze naciśnięcie
 * na wspólnej osi czasu — a nie ten, czyj pakiet pierwszy dobiegł do serwera.
 * Bez tej korekty jitter WiFi (20–120 ms) potrafi przebić różnicę refleksu (30–80 ms),
 * czyli połowa pojedynków byłaby loterią.
 *
 * Różnicę poniżej progu uznajemy za nierozstrzygalną — wtedy dogrywka, nie rzut monetą.
 */
@Injectable()
export class OffsetCorrectedStrategy implements ResolveStrategy {
  resolve(presses: PressRecord[], tiebreakThresholdMs: number): RaceOutcome {
    const valid = presses.filter((p) => p.rejectedReason === null);
    if (valid.length === 0) {
      return { winnerTeamId: null, tiedTeamIds: [], presses: toView(presses, 0) };
    }

    const sorted = valid.slice().sort((a, b) => a.adjustedMs - b.adjustedMs);
    const best = sorted[0];
    const tied = sorted.filter((p) => p.adjustedMs - best.adjustedMs < tiebreakThresholdMs);

    if (tied.length > 1) {
      return {
        winnerTeamId: null,
        tiedTeamIds: tied.map((p) => p.teamId),
        presses: toView(presses, best.adjustedMs),
      };
    }

    return { winnerTeamId: best.teamId, tiedTeamIds: [], presses: toView(presses, best.adjustedMs) };
  }
}
