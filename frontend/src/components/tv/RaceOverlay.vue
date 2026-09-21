<script setup lang="ts">
import type { RaceView, TeamView } from '@cue/shared';
import { computed, watch } from 'vue';
import { useCountdown } from '~/composables/useCountdown';
import { useAudioStore } from '~/stores/audio';
import { useTvStore } from '~/stores/tv';

const props = defineProps<{ race: RaceView; teams: TeamView[] }>();
const tv = useTvStore();
const audio = useAudioStore();

const eligible = computed(() => props.teams.filter((t) => props.race.eligible.includes(t.id)));
const title = computed(() =>
  props.race.kind === 'STEAL' ? 'PRZEJĘCIE — KTO PIERWSZY?' : props.race.kind === 'TIEBREAK' ? 'DOGRYWKA!' : 'KTO PIERWSZY?',
);

// Przejęcie: 3-2-1 na ekranie, grzybki ożywają dopiero na zerze (serwer pilnuje tego samego)
const countdown = useCountdown(
  () => props.race.armsAt,
  () => tv.serverOffsetMs,
);
watch(
  () => [props.race.id, countdown.secondsLeft.value] as const,
  ([raceId, left], previous) => {
    if (left > 0) audio.play('countdown_tick');
    // Dźwięk startu tylko po faktycznym odliczaniu — nie przy odświeżeniu w trakcie wyścigu
    else if (previous && previous[0] === raceId && previous[1] > 0) audio.play('race_open');
  },
  { immediate: true },
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

    <!-- Klucz tekstowy: liczba zderzała się z kluczem gałęzi v-else i Vue nie podmieniał elementu -->
    <p
      v-if="countdown.counting.value"
      :key="`countdown-${countdown.secondsLeft.value}`"
      data-testid="tv-race-countdown"
      class="mt-[3vh] animate-pop-in font-display text-[18vh] leading-none text-gold"
    >
      {{ countdown.secondsLeft.value }}
    </p>
    <p v-else class="mt-[5vh] font-display text-[3vh] tracking-[0.4em] text-white/40">GRZYBKI ODBLOKOWANE</p>
  </div>
</template>
