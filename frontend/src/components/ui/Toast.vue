<script setup lang="ts">
import { useUiStore } from '~/stores/ui';

const ui = useUiStore();
const tones: Record<string, string> = {
  info: 'border-white/20 bg-board-mid',
  success: 'border-emerald-400/40 bg-emerald-900/80',
  error: 'border-rose-400/40 bg-rose-900/80',
};
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
    <TransitionGroup name="toast">
      <div
        v-for="item in ui.toasts"
        :key="item.id"
        class="pointer-events-auto max-w-lg rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur"
        :class="tones[item.tone]"
        @click="ui.dismiss(item.id)"
      >
        {{ item.text }}
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
