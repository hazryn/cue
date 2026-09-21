<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import FinalBoard from '~/components/tv/final/Board.vue';
import Board from '~/components/tv/Board.vue';
import Leaderboard from '~/components/tv/Leaderboard.vue';
import Lobby from '~/components/tv/Lobby.vue';
import RaceOverlay from '~/components/tv/RaceOverlay.vue';
import Scores from '~/components/tv/Scores.vue';
import { useKeepAwakeVideo } from '~/composables/useKeepAwakeVideo';
import { useWakeLock } from '~/composables/useWakeLock';
import { useAudioStore } from '~/stores/audio';
import { useTvStore } from '~/stores/tv';

const tv = useTvStore();
const audio = useAudioStore();
useWakeLock();
// Telewizory często ignorują Wake Lock — zapętlone, niewidoczne wideo trzyma ekran włączony
const keepAwake = useKeepAwakeVideo();

const view = computed(() => tv.view);
const phase = computed(() => view.value?.phase);
const race = computed(() => view.value?.question?.race ?? null);
const showBoard = computed(() => phase.value === 'MAIN_ROUND' && view.value?.question);

/** Przeglądarka nie zagra dźwięku bez interakcji — stąd ekran startowy. */
function start(): void {
  keepAwake.start();
  audio.unlock();
  audio.play('theme_intro');
  void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

onMounted(() => tv.connect());
onUnmounted(() => tv.disconnect());
</script>

<template>
  <main class="tv-shell relative bg-[url('/brand/tv-bg.jpg')] bg-cover bg-center">
    <div
      v-if="!audio.unlocked"
      class="absolute inset-0 z-30 flex cursor-pointer flex-col items-center justify-center gap-[3vh] bg-board-deep"
      @click="start"
    >
      <img src="/brand/logo.png" alt="Drużynada" class="h-[22vh] object-contain drop-shadow-[0_0_5vh_rgba(251,191,36,0.35)]" />
      <p class="font-display text-[4vh] tracking-[0.3em] text-white/60">KLIKNIJ, ABY ROZPOCZĄĆ</p>
      <p class="text-[2.2vh] text-white/40">Włączy dźwięk i tryb pełnoekranowy</p>
    </div>

    <div v-if="!tv.connected" class="absolute right-[2vh] top-[2vh] z-30 rounded-full bg-rose-600/80 px-[2vh] py-[1vh] text-[2vh]">
      Brak połączenia z serwerem
    </div>

    <div v-if="view" class="flex h-full">
      <Scores v-if="showBoard || phase === 'ROUND_SUMMARY'" :teams="view.teams" :question="view.question" />

      <div class="relative flex-1">
        <Lobby v-if="phase === 'LOBBY'" :teams="view.teams" :join-url="view.joinUrl" />
        <Board v-else-if="showBoard" :question="view.question!" />
        <Leaderboard
          v-else-if="phase === 'ROUND_SUMMARY'"
          :ranking="view.ranking"
          title="PUNKTACJA"
          compact
        />
        <Leaderboard v-else-if="phase === 'LEADERBOARD'" :ranking="view.ranking" title="RUNDA GŁÓWNA ZAKOŃCZONA" />
        <FinalBoard v-else-if="phase === 'FINAL' && view.final" :final="view.final" />
        <Leaderboard v-else-if="phase === 'FINISHED'" :ranking="view.ranking" title="KONIEC GRY" />

        <RaceOverlay v-if="race" :race="race" :teams="view.teams" />
      </div>
    </div>

    <div v-else class="flex h-full items-center justify-center">
      <p class="font-display text-[5vh] tracking-[0.3em] text-white/40">ŁĄCZENIE…</p>
    </div>
  </main>
</template>
