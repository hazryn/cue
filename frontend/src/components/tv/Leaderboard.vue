<script setup lang="ts">
import type { RankingEntry } from '@cue/shared';

defineProps<{ ranking: RankingEntry[]; title?: string; compact?: boolean }>();
</script>

<template>
  <section class="flex h-full flex-col items-center justify-center gap-[4vh] p-[5vh]">
    <h1 class="font-display tracking-[0.2em] text-gold" :class="compact ? 'text-[6vh]' : 'text-[9vh]'">
      {{ title ?? 'WYNIKI' }}
    </h1>

    <div class="flex w-full max-w-[120vh] flex-col gap-[2vh]">
      <div
        v-for="entry in ranking"
        :key="entry.teamId"
        class="flex items-center gap-[3vh] rounded-[1.5vh] border-[0.4vh] px-[3vh] py-[2vh] transition-all"
        :class="entry.isWinner ? 'border-gold bg-gold/15 shadow-[0_0_5vh_rgba(251,191,36,0.35)]' : 'border-white/10 bg-white/5'"
      >
        <span class="font-display text-[6vh] leading-none" :class="entry.isWinner ? 'text-gold' : 'text-white/40'">
          {{ entry.place }}
        </span>
        <span class="h-[2.5vh] w-[2.5vh] rounded-full" :style="{ background: entry.color }" />
        <span class="flex-1 font-display text-[5.5vh] uppercase tracking-wide">{{ entry.name }}</span>
        <span v-if="entry.isWinner" class="font-display text-[3vh] tracking-[0.3em] text-gold">ZWYCIĘZCA</span>
        <span class="font-display text-[6.5vh] leading-none text-gold">{{ entry.score }}</span>
      </div>
    </div>
  </section>
</template>
