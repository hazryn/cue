import { NS } from '@cue/shared';
import { io, Socket } from 'socket.io-client';
import { checkForNewVersion } from './version';

const BASE = import.meta.env.VITE_API_URL || window.location.origin;

/**
 * Jedno połączenie na rolę. Reconnect jest domyślny i nieskończony — telefon
 * po przerwie w WiFi musi wrócić sam, bez proszenia gracza o odświeżenie.
 */
export function connect(namespace: string, auth: Record<string, unknown> = {}, reloadOnNewVersion = true): Socket {
  const socket = io(`${BASE}${namespace}`, {
    transports: ['websocket', 'polling'],
    auth,
    reconnection: true,
    reconnectionDelay: 400,
    reconnectionDelayMax: 3000,
    timeout: 8000,
  });
  // Ponowne połączenie zwykle oznacza restart serwera — np. po wdrożeniu nowej wersji
  socket.io.on('reconnect', () => {
    void checkForNewVersion().then((isNew) => {
      if (isNew && reloadOnNewVersion) window.location.reload();
    });
  });
  return socket;
}

// Telewizor nie przeładowuje się sam: po odświeżeniu czekałby na kliknięcie
// odblokowujące dźwięk, więc tylko pokazuje prośbę o odświeżenie (Tv.vue).
export const connectTv = () => connect(NS.TV, {}, false);
export const connectAdmin = (token: string) => connect(NS.ADMIN, { token });
export const connectPlayer = (deviceToken?: string) => connect(NS.PLAY, { deviceToken });
