import { NS } from '@cue/shared';
import { io, Socket } from 'socket.io-client';

const BASE = import.meta.env.VITE_API_URL || window.location.origin;

/**
 * Jedno połączenie na rolę. Reconnect jest domyślny i nieskończony — telefon
 * po przerwie w WiFi musi wrócić sam, bez proszenia gracza o odświeżenie.
 */
export function connect(namespace: string, auth: Record<string, unknown> = {}): Socket {
  return io(`${BASE}${namespace}`, {
    transports: ['websocket', 'polling'],
    auth,
    reconnection: true,
    reconnectionDelay: 400,
    reconnectionDelayMax: 3000,
    timeout: 8000,
  });
}

export const connectTv = () => connect(NS.TV);
export const connectAdmin = (token: string) => connect(NS.ADMIN, { token });
export const connectPlayer = (deviceToken?: string) => connect(NS.PLAY, { deviceToken });
