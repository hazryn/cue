import { onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * Blokada wygaszania ekranu.
 *
 * Nieoczywiste, a krytyczne: telefon z ciemnym ekranem nie pokaże otwarcia
 * wyścigu, a telewizor w wygaszaczu psuje cały efekt. Gdy API nie jest dostępne
 * (starsze przeglądarki, brak HTTPS), po prostu nic się nie dzieje.
 */
export function useWakeLock() {
  const active = ref(false);
  let sentinel: WakeLockSentinel | null = null;

  async function request(): Promise<void> {
    try {
      sentinel = await navigator.wakeLock?.request('screen');
      active.value = Boolean(sentinel);
      sentinel?.addEventListener('release', () => {
        active.value = false;
      });
    } catch {
      active.value = false;
    }
  }

  function onVisibility(): void {
    if (document.visibilityState === 'visible' && !active.value) void request();
  }

  onMounted(() => {
    void request();
    document.addEventListener('visibilitychange', onVisibility);
  });

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibility);
    void sentinel?.release();
    sentinel = null;
  });

  return { active, request };
}
