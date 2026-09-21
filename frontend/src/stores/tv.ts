import type { Ack, SoundKey, StatePatch, TvView } from '@cue/shared';
import { defineStore } from 'pinia';
import type { Socket } from 'socket.io-client';
import { ref } from 'vue';
import { connectTv } from '~/api/socket';
import { useAudioStore } from './audio';

export const useTvStore = defineStore('tv', () => {
  const audio = useAudioStore();
  const view = ref<TvView | null>(null);
  const seq = ref(0);
  const connected = ref(false);
  let socket: Socket | null = null;

  function connect(): void {
    if (socket) return;
    socket = connectTv();

    socket.on('connect', () => {
      connected.value = true;
      // Po odświeżeniu przeglądarki telewizor musi sam poprosić o pełny obraz
      socket?.emit('tv:hello', {}, (ack: Ack<{ view: TvView }>) => {
        if (ack.ok && ack.data) apply({ seq: ack.seq, view: ack.data.view, sounds: [] });
      });
    });

    socket.on('disconnect', () => (connected.value = false));
    socket.on('tv:state', (patch: StatePatch<TvView>) => apply(patch));
    socket.on('tv:sound', ({ keys }: { keys: SoundKey[] }) => audio.playAll(keys));
  }

  function apply(patch: StatePatch<TvView>): void {
    view.value = patch.view;
    seq.value = patch.seq;
    audio.playAll(patch.sounds);
  }

  function disconnect(): void {
    socket?.disconnect();
    socket = null;
    connected.value = false;
  }

  return { view, seq, connected, connect, disconnect };
});
