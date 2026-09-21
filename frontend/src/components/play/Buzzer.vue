<script setup lang="ts">
import { computed } from 'vue';
import { usePlayerStore } from '~/stores/player';

const player = usePlayerStore();

const labels: Record<string, string> = {
  ARMED: 'BIJ!',
  WAITING: 'Czekaj…',
  NOT_ELIGIBLE: 'Nie wasza kolej',
  ALREADY_PRESSED: 'Naciśnięte',
  LOCKED_OUT: 'Falstart',
  SYNCING: 'Synchronizacja…',
  GAME_NOT_RUNNING: 'Gra nie trwa',
};

const armed = computed(() => player.buzzer.armed);
const label = computed(() => labels[player.buzzer.reason] ?? 'Czekaj…');

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
    class="relative flex aspect-square w-[78vw] max-w-[420px] select-none items-center justify-center rounded-full
           border-8 font-display text-6xl tracking-wide transition-transform duration-75"
    :class="
      armed
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
