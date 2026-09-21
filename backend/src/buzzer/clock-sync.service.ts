import { Injectable } from '@nestjs/common';

export interface ClockInfo {
  offsetMs: number;
  rttMs: number;
  stdDevMs: number;
  updatedAt: number;
}

/**
 * Telefon liczy offset metodą NTP-lite (mediana z kilku próbek o najniższym RTT)
 * i raportuje go tutaj. Serwer trzyma ostatnią estymatę per drużyna, żeby móc
 * przeliczyć znacznik naciśnięcia na własną oś czasu i ocenić, czy mu ufać.
 */
@Injectable()
export class ClockSyncService {
  private readonly clocks = new Map<string, ClockInfo>();

  /** Skok offsetu o tyle ms oznacza, że telefon spał albo przeskoczył zegar */
  private static readonly DRIFT_LIMIT_MS = 50;
  /** Powyżej tego rozrzutu estymata jest zbyt niepewna, by na niej polegać */
  private static readonly UNSTABLE_STDDEV_MS = 15;

  report(teamId: string, offsetMs: number, rttMs: number, stdDevMs: number): { drifted: boolean } {
    const previous = this.clocks.get(teamId);
    const drifted = previous ? Math.abs(previous.offsetMs - offsetMs) > ClockSyncService.DRIFT_LIMIT_MS : false;
    this.clocks.set(teamId, { offsetMs, rttMs, stdDevMs, updatedAt: Date.now() });
    return { drifted };
  }

  get(teamId: string): ClockInfo | undefined {
    return this.clocks.get(teamId);
  }

  isReady(teamId: string): boolean {
    return this.clocks.has(teamId);
  }

  isUnstable(teamId: string): boolean {
    const clock = this.clocks.get(teamId);
    return clock ? clock.stdDevMs > ClockSyncService.UNSTABLE_STDDEV_MS : true;
  }

  forget(teamId: string): void {
    this.clocks.delete(teamId);
  }
}
