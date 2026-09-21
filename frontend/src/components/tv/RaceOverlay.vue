<script setup lang="ts">
import type { RaceView, TeamView } from '@cue/shared';
import { computed } from 'vue';

const props = defineProps<{ race: RaceView; teams: TeamView[] }>();

const eligible = computed(() => props.teams.filter((t) => props.race.eligible.includes(t.id)));
const title = computed(() =>
  props.race.kind === 'STEAL' ? 'PRZEJĘCIE — KTO PIERWSZY?' : props.race.kind === 'TIEBREAK' ? 'DOGRYWKA!' : 'KTO PIERWSZY?',
);
</script>

<template>
  <div class="absolute inset-0 z-20 flex flex-col items-center justify-center bg-board-deep/95 backdrop-blur">
    <p class="animate-pulse font-display text-[11vh] tracking-[0.15em] text-gold">{{ title }}</p>

    <div class="mt-[4vh] flex gap-[4vh]">
      <div
        v-for="team in eligible"
        :key="team.id"
        class="rounded-[2vh] border-[0.5vh] px-[4vh] py-[2.5vh] text-center"
        :style="{ borderColor: team.color }"
      >
        <p class="font-display text-[5vh] uppercase tracking-wide">{{ team.name }}</p>
        <p v-if="!team.connected" class="text-[2vh] uppercase tracking-widest text-rose-400">telefon offline</p>
      </div>
    </div>

    <p class="mt-[5vh] font-display text-[3vh] tracking-[0.4em] text-white/40">GRZYBKI ODBLOKOWANE</p>
  </div>
</template>
