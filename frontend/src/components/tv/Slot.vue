<script setup lang="ts">
import type { SlotView } from '@cue/shared';

defineProps<{ slot: SlotView; index: number }>();
</script>

<template>
  <div
    data-testid="tv-slot"
    :data-revealed="slot.revealed"
    class="flex items-center gap-[1.2vh] rounded-[1.2vh] border-[0.3vh] px-[1.6vh] py-[1.1vh] transition-all duration-300"
    :class="slot.revealed ? 'border-gold/70 bg-board-light shadow-[0_0_3vh_rgba(251,191,36,0.25)]' : 'border-white/10 bg-black/30'"
  >
    <span
      class="flex h-[5vh] w-[5vh] shrink-0 items-center justify-center rounded-[0.8vh] font-display text-[3vh]"
      :class="slot.revealed ? 'bg-gold text-board-deep' : 'bg-white/10 text-white/40'"
    >
      {{ index + 1 }}
    </span>

    <template v-if="slot.revealed">
      <span class="flex-1 truncate font-display text-[3.6vh] uppercase tracking-wide animate-flip">
        {{ slot.text }}
      </span>
      <span class="font-display text-[3.6vh] text-gold animate-flip">{{ slot.weight }}</span>
    </template>

    <!-- Nieodsłonięty slot nie może zdradzić nawet długości odpowiedzi -->
    <span v-else class="flex-1 text-center font-display text-[3.2vh] tracking-[0.6em] text-white/20">• • • •</span>
  </div>
</template>
