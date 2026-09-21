<script setup lang="ts">
import type { PresenceEntry, TeamView } from '@cue/shared';

defineProps<{ teams: TeamView[]; presence: PresenceEntry[] }>();

/** Rozrzut estymaty zegara powyżej 15 ms oznacza niestabilne łącze telefonu. */
const unstable = (entry?: PresenceEntry): boolean => (entry?.clockStdDevMs ?? 0) > 15;
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <div
      v-for="team in teams"
      :key="team.id"
      class="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs"
    >
      <span
        class="h-2.5 w-2.5 rounded-full"
        :class="team.connected ? 'bg-emerald-400' : 'bg-rose-500'"
        :title="team.connected ? 'połączony' : 'offline'"
      />
      <span class="font-semibold">{{ team.name }}</span>
      <span class="text-white/40">
        {{ presence.find((p) => p.teamId === team.id)?.rttMs ?? '—' }} ms
      </span>
      <span v-if="unstable(presence.find((p) => p.teamId === team.id))" class="text-amber-400" title="Niestabilny zegar">
        ⚠
      </span>
    </div>
  </div>
</template>
