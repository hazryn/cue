#!/usr/bin/env node
/**
 * Rozgrywa krótką partię na żywej aplikacji i robi zrzuty ekranów do README.
 *
 *   node tools/screenshots.mjs                          # lokalny stack (7200/7201)
 *   BASE=https://twoja-domena ADMIN_PASSWORD=... node tools/screenshots.mjs
 *
 * Zakłada nową grę, więc nie odpalaj go w trakcie prawdziwej rozgrywki.
 * Zrzuty lądują w docs/screenshots/.
 */
import pw from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const { chromium } = pw;
const WEB = process.env.BASE ?? 'http://localhost:7201';
const API = process.env.API ?? (process.env.BASE ?? 'http://localhost:7200');
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'familiada';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const TV = { width: 1920, height: 1080 };
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(path, init = {}) {
  const response = await fetch(`${API}${path}`, init);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  const raw = await response.text();
  return raw ? JSON.parse(raw) : undefined;
}

const shot = async (page, name) => {
  await wait(700); // animacje odsłaniania i flipy muszą dojść do końca
  // JPEG zamiast PNG: tło studia to zdjęcie, a README nie powinno ważyć megabajtów
  await page.screenshot({ path: join(OUT, `${name}.jpg`), type: 'jpeg', quality: 82 });
  console.log(`  ✓ ${name}.jpg`);
};

const { token } = await json('/api/auth/admin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: PASSWORD }),
});
const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
await json('/api/game', { method: 'POST', headers: auth, body: JSON.stringify({ packIds: [], keepTeams: false }) });

const browser = await chromium.launch();
const open = async (viewport, path, init) => {
  const context = await browser.newContext(
    viewport === TV ? { viewport: TV } : { viewport: { width: PHONE.width, height: PHONE.height }, ...PHONE },
  );
  if (init) await context.addInitScript(init.fn, init.arg);
  const page = await context.newPage();
  await page.goto(`${WEB}${path}`);
  return page;
};

console.log(`Zrzuty z ${WEB} → ${OUT}`);

// --- strona główna i lobby -------------------------------------------------
const home = await open(TV, '/');
await shot(home, 'home');

const tv = await open(TV, '/tv');
await tv.getByText('KLIKNIJ, ABY ROZPOCZĄĆ').click();

const names = ['Ogórki Kiszone', 'Kotlety Schabowe', 'Pierogi Ruskie'];
const phones = [];
for (const name of names) {
  const phone = await open(PHONE, '/play');
  if (phones.length === 0) await shot(phone, 'play-join');
  await phone.getByPlaceholder('np. Ogórki Kiszone').fill(name);
  await phone.getByRole('button', { name: 'Dołącz do gry' }).click();
  await phone.getByTestId('buzzer').waitFor();
  phones.push(phone);
}
await shot(tv, 'tv-lobby');

// --- runda główna -------------------------------------------------------------
const admin = await open(PHONE, '/admin', {
  fn: (value) => window.localStorage.setItem('cue.admin.token', value),
  arg: token,
});
await admin.getByRole('button', { name: /Losuj/ }).click();
await shot(admin, 'admin-lobby');
await admin.getByRole('button', { name: 'Rozpocznij grę' }).click();

await admin.getByRole('button', { name: /pytanie i grzybki/ }).click();
await phones[1].locator('[data-testid="buzzer"][data-armed="true"]').waitFor();
await shot(phones[1], 'play-buzzer');
await phones[1].getByTestId('buzzer').click();
await admin.getByText('Gra:').waitFor();

const answers = admin.getByTestId('admin-answer');
await answers.nth(0).click();
await answers.nth(2).click();
await admin.getByRole('button', { name: '✖ Błędna odpowiedź' }).click();
await shot(tv, 'tv-board');
await shot(admin, 'admin-control');

// --- skrót do finału przez WebSocket (ten sam, który prowadzący ma w panelu) ---
const socket = io(`${API}/admin`, { transports: ['websocket'], auth: { token } });
await new Promise((r) => socket.on('connect', r));
const act = (type, payload = {}) =>
  new Promise((r) => socket.emit('admin:action', { type, payload, clientOpId: crypto.randomUUID() }, r));
let view = null;
socket.on('admin:state', (patch) => (view = patch.view));
await wait(300);
const teamIds = view.teams.map((t) => t.id);
await act('ADMIN_ADJUST_SCORE', { teamId: teamIds[1], delta: 312, reason: 'zrzuty' });
await act('ADMIN_ADJUST_SCORE', { teamId: teamIds[0], delta: 244, reason: 'zrzuty' });
await act('ADMIN_ADJUST_SCORE', { teamId: teamIds[2], delta: 187, reason: 'zrzuty' });
await act('ADMIN_SKIP_TO_LEADERBOARD');
await tv.getByText('ZWYCIĘZCA').waitFor();
await shot(tv, 'tv-ranking');

// --- finał ---------------------------------------------------------------------
await admin.getByPlaceholder('Imię').first().fill('Ania');
await admin.getByPlaceholder('Imię').nth(1).fill('Bartek');
await admin.getByRole('button', { name: 'Rozpocznij finał' }).click();
await admin.getByRole('button', { name: 'Zaczynamy — gracz 1' }).click();
await tv.getByText('OPUŚĆ POKÓJ').waitFor();
await shot(tv, 'tv-final-gate');
await admin.getByRole('button', { name: 'Start tury' }).click();

const progress = admin.getByTestId('final-progress');
const answerAndWait = async (locator) => {
  const before = await progress.innerText();
  await locator.first().click();
  await admin.waitForFunction(
    (b) => document.querySelector('[data-testid="final-progress"]')?.textContent !== b,
    before,
  ).catch(() => undefined);
};

await answerAndWait(admin.getByTestId('final-answer'));
await shot(tv, 'tv-final-turn');
await shot(admin, 'admin-final-turn');
for (let i = 1; i < 5; i++) await answerAndWait(admin.getByTestId('final-answer'));

await admin.getByRole('button', { name: 'Zawołaj gracza 2' }).click();
await admin.getByRole('button', { name: 'Start tury' }).click();
for (let i = 0; i < 5; i++) {
  await answerAndWait(admin.getByTestId('final-answer').filter({ hasNot: admin.getByTestId('taken-by-p1') }));
}

await admin.getByRole('button', { name: 'Przejdź do odsłaniania' }).click();
for (let i = 0; i < 7; i++) await admin.getByRole('button', { name: /Odsłoń kolejną/ }).click();
await shot(tv, 'tv-final-reveal');
await shot(admin, 'admin-final-reveal');
for (let i = 7; i < 10; i++) await admin.getByRole('button', { name: /Odsłoń kolejną/ }).click();
await tv.getByTestId('tv-final-verdict').waitFor();
await shot(tv, 'tv-final-result');

socket.close();
await browser.close();
console.log('Gotowe.');
