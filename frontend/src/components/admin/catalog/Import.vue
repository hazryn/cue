<script setup lang="ts">
import { ref } from 'vue';
import Modal from '~/components/ui/Modal.vue';
import { useCatalogStore } from '~/stores/catalog';
import { useUiStore } from '~/stores/ui';

const emit = defineEmits<{ close: []; saved: [] }>();
const catalog = useCatalogStore();
const ui = useUiStore();

const packId = ref(catalog.packs[0]?.id ?? '');
const kind = ref<'MAIN' | 'FINAL'>('MAIN');
const text = ref('');
const preview = ref<{ text: string; answers: Array<{ text: string; weight: number }> } | null>(null);

const example = `Co można znaleźć w kuchni?
Lodówka\t32
Garnek\t21
Nóż\t15`;

async function runPreview(): Promise<void> {
  try {
    preview.value = await catalog.previewImport(packId.value, kind.value, text.value);
  } catch (error) {
    preview.value = null;
    ui.toast(error instanceof Error ? error.message : 'Nie udało się sparsować', 'error');
  }
}

async function save(): Promise<void> {
  if (await catalog.importQuestion(packId.value, kind.value, text.value)) emit('saved');
}
</script>

<template>
  <Modal title="Import pytania z tekstu" wide @close="emit('close')">
    <div class="flex flex-col gap-3">
      <p class="text-sm text-white/60">
        Pierwsza linia to pytanie, każda kolejna to „odpowiedź — tabulator albo spacja — waga".
        Szybsza droga niż klikanie formularza dla każdej z kilkuset odpowiedzi.
      </p>

      <div class="grid gap-3 sm:grid-cols-2">
        <select v-model="packId" class="input">
          <option v-for="pack in catalog.packs" :key="pack.id" :value="pack.id">{{ pack.name }}</option>
        </select>
        <select v-model="kind" class="input">
          <option value="MAIN">Runda główna</option>
          <option value="FINAL">Finał</option>
        </select>
      </div>

      <textarea v-model="text" rows="10" class="input font-mono text-sm" :placeholder="example" />

      <button class="btn-ghost" :disabled="text.trim().length < 5" @click="runPreview">Sprawdź parsowanie</button>

      <div v-if="preview" class="card">
        <p class="font-display text-xl tracking-wide">{{ preview.text }}</p>
        <ul class="mt-2 space-y-1 text-sm">
          <li v-for="(answer, i) in preview.answers" :key="i" class="flex justify-between">
            <span>{{ answer.text }}</span>
            <span class="text-gold">{{ answer.weight }}</span>
          </li>
        </ul>
      </div>
    </div>

    <template #footer>
      <button class="btn-ghost" @click="emit('close')">Anuluj</button>
      <button class="btn-primary" :disabled="!preview" @click="save">Zapisz pytanie</button>
    </template>
  </Modal>
</template>
