<script setup lang="ts">
import { ref } from 'vue';
import { useAdminStore } from '~/stores/admin';

const admin = useAdminStore();
const password = ref('');
const busy = ref(false);

async function submit(): Promise<void> {
  busy.value = true;
  try {
    await admin.login(password.value);
  } finally {
    busy.value = false;
    password.value = '';
  }
}
</script>

<template>
  <form class="mx-auto flex w-full max-w-sm flex-col gap-4 p-6" @submit.prevent="submit">
    <h1 class="font-display text-4xl tracking-wide">Panel prowadzącego</h1>
    <input v-model="password" type="password" class="input" placeholder="Hasło" autocomplete="current-password" />
    <p v-if="admin.authError" class="text-sm text-rose-400">{{ admin.authError }}</p>
    <button class="btn-primary" :disabled="busy || !password">Wejdź</button>
  </form>
</template>
