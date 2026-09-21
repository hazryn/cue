import { onBeforeUnmount } from 'vue';

/**
 * Drugi bezpiecznik przeciw wygaszaczowi — dla telewizorów.
 *
 * Przeglądarki w telewizorach (np. Samsung/Tizen) potrafią nie obsługiwać albo
 * ignorować Wake Lock API i po kilku minutach bez pilota włączają wygaszacz.
 * Za to dopóki odtwarza się wideo, system uznaje ekran za używany. Grajemy więc
 * w pętli maleńki, wyciszony klip — ta sama sztuczka, na której opiera się NoSleep.js.
 *
 * Start musi wyjść z gestu użytkownika (autoplay), dlatego `start()` wołamy
 * w kliknięciu „Kliknij, aby rozpocząć".
 */
export function useKeepAwakeVideo() {
  let video: HTMLVideoElement | null = null;

  function start(): void {
    if (!video) {
      video = document.createElement('video');
      // H.264 dla telewizorów, WebM dla przeglądarek bez kodeków własnościowych
      for (const [src, type] of [
        ['/media/keep-awake.mp4', 'video/mp4'],
        ['/media/keep-awake.webm', 'video/webm'],
      ]) {
        const source = document.createElement('source');
        source.src = src;
        source.type = type;
        video.appendChild(source);
      }
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('aria-hidden', 'true');
      video.dataset.testid = 'keep-awake';
      // Musi być w widoku: część przeglądarek pauzuje wideo, którego nie widać
      Object.assign(video.style, {
        position: 'fixed',
        right: '0',
        bottom: '0',
        width: '2px',
        height: '2px',
        opacity: '0.01',
        pointerEvents: 'none',
        zIndex: '-1',
      });
      document.body.appendChild(video);
    }
    void video.play().catch(() => undefined);
  }

  // Po powrocie do karty albo wybudzeniu telewizora odtwarzanie bywa wstrzymane
  function onVisibility(): void {
    if (document.visibilityState === 'visible' && video?.paused) void video.play().catch(() => undefined);
  }
  document.addEventListener('visibilitychange', onVisibility);

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibility);
    video?.pause();
    video?.remove();
    video = null;
  });

  return { start };
}
