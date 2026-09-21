<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { Question } from '~/stores/catalog';
import { useCatalogStore } from '~/stores/catalog';
import { useUiStore } from '~/stores/ui';
import Import from './Import.vue';
import Packs from './Packs.vue';
import QuestionForm from './QuestionForm.vue';

const catalog = useCatalogStore();
const ui = useUiStore();

const packFilter = ref('');
const kindFilter = ref<'' | 'MAIN' | 'FINAL'>('');
const editing = ref<Partial<Question> | null>(null);
const importing = ref(false);
const managingPacks = ref(false);

const filtered = computed(() =>
  catalog.questions.filter(
    (q) => (!packFilter.value || q.packId === packFilter.value) && (!kindFilter.value || q.kind === kindFilter.value),
  ),
);

onMounted(async () => {
  await catalog.loadPacks();
  await catalog.loadQuestions();
});

function create(): void {
  editing.value = {
    packId: packFilter.value || catalog.packs[0]?.id,
    kind: kindFilter.value || 'MAIN',
    text: '',
    answers: [
      { text: '', weight: 30 },
      { text: '', weight: 20 },
      { text: '', weight: 10 },
    ],
  };
}

async function remove(question: Question): Promise<void> {
  const ok = await ui.confirm({
    title: 'Usunąć pytanie?',
    message: question.text,
    confirmLabel: 'Usuń',
    danger: true,
  });
  if (ok) await catalog.deleteQuestion(question.id);
}

async function refresh(): Promise<void> {
  editing.value = null;
  importing.value = false;
  await catalog.loadQuestions();
  await catalog.loadPacks();
}
</script>

<template>
  <div class="flex flex-col gap-4 p-4 pb-24">
    <div class="flex flex-wrap items-center gap-2">
      <select v-model="packFilter" class="input w-auto">
        <option value="">Wszystkie pakiety</option>
        <option v-for="pack in catalog.packs" :key="pack.id" :value="pack.id">
          {{ pack.name }} ({{ catalog.stats[pack.id]?.main ?? 0 }}/{{ catalog.stats[pack.id]?.final ?? 0 }})
        </option>
      </select>

      <select v-model="kindFilter" class="input w-auto">
        <option value="">Wszystkie rodzaje</option>
        <option value="MAIN">Runda główna</option>
        <option value="FINAL">Finał</option>
      </select>

      <span class="flex-1" />
      <button class="btn-ghost" data-testid="manage-packs" @click="managingPacks = true">Pakiety</button>
      <button class="btn-ghost" @click="importing = true">Import z tekstu</button>
      <button class="btn-primary" @click="create">Nowe pytanie</button>
    </div>

    <p class="text-sm text-white/50">{{ filtered.length }} pytań</p>

    <ul class="flex flex-col gap-2">
      <li
        v-for="question in filtered"
        :key="question.id"
        class="card flex items-start gap-3 py-3"
      >
        <span
          class="shrink-0 rounded-md px-2 py-1 text-[10px] uppercase tracking-widest"
          :class="question.kind === 'FINAL' ? 'bg-purple-500/20 text-purple-300' : 'bg-white/10 text-white/50'"
        >
          {{ question.kind === 'FINAL' ? 'finał' : 'główne' }}
        </span>

        <div class="min-w-0 flex-1">
          <p class="truncate font-semibold">{{ question.text }}</p>
          <p class="truncate text-xs text-white/40">
            {{ question.answers.map((a) => `${a.text} ${a.weight}`).join(' · ') }}
          </p>
        </div>

        <button class="btn-ghost px-3 py-1.5 text-xs" @click="editing = question">Edytuj</button>
        <button class="btn-ghost px-3 py-1.5 text-xs" @click="remove(question)">Usuń</button>
      </li>
    </ul>

    <QuestionForm v-if="editing" :question="editing" @close="editing = null" @saved="refresh" />
    <Import v-if="importing" @close="importing = false" @saved="refresh" />
    <Packs v-if="managingPacks" @close="managingPacks = false" />
  </div>
</template>
