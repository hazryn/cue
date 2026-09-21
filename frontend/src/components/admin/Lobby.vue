<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { http } from '~/api/http';
import { useAdminStore } from '~/stores/admin';
import { useCatalogStore } from '~/stores/catalog';
import { useUiStore } from '~/stores/ui';
import Modal from '~/components/ui/Modal.vue';
import Presence from './Presence.vue';

const admin = useAdminStore();
const catalog = useCatalogStore();
const ui = useUiStore();

const selectedPacks = ref<string[]>([]);
const selectedQuestions = ref<string[]>([]);
const hasGame = ref(true);
const busy = ref(false);

const mainQuestions = computed(() => catalog.questions.filter((q) => q.kind === 'MAIN'));
const available = computed(() =>
  selectedPacks.value.length
    ? mainQuestions.value.filter((q) => selectedPacks.value.includes(q.packId))
    : mainQuestions.value,
);
const needed = computed(() => admin.view?.config.questionsPerGame ?? 10);
const ready = computed(() => selectedQuestions.value.length === needed.value && (admin.view?.teams.length ?? 0) >= 2);

onMounted(async () => {
  await catalog.loadPacks();
  await catalog.loadQuestions();
  const current = await http.get<{ exists: boolean }>('/api/game/current');
  hasGame.value = current.exists;
});

/**
 * Zaznaczenie odtwarzamy ze stanu gry, a nie trzymamy wyłącznie lokalnie:
 * po wyzerowaniu rozgrywki prowadzący wraca do lobby z tym samym kompletem
 * pytań i powtórka jest jednym kliknięciem.
 */
watch(
  () => admin.view?.questionOrder,
  (order) => {
    if (order?.length && selectedQuestions.value.length === 0) selectedQuestions.value = [...order];
  },
  { immediate: true },
);

function togglePack(id: string): void {
  selectedPacks.value = selectedPacks.value.includes(id)
    ? selectedPacks.value.filter((p) => p !== id)
    : [...selectedPacks.value, id];
  selectedQuestions.value = selectedQuestions.value.filter((qid) =>
    available.value.some((q) => q.id === qid),
  );
}

function toggleQuestion(id: string): void {
  if (selectedQuestions.value.includes(id)) {
    selectedQuestions.value = selectedQuestions.value.filter((q) => q !== id);
  } else if (selectedQuestions.value.length < needed.value) {
    selectedQuestions.value = [...selectedQuestions.value, id];
  } else {
    ui.toast(`Wybrano już ${needed.value} pytań — odznacz coś najpierw`, 'info');
  }
}

/** Losowanie z zachowaniem kolejności pakietów, żeby wieczór nie zaczął się od 18+ */
function draw(): void {
  const pool = [...available.value];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  selectedQuestions.value = pool.slice(0, needed.value).map((q) => q.id);
}

async function newGame(): Promise<void> {
  const confirmed =
    !hasGame.value ||
    (await ui.confirm({
      title: 'Zacząć nową grę?',
      message: 'Punktacja zostanie wyzerowana, a drużyny zostaną w lobby ze swoimi telefonami. Pytania wybierzesz od nowa.',
      confirmLabel: 'Nowa gra',
      danger: true,
    }));
  if (!confirmed) return;

  busy.value = true;
  try {
    await admin.newGame(selectedPacks.value);
    hasGame.value = true;
    selectedQuestions.value = [];
  } finally {
    busy.value = false;
  }
}

async function start(): Promise<void> {
  const teams = admin.view?.teams.length ?? 0;
  if (teams === 2) {
    const ok = await ui.confirm({
      title: 'Gracie w dwie drużyny?',
      message: 'Przy dwóch drużynach przejęcie idzie od razu do przeciwnika, bez wyścigu.',
      confirmLabel: 'Startujemy',
    });
    if (!ok) return;
  }

  const finalIds = catalog.questions.filter((q) => q.kind === 'FINAL').map((q) => q.id);
  const setupOk = await admin.action('ADMIN_SETUP_GAME', {
    questionOrder: selectedQuestions.value,
    finalQuestionIds: finalIds,
  });
  if (setupOk) await admin.action('ADMIN_START_GAME');
}

async function kick(teamId: string, name: string): Promise<void> {
  const ok = await ui.confirm({
    title: `Wyrzucić drużynę ${name}?`,
    message: 'Jej telefon wróci do ekranu dołączania — ta sama para może dołączyć ponownie.',
    danger: true,
    confirmLabel: 'Wyrzuć',
  });
  if (ok) await admin.action('TEAM_KICK', { teamId });
}

const renaming = ref<{ teamId: string; name: string } | null>(null);

async function saveRename(): Promise<void> {
  if (!renaming.value) return;
  const ok = await admin.action('TEAM_RENAME', {
    teamId: renaming.value.teamId,
    name: renaming.value.name.trim(),
  });
  if (ok) renaming.value = null;
}
</script>

<template>
  <div class="flex flex-col gap-4 p-4">
    <section class="card">
      <h2 class="mb-2 font-display text-2xl tracking-wide">Drużyny</h2>
      <Presence :teams="admin.view?.teams ?? []" :presence="admin.view?.presence ?? []" />

      <ul class="mt-3 space-y-2">
        <li
          v-for="team in admin.view?.teams ?? []"
          :key="team.id"
          class="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2"
        >
          <span class="h-3 w-3 rounded-full" :style="{ background: team.color }" />
          <span class="flex-1 truncate font-semibold">{{ team.name }}</span>
          <button
            class="btn-ghost px-3 py-1.5 text-xs"
            @click="renaming = { teamId: team.id, name: team.name }"
          >
            Zmień
          </button>
          <button class="btn-ghost px-3 py-1.5 text-xs" @click="kick(team.id, team.name)">Wyrzuć</button>
        </li>
      </ul>

      <p v-if="!admin.view?.teams.length" class="mt-3 text-sm text-white/50">
        Nikt jeszcze nie dołączył. Gracze wchodzą na <code class="text-gold">/play</code> albo skanują kod z telewizora.
      </p>
    </section>

    <section class="card">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="font-display text-2xl tracking-wide">Pakiety</h2>
        <button class="btn-ghost px-3 py-1.5 text-sm" :disabled="busy" @click="newGame">
          {{ hasGame ? 'Nowa gra' : 'Utwórz grę' }}
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          v-for="pack in catalog.packs"
          :key="pack.id"
          class="rounded-xl border px-3 py-2 text-sm transition"
          :class="selectedPacks.includes(pack.id) ? 'border-gold bg-gold/15 text-gold' : 'border-white/15 bg-white/5'"
          @click="togglePack(pack.id)"
        >
          {{ pack.name }}
          <span class="text-white/40">{{ catalog.stats[pack.id]?.main ?? 0 }}</span>
        </button>
      </div>
      <p class="mt-2 text-xs text-white/40">Brak zaznaczenia = wszystkie pakiety w puli.</p>
    </section>

    <section class="card">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="font-display text-2xl tracking-wide">
          Pytania <span class="text-gold">{{ selectedQuestions.length }}/{{ needed }}</span>
        </h2>
        <button class="btn-ghost px-3 py-1.5 text-sm" @click="draw">Losuj {{ needed }}</button>
      </div>

      <ul class="max-h-80 space-y-1 overflow-y-auto pr-1">
        <li v-for="question in available" :key="question.id">
          <button
            class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition"
            :class="selectedQuestions.includes(question.id) ? 'bg-gold/15 text-gold' : 'bg-white/5 hover:bg-white/10'"
            @click="toggleQuestion(question.id)"
          >
            <span class="w-6 shrink-0 text-center text-xs text-white/40">
              {{ selectedQuestions.indexOf(question.id) >= 0 ? selectedQuestions.indexOf(question.id) + 1 : '' }}
            </span>
            <span class="flex-1 truncate">{{ question.text }}</span>
            <span class="shrink-0 text-xs text-white/40">{{ question.answers.length }} odp.</span>
          </button>
        </li>
      </ul>
    </section>

    <button class="btn-primary text-lg" :disabled="!ready" @click="start">
      Rozpocznij grę
    </button>
    <p v-if="!ready" class="text-center text-xs text-white/40">
      Potrzeba {{ needed }} pytań i co najmniej dwóch drużyn.
    </p>

    <!-- Nazwa trafia na 55-calowy ekran, więc prowadzący musi móc ją poprawić -->
    <Modal v-if="renaming" title="Zmiana nazwy drużyny" @close="renaming = null">
      <input v-model="renaming.name" class="input" maxlength="24" @keyup.enter="saveRename" />
      <template #footer>
        <button class="btn-ghost" @click="renaming = null">Anuluj</button>
        <button class="btn-primary" :disabled="renaming.name.trim().length < 2" @click="saveRename">Zapisz</button>
      </template>
    </Modal>
  </div>
</template>
