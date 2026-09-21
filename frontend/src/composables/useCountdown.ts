import { computed, onBeforeUnmount, ref, watch } from 'vue';

/**
 * Odliczanie do momentu wyrażonego w czasie serwera.
 *
 * `offsetMs` to różnica zegarów (serwer − klient): bez niej telefon z zegarem
 * rozjechanym o sekundę odblokowałby grzybek wcześniej niż reszta. Tykamy
 * tylko wtedy, gdy cel jest w przyszłości — w spoczynku nie ma żadnego interwału.
 */
export function useCountdown(target: () => number | null, offsetMs: () => number) {
  const now = ref(Date.now());
  let timer: ReturnType<typeof setInterval> | null = null;

  const remainingMs = computed(() => {
    const at = target();
    if (at === null) return 0;
    return Math.max(0, at - (now.value + offsetMs()));
  });
  /** Cyfra na ekranie: 3, 2, 1, a po dojściu do celu 0 */
  const secondsLeft = computed(() => Math.ceil(remainingMs.value / 1000));
  const counting = computed(() => remainingMs.value > 0);

  function stop(): void {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function tick(): void {
    now.value = Date.now();
    if (remainingMs.value <= 0) stop();
  }

  watch(
    () => [target(), offsetMs()],
    () => {
      now.value = Date.now();
      if (remainingMs.value > 0 && !timer) timer = setInterval(tick, 50);
    },
    { immediate: true },
  );

  onBeforeUnmount(stop);

  return { remainingMs, secondsLeft, counting };
}
