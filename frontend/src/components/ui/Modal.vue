<script setup lang="ts">
defineProps<{ title?: string; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4" @click.self="emit('close')">
    <div class="w-full rounded-2xl border border-white/10 bg-board-mid shadow-2xl" :class="wide ? 'max-w-3xl' : 'max-w-md'">
      <header v-if="title" class="border-b border-white/10 px-5 py-4">
        <h2 class="font-display text-2xl tracking-wide">{{ title }}</h2>
      </header>
      <div class="max-h-[70vh] overflow-y-auto p-5">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
        <slot name="footer" />
      </footer>
    </div>
  </div>
</template>
