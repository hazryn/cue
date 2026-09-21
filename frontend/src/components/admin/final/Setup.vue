<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useAdminStore } from '~/stores/admin';
import { useCatalogStore } from '~/stores/catalog';

const admin = useAdminStore();
const catalog = useCatalogStore();

const teamId = ref<string>('');
const p1Name = ref('');
const p2Name = ref('');
const picked = ref<string[]>([]);

const needed = computed(() => admin.view?.config.finalQuestionCount ?? 5);
const finalQuestions = computed(() => catalog.questions.filter((q) => q.kind === 'FINAL'));
const ready = computed(
  () => Boolean(teamId.value) && p1Name.value.trim() && p2Name.value.trim() && picked.value.length === needed.value,
);

onMounted(async () => {
  if (!catalog.questions.length) await catalog.loadQuestions();
  // Domyślnie finał gra zwycięzca rundy głównej — przy remisie prowadzący wybiera sam
  teamId.value = admin.view?.ranking.find((r) => r.isWinner)?.teamId ?? '';
  draw();
});

watch(finalQuestions, () => {
  if (picked.value.length === 0) draw();
});

function draw(): void {
  const pool = [...finalQuestions.value];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  picked.value = pool.slice(0, needed.value).map((q) => q.id);
}

function toggle(id: string): void {
  if (picked.value.includes(id)) picked.value = picked.value.filter((q) => q !== id);
  else if (picked.value.length < needed.value) picked.value = [...picked.value, id];
}

async function start(): Promise<void> {
  await admin.action('ADMIN_START_FINAL', {
    teamId: teamId.value,
    p1Name: p1Name.value.trim(),
    p2Name: p2Name.value.trim(),
    questionIds: picked.value,
  });
}
</script>

<template>
  <div class="flex flex-col gap-4 p-4 pb-24">
    <section class="card">
      <h2 class="mb-3 font-display text-2xl tracking-wide">Kto gra finał?</h2>
      <div class="flex flex-col gap-2">
        <button
          v-for="entry in admin.view?.ranking ?? []"
          :key="entry.teamId"
          class="flex items-center gap-3 rounded-xl border px-4 py-3 text-left"
          :class="teamId === entry.teamId ? 'border-gold bg-gold/15' : 'border-white/15 bg-white/5'"
          @click="teamId = entry.teamId"
        >
          <span class="w-6 font-display text-xl text-white/40">{{ entry.place }}</span>
          <span class="flex-1 font-semibold">{{ entry.name }}</span>
          <span class="font-display text-xl text-gold">{{ entry.score }}</span>
        </button>
      </div>
    </section>

    <section class="card">
      <h2 class="mb-3 font-display text-2xl tracking-wide">Zawodnicy</h2>
      <label class="mb-2 block text-xs uppercase tracking-widest text-white/40">Gracz 1 — gra pierwszy</label>
      <input v-model="p1Name" class="input mb-3" placeholder="Imię" maxlength="24" />
      <label class="mb-2 block text-xs uppercase tracking-widest text-white/40">
        Gracz 2 — wychodzi z pokoju na czas tury gracza 1
      </label>
      <input v-model="p2Name" class="input" placeholder="Imię" maxlength="24" />
    </section>

    <section class="card">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="font-display text-2xl tracking-wide">
          Pytania <span class="text-gold">{{ picked.length }}/{{ needed }}</span>
        </h2>
        <button class="btn-ghost px-3 py-1.5 text-sm" @click="draw">Losuj</button>
      </div>
      <ul class="max-h-72 space-y-1 overflow-y-auto pr-1">
        <li v-for="question in finalQuestions" :key="question.id">
          <button
            class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm"
            :class="picked.includes(question.id) ? 'bg-gold/15 text-gold' : 'bg-white/5 hover:bg-white/10'"
            @click="toggle(question.id)"
          >
            <span class="w-5 text-xs text-white/40">
              {{ picked.indexOf(question.id) >= 0 ? picked.indexOf(question.id) + 1 : '' }}
            </span>
            <span class="flex-1 truncate">{{ question.text }}</span>
          </button>
        </li>
      </ul>
    </section>

    <button class="btn-primary text-lg" :disabled="!ready" @click="start">Rozpocznij finał</button>
  </div>
</template>
