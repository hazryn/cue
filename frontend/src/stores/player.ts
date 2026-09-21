import type { Ack, BuzzerArm, PlayJoinRes, PlayerView, StatePatch } from '@cue/shared';
import { defineStore } from 'pinia';
import type { Socket } from 'socket.io-client';
import { ref } from 'vue';
import { connectPlayer } from '~/api/socket';
import { useClockSync } from '~/composables/useClockSync';
import { useUiStore } from './ui';

const TOKEN_KEY = 'cue.play.token';

export const usePlayerStore = defineStore('player', () => {
  const ui = useUiStore();
  const view = ref<PlayerView | null>(null);
  const buzzer = ref<BuzzerArm>({ raceId: null, armed: false, reason: 'WAITING', openedAt: null });
  const connected = ref(false);
  const joining = ref(false);
  const evicted = ref<string | null>(null);
  const deviceToken = ref<string | null>(localStorage.getItem(TOKEN_KEY));

  let socket: Socket | null = null;
  const clock = useClockSync(() => socket);

  function connect(): void {
    if (socket) return;
    socket = connectPlayer(deviceToken.value ?? undefined);

    socket.on('connect', () => {
      connected.value = true;
      evicted.value = null;
      clock.start();
    });
    socket.on('disconnect', () => {
      connected.value = false;
      clock.stop();
    });
    socket.on('play:state', (patch: StatePatch<PlayerView>) => (view.value = patch.view));
    socket.on('play:buzzer', (arm: BuzzerArm) => (buzzer.value = arm));
    socket.on('play:sync-request', () => void clock.sync());
    socket.on('play:race-result', (result: { won: boolean; winnerTeamName: string }) => {
      ui.toast(result.won ? 'Wygraliście grzybka!' : `Szybsi byli: ${result.winnerTeamName}`, result.won ? 'success' : 'info');
      if (navigator.vibrate) navigator.vibrate(result.won ? [40, 60, 120] : 30);
    });
    socket.on('play:evicted', ({ reason }: { reason: string }) => {
      evicted.value = reason;
      socket?.disconnect();
    });
  }

  async function join(teamName: string): Promise<boolean> {
    if (!socket) connect();
    joining.value = true;
    try {
      const ack = await emit<PlayJoinRes>('play:join', { teamName });
      if (!ack.ok) {
        ui.toast(ack.error, 'error');
        return false;
      }
      deviceToken.value = ack.data!.deviceToken;
      localStorage.setItem(TOKEN_KEY, ack.data!.deviceToken);
      view.value = ack.data!.view;
      // Kolejne połączenie ma się już przedstawiać tokenem, nie nazwą
      if (socket) socket.auth = { deviceToken: deviceToken.value };
      // Dopiero teraz serwer wie, czyj jest ten zegar
      void clock.sync();
      return true;
    } finally {
      joining.value = false;
    }
  }

  /**
   * Naciśnięcie grzybka.
   *
   * Znacznik czasu bierzemy z samego zdarzenia wejściowego (event.timeStamp),
   * a nie z chwili wykonania handlera — przeglądarka stempluje je w momencie
   * dotknięcia ekranu, więc zajęty wątek renderowania nie zabiera nam wyścigu.
   */
  async function buzz(event: PointerEvent): Promise<void> {
    if (!buzzer.value.armed || !buzzer.value.raceId) return;
    const clientTs = Math.round(performance.timeOrigin + event.timeStamp);
    buzzer.value = { ...buzzer.value, armed: false, reason: 'ALREADY_PRESSED' };
    if (navigator.vibrate) navigator.vibrate(25);

    const ack = await emit('play:buzz', {
      raceId: buzzer.value.raceId,
      clientTs,
      offsetMs: Math.round(clock.offsetMs.value),
      rttMs: clock.rttMs.value,
    });
    if (!ack.ok) ui.toast(ack.error, 'error');
  }

  async function rename(name: string): Promise<boolean> {
    const ack = await emit('play:rename', { name });
    if (!ack.ok) ui.toast(ack.error, 'error');
    return ack.ok;
  }

  function emit<T>(event: string, payload: unknown): Promise<Ack<T>> {
    return new Promise((resolve) => {
      if (!socket) return resolve({ ok: false, code: 'INTERNAL', error: 'Brak połączenia' });
      socket.emit(event, payload, (ack: Ack<T>) => resolve(ack));
    });
  }

  /**
   * Powrót do ekranu dołączania — po wyrzuceniu drużyny albo przejęciu jej przez
   * inny telefon. Łączymy się od razu na nowo, bez starego tokenu: wcześniej
   * komunikat zostawał na ekranie i nie dało się z niego wyjść.
   */
  function reset(): void {
    localStorage.removeItem(TOKEN_KEY);
    deviceToken.value = null;
    view.value = null;
    evicted.value = null;
    socket?.disconnect();
    socket = null;
    connect();
  }

  return { view, buzzer, connected, joining, evicted, deviceToken, clock, connect, join, buzz, rename, reset };
});
