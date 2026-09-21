<script setup lang="ts">
import { computed } from 'vue';
import { usePlayerStore } from '~/stores/player';

const player = usePlayerStore();
const view = computed(() => player.view);
</script>

<template>
  <div v-if="view" class="flex w-full max-w-sm flex-col gap-3">
    <div class="card flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="h-4 w-4 rounded-full" :style="{ background: view.teamColor }" />
        <div>
          <p class="font-display text-2xl leading-none tracking-wide">{{ view.teamName }}</p>
          <p class="text-xs text-white/50">
            {{ player.connected ? 'połączono' : 'łączenie…' }}
            <span v-if="player.clock.ready"> · zegar ±{{ player.clock.stdDevMs }} ms</span>
          </p>
        </div>
      </div>
      <div class="text-right">
        <p class="font-display text-3xl leading-none text-gold">{{ view.score }}</p>
        <p class="text-xs text-white/50">{{ view.place ? `${view.place}. miejsce` : 'punkty' }}</p>
      </div>
    </div>

    <div v-if="view.hasControl" class="card border-gold/50 bg-gold/10 text-center">
      <p class="font-display text-2xl tracking-wide text-gold">ODPOWIADACIE</p>
      <p class="text-sm text-white/70">Mówcie na głos — prowadzący zaznacza odpowiedzi</p>
      <div v-if="view.strikes > 0" class="mt-2 flex justify-center gap-2 text-3xl text-rose-500">
        <span v-for="i in view.strikes" :key="i">✖</span>
      </div>
    </div>
  </div>
</template>
