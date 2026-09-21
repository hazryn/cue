<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Modal from '~/components/ui/Modal.vue';
import type { Question } from '~/stores/catalog';
import { useCatalogStore } from '~/stores/catalog';

const props = defineProps<{ question: Partial<Question> }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const catalog = useCatalogStore();

/** Edytujemy w kolejności z planszy: najwyżej punktowana odpowiedź na górze. */
const byPoints = (answers: Question['answers'] = []) => [...answers].sort((a, b) => b.weight - a.weight);

const draft = ref<Partial<Question>>({ ...props.question, answers: byPoints(props.question.answers) });

const sum = computed(() => (draft.value.answers ?? []).reduce((acc, a) => acc + (Number(a.weight) || 0), 0));
const countOk = computed(() => {
  const count = draft.value.answers?.length ?? 0;
  return draft.value.kind === 'FINAL' ? count === 10 : count >= 3 && count <= 10;
});
const valid = computed(() => Boolean(draft.value.text?.trim()) && countOk.value && sum.value <= 100);

watch(
  () => props.question,
  (next) => (draft.value = { ...next, answers: byPoints(next.answers) }),
);

function addAnswer(): void {
  draft.value.answers = [...(draft.value.answers ?? []), { text: '', weight: 1 }];
}

/** Ręczne przesortowanie — w trakcie wpisywania pola nie skaczą same. */
function sortByPoints(): void {
  draft.value.answers = byPoints(draft.value.answers);
}

function removeAnswer(index: number): void {
  draft.value.answers = (draft.value.answers ?? []).filter((_, i) => i !== index);
}

async function save(): Promise<void> {
  if (await catalog.saveQuestion(draft.value)) emit('saved');
}
</script>

<template>
  <Modal :title="draft.id ? 'Edycja pytania' : 'Nowe pytanie'" wide @close="emit('close')">
    <div class="flex flex-col gap-4">
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-white/50">Pakiet</span>
          <select v-model="draft.packId" class="input">
            <option v-for="pack in catalog.packs" :key="pack.id" :value="pack.id">{{ pack.name }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-white/50">Rodzaj</span>
          <select v-model="draft.kind" class="input">
            <option value="MAIN">Runda główna (3–10 odpowiedzi)</option>
            <option value="FINAL">Finał (dokładnie 10)</option>
          </select>
        </label>
      </div>

      <label class="flex flex-col gap-1 text-sm">
        <span class="text-white/50">Pytanie</span>
        <input v-model="draft.text" class="input" placeholder="Co można znaleźć w kuchni?" />
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span class="text-white/50">Notatka dla prowadzącego (opcjonalnie)</span>
        <input v-model="draft.note" class="input" placeholder="np. uznajemy też: chłodziarka" />
      </label>

      <div>
        <div class="mb-2 flex items-center justify-between text-sm">
          <span class="text-white/50">
            Odpowiedzi ({{ draft.answers?.length ?? 0 }}) — suma wag
            <span :class="sum > 100 ? 'text-rose-400' : 'text-gold'">{{ sum }}</span>
          </span>
          <span class="flex gap-2">
            <button class="btn-ghost px-3 py-1 text-xs" @click="sortByPoints">Sortuj po punktach</button>
            <button class="btn-ghost px-3 py-1 text-xs" @click="addAnswer">+ dodaj</button>
          </span>
        </div>

        <div class="flex flex-col gap-2">
          <div v-for="(answer, index) in draft.answers ?? []" :key="index" class="flex items-center gap-2">
            <span class="w-5 shrink-0 text-center text-xs text-white/30">{{ index + 1 }}</span>
            <input v-model="answer.text" class="input flex-1" placeholder="Odpowiedź" maxlength="120" />
            <input v-model.number="answer.weight" type="number" min="1" max="100" class="input w-24" />
            <button class="btn-ghost px-3" @click="removeAnswer(index)">✕</button>
          </div>
        </div>

        <p v-if="!countOk" class="mt-2 text-xs text-rose-400">
          {{ draft.kind === 'FINAL' ? 'Pytanie finałowe musi mieć dokładnie 10 odpowiedzi.' : 'Wymagane 3–10 odpowiedzi.' }}
        </p>
      </div>
    </div>

    <template #footer>
      <button class="btn-ghost" @click="emit('close')">Anuluj</button>
      <button class="btn-primary" :disabled="!valid" @click="save">Zapisz</button>
    </template>
  </Modal>
</template>
