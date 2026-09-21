<script setup lang="ts">
import { computed, onMounted } from 'vue';
import Buzzer from '~/components/play/Buzzer.vue';
import Join from '~/components/play/Join.vue';
import Status from '~/components/play/Status.vue';
import { useWakeLock } from '~/composables/useWakeLock';
import { usePlayerStore } from '~/stores/player';

const player = usePlayerStore();
// Ciemny ekran nie pokaże otwarcia wyścigu — bez blokady wygaszania nie ma gry
useWakeLock();

const joined = computed(() => Boolean(player.view));

onMounted(() => player.connect());
</script>

<template>
  <main class="flex min-h-full flex-col items-center justify-center gap-6 px-5 py-8">
    <div v-if="player.evicted" data-testid="play-evicted" class="card max-w-sm text-center">
      <p class="font-display text-3xl tracking-wide text-rose-400">Poza grą</p>
      <p class="mt-2 text-sm text-white/70">{{ player.evicted }}</p>
      <button class="btn-ghost mt-4" @click="player.reset()">Dołącz jeszcze raz</button>
    </div>

    <template v-else-if="joined">
      <Status />
      <Buzzer />
      <p class="text-center text-xs text-white/40">
        Po wygranym grzybku odpowiadacie na głos — telefon nie jest już potrzebny.
      </p>
    </template>

    <Join v-else />
  </main>
</template>
