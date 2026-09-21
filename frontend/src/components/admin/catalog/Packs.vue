<script setup lang="ts">
import { ref } from 'vue';
import Modal from '~/components/ui/Modal.vue';
import type { Pack } from '~/stores/catalog';
import { useCatalogStore } from '~/stores/catalog';
import { useUiStore } from '~/stores/ui';

const emit = defineEmits<{ close: [] }>();
const catalog = useCatalogStore();
const ui = useUiStore();

/** Paleta pod planszę — dowolny kolor i tak da się wpisać ręcznie. */
const PALETTE = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#a855f7', '#14b8a6', '#64748b'];

const editing = ref<Partial<Pack> | null>(null);

function create(): void {
  editing.value = { name: '', description: '', color: PALETTE[catalog.packs.length % PALETTE.length] };
}

async function save(): Promise<void> {
  if (!editing.value?.name?.trim()) return;
  if (await catalog.savePack(editing.value)) editing.value = null;
}

async function remove(pack: Pack): Promise<void> {
  const stats = catalog.stats[pack.id];
  const count = (stats?.main ?? 0) + (stats?.final ?? 0);
  if (count > 0) {
    ui.toast(`„${pack.name}" ma jeszcze ${count} pytań — najpierw je przenieś lub usuń`, 'error');
    return;
  }
  const ok = await ui.confirm({ title: `Usunąć pakiet „${pack.name}"?`, confirmLabel: 'Usuń', danger: true });
  if (ok) await catalog.deletePack(pack.id);
}
</script>

<template>
  <Modal title="Pakiety" wide @close="emit('close')">
    <div class="flex flex-col gap-3">
      <p class="text-sm text-white/60">
        Pakiety porządkują pytania tematycznie — przed grą wybierasz, które wchodzą do puli.
      </p>

      <ul class="flex flex-col gap-2">
        <li
          v-for="pack in catalog.packs"
          :key="pack.id"
          data-testid="pack-row"
          class="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
        >
          <span class="h-4 w-4 shrink-0 rounded-full" :style="{ background: pack.color }" />
          <div class="min-w-0 flex-1">
            <p class="truncate font-semibold">{{ pack.name }}</p>
            <p class="truncate text-xs text-white/40">
              {{ catalog.stats[pack.id]?.main ?? 0 }} głównych ·
              {{ catalog.stats[pack.id]?.final ?? 0 }} finałowych
              <span v-if="pack.description"> — {{ pack.description }}</span>
            </p>
          </div>
          <button class="btn-ghost px-3 py-1.5 text-xs" @click="editing = { ...pack }">Edytuj</button>
          <button class="btn-ghost px-3 py-1.5 text-xs" @click="remove(pack)">Usuń</button>
        </li>
      </ul>

      <button data-testid="pack-new" class="btn-ghost" @click="create">+ Nowy pakiet</button>

      <div v-if="editing" class="card flex flex-col gap-3">
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-white/50">Nazwa</span>
          <input v-model="editing.name" data-testid="pack-name" class="input" maxlength="120" placeholder="np. Wesele" />
        </label>

        <label class="flex flex-col gap-1 text-sm">
          <span class="text-white/50">Opis (opcjonalnie)</span>
          <input v-model="editing.description" class="input" placeholder="Dla kogo i na jaką okazję" />
        </label>

        <div class="flex flex-col gap-2 text-sm">
          <span class="text-white/50">Kolor</span>
          <div class="flex flex-wrap items-center gap-2">
            <button
              v-for="color in PALETTE"
              :key="color"
              class="h-8 w-8 rounded-full border-2 transition"
              :class="editing.color === color ? 'border-white' : 'border-transparent'"
              :style="{ background: color }"
              @click="editing.color = color"
            />
            <input v-model="editing.color" class="input w-28" maxlength="16" />
          </div>
        </div>

        <div class="flex justify-end gap-2">
          <button class="btn-ghost" @click="editing = null">Anuluj</button>
          <button class="btn-primary" data-testid="pack-save" :disabled="!editing.name?.trim()" @click="save">
            Zapisz
          </button>
        </div>
      </div>
    </div>

    <template #footer>
      <button class="btn-ghost" @click="emit('close')">Zamknij</button>
    </template>
  </Modal>
</template>
