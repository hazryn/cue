<script setup lang="ts">
import { computed } from 'vue';
import { useAdminStore } from '~/stores/admin';
import { useUiStore } from '~/stores/ui';

const admin = useAdminStore();
const ui = useUiStore();

const phaseLabels: Record<string, string> = {
  LOBBY: 'Lobby',
  MAIN_ROUND: 'Runda główna',
  ROUND_SUMMARY: 'Punktacja',
  LEADERBOARD: 'Ranking',
  FINAL: 'Finał',
  FINISHED: 'Koniec',
  ABORTED: 'Przerwana',
};

const lastAction = computed(() => admin.view?.undoStack[0] ?? null);
const canReset = computed(() => Boolean(admin.view) && admin.view!.phase !== 'LOBBY');

async function undo(): Promise<void> {
  if (!lastAction.value) return;
  const confirmed = await ui.confirm({
    title: 'Cofnąć ostatnią akcję?',
    message: `„${lastAction.value.label}" zostanie wycofana, a stan przeliczony od nowa.`,
    confirmLabel: 'Cofnij',
  });
  if (confirmed) await admin.undo();
}

/** Powrót do lobby: punktacja znika, drużyny i wybrane pytania zostają. */
async function reset(): Promise<void> {
  const confirmed = await ui.confirm({
    title: 'Zacząć grę od nowa?',
    message: 'Punktacja i przebieg zostaną skasowane. Drużyny przy telefonach i wybrane pytania zostają.',
    confirmLabel: 'Od nowa',
    danger: true,
  });
  if (confirmed) await admin.action('ADMIN_RESET_GAME');
}
</script>

<template>
  <header class="sticky top-0 z-20 flex items-center gap-3 border-b border-white/10 bg-board-deep/95 px-4 py-3 backdrop-blur">
    <span class="h-2.5 w-2.5 shrink-0 rounded-full" :class="admin.connected ? 'bg-emerald-400' : 'bg-rose-500'" />
    <div class="min-w-0 flex-1">
      <p class="truncate font-display text-xl tracking-wide">
        {{ phaseLabels[admin.view?.phase ?? ''] ?? 'Ładowanie…' }}
      </p>
      <p class="truncate text-xs text-white/40">
        {{ lastAction ? `ostatnio: ${lastAction.label}` : 'brak akcji' }}
      </p>
    </div>

    <button class="btn-ghost px-3 py-2 text-sm" :disabled="!lastAction" @click="undo">↶ Cofnij</button>
    <button class="btn-ghost px-3 py-2 text-sm" :disabled="!canReset" @click="reset">⟲ Od nowa</button>
  </header>
</template>
