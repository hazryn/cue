<script setup lang="ts">
import type { TvFinalView } from '@cue/shared';
import { computed } from 'vue';

const props = defineProps<{ final: TvFinalView }>();

const player1Slots = computed(() => props.final.slots.filter((s) => s.player === 1));
const player2Slots = computed(() => props.final.slots.filter((s) => s.player === 2));
const revealing = computed(() => props.final.fsm === 'F_REVEAL' || props.final.fsm === 'F_RESULT');
const waitingForPlayer = computed(() => props.final.fsm === 'F_P1_READY' || props.final.fsm === 'F_P2_READY');
const activePlayerName = computed(() => (props.final.turn === 1 ? props.final.p1Name : props.final.p2Name));

/** W turze: pytanie, na które gracz właśnie odpowiada; przy odsłanianiu — to, którego dotyczy odsłonięta odpowiedź. */
const questionText = computed(() =>
  revealing.value ? props.final.revealQuestionText : props.final.currentQuestionText,
);
</script>

<template>
  <!-- Cały ekran musi zmieścić się w wysokości telewizora — stąd stałe proporcje i min-h-0 -->
  <section class="flex h-full flex-col gap-[2.2vh] px-[5vh] py-[3.5vh]">
    <header class="flex items-baseline justify-between">
      <p class="font-display text-[3vh] tracking-[0.4em] text-white/50">FINAŁ — {{ final.teamName }}</p>
      <p class="font-display text-[3.6vh] tracking-wide text-gold">{{ final.p1Name }} &amp; {{ final.p2Name }}</p>
    </header>

    <!-- Bramka organizacyjna: bez niej gracz 2 zostaje w pokoju i finał jest do wyrzucenia -->
    <div v-if="waitingForPlayer" class="flex flex-1 flex-col items-center justify-center gap-[2vh] text-center">
      <p class="font-display text-[8vh] leading-tight tracking-wide text-rose-400">
        {{ final.turn === 1 ? final.p2Name : final.p1Name }}
      </p>
      <p class="font-display text-[5vh] tracking-[0.2em]">
        {{ final.turn === 1 ? 'OPUŚĆ POKÓJ' : 'WRACA DO GRY' }}
      </p>
      <p class="max-w-[80vh] text-[2.5vh] text-white/60">
        Prowadzący startuje turę dopiero, gdy wszyscy są na swoich miejscach.
      </p>
    </div>

    <template v-else>
      <div class="flex min-h-[11vh] flex-col items-center justify-center text-center">
        <p v-if="!revealing && final.turn" class="font-display text-[2.6vh] tracking-[0.3em] text-white/50">
          ODPOWIADA {{ activePlayerName }} — PYTANIE {{ final.qCursor + 1 }}/{{ final.questionCount }}
        </p>
        <p v-else-if="final.fsm === 'F_REVEAL'" class="font-display text-[2.6vh] tracking-[0.3em] text-white/50">
          PYTANIE
        </p>
        <p
          v-if="questionText"
          data-testid="tv-final-question"
          class="line-clamp-2 max-w-[150vh] font-display text-[4.6vh] uppercase leading-tight"
        >
          {{ questionText }}
        </p>
      </div>

      <div class="grid min-h-0 w-full flex-1 grid-cols-2 content-start gap-x-[4vh]">
        <div v-for="(slots, idx) in [player1Slots, player2Slots]" :key="idx" class="flex flex-col gap-[1vh]">
          <p class="font-display text-[2.6vh] tracking-[0.3em] text-white/50">
            {{ idx === 0 ? final.p1Name : final.p2Name }}
          </p>

          <div
            v-for="slot in slots"
            :key="`${slot.player}-${slot.qIdx}`"
            data-testid="tv-final-slot"
            :data-answered="slot.answered"
            :data-revealed="slot.revealed"
            :data-current="slot.current"
            class="flex items-center gap-[1.5vh] rounded-[1.2vh] border-[0.3vh] px-[2vh] py-[0.9vh] transition-all"
            :class="[
              slot.revealed ? 'border-gold/70 bg-board-light' : 'border-white/10 bg-black/30',
              slot.current ? 'ring-[0.4vh] ring-gold shadow-[0_0_3vh_rgba(251,191,36,0.35)]' : '',
            ]"
          >
            <span class="w-[3.5vh] font-display text-[2.8vh] text-white/40">{{ slot.qIdx + 1 }}</span>

            <!-- Do fazy odsłaniania widz wie tylko tyle, że slot jest zajęty -->
            <span v-if="slot.revealed" class="flex-1 truncate font-display text-[3.2vh] uppercase animate-flip">
              {{ slot.text ?? '—' }}
            </span>
            <span v-else class="flex-1 font-display text-[3.2vh] tracking-[0.5em] text-white/25">
              {{ slot.answered ? '■ ■ ■ ■' : '· · · ·' }}
            </span>

            <span v-if="slot.revealed" class="font-display text-[3.2vh] text-gold animate-flip">
              {{ slot.points ?? 0 }}
            </span>
          </div>
        </div>
      </div>

      <!-- Suma, próg i werdykt w jednym wierszu — osobna linia z werdyktem wypychała ekran poza TV -->
      <footer v-if="revealing" class="flex items-center justify-center gap-[6vh]">
        <div class="text-center">
          <p class="font-display text-[2.4vh] tracking-[0.3em] text-white/50">SUMA</p>
          <p data-testid="tv-final-total" class="font-display text-[9vh] leading-none text-gold">{{ final.total }}</p>
        </div>
        <div class="text-center">
          <p class="font-display text-[2.4vh] tracking-[0.3em] text-white/50">POTRZEBA</p>
          <p class="font-display text-[6vh] leading-none text-white/40">{{ final.threshold }}</p>
        </div>
        <p
          v-if="final.won !== null"
          data-testid="tv-final-verdict"
          class="animate-strike-in rounded-[2vh] border-[0.4vh] px-[4vh] py-[1.5vh] font-display text-[6vh] leading-none tracking-[0.12em]"
          :class="
            final.won
              ? 'border-gold bg-gold/15 text-gold shadow-[0_0_5vh_rgba(251,191,36,0.4)]'
              : 'border-rose-400/70 bg-rose-950/50 text-rose-300'
          "
        >
          {{ final.won ? 'NAGRODA GŁÓWNA!' : 'ZABRAKŁO PUNKTÓW' }}
        </p>
      </footer>
    </template>
  </section>
</template>
