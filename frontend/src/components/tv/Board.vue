<script setup lang="ts">
import type { TvQuestionView } from '@cue/shared';
import { computed } from 'vue';
import Slot from './Slot.vue';
import Strikes from './Strikes.vue';

const props = defineProps<{ question: TvQuestionView }>();

const leftColumn = computed(() => props.question.slots.slice(0, Math.ceil(props.question.slots.length / 2)));
const rightColumn = computed(() => props.question.slots.slice(Math.ceil(props.question.slots.length / 2)));
const offset = computed(() => leftColumn.value.length);
// Po przyznaniu puli na pierwszy plan wchodzi wynik — X-y zrobiły już swoje
const showStrikes = computed(() => props.question.strikes > 0 && !props.question.awardedTo);
</script>

<template>
  <section class="flex h-full flex-1 flex-col p-[2.5vh]">
    <header class="mb-[2vh] flex items-baseline justify-between">
      <span class="font-display text-[3vh] tracking-[0.3em] text-white/50">
        PYTANIE {{ question.index + 1 }}/{{ question.total }}
        <span v-if="question.multiplier > 1" class="ml-[1vh] text-gold">×{{ question.multiplier }}</span>
      </span>
      <span class="font-display text-[3vh] tracking-[0.3em] text-white/50">PULA</span>
    </header>

    <div class="mb-[2.5vh] flex items-center justify-between gap-[3vh]">
      <h1 data-testid="tv-question" class="flex-1 font-display text-[5.5vh] uppercase leading-tight tracking-wide">
        {{ question.text ?? '. . .' }}
      </h1>
      <div
        class="min-w-[16vh] rounded-[1.5vh] border-[0.4vh] px-[2vh] py-[1vh] text-center"
        :class="question.forfeited ? 'animate-pulse border-rose-500 bg-rose-950/60' : 'border-gold bg-gold/10'"
      >
        <p data-testid="tv-pool" class="font-display text-[7vh] leading-none" :class="question.forfeited ? 'text-rose-400' : 'text-gold'">
          {{ question.forfeited ? 0 : question.pool }}
        </p>
      </div>
    </div>

    <div class="grid flex-1 grid-cols-2 content-start gap-x-[2.5vh] gap-y-[1.2vh]">
      <div class="flex flex-col gap-[1.2vh]">
        <Slot v-for="(slot, i) in leftColumn" :key="slot.position" :slot="slot" :index="i" />
      </div>
      <div class="flex flex-col gap-[1.2vh]">
        <Slot v-for="(slot, i) in rightColumn" :key="slot.position" :slot="slot" :index="offset + i" />
      </div>
    </div>

    <footer class="mt-[2vh] flex h-[20vh] items-center justify-center">
      <Strikes v-if="showStrikes" :count="question.strikes" />
      <p v-else-if="question.awardedTo" data-testid="tv-award" class="animate-flip font-display text-[6vh] tracking-wide text-gold">
        +{{ question.awardedAmount }} PUNKTÓW
      </p>
      <p v-else-if="question.forfeited" class="font-display text-[5vh] tracking-wide text-rose-400">
        PULA PRZEPADA
      </p>
    </footer>
  </section>
</template>
