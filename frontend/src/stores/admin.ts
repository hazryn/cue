import type { Ack, AdminView, RaceResultView, StatePatch } from '@cue/shared';
import { defineStore } from 'pinia';
import type { Socket } from 'socket.io-client';
import { computed, ref } from 'vue';
import { http } from '~/api/http';
import { connectAdmin } from '~/api/socket';
import { useUiStore } from './ui';

const TOKEN_KEY = 'cue.admin.token';

/**
 * crypto.randomUUID istnieje tylko w bezpiecznym kontekście (HTTPS albo localhost).
 * Gra postawiona w domowej sieci po gołym HTTP nie miałaby go na telefonie
 * prowadzącego — a identyfikator służy wyłącznie do odsiewania podwójnych tapnięć,
 * więc wystarczy mu unikalność.
 */
function operationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export const useAdminStore = defineStore('admin', () => {
  const ui = useUiStore();
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const view = ref<AdminView | null>(null);
  const connected = ref(false);
  const authError = ref<string | null>(null);
  const lastRace = ref<RaceResultView | null>(null);
  const raceLog = ref<RaceResultView[]>([]);
  /** Różnica zegarów serwer − urządzenie prowadzącego, do podglądu odliczania */
  const serverOffsetMs = ref(0);
  let socket: Socket | null = null;

  const loggedIn = computed(() => Boolean(token.value));
  const question = computed(() => view.value?.question ?? null);
  const final = computed(() => view.value?.final ?? null);

  async function login(password: string): Promise<boolean> {
    try {
      const result = await http.post<{ token: string }>('/api/auth/admin', { password });
      token.value = result.token;
      localStorage.setItem(TOKEN_KEY, result.token);
      authError.value = null;
      connect();
      return true;
    } catch (error) {
      authError.value = error instanceof Error ? error.message : 'Błędne hasło';
      return false;
    }
  }

  function logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    token.value = null;
    socket?.disconnect();
    socket = null;
    view.value = null;
  }

  function connect(): void {
    if (socket || !token.value) return;
    socket = connectAdmin(token.value);

    socket.on('connect', () => (connected.value = true));
    socket.on('disconnect', () => (connected.value = false));
    socket.on('connect_error', (error: Error) => {
      // Wygasły token po 24 h — lepiej od razu poprosić o hasło niż migać błędem
      if (error.message === 'UNAUTHORIZED') {
        authError.value = 'Sesja wygasła — zaloguj się ponownie';
        logout();
      }
    });
    socket.on('admin:state', (patch: StatePatch<AdminView>) => {
      view.value = patch.view;
      if (patch.serverTime) serverOffsetMs.value = patch.serverTime - Date.now();
    });
    socket.on('admin:race', (result: RaceResultView) => {
      lastRace.value = result;
      raceLog.value = [result, ...raceLog.value].slice(0, 12);
    });
  }

  /**
   * Każda akcja niesie clientOpId (ochrona przed podwójnym tapnięciem) oraz
   * expectedSeq — jeśli drugie urządzenie admina zdążyło coś zmienić, serwer
   * odrzuci akcję zamiast wykonać ją na nieaktualnym obrazie.
   */
  async function action(type: string, payload: Record<string, unknown> = {}, guardSeq = false): Promise<boolean> {
    const ack = await emit('admin:action', {
      type,
      payload,
      clientOpId: operationId(),
      expectedSeq: guardSeq ? view.value?.seq : undefined,
    });
    if (!ack.ok) {
      ui.toast(ack.error, ack.code === 'ALREADY_REVEALED' ? 'info' : 'error');
      return false;
    }
    return true;
  }

  async function undo(): Promise<void> {
    const seq = view.value?.seq ?? 0;
    const ack = await emit('admin:undo', { expectedSeq: seq });
    if (!ack.ok) ui.toast(ack.error, 'error');
    else ui.toast('Cofnięto ostatnią akcję', 'success');
  }

  async function newGame(packIds: string[]): Promise<void> {
    await http.post('/api/game', { packIds });
    await emit('admin:resync', {});
    ui.toast('Nowa gra gotowa — drużyny czekają w lobby', 'success');
  }

  function emit<T = undefined>(event: string, payload: unknown): Promise<Ack<T>> {
    return new Promise((resolve) => {
      if (!socket) return resolve({ ok: false, code: 'INTERNAL', error: 'Brak połączenia z serwerem' });
      socket.emit(event, payload, (ack: Ack<T>) => {
        if (event === 'admin:resync' && ack.ok) {
          const data = ack.data as { view: AdminView } | undefined;
          if (data?.view) view.value = data.view;
        }
        resolve(ack);
      });
    });
  }

  return {
    token,
    view,
    question,
    final,
    connected,
    authError,
    loggedIn,
    lastRace,
    raceLog,
    serverOffsetMs,
    login,
    logout,
    connect,
    action,
    undo,
    newGame,
  };
});
