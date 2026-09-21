<script setup lang="ts">
import { computed, watch } from 'vue';
import { useCountdown } from '~/composables/useCountdown';
import { usePlayerStore } from '~/stores/player';

const player = usePlayerStore();

// Przejęcie: grzybek jest już „uzbrojony", ale ożywa dopiero po odliczaniu 3-2-1
const countdown = useCountdown(
  () => (player.buzzer.armed ? player.buzzer.armsAt : null),
  () => player.clock.offsetMs,
);
watch(countdown.secondsLeft, (left) => {
  if (left > 0 && navigator.vibrate) navigator.vibrate(15);
});

const labels: Record<string, string> = {
  ARMED: 'BIJ!',
  WAITING: 'Czekaj…',
  NOT_ELIGIBLE: 'Nie wasza kolej',
  ALREADY_PRESSED: 'Naciśnięte',
  LOCKED_OUT: 'Falstart',
  SYNCING: 'Synchronizacja…',
  GAME_NOT_RUNNING: 'Gra nie trwa',
};

const armed = computed(() => player.buzzer.armed && !countdown.counting.value);
const label = computed(() =>
  countdown.counting.value ? String(countdown.secondsLeft.value) : (labels[player.buzzer.reason] ?? 'Czekaj…'),
);

/**
 * pointerdown, nie click: click czeka na puszczenie palca i dorzuca 50–300 ms,
 * czyli więcej niż cała różnica refleksu między dwiema parami.
 */
function press(event: PointerEvent): void {
  void player.buzz(event);
}
</script>

<template>
  <button
    data-testid="buzzer"
    :data-armed="armed"
    :data-countdown="countdown.counting.value ? countdown.secondsLeft.value : null"
    class="relative flex aspect-square w-[78vw] max-w-[420px] select-none items-center justify-center rounded-full
           border-8 font-display text-6xl tracking-wide transition-transform duration-75"
    :class="
      countdown.counting.value
        ? 'border-amber-300/60 bg-amber-500/15 text-amber-200 text-[9rem]'
        : armed
        ? 'animate-pulse-ring border-rose-300 bg-rose-600 text-white shadow-[0_0_60px_rgba(244,63,94,0.6)] active:scale-95'
        : 'border-white/10 bg-white/5 text-white/40'
    "
    style="touch-action: manipulation"
    :disabled="!armed"
    @pointerdown.prevent="press"
  >
    {{ label }}
  </button>
</template>
