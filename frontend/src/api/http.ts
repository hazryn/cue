/** Cienka warstwa nad fetch: wspólny prefiks, token admina i czytelne błędy. */
const BASE = import.meta.env.VITE_API_URL || '';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('cue.admin.token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: response.statusText }));
    throw new HttpError(response.status, payload.message ?? 'Błąd zapytania');
  }

  // DELETE w NestJS odpowiada pustym 200, więc ślepe response.json() rzucałoby
  // błędem parsowania na udanej operacji — i UI pokazywałby porażkę mimo sukcesu.
  const raw = await response.text();
  return (raw ? JSON.parse(raw) : undefined) as T;
}

export const http = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};
