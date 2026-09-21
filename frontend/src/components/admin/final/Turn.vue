<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useAdminStore } from '~/stores/admin';

const admin = useAdminStore();
const final = computed(() => admin.final);
const customAnswer = ref('');

// Nowe pytanie to nowa odpowiedź — pole nie może ciągnąć się za kursorem
watch(
  () => [final.value?.qCursor, final.value?.turn],
  () => (customAnswer.value = ''),
);

/**
 * Odpowiedź spoza listy: zero punktów, ale zapisana treść trafia na telewizor
 * przy odsłanianiu. Puste pole = zwykły błąd.
 */
async function registerMiss(): Promise<void> {
  const text = customAnswer.value.trim();
  const ok = await admin.action('ADMIN_FINAL_MISS', text ? { text } : {});
  if (ok) customAnswer.value = '';
}
// Tura bez zegara: prowadzący na telefonie nie nadążał jednocześnie z czasem i odpowiedziami.
// Stan PAUSED zostaje obsłużony tylko dla gier rozpoczętych jeszcze z zegarem.
const running = computed(() => final.value?.fsm === 'F_P1_RUNNING' || final.value?.fsm === 'F_P2_RUNNING');
const paused = computed(() => final.value?.fsm === 'F_P1_PAUSED' || final.value?.fsm === 'F_P2_PAUSED');
const ready = computed(() => final.value?.fsm === 'F_P1_READY' || final.value?.fsm === 'F_P2_READY');
const activeName = computed(() => (final.value?.turn === 1 ? final.value?.p1Name : final.value?.p2Name));
const otherName = computed(() => (final.value?.turn === 1 ? final.value?.p2Name : final.value?.p1Name));
</script>

<template>
  <div v-if="final" class="flex flex-col gap-3 p-4 pb-24">
    <section class="card">
      <p class="text-xs uppercase tracking-widest text-white/40">
        gracz {{ final.turn }} · pytanie
        <span data-testid="final-progress">{{ final.qCursor + 1 }}/{{ final.questionCount }}</span>
      </p>
      <p class="font-display text-2xl tracking-wide">{{ activeName }}</p>
    </section>

    <!-- Bramka: prowadzący potwierdza, że drugi gracz naprawdę wyszedł z pokoju -->
    <section v-if="ready" class="card text-center">
      <p class="font-display text-2xl tracking-wide text-rose-300">
        {{ final.turn === 1 ? `${otherName} opuszcza pokój` : `${otherName} wraca — ${activeName} gra` }}
      </p>
      <p class="mt-1 text-sm text-white/60">Pierwsze pytanie pojawi się po Twoim kliknięciu.</p>
      <button class="btn-primary mt-3 w-full text-lg" @click="admin.action('ADMIN_FINAL_START_TIMER')">
        Start tury
      </button>
    </section>

    <template v-if="running || paused">
      <p class="font-display text-xl leading-tight">{{ final.currentQuestionText }}</p>

      <section class="grid gap-2">
        <button
          v-for="answer in final.currentAnswers"
          :key="answer.id"
          data-testid="final-answer"
          :data-weight="answer.weight"
          class="flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition active:scale-[0.99]"
          :class="
            answer.takenByPlayer1 && final.turn === 2
              ? 'border-amber-400/60 bg-amber-900/25'
              : answer.takenByPlayer2 && final.turn === 2
                ? 'border-emerald-400/30 bg-emerald-900/20 opacity-60'
                : 'border-white/15 bg-white/5 hover:bg-white/10'
          "
          :disabled="!running"
          @click="admin.action('ADMIN_FINAL_HIT', { answerId: answer.id })"
        >
          <!-- Ostrzeżenie o duplikacie musi być widoczne, zanim palec dotknie ekranu -->
          <span
            v-if="answer.takenByPlayer1 && final.turn === 2"
            data-testid="taken-by-p1"
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-board-deep"
            title="Tę odpowiedź zajął gracz 1 — duplikat"
          >
            1
          </span>
          <span v-else class="w-6 text-center text-white/40">{{ answer.position + 1 }}</span>

          <span data-testid="final-answer-text" class="flex-1 font-semibold">{{ answer.text }}</span>
          <span class="font-display text-lg text-gold">{{ answer.weight }}</span>
        </button>
      </section>

      <div class="flex flex-col gap-2">
        <input
          v-model="customAnswer"
          data-testid="final-custom"
          class="input"
          placeholder="Odpowiedź spoza listy (0 pkt) — opcjonalnie"
          maxlength="120"
          :disabled="!running"
          @keyup.enter="registerMiss"
        />
        <div class="grid grid-cols-2 gap-2">
          <button data-testid="final-miss" class="btn-danger" :disabled="!running" @click="registerMiss">
            ✖ {{ customAnswer.trim() ? 'Zapisz i dalej' : 'Błąd' }}
          </button>
          <button class="btn-ghost" :disabled="!running" @click="admin.action('ADMIN_FINAL_PASS')">⏭ Pas</button>
        </div>
      </div>

      <button v-if="paused" class="btn-primary text-sm" @click="admin.action('ADMIN_FINAL_RESUME')">▶ Wznów</button>
      <button class="btn-ghost text-sm" @click="admin.action('ADMIN_FINAL_END_TURN')">Zakończ turę</button>

      <p v-if="final.duplicateBuzzes > 0 && final.turn === 2" class="text-center text-xs text-amber-300">
        Duplikaty w tej turze: {{ final.duplicateBuzzes }}
      </p>
    </template>

    <section v-if="final.fsm === 'F_P1_DONE'" class="card text-center">
      <p class="font-display text-2xl tracking-wide">Tura gracza 1 zakończona</p>
      <button class="btn-primary mt-3 w-full" @click="admin.action('ADMIN_FINAL_BEGIN_TURN', { player: 2 })">
        Zawołaj gracza 2
      </button>
    </section>

    <section v-if="final.fsm === 'F_P2_DONE'" class="card text-center">
      <p class="font-display text-2xl tracking-wide">Obie tury zagrane</p>
      <button class="btn-primary mt-3 w-full" @click="admin.action('ADMIN_FINAL_BEGIN_REVEAL')">
        Przejdź do odsłaniania
      </button>
    </section>

    <section v-if="final.fsm === 'F_SETUP'" class="card text-center">
      <button class="btn-primary w-full" @click="admin.action('ADMIN_FINAL_BEGIN_TURN', { player: 1 })">
        Zaczynamy — gracz 1
      </button>
    </section>
  </div>
</template>
