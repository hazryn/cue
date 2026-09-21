import { BrowserContext, Page, expect, test } from '@playwright/test';
import { fastForwardToLeaderboard, freshGame, joinAsTeam, openAdmin, openTv, teamIds } from '../fixtures';

test.describe.configure({ timeout: 180_000 });

interface Table {
  admin: Page;
  tv: Page;
  teams: Array<{ name: string; page: Page }>;
  contexts: BrowserContext[];
}

async function setUpTable(browser: Parameters<typeof openTv>[0]): Promise<Table> {
  await freshGame();
  const tv = await openTv(browser);
  const admin = await openAdmin(browser);
  const teams = [];
  const contexts: BrowserContext[] = [tv.context, admin.context];

  for (const name of ['Ogórki', 'Kotlety']) {
    const team = await joinAsTeam(browser, name);
    teams.push({ name, page: team.page });
    contexts.push(team.context);
  }

  await admin.page.getByRole('button', { name: /Losuj/ }).click();
  await admin.page.getByRole('button', { name: 'Rozpocznij grę' }).click();
  await admin.page.getByTestId('confirm-yes').click();
  return { admin: admin.page, tv: tv.page, teams, contexts };
}


/**
 * Klika odpowiedź i czeka, aż licznik pytań faktycznie się przesunie.
 * Bez tego przy wolniejszym łączu test klika w listę poprzedniego pytania,
 * a serwer — słusznie — odrzuca taką akcję.
 */
async function answerFinal(admin: Page, pick: (page: Page) => ReturnType<Page['getByTestId']>): Promise<void> {
  const before = await admin.getByTestId('final-progress').innerText();
  await pick(admin).first().click();
  await expect(admin.getByTestId('final-progress')).not.toHaveText(before);
}

/**
 * Karta wyniku finału musi zmieścić się w całości na ekranie telewizora —
 * werdykt dokładany wcześniej pod planszą wypychał widok w dół.
 * Mierzymy po animacji wejścia, bo startuje z pomniejszenia.
 */
async function expectResultFitsScreen(tv: Page): Promise<void> {
  const card = tv.getByTestId('tv-final-result');
  await expect(card).toBeVisible();
  await card.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const box = (await card.boundingBox())!;
  const viewport = tv.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  const overflow = await tv.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  expect(overflow).toBeLessThanOrEqual(0);
}

test('finał: duplikaty, szczelność telewizora i odsłanianie z pytaniami', async ({ browser }) => {
  const table = await setUpTable(browser);

  // Rundę główną przewijamy przez API — tematem tego testu jest finał
  const teams = await teamIds();
  await fastForwardToLeaderboard(teams[0].id);

  await expect(table.admin.getByRole('heading', { name: 'Runda główna zakończona' })).toBeVisible();
  await expect(table.tv.getByText('ZWYCIĘZCA')).toBeVisible();

  // --- przygotowanie finału ------------------------------------------------
  await table.admin.getByPlaceholder('Imię').first().fill('Ania');
  await table.admin.getByPlaceholder('Imię').nth(1).fill('Bartek');
  await table.admin.getByRole('button', { name: 'Rozpocznij finał' }).click();

  await table.admin.getByRole('button', { name: 'Zaczynamy — gracz 1' }).click();
  await expect(table.tv.getByText('OPUŚĆ POKÓJ')).toBeVisible();
  await expect(table.tv.getByText('Bartek').first()).toBeVisible();

  await table.admin.getByRole('button', { name: 'Start tury' }).click();

  // --- tura gracza 1 --------------------------------------------------------
  const player1Answers: string[] = [];
  for (let i = 0; i < 5; i++) {
    player1Answers.push(await table.admin.getByTestId('final-answer-text').first().innerText());
    if (i < 4) await answerFinal(table.admin, (p) => p.getByTestId('final-answer'));
    else await table.admin.getByTestId('final-answer').first().click();
  }
  await expect(table.admin.getByText('Tura gracza 1 zakończona')).toBeVisible();

  // --- gracz 2 wraca i patrzy na telewizor ---------------------------------
  await table.admin.getByRole('button', { name: 'Zawołaj gracza 2' }).click();
  await table.admin.getByRole('button', { name: 'Start tury' }).click();

  const tvHtml = await table.tv.content();
  for (const answer of player1Answers) {
    expect(tvHtml, `odpowiedź „${answer}" nie może być widoczna dla gracza 2`).not.toContain(answer);
  }
  await expect(table.tv.getByTestId('tv-final-slot').filter({ hasText: '■' }).first()).toBeVisible();

  // --- duplikat nie zużywa pytania -----------------------------------------
  const duplicate = table.admin.getByTestId('final-answer').filter({ has: table.admin.getByTestId('taken-by-p1') }).first();
  await expect(duplicate).toBeVisible();
  const questionBefore = await table.admin.getByTestId('final-progress').innerText();
  await duplicate.click();
  await expect(table.admin.getByTestId('final-progress')).toHaveText(questionBefore);
  await expect(table.admin.getByText(/Duplikaty w tej turze: 1/)).toBeVisible();

  const alternative = table.admin
    .getByTestId('final-answer')
    .filter({ hasNot: table.admin.getByTestId('taken-by-p1') })
    .first();
  await alternative.click();
  await expect(table.admin.getByTestId('final-progress')).not.toHaveText(questionBefore);

  for (let i = 0; i < 4; i++) {
    const fresh = (p: Page) => p.getByTestId('final-answer').filter({ hasNot: p.getByTestId('taken-by-p1') });
    if (i < 3) await answerFinal(table.admin, fresh);
    else await fresh(table.admin).first().click();
  }
  await expect(table.admin.getByText('Obie tury zagrane')).toBeVisible();

  // --- odsłanianie ----------------------------------------------------------
  await table.admin.getByRole('button', { name: 'Przejdź do odsłaniania' }).click();
  await expect(table.tv.getByTestId('tv-final-total')).toHaveText('0');

  // Widz i prowadzący muszą wiedzieć, do którego pytania należy odsłaniana odpowiedź
  const nextQuestion = await table.admin.getByTestId('reveal-next-question').innerText();
  await expect(table.tv.getByTestId('tv-final-question')).toHaveText(nextQuestion);

  for (let i = 0; i < 10; i++) {
    // Czekamy, aż panel pokaże licznik tego kroku — przy wolniejszym łączu
    // „następne pytanie" potrafi być jeszcze tym sprzed poprzedniego kliknięcia
    const button = table.admin.getByRole('button', { name: `Odsłoń kolejną (${i + 1}/10)` });
    await expect(button).toBeVisible();
    const question = await table.admin.getByTestId('reveal-next-question').innerText();
    await button.click();
    if (i < 9) await expect(table.tv.getByTestId('tv-final-question')).toHaveText(question);
  }

  const total = Number(await table.tv.getByTestId('tv-final-total').innerText());
  expect(total).toBeGreaterThan(0);
  const verdict = table.tv.getByTestId('tv-final-verdict');
  const threshold = Number(await table.tv.getByTestId('tv-final-threshold').innerText());
  expect(threshold).toBe(100);
  await expect(verdict).toHaveText(total >= threshold ? 'NAGRODA GŁÓWNA!' : 'NIE UDAŁO SIĘ');
  await expectResultFitsScreen(table.tv);

  // Po odsłonięciu odpowiedzi gracza 1 mogą już być widoczne
  const finalHtml = await table.tv.content();
  expect(finalHtml).toContain(player1Answers[0]);

  for (const context of table.contexts) await context.close();
});

test('tura finału nie ma zegara ani na telewizorze, ani u prowadzącego', async ({ browser }) => {
  const table = await setUpTable(browser);
  const teams = await teamIds();
  await fastForwardToLeaderboard(teams[0].id);

  await table.admin.getByPlaceholder('Imię').first().fill('Ania');
  await table.admin.getByPlaceholder('Imię').nth(1).fill('Bartek');
  await table.admin.getByRole('button', { name: 'Rozpocznij finał' }).click();
  await table.admin.getByRole('button', { name: 'Zaczynamy — gracz 1' }).click();
  await table.admin.getByRole('button', { name: 'Start tury' }).click();
  await expect(table.admin.getByTestId('final-answer')).toHaveCount(10);

  // Nic nie odlicza: ani pauzy, ani sekund — tura kończy się odpowiedziami albo ręcznie
  await expect(table.admin.getByRole('button', { name: /Pauza/ })).toHaveCount(0);
  await table.tv.waitForTimeout(1500);
  await expect(table.admin.getByTestId('final-answer')).toHaveCount(10);
  await expect(table.admin.getByText('Tura gracza 1 zakończona')).toHaveCount(0);

  await table.admin.getByRole('button', { name: 'Zakończ turę' }).click();
  await expect(table.admin.getByText('Tura gracza 1 zakończona')).toBeVisible();

  for (const context of table.contexts) await context.close();
});

test('pytanie i odpowiedzi są na ekranie prowadzącego od razu po starcie tury', async ({ browser }) => {
  const table = await setUpTable(browser);
  const teams = await teamIds();
  await fastForwardToLeaderboard(teams[0].id);

  await table.admin.getByPlaceholder('Imię').first().fill('Ania');
  await table.admin.getByPlaceholder('Imię').nth(1).fill('Bartek');
  await table.admin.getByRole('button', { name: 'Rozpocznij finał' }).click();
  await table.admin.getByRole('button', { name: 'Zaczynamy — gracz 1' }).click();
  await table.admin.getByRole('button', { name: 'Start tury' }).click();

  // Pytania finałowe bywają spoza pakietów rundy głównej — i tak muszą mieć treść
  await expect(table.admin.getByTestId('final-answer')).toHaveCount(10);
  const firstAnswer = await table.admin.getByTestId('final-answer-text').first().innerText();
  expect(firstAnswer.length).toBeGreaterThan(1);
  await expect(table.tv.getByText(/ODPOWIADA ANIA/i)).toBeVisible();

  for (const context of table.contexts) await context.close();
});

test('odpowiedź spoza listy zostaje zapisana i pokazana przy odsłanianiu', async ({ browser }) => {
  const table = await setUpTable(browser);
  const teams = await teamIds();
  await fastForwardToLeaderboard(teams[0].id);

  await table.admin.getByPlaceholder('Imię').first().fill('Ania');
  await table.admin.getByPlaceholder('Imię').nth(1).fill('Bartek');
  await table.admin.getByRole('button', { name: 'Rozpocznij finał' }).click();
  await table.admin.getByRole('button', { name: 'Zaczynamy — gracz 1' }).click();
  await table.admin.getByRole('button', { name: 'Start tury' }).click();

  const wildAnswer = 'Kosmiczny odkurzacz';
  await table.admin.getByTestId('final-custom').fill(wildAnswer);
  await table.admin.getByTestId('final-miss').click();

  // Pole czyści się samo, żeby nie przeszło na kolejne pytanie
  await expect(table.admin.getByTestId('final-custom')).toHaveValue('');

  for (let i = 1; i < 5; i++) {
    if (i < 4) await answerFinal(table.admin, (p) => p.getByTestId('final-answer'));
    else await table.admin.getByTestId('final-answer').first().click();
  }
  await table.admin.getByRole('button', { name: 'Zawołaj gracza 2' }).click();
  await table.admin.getByRole('button', { name: 'Start tury' }).click();
  for (let i = 0; i < 5; i++) {
    const fresh = (p: Page) => p.getByTestId('final-answer').filter({ hasNot: p.getByTestId('taken-by-p1') });
    if (i < 4) await answerFinal(table.admin, fresh);
    else await fresh(table.admin).first().click();
  }

  await table.admin.getByRole('button', { name: 'Przejdź do odsłaniania' }).click();
  // Wpisana odpowiedź nie może wyciec przed czasem
  await expect(table.tv.getByText(wildAnswer)).toHaveCount(0);

  await table.admin.getByRole('button', { name: /Odsłoń kolejną/ }).click();
  await expect(table.tv.getByText(wildAnswer)).toBeVisible();
  await expect(table.tv.getByTestId('tv-final-total')).toHaveText('0');

  for (const context of table.contexts) await context.close();
});

test('dwóch prowadzących widzi ten sam stan gry', async ({ browser }) => {
  const table = await setUpTable(browser);
  const second = await openAdmin(browser);
  table.contexts.push(second.context);

  const teams = await teamIds();
  await fastForwardToLeaderboard(teams[0].id);

  // Drugie urządzenie dostaje tę samą fazę bez odświeżania
  await expect(second.page.getByRole('heading', { name: 'Runda główna zakończona' })).toBeVisible();

  await table.admin.getByPlaceholder('Imię').first().fill('Ania');
  await table.admin.getByPlaceholder('Imię').nth(1).fill('Bartek');
  await table.admin.getByRole('button', { name: 'Rozpocznij finał' }).click();
  await second.page.getByRole('button', { name: 'Zaczynamy — gracz 1' }).click();
  await table.admin.getByRole('button', { name: 'Start tury' }).click();

  // Jeden czyta pytanie, drugi zaznacza — obaj muszą być na tym samym pytaniu
  await expect(second.page.getByTestId('final-progress')).toHaveText('1/5');
  await table.admin.getByTestId('final-answer').first().click();
  await expect(second.page.getByTestId('final-progress')).toHaveText('2/5');
  await expect(table.admin.getByTestId('final-progress')).toHaveText('2/5');

  for (const context of table.contexts) await context.close();
});

test('nowa gra po finale wraca na telewizorze do lobby z tymi samymi drużynami', async ({ browser }) => {
  const table = await setUpTable(browser);
  const teams = await teamIds();
  await fastForwardToLeaderboard(teams[0].id);

  // Finał bez odpowiedzi — kończy się komunikatem, że zabrakło punktów
  await table.admin.getByPlaceholder('Imię').first().fill('Ania');
  await table.admin.getByPlaceholder('Imię').nth(1).fill('Bartek');
  await table.admin.getByRole('button', { name: 'Rozpocznij finał' }).click();
  for (const label of ['Zaczynamy — gracz 1', 'Start tury', 'Zakończ turę', 'Zawołaj gracza 2', 'Start tury', 'Zakończ turę']) {
    await table.admin.getByRole('button', { name: label }).click();
  }
  await table.admin.getByRole('button', { name: 'Przejdź do odsłaniania' }).click();
  for (let i = 0; i < 10; i++) {
    await table.admin.getByRole('button', { name: `Odsłoń kolejną (${i + 1}/10)` }).click();
  }
  await expect(table.tv.getByTestId('tv-final-verdict')).toHaveText('NIE UDAŁO SIĘ');
  await expect(table.tv.getByText('ZABRAKŁO 100 PKT')).toBeVisible();
  await expectResultFitsScreen(table.tv);

  await table.admin.getByRole('button', { name: 'Zakończ grę' }).click();
  await table.admin.getByRole('button', { name: 'Nowa gra' }).click();
  await table.admin.getByTestId('confirm-yes').click();

  // Telewizor sam wraca do lobby — wcześniej zostawał na ekranie końca gry
  await expect(table.tv.getByText('DOŁĄCZ TELEFONEM')).toBeVisible();
  await expect(table.tv.getByText('CZEKAMY NA DRUŻYNY…')).toHaveCount(0);
  for (const { name } of table.teams) await expect(table.tv.getByText(name, { exact: true })).toBeVisible();

  // Telefony zostają przy swoich drużynach, bez ponownego dołączania, z zerowym wynikiem
  for (const { name, page } of table.teams) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('np. Ogórki Kiszone')).toHaveCount(0);
  }
  await expect(table.teams[0].page.locator('p.text-gold').first()).toHaveText('0');

  // Prowadzący widzi drużyny w lobby i może od razu losować pytania
  await expect(table.admin.getByRole('heading', { name: 'Drużyny' })).toBeVisible();
  await expect(table.admin.getByText('Nikt jeszcze nie dołączył')).toHaveCount(0);
  await table.admin.getByRole('button', { name: /Losuj/ }).click();
  await expect(table.admin.getByRole('button', { name: 'Rozpocznij grę' })).toBeEnabled();

  for (const context of table.contexts) await context.close();
});
