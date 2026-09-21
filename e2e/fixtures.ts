import { APIRequestContext, Browser, BrowserContext, Page, expect, request } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const API = process.env.E2E_API_URL ?? 'http://localhost:7200';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'familiada';

/**
 * Token admina cache'owany na dysku.
 *
 * Endpoint logowania ma limit 5 prób / 5 min (bo hasło jest krótkie i wspólne),
 * więc pamięć procesu nie wystarcza — kolejne uruchomienie zestawu wyczerpywałoby
 * limit i testy padałyby na 429 zamiast na realnym błędzie.
 */
const TOKEN_CACHE = join(__dirname, '.auth-token');

export async function adminToken(api: APIRequestContext): Promise<string> {
  if (existsSync(TOKEN_CACHE)) {
    const cached = readFileSync(TOKEN_CACHE, 'utf8').trim();
    const probe = await api.get(`${API}/api/admin/catalog/packs`, {
      headers: { Authorization: `Bearer ${cached}` },
    });
    if (probe.ok()) return cached;
  }

  const response = await api.post(`${API}/api/auth/admin`, { data: { password: ADMIN_PASSWORD } });
  expect(response.ok(), 'logowanie admina (wyczerpany limit prób?)').toBeTruthy();
  const token = (await response.json()).token as string;
  writeFileSync(TOKEN_CACHE, token);
  return token;
}

export interface CatalogQuestion {
  id: string;
  kind: 'MAIN' | 'FINAL';
  text: string;
  answers: Array<{ id: string; text: string; weight: number; position: number }>;
}

/** Świeża gra przez API — szybciej i pewniej niż przeklikiwanie lobby w każdym teście. */
export async function freshGame(): Promise<{ token: string; main: CatalogQuestion[]; final: CatalogQuestion[] }> {
  const api = await request.newContext();
  const token = await adminToken(api);
  const headers = { Authorization: `Bearer ${token}` };

  // Czysta karta: bez drużyn z poprzedniego testu (panel domyślnie je przenosi)
  const created = await api.post(`${API}/api/game`, { headers, data: { packIds: [], keepTeams: false } });
  expect(created.ok(), 'utworzenie nowej gry').toBeTruthy();

  const list = await api.get(`${API}/api/admin/catalog/questions`, { headers });
  const questions: CatalogQuestion[] = await list.json();
  await api.dispose();

  return {
    token,
    main: questions.filter((q) => q.kind === 'MAIN'),
    final: questions.filter((q) => q.kind === 'FINAL'),
  };
}

/** Telefon drużyny: własny kontekst przeglądarki, bo deviceToken siedzi w localStorage. */
export async function joinAsTeam(browser: Browser, name: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('/play');
  await page.getByPlaceholder('np. Ogórki Kiszone').fill(name);
  await page.getByRole('button', { name: 'Dołącz do gry' }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  return { context, page };
}

/**
 * Panel prowadzącego na telefonie.
 *
 * Token wstrzykujemy do localStorage zamiast przechodzić przez formularz:
 * logowanie ma limit 5 prób / 5 min, więc zestaw kilkunastu testów utknąłby
 * na 429. Samo logowanie sprawdza osobny test w smoke.spec.ts.
 */
export async function openAdmin(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const api = await request.newContext();
  const token = await adminToken(api);
  await api.dispose();

  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  await context.addInitScript((value) => window.localStorage.setItem('cue.admin.token', value), token);
  const page = await context.newPage();
  await page.goto('/admin');
  await expect(page.getByRole('button', { name: 'Gra', exact: true })).toBeVisible();
  return { context, page };
}

/** Telewizor: duży ekran plus kliknięcie, które odblokowuje dźwięk i chowa ekran startowy. */
export async function openTv(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  await page.goto('/tv');
  await page.getByText('KLIKNIJ, ABY ROZPOCZĄĆ').click();
  return { context, page };
}

// ---------------------------------------------------------------- skróty

/**
 * Przewija rundę główną przez WebSocket zamiast przeklikiwać dziesięć pytań w UI.
 * Korzysta z tego samego skrótu, który prowadzący ma w narzędziach ratunkowych,
 * plus ręcznej korekty punktów, żeby finał miał jednoznacznego zwycięzcę.
 */
export async function fastForwardToLeaderboard(winnerTeamId: string): Promise<void> {
  const { io } = await import('socket.io-client');
  const api = await request.newContext();
  const token = await adminToken(api);
  await api.dispose();

  const socket = io(`${API}/admin`, { transports: ['websocket'], auth: { token } });
  let view: { phase: string } | null = null;
  socket.on('admin:state', (patch: { view: typeof view }) => (view = patch.view));
  await new Promise<void>((resolve) => socket.on('connect', () => resolve()));

  const act = (type: string, payload: Record<string, unknown> = {}) =>
    new Promise<{ ok: boolean; error?: string }>((resolve) =>
      socket.emit('admin:action', { type, payload, clientOpId: crypto.randomUUID() }, resolve),
    );

  await act('ADMIN_ADJUST_SCORE', { teamId: winnerTeamId, delta: 250, reason: 'przewijanie do finału' });
  const skipped = await act('ADMIN_SKIP_TO_LEADERBOARD');
  expect(skipped.ok, `przewinięcie do rankingu: ${skipped.error ?? ''}`).toBeTruthy();
  await new Promise((r) => setTimeout(r, 120));
  expect(view?.phase, 'runda główna zamknięta').toBe('LEADERBOARD');
  socket.close();
}

/** Identyfikatory drużyn z bieżącej gry — potrzebne do skrótów przez API. */
export async function teamIds(): Promise<Array<{ id: string; name: string }>> {
  const api = await request.newContext();
  const token = await adminToken(api);
  const { io } = await import('socket.io-client');
  await api.dispose();

  const socket = io(`${API}/admin`, { transports: ['websocket'], auth: { token } });
  const view = await new Promise<{ teams: Array<{ id: string; name: string }> }>((resolve) => {
    socket.on('admin:state', (patch: { view: { teams: Array<{ id: string; name: string }> } }) => resolve(patch.view));
  });
  socket.close();
  return view.teams;
}
