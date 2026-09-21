<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Bar from '~/components/admin/Bar.vue';
import Catalog from '~/components/admin/catalog/Panel.vue';
import Control from '~/components/admin/Control.vue';
import FinalReveal from '~/components/admin/final/Reveal.vue';
import FinalSetup from '~/components/admin/final/Setup.vue';
import FinalTurn from '~/components/admin/final/Turn.vue';
import Lobby from '~/components/admin/Lobby.vue';
import Login from '~/components/admin/Login.vue';
import { useAdminStore } from '~/stores/admin';

type Tab = 'game' | 'catalog';

const admin = useAdminStore();
const tab = ref<Tab>('game');

const phase = computed(() => admin.view?.phase);
const finalFsm = computed(() => admin.final?.fsm);
const revealing = computed(() => finalFsm.value === 'F_REVEAL' || finalFsm.value === 'F_RESULT');

onMounted(() => admin.connect());
</script>

<template>
  <main class="min-h-full">
    <Login v-if="!admin.loggedIn" />

    <template v-else>
      <Bar />

      <nav class="flex gap-1 border-b border-white/10 px-4 py-2 text-sm">
        <button
          v-for="item in [
            { id: 'game', label: 'Gra' },
            { id: 'catalog', label: 'Pytania' },
          ]"
          :key="item.id"
          class="rounded-lg px-3 py-1.5"
          :class="tab === item.id ? 'bg-gold text-board-deep' : 'text-white/60 hover:bg-white/10'"
          @click="tab = item.id as Tab"
        >
          {{ item.label }}
        </button>
        <span class="flex-1" />
        <button class="rounded-lg px-3 py-1.5 text-white/40 hover:bg-white/10" @click="admin.logout()">Wyloguj</button>
      </nav>

      <Catalog v-if="tab === 'catalog'" />

      <template v-else>
        <Lobby v-if="phase === 'LOBBY'" />
        <Control v-else-if="phase === 'MAIN_ROUND'" />

        <div v-else-if="phase === 'ROUND_SUMMARY'" class="flex flex-col gap-3 p-4">
          <h2 class="font-display text-2xl tracking-wide">Punktacja na ekranie</h2>
          <ul class="flex flex-col gap-2">
            <li
              v-for="entry in admin.view?.ranking ?? []"
              :key="entry.teamId"
              class="card flex items-center gap-3 py-3"
            >
              <span class="w-6 font-display text-xl text-white/40">{{ entry.place }}</span>
              <span class="flex-1 font-semibold">{{ entry.name }}</span>
              <span class="font-display text-2xl text-gold">{{ entry.score }}</span>
            </li>
          </ul>
          <button class="btn-primary text-lg" @click="admin.action('ADMIN_NEXT_QUESTION')">Następne pytanie</button>
        </div>

        <div v-else-if="phase === 'LEADERBOARD'" class="flex flex-col gap-3 p-4">
          <h2 class="font-display text-2xl tracking-wide">Runda główna zakończona</h2>
          <ul class="flex flex-col gap-2">
            <li
              v-for="entry in admin.view?.ranking ?? []"
              :key="entry.teamId"
              class="card flex items-center gap-3 py-3"
              :class="entry.isWinner ? 'border-gold/60' : ''"
            >
              <span class="w-6 font-display text-xl" :class="entry.isWinner ? 'text-gold' : 'text-white/40'">
                {{ entry.place }}
              </span>
              <span class="flex-1 font-semibold">{{ entry.name }}</span>
              <span class="font-display text-2xl text-gold">{{ entry.score }}</span>
            </li>
          </ul>

          <p v-if="(admin.view?.ranking ?? []).filter((r) => r.isWinner).length > 1" class="text-sm text-amber-300">
            Remis na szczycie — wybierz w finale, która drużyna gra.
          </p>

          <FinalSetup />
          <button class="btn-ghost" @click="admin.action('ADMIN_FINISH')">Kończymy bez finału</button>
        </div>

        <template v-else-if="phase === 'FINAL'">
          <FinalReveal v-if="revealing" />
          <FinalTurn v-else />
        </template>

        <div v-else-if="phase === 'FINISHED'" class="flex flex-col gap-3 p-4 text-center">
          <h2 class="font-display text-3xl tracking-wide text-gold">Gra zakończona</h2>
          <p class="text-white/60">Nową rozgrywkę założysz w zakładce „Gra" po odświeżeniu lobby.</p>
          <Lobby />
        </div>

        <div v-else class="p-6 text-center text-white/50">Ładowanie stanu gry…</div>
      </template>
    </template>
  </main>
</template>
