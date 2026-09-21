<script setup lang="ts">
import { computed } from 'vue';
import { useAdminStore } from '~/stores/admin';

const admin = useAdminStore();
const final = computed(() => admin.final);
const done = computed(() => final.value?.fsm === 'F_RESULT');
</script>

<template>
  <div v-if="final" class="flex flex-col gap-3 p-4 pb-24">
    <section class="card text-center">
      <p class="text-xs uppercase tracking-widest text-white/40">suma</p>
      <p class="font-display text-6xl leading-none text-gold">{{ final.total }}</p>
      <p class="text-sm text-white/50">próg: {{ final.threshold }}</p>
    </section>

    <!-- Prowadzący czyta pytanie na głos, zanim odsłoni odpowiedź — TV pokaże to samo -->
    <section v-if="final.nextRevealQuestionText" class="card border-gold/40">
      <p class="text-xs uppercase tracking-widest text-white/40">następne do odsłonięcia</p>
      <p data-testid="reveal-next-question" class="font-display text-xl leading-tight">
        {{ final.nextRevealQuestionText }}
      </p>
    </section>

    <ul class="space-y-1">
      <li
        v-for="(slot, index) in final.slots"
        :key="`${slot.player}-${slot.qIdx}`"
        class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm"
        :class="[
          slot.revealed ? 'bg-emerald-900/25' : 'bg-white/5',
          index === final.revealCursor ? 'ring-2 ring-gold' : '',
        ]"
      >
        <span class="w-14 shrink-0 text-xs text-white/40">
          {{ slot.player === 1 ? final.p1Name : final.p2Name }}
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-xs text-white/40">{{ slot.qIdx + 1 }}. {{ slot.questionText }}</span>
          <span class="block truncate">{{ slot.text ?? (slot.result === 'MISS' ? '— błąd —' : '— brak —') }}</span>
        </span>
        <span class="font-display text-lg" :class="slot.revealed ? 'text-gold' : 'text-white/20'">
          {{ slot.revealed ? slot.points : '?' }}
        </span>
      </li>
    </ul>

    <button v-if="!done" class="btn-primary text-lg" @click="admin.action('ADMIN_FINAL_REVEAL_NEXT')">
      Odsłoń kolejną ({{ final.revealCursor + 1 }}/{{ final.slots.length }})
    </button>

    <section v-else class="card text-center">
      <p class="font-display text-3xl tracking-wide" :class="final.won ? 'text-gold' : 'text-rose-400'">
        {{ final.won ? 'Nagroda główna!' : 'Zabrakło punktów' }}
      </p>
      <button class="btn-ghost mt-3 w-full" @click="admin.action('ADMIN_FINISH')">Zakończ grę</button>
    </section>
  </div>
</template>
