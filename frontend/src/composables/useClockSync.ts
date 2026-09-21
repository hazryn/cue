import type { Ack, ClockSyncRes } from '@cue/shared';
import type { Socket } from 'socket.io-client';
import { ref } from 'vue';

const ROUNDS = 7;
/** Z siedmiu próbek bierzemy cztery o najniższym RTT — reszta to zwykle jitter */
const KEEP = 4;
const RESYNC_INTERVAL_MS = 20_000;

/**
 * Synchronizacja zegara telefonu z serwerem metodą NTP-lite.
 *
 * offset = t_serwera - (t_wysłania + RTT/2), liczone kilka razy; bierzemy medianę
 * z próbek o najniższym RTT, bo mediana nie daje się zepsuć jednemu złemu pakietowi.
 * Bez tego nie da się uczciwie porównać naciśnięć z trzech telefonów: jitter WiFi
 * potrafi przekroczyć różnicę ludzkiego refleksu.
 */
export function useClockSync(socket: () => Socket | null) {
  const offsetMs = ref(0);
  const rttMs = ref(0);
  const stdDevMs = ref(0);
  const ready = ref(false);
  let timer: number | null = null;

  async function probe(): Promise<{ offset: number; rtt: number } | null> {
    const active = socket();
    if (!active?.connected) return null;

    const t0 = Date.now();
    const response = await new Promise<Ack<ClockSyncRes> | null>((resolve) => {
      const timeout = window.setTimeout(() => resolve(null), 1500);
      active.emit('clock:sync', { t0 }, (ack: Ack<ClockSyncRes>) => {
        window.clearTimeout(timeout);
        resolve(ack);
      });
    });
    if (!response?.ok || !response.data) return null;

    const t2 = Date.now();
    const rtt = t2 - t0;
    return { offset: response.data.t1 - (t0 + rtt / 2), rtt };
  }

  async function sync(): Promise<void> {
    const samples: Array<{ offset: number; rtt: number }> = [];
    for (let i = 0; i < ROUNDS; i++) {
      const sample = await probe();
      if (sample) samples.push(sample);
    }
    if (samples.length === 0) return;

    const best = samples.sort((a, b) => a.rtt - b.rtt).slice(0, Math.min(KEEP, samples.length));
    const offsets = best.map((s) => s.offset).sort((a, b) => a - b);
    const median =
      offsets.length % 2 === 1
        ? offsets[(offsets.length - 1) / 2]
        : (offsets[offsets.length / 2 - 1] + offsets[offsets.length / 2]) / 2;
    const mean = offsets.reduce((acc, v) => acc + v, 0) / offsets.length;
    const variance = offsets.reduce((acc, v) => acc + (v - mean) ** 2, 0) / offsets.length;

    offsetMs.value = median;
    rttMs.value = Math.round(best.reduce((acc, s) => acc + s.rtt, 0) / best.length);
    stdDevMs.value = Math.round(Math.sqrt(variance));
    ready.value = true;

    socket()?.emit('clock:report', {
      offsetMs: Math.round(offsetMs.value),
      rttMs: rttMs.value,
      stdDevMs: stdDevMs.value,
    });
  }

  function start(): void {
    void sync();
    if (timer !== null) window.clearInterval(timer);
    timer = window.setInterval(() => void sync(), RESYNC_INTERVAL_MS);
  }

  function stop(): void {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    ready.value = false;
  }

  return { offsetMs, rttMs, stdDevMs, ready, sync, start, stop };
}
