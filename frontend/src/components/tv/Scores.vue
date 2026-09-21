<script setup lang="ts">
import type { TeamView, TvQuestionView } from '@cue/shared';

defineProps<{ teams: TeamView[]; question: TvQuestionView | null }>();
</script>

<template>
  <aside class="flex h-full w-[20%] flex-col gap-[1.5vh] border-r-[0.3vh] border-white/10 bg-black/30 p-[2vh]">
    <h2 class="font-display text-[3vh] tracking-[0.3em] text-white/50">DRUŻYNY</h2>

    <div
      v-for="team in teams"
      :key="team.id"
      data-testid="tv-team"
      :data-team="team.name"
      class="rounded-[1.2vh] border-[0.3vh] p-[1.5vh] transition-all duration-300"
      :class="[
        question?.controllingTeamId === team.id || question?.stealingTeamId === team.id
          ? 'border-gold bg-gold/15 shadow-[0_0_3vh_rgba(251,191,36,0.3)]'
          : 'border-white/10 bg-white/5',
        question?.triedTeamIds.includes(team.id) ? 'opacity-50' : '',
      ]"
    >
      <div class="flex items-center gap-[1vh]">
        <span class="h-[1.6vh] w-[1.6vh] shrink-0 rounded-full" :style="{ background: team.color }" />
        <span class="truncate font-display text-[3vh] uppercase tracking-wide">{{ team.name }}</span>
      </div>
      <p class="mt-[0.5vh] font-display text-[5vh] leading-none text-gold">{{ team.score }}</p>

      <p v-if="question?.stealingTeamId === team.id" class="text-[1.8vh] uppercase tracking-widest text-gold">
        przejęcie
      </p>
      <p v-else-if="question?.controllingTeamId === team.id" class="text-[1.8vh] uppercase tracking-widest text-gold">
        odpowiada
      </p>
      <p v-else-if="!team.connected" class="text-[1.8vh] uppercase tracking-widest text-rose-400/70">
        offline
      </p>
    </div>
  </aside>
</template>
