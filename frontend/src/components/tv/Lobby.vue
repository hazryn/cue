<script setup lang="ts">
import type { TeamView } from '@cue/shared';
import { onMounted, ref, watch } from 'vue';

const props = defineProps<{ teams: TeamView[]; joinUrl: string }>();
const qr = ref<string | null>(null);

async function render(): Promise<void> {
  if (!props.joinUrl) return;
  const QRCode = await import('qrcode');
  qr.value = await QRCode.toDataURL(props.joinUrl, { width: 420, margin: 1, color: { dark: '#050b2e', light: '#ffffff' } });
}

onMounted(render);
watch(() => props.joinUrl, render);
</script>

<template>
  <section class="flex h-full flex-col items-center justify-center gap-[4vh] p-[4vh]">
    <img src="/brand/logo.png" alt="Drużynada" class="h-[22vh] object-contain drop-shadow-[0_0_4vh_rgba(251,191,36,0.3)]" />

    <div class="flex items-center gap-[6vh]">
      <div class="rounded-[2vh] bg-white p-[2vh]">
        <img v-if="qr" :src="qr" alt="Kod QR do dołączenia" class="h-[30vh] w-[30vh]" />
        <div v-else class="flex h-[30vh] w-[30vh] items-center justify-center text-board-deep">…</div>
      </div>

      <div class="text-left">
        <p class="font-display text-[3vh] tracking-[0.3em] text-white/50">DOŁĄCZ TELEFONEM</p>
        <p class="font-display text-[5vh] tracking-wide text-gold">{{ joinUrl }}</p>
        <p class="mt-[2vh] max-w-[40vh] text-[2.4vh] text-white/60">
          Jeden telefon na parę. Wpiszcie nazwę drużyny — pojawi się poniżej.
        </p>
      </div>
    </div>

    <div class="flex min-h-[18vh] items-start gap-[3vh]">
      <div
        v-for="team in teams"
        :key="team.id"
        class="animate-flip rounded-[1.5vh] border-[0.4vh] px-[4vh] py-[2vh] text-center"
        :style="{ borderColor: team.color }"
      >
        <p class="font-display text-[4.5vh] uppercase tracking-wide">{{ team.name }}</p>
        <p class="text-[2vh] uppercase tracking-widest" :class="team.connected ? 'text-emerald-400' : 'text-rose-400'">
          {{ team.connected ? 'gotowi' : 'offline' }}
        </p>
      </div>

      <p v-if="teams.length === 0" class="font-display text-[3.5vh] tracking-widest text-white/30">
        CZEKAMY NA DRUŻYNY…
      </p>
    </div>
  </section>
</template>
