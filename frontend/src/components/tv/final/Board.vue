<script setup lang="ts">
import type { TvFinalView } from '@cue/shared';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useAudioStore } from '~/stores/audio';
import { FINAL_RESULT_DELAY_MS } from './resultDelay';

const props = defineProps<{ final: TvFinalView }>();

const player1Slots = computed(() => props.final.slots.filter((s) => s.player === 1));
const player2Slots = computed(() => props.final.slots.filter((s) => s.player === 2));
const revealing = computed(() => props.final.fsm === 'F_REVEAL' || props.final.fsm === 'F_RESULT');
/**
 * Bramka organizacyjna dotyczy zawsze gracza 2: zaraz po starcie finału musi
 * wyjść z pokoju, zanim plansza w ogóle się pokaże, a przed swoją turą wraca.
 */
const leavingRoom = computed(() => props.final.fsm === 'F_SETUP');
const returning = computed(() => props.final.fsm === 'F_P2_READY');
const activePlayerName = computed(() => (props.final.turn === 1 ? props.final.p1Name : props.final.p2Name));

/**
 * Werdykt po FINAL_RESULT_DELAY_MS od ostatniego odsłonięcia. Telewizor odświeżony
 * już po wyniku pokazuje go od razu — nie ma na co czekać.
 */
const audio = useAudioStore();
const showResult = ref(props.final.won !== null);
let resultTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => props.final.won,
  (won, previous) => {
    if (resultTimer) clearTimeout(resultTimer);
    resultTimer = null;
    if (won === null) {
      showResult.value = false;
      // Cofnięcie ostatniego odsłonięcia: fanfara nie może grać dalej
      if (previous) audio.stopLoop(500);
    }
    else if (previous === null) resultTimer = setTimeout(() => (showResult.value = true), FINAL_RESULT_DELAY_MS);
  },
);
onBeforeUnmount(() => resultTimer && clearTimeout(resultTimer));

/** W turze: pytanie, na które gracz właśnie odpowiada; przy odsłanianiu — to, którego dotyczy odsłonięta odpowiedź. */
const questionText = computed(() =>
  revealing.value ? props.final.revealQuestionText : props.final.currentQuestionText,
);
</script>

<template>
  <!-- Cały ekran musi zmieścić się w wysokości telewizora — stąd stałe proporcje i min-h-0 -->
  <section class="relative flex h-full flex-col gap-[2.2vh] px-[5vh] py-[3.5vh]">
    <header class="flex items-baseline justify-between">
      <p class="font-display text-[3vh] tracking-[0.4em] text-white/50">FINAŁ — {{ final.teamName }}</p>
      <p class="font-display text-[3.6vh] tracking-wide text-gold">{{ final.p1Name }} &amp; {{ final.p2Name }}</p>
    </header>

    <!-- Bramka organizacyjna: bez niej gracz 2 zostaje w pokoju i finał jest do wyrzucenia -->
    <div
      v-if="leavingRoom || returning"
      data-testid="tv-final-gate"
      class="flex flex-1 flex-col items-center justify-center gap-[2vh] text-center"
    >
      <p class="font-display text-[8vh] leading-tight tracking-wide text-rose-400">{{ final.p2Name }}</p>
      <p class="font-display text-[5vh] tracking-[0.2em]">
        {{ leavingRoom ? 'OPUŚĆ POKÓJ' : 'WRACA DO GRY' }}
      </p>
      <p class="max-w-[80vh] text-[2.5vh] text-white/60">
        Prowadzący startuje turę dopiero, gdy wszyscy są na swoich miejscach.
      </p>
    </div>

    <template v-else>
      <div class="flex min-h-[11vh] flex-col items-center justify-center text-center">
        <p v-if="!revealing && final.currentQuestionText" class="font-display text-[2.6vh] tracking-[0.3em] text-white/50">
          ODPOWIADA {{ activePlayerName }} — PYTANIE {{ final.qCursor + 1 }}/{{ final.questionCount }}
        </p>
        <p v-else-if="revealing" class="font-display text-[2.6vh] tracking-[0.3em] text-white/50">
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

      <!-- Podczas odsłaniania: narastająca suma i próg pod planszą -->
      <footer v-if="revealing && !showResult" class="flex items-center justify-center gap-[6vh]">
        <div class="text-center">
          <p class="font-display text-[2.4vh] tracking-[0.3em] text-white/50">SUMA</p>
          <p data-testid="tv-final-total" class="font-display text-[9vh] leading-none text-gold">{{ final.total }}</p>
        </div>
        <div class="text-center">
          <p class="font-display text-[2.4vh] tracking-[0.3em] text-white/50">POTRZEBA</p>
          <p data-testid="tv-final-threshold" class="font-display text-[6vh] leading-none text-white/40">{{ final.threshold }}</p>
        </div>
      </footer>
    </template>

    <!--
      Wynik finału: karta na środku, plansza rozmyta pod spodem. Werdykt dokładany
      do wiersza z sumą wypychał ekran poza telewizor — tu nie konkuruje o miejsce
      z listą odpowiedzi. Bez obsługi backdrop-filter zostaje ciemna zasłona.
    -->
    <div
      v-if="final.won !== null && showResult"
      class="absolute inset-0 z-10 flex animate-fade-in items-center justify-center bg-board-deep/70 p-[5vh] backdrop-blur-[1.4vh]"
    >
      <div
        data-testid="tv-final-result"
        class="flex animate-pop-in flex-col items-center gap-[1.5vh] rounded-[4vh] border-[0.5vh] px-[10vh] py-[5vh] text-center"
        :class="
          final.won
            ? 'border-gold bg-board-mid/80 shadow-[0_0_12vh_rgba(251,191,36,0.45)]'
            : 'border-rose-400/70 bg-board-mid/80 shadow-[0_0_10vh_rgba(244,63,94,0.3)]'
        "
      >
        <p class="font-display text-[3vh] tracking-[0.4em] text-white/50">FINAŁ — {{ final.teamName }}</p>
        <p
          data-testid="tv-final-total"
          class="font-display text-[22vh] leading-none"
          :class="final.won ? 'text-gold' : 'text-white'"
        >
          {{ final.total }}
        </p>
        <p class="font-display text-[3.4vh] tracking-[0.3em] text-white/60">
          PUNKTÓW · POTRZEBA
          <span data-testid="tv-final-threshold">{{ final.threshold }}</span>
        </p>
        <p
          data-testid="tv-final-verdict"
          class="mt-[2vh] font-display text-[9vh] leading-none tracking-[0.12em]"
          :class="final.won ? 'text-gold drop-shadow-[0_0_4vh_rgba(251,191,36,0.6)]' : 'text-rose-300'"
        >
          {{ final.won ? 'NAGRODA GŁÓWNA!' : 'NIE UDAŁO SIĘ' }}
        </p>
        <p v-if="!final.won" class="font-display text-[3.2vh] tracking-[0.2em] text-white/50">
          ZABRAKŁO {{ final.threshold - final.total }} PKT
        </p>
      </div>
    </div>
  </section>
</template>
