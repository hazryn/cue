<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { http } from '~/api/http';

const game = ref<{ exists: boolean; code?: string; phase?: string } | null>(null);

const phaseLabels: Record<string, string> = {
  LOBBY: 'drużyny się zbierają',
  MAIN_ROUND: 'trwa runda główna',
  ROUND_SUMMARY: 'przerwa między pytaniami',
  LEADERBOARD: 'ranking po rundzie głównej',
  FINAL: 'trwa finał',
  FINISHED: 'gra zakończona',
  ABORTED: 'gra przerwana',
};

onMounted(async () => {
  game.value = await http.get<{ exists: boolean; code?: string; phase?: string }>('/api/game/current').catch(() => null);
});
</script>

<template>
  <main class="flex min-h-full flex-col items-center justify-center px-6 py-16">
    <div class="w-full max-w-3xl text-center">
      <img
        src="/brand/logo.png"
        alt="Drużynada"
        class="mx-auto w-full max-w-xl drop-shadow-[0_0_3rem_rgba(251,191,36,0.25)]"
      />
      <p class="mt-2 font-display text-lg tracking-[0.5em] text-gold">FAMILIADA DOMOWA</p>
      <p class="mx-auto mt-5 max-w-xl text-white/70">
        Trzy pary, dziesięć pytań, grzybki na telefonach i wielki ekran w salonie.
        Wybierz, czym dzisiaj jesteś.
      </p>

      <p v-if="game?.exists" class="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-4 py-2 text-sm text-emerald-300">
        <span class="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        Gra {{ game.code }} — {{ phaseLabels[game.phase ?? ''] ?? game.phase }}
      </p>
      <p v-else-if="game" class="mt-6 text-sm text-white/50">
        Nie ma jeszcze aktywnej gry — prowadzący zakłada ją w panelu admina.
      </p>

      <div class="mt-12 grid gap-4 sm:grid-cols-3">
        <RouterLink to="/tv" class="group card flex flex-col items-center gap-3 py-8 transition hover:border-gold/60 hover:bg-white/10">
          <img src="/brand/role-tv.png" alt="" class="h-20 w-20 rounded-xl" />
          <span class="font-display text-3xl tracking-wide">TV</span>
          <span class="text-sm text-white/60">Ekran w salonie — plansza, punkty, muzyka</span>
        </RouterLink>

        <RouterLink to="/admin" class="group card flex flex-col items-center gap-3 py-8 transition hover:border-gold/60 hover:bg-white/10">
          <img src="/brand/role-admin.png" alt="" class="h-20 w-20 rounded-xl" />
          <span class="font-display text-3xl tracking-wide">Admin</span>
          <span class="text-sm text-white/60">Prowadzący — wymaga hasła</span>
        </RouterLink>

        <RouterLink to="/play" class="group card flex flex-col items-center gap-3 py-8 transition hover:border-gold/60 hover:bg-white/10">
          <img src="/brand/role-player.png" alt="" class="h-20 w-20 rounded-xl" />
          <span class="font-display text-3xl tracking-wide">Gracz</span>
          <span class="text-sm text-white/60">Grzybek drużyny — jeden telefon na parę</span>
        </RouterLink>
      </div>
    </div>
  </main>
</template>
