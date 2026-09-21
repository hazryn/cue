<script setup lang="ts">
import { computed } from 'vue';
import { useAdminStore } from '~/stores/admin';
import { useUiStore } from '~/stores/ui';
import Presence from './Presence.vue';
import RaceLog from './RaceLog.vue';

const admin = useAdminStore();
const ui = useUiStore();

const question = computed(() => admin.question);
const fsm = computed(() => question.value?.fsm);
const teams = computed(() => admin.view?.teams ?? []);

const teamName = (id: string | null): string => teams.value.find((t) => t.id === id)?.name ?? '—';
const controlling = computed(() => question.value?.controllingTeamId ?? question.value?.stealingTeamId ?? null);
const canAnswer = computed(() => fsm.value === 'Q_CONTROL' || fsm.value === 'Q_STEAL_ATTEMPT');
const revealing = computed(() => fsm.value === 'Q_FORFEIT_REVEAL');
const remaining = computed(() => question.value?.answers.filter((a) => !a.revealed) ?? []);

async function skipToFinal(): Promise<void> {
  const ok = await ui.confirm({
    title: 'Przewinąć do finału?',
    message: 'Runda główna zostanie zamknięta z bieżącą punktacją. Skrót do prób przed grą.',
    confirmLabel: 'Przewiń',
    danger: true,
  });
  if (ok) await admin.action('ADMIN_SKIP_TO_LEADERBOARD');
}

async function revealRest(): Promise<void> {
  const ok = await ui.confirm({
    title: 'Odsłonić resztę hurtem?',
    message: 'Przy dziesięciu odpowiedziach klikanie po jednej potrafi zabić tempo wieczoru.',
    confirmLabel: 'Odsłoń wszystko',
  });
  if (ok) await admin.action('ADMIN_REVEAL_REST');
}
</script>

<template>
  <div v-if="question" class="flex flex-col gap-3 p-4 pb-24">
    <Presence :teams="teams" :presence="admin.view?.presence ?? []" />

    <section class="card">
      <div class="flex items-baseline justify-between text-xs uppercase tracking-widest text-white/40">
        <span>pytanie {{ question.index + 1 }}/{{ question.total }}</span>
        <span v-if="question.multiplier > 1" class="text-gold">mnożnik ×{{ question.multiplier }}</span>
      </div>
      <p data-testid="admin-question" class="mt-1 font-display text-2xl leading-tight tracking-wide">{{ question.text }}</p>
      <p v-if="question.note" class="mt-1 text-xs text-amber-300/80">{{ question.note }}</p>

      <div class="mt-3 flex items-center justify-between">
        <span class="text-sm text-white/60">
          Pula: <span data-testid="admin-pool" class="font-display text-xl text-gold">{{ question.pool }}</span>
        </span>
        <span v-if="controlling" class="text-sm">
          Gra: <span class="font-semibold text-gold">{{ teamName(controlling) }}</span>
          <span v-if="fsm === 'Q_STEAL_ATTEMPT'" class="text-white/50"> (przejęcie — jedna próba)</span>
        </span>
      </div>

      <div v-if="fsm === 'Q_CONTROL'" class="mt-2 flex gap-1 text-2xl">
        <span v-for="i in 3" :key="i" :class="i <= question.strikes ? 'text-rose-500' : 'text-white/15'">✖</span>
      </div>
    </section>

    <!-- Jedno kliknięcie: pytanie pojawia się na TV razem z odblokowaniem grzybków -->
    <section v-if="fsm === 'Q_IDLE'" class="flex flex-col gap-2">
      <button class="btn-primary text-lg" @click="admin.action('ADMIN_OPEN_RACE')">
        START — pytanie i grzybki
      </button>
      <p class="text-center text-xs text-white/40">Pytanie pokaże się na telewizorze w tym samym momencie.</p>
    </section>

    <section v-else-if="fsm === 'Q_RACE_OPEN' || fsm === 'Q_RACE_RESOLVING'" class="card text-center">
      <p class="font-display text-2xl tracking-wide text-gold">Czekam na grzybek…</p>
      <button class="btn-ghost mt-3" @click="admin.action('ADMIN_CANCEL_RACE')">Anuluj wyścig</button>
    </section>

    <section v-else-if="fsm === 'Q_STEAL_RACE_OPEN'" class="card text-center">
      <p class="font-display text-2xl tracking-wide text-gold">Przejęcie</p>
      <p class="text-sm text-white/60">Grają drużyny, które jeszcze nie próbowały.</p>
      <button class="btn-primary mt-3" @click="admin.action('ADMIN_OPEN_RACE')">Odblokuj grzybki</button>
    </section>

    <!-- Odpowiedzi: duże cele dotykowe, bo klikane w półmroku i pod presją -->
    <section v-if="canAnswer || revealing" class="grid gap-2">
      <button
        v-for="answer in question.answers"
        :key="answer.id"
        data-testid="admin-answer"
        :data-weight="answer.weight"
        :data-revealed="answer.revealed"
        class="flex items-center gap-3 rounded-xl border px-4 py-4 text-left transition active:scale-[0.99]"
        :class="
          answer.revealed
            ? 'border-emerald-400/40 bg-emerald-900/30 text-white/50'
            : 'border-white/15 bg-white/5 hover:bg-white/10'
        "
        @click="admin.action(revealing ? 'ADMIN_REVEAL_ONE' : 'ADMIN_HIT', { answerId: answer.id })"
      >
        <span class="w-6 text-center text-white/40">{{ answer.position + 1 }}</span>
        <span data-testid="admin-answer-text" class="flex-1 font-semibold">{{ answer.text }}</span>
        <span class="font-display text-xl text-gold">{{ answer.weight }}</span>
        <span v-if="answer.revealed" class="text-emerald-400">✓</span>
      </button>
    </section>

    <button v-if="canAnswer" class="btn-danger text-lg" @click="admin.action('ADMIN_MISS')">
      ✖ Błędna odpowiedź
    </button>

    <div v-if="revealing" class="flex flex-col gap-2">
      <p class="text-center text-sm text-rose-300">Pula przepadła — odsłoń pozostałe {{ remaining.length }} odpowiedzi.</p>
      <button class="btn-ghost" @click="revealRest">Odsłoń resztę hurtem</button>
    </div>

    <section v-if="fsm === 'Q_AWARD'" class="card text-center">
      <p class="font-display text-3xl tracking-wide text-gold">
        {{ teamName(question.awardedTo) }} +{{ question.awardedAmount }}
      </p>
      <button class="btn-primary mt-3 w-full" @click="admin.action('ADMIN_CONTINUE')">Dalej</button>
    </section>

    <section v-if="fsm === 'Q_CLOSED'" class="flex flex-col gap-2">
      <button class="btn-primary text-lg" @click="admin.action('ADMIN_NEXT_QUESTION')">
        {{ question.index + 1 >= question.total ? 'Pokaż ranking końcowy' : 'Następne pytanie' }}
      </button>
    </section>

    <details class="card">
      <summary class="cursor-pointer text-sm text-white/60">Narzędzia ratunkowe</summary>
      <div class="mt-3 flex flex-col gap-2">
        <button
          v-if="fsm === 'Q_CONTROL'"
          class="btn-ghost text-sm"
          @click="admin.action('ADMIN_PASS_TO_STEAL')"
        >
          Wymuś przejęcie
        </button>
        <button
          v-if="fsm === 'Q_IDLE' || fsm === 'Q_RACE_OPEN'"
          class="btn-ghost text-sm"
          @click="admin.action('ADMIN_SKIP_QUESTION')"
        >
          Podmień pytanie
        </button>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="team in teams"
            :key="team.id"
            class="btn-ghost text-xs"
            @click="admin.action('ADMIN_FORCE_CONTROL', { teamId: team.id })"
          >
            Kontrola: {{ team.name }}
          </button>
        </div>

        <!-- Do prób przed imprezą: pomija resztę rundy głównej i wchodzi w finał -->
        <button class="btn-ghost text-sm" @click="skipToFinal">⏩ Przewiń do finału (próba)</button>
      </div>
    </details>

    <RaceLog />
  </div>

  <div v-else class="p-6 text-center text-white/50">Czekam na dane pytania…</div>
</template>
