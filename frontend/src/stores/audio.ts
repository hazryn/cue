import { LOOPING_SOUNDS } from '@cue/shared';
import type { SoundKey } from '@cue/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * Odtwarzanie dźwięków na TV.
 *
 * Przeglądarka nie zagra niczego przed pierwszą interakcją użytkownika, dlatego
 * ekran telewizora zaczyna od kliknięcia „Rozpocznij". Brakujący plik jest cicho
 * ignorowany — gra działa bez ani jednego mp3, więc można je dograć później.
 */
export const useAudioStore = defineStore('audio', () => {
  const unlocked = ref(false);
  const muted = ref(false);
  const missing = ref<string[]>([]);
  const cache = new Map<SoundKey, HTMLAudioElement>();
  let currentLoop: HTMLAudioElement | null = null;

  function element(key: SoundKey): HTMLAudioElement {
    let audio = cache.get(key);
    if (!audio) {
      audio = new Audio(`/audio/${key}.mp3`);
      audio.preload = 'auto';
      audio.addEventListener('error', () => {
        if (!missing.value.includes(key)) missing.value.push(key);
      });
      cache.set(key, audio);
    }
    return audio;
  }

  function unlock(): void {
    unlocked.value = true;
    // Cichy start odblokowuje politykę autoplay dla całej sesji
    const probe = element('buzz');
    probe.volume = 0;
    void probe
      .play()
      .then(() => {
        probe.pause();
        probe.currentTime = 0;
        probe.volume = 1;
      })
      .catch(() => undefined);
  }

  function play(key: SoundKey): void {
    if (!unlocked.value || muted.value) return;
    const audio = element(key);

    if (LOOPING_SOUNDS.includes(key)) {
      if (currentLoop && currentLoop !== audio) {
        currentLoop.pause();
        currentLoop.currentTime = 0;
      }
      audio.loop = true;
      audio.volume = 1; // mogła zostać wyciszona przez stopLoop z wygaszaniem
      currentLoop = audio;
    }

    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }

  function playAll(keys: SoundKey[]): void {
    for (const key of keys) play(key);
  }

  /** Zatrzymuje pętlę; z `fadeMs` wycisza ją łagodnie zamiast uciąć w pół taktu. */
  function stopLoop(fadeMs = 0): void {
    const loop = currentLoop;
    if (!loop) return;
    currentLoop = null;

    const finish = () => {
      loop.pause();
      loop.currentTime = 0;
      loop.volume = 1;
    };
    if (fadeMs <= 0) return finish();

    const steps = 20;
    let step = 0;
    const timer = window.setInterval(() => {
      step += 1;
      // Pętla mogła zostać w międzyczasie uruchomiona ponownie — wtedy nie ruszamy głośności
      if (currentLoop === loop) return window.clearInterval(timer);
      loop.volume = Math.max(0, 1 - step / steps);
      if (step >= steps) {
        window.clearInterval(timer);
        finish();
      }
    }, fadeMs / steps);
  }

  return { unlocked, muted, missing, unlock, play, playAll, stopLoop };
});
