<script setup lang="ts">
defineProps<{ count: number }>();
</script>

<template>
  <div class="pointer-events-none flex items-center justify-center gap-[3vh]">
    <span
      v-for="i in count"
      :key="i"
      data-testid="tv-strike"
      class="animate-strike-in font-display text-[18vh] leading-none text-rose-600 drop-shadow-[0_0_3vh_rgba(244,63,94,0.7)]"
    >
      ✖
    </span>
  </div>
</template>
