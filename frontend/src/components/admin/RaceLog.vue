<script setup lang="ts">
import { useAdminStore } from '~/stores/admin';

const admin = useAdminStore();
</script>

<template>
  <div v-if="admin.raceLog.length" class="card">
    <h3 class="mb-2 font-display text-lg tracking-wide">Ostatnie grzybki</h3>
    <p class="mb-3 text-xs text-white/40">
      Milisekundy na wspólnej osi czasu — argument, gdy ktoś twierdzi, że był pierwszy.
    </p>

    <div v-for="race in admin.raceLog.slice(0, 3)" :key="race.raceId" class="mb-3 last:mb-0">
      <p class="text-xs uppercase tracking-widest text-white/40">
        {{ race.kind === 'STEAL' ? 'przejęcie' : race.kind === 'TIEBREAK' ? 'dogrywka' : 'start pytania' }}
      </p>
      <ul class="mt-1 space-y-1">
        <li
          v-for="press in race.presses"
          :key="press.teamId + press.adjustedMs"
          class="flex items-center justify-between rounded-lg px-2 py-1 text-sm"
          :class="press.teamId === race.winnerTeamId ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5'"
        >
          <span class="truncate">{{ press.teamName || press.teamId.slice(0, 6) }}</span>
          <span class="tabular-nums text-white/60">
            +{{ press.deltaMs }} ms
            <span class="text-white/30">/ rtt {{ press.rttMs }}</span>
            <span v-if="press.rejectedReason" class="text-rose-400"> · {{ press.rejectedReason }}</span>
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>
