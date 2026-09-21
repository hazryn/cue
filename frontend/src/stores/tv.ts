import type { Ack, SoundKey, StatePatch, TvView } from '@cue/shared';
import { defineStore } from 'pinia';
import type { Socket } from 'socket.io-client';
import { ref } from 'vue';
import { connectTv } from '~/api/socket';
import { FINAL_RESULT_DELAY_MS } from '~/components/tv/final/resultDelay';
import { useAudioStore } from './audio';

/** Dźwięki werdyktu finału grają razem z kartą wyniku, nie z ostatnim odsłonięciem. */
const DELAYED_SOUNDS: SoundKey[] = ['final_win', 'final_fanfare', 'final_lose'];

export const useTvStore = defineStore('tv', () => {
  const audio = useAudioStore();
  const view = ref<TvView | null>(null);
  const seq = ref(0);
  const connected = ref(false);
  /** Różnica zegarów serwer − telewizor; wystarcza do odliczania 3-2-1 przy przejęciu */
  const serverOffsetMs = ref(0);
  let socket: Socket | null = null;

  function connect(): void {
    if (socket) return;
    socket = connectTv();

    socket.on('connect', () => {
      connected.value = true;
      // Po odświeżeniu przeglądarki telewizor musi sam poprosić o pełny obraz
      socket?.emit('tv:hello', {}, (ack: Ack<{ view: TvView; serverTime: number }>) => {
        if (ack.ok && ack.data) {
          apply({ seq: ack.seq, view: ack.data.view, serverTime: ack.data.serverTime, sounds: [] });
        }
      });
    });

    socket.on('disconnect', () => (connected.value = false));
    socket.on('tv:state', (patch: StatePatch<TvView>) => apply(patch));
    socket.on('tv:sound', ({ keys }: { keys: SoundKey[] }) => audio.playAll(keys));
  }

  function apply(patch: StatePatch<TvView>): void {
    view.value = patch.view;
    seq.value = patch.seq;
    if (patch.serverTime) serverOffsetMs.value = patch.serverTime - Date.now();
    audio.playAll(patch.sounds.filter((key) => !DELAYED_SOUNDS.includes(key)));
    const delayed = patch.sounds.filter((key) => DELAYED_SOUNDS.includes(key));
    if (delayed.length) setTimeout(() => audio.playAll(delayed), FINAL_RESULT_DELAY_MS);
  }

  function disconnect(): void {
    socket?.disconnect();
    socket = null;
    connected.value = false;
  }

  return { view, seq, connected, serverOffsetMs, connect, disconnect };
});
