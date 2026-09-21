<script setup lang="ts">
import { ref } from 'vue';
import { usePlayerStore } from '~/stores/player';

const player = usePlayerStore();
const name = ref('');

async function submit(): Promise<void> {
  const trimmed = name.value.trim();
  if (trimmed.length < 2) return;
  await player.join(trimmed);
}
</script>

<template>
  <form class="flex w-full max-w-sm flex-col gap-4" @submit.prevent="submit">
    <div>
      <h1 class="font-display text-4xl tracking-wide">Nazwa drużyny</h1>
      <p class="mt-1 text-sm text-white/60">Jeden telefon na parę — ten sam, którym będziecie bić grzybka.</p>
    </div>

    <input
      v-model="name"
      class="input text-lg"
      placeholder="np. Ogórki Kiszone"
      maxlength="24"
      autocomplete="off"
      autofocus
    />

    <button class="btn-primary text-lg" :disabled="name.trim().length < 2 || player.joining">
      {{ player.joining ? 'Dołączam…' : 'Dołącz do gry' }}
    </button>

    <p class="text-center text-xs text-white/40">
      Nazwa pojawi się na telewizorze, więc pomyśl o teściowej.
    </p>
  </form>
</template>
