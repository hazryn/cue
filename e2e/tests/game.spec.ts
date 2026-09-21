import { BrowserContext, Page, expect, test } from '@playwright/test';
import { CatalogQuestion, freshGame, joinAsTeam, openAdmin, openTv } from '../fixtures';

interface Table {
  admin: Page;
  tv: Page;
  teams: Array<{ name: string; page: Page }>;
  contexts: BrowserContext[];
  questions: CatalogQuestion[];
}

/** Ustawia stół: trzy telefony, prowadzący i telewizor, gra wystartowana. */
async function setUpTable(browser: Parameters<typeof openTv>[0], teamNames: string[]): Promise<Table> {
  const { main } = await freshGame();

  const tv = await openTv(browser);
  const admin = await openAdmin(browser);
  const teams = [];
  const contexts: BrowserContext[] = [tv.context, admin.context];

  for (const name of teamNames) {
    const team = await joinAsTeam(browser, name);
    teams.push({ name, page: team.page });
    contexts.push(team.context);
  }

  await admin.page.getByRole('button', { name: /Losuj/ }).click();
  await admin.page.getByRole('button', { name: 'Rozpocznij grę' }).click();
  if (teamNames.length === 2) {
    await admin.page.getByTestId('confirm-yes').click();
  }
  await expect(admin.page.getByText('PYTANIE 1/10')).toBeVisible();

  return { admin: admin.page, tv: tv.page, teams, contexts, questions: main };
}

const closeAll = async (table: Table) => {
  for (const context of table.contexts) await context.close();
};

/** Grzybek wygrywa ten, kto nacisnie pierwszy — reszta może próbować równolegle. */
async function winRace(table: Table, winner: string): Promise<void> {
  await table.admin.getByRole('button', { name: /pytanie i grzybki|Odblokuj grzybki/i }).click();
  const page = table.teams.find((t) => t.name === winner)!.page;
  await expect(page.getByTestId('buzzer')).toHaveAttribute('data-armed', 'true');
  await page.getByTestId('buzzer').click();
  await expect(table.admin.getByText(winner, { exact: false }).first()).toBeVisible();
}

test.describe('runda główna', () => {
  test('pytanie, grzybek i odsłanianie odpowiedzi', async ({ browser }) => {
    const table = await setUpTable(browser, ['Ogórki', 'Kotlety', 'Pierogi']);

    // Przed startem plansza jest pusta, a treść pytania ukryta
    await expect(table.tv.getByText('• • • •').first()).toBeVisible();
    await expect(table.tv.getByTestId('tv-question')).toHaveText('. . .');

    const questionText = await table.admin.getByTestId('admin-question').innerText();
    await winRace(table, 'Kotlety');

    // Jedno kliknięcie prowadzącego: pytanie i grzybki naraz
    await expect(table.tv.getByTestId('tv-question')).toHaveText(questionText);
    await expect(table.tv.getByText('ODPOWIADA')).toBeVisible();

    // Pierwsza odpowiedź na liście admina to ta o najwyższej wadze
    const firstAnswer = table.admin.getByTestId('admin-answer').first();
    const answerText = await firstAnswer.getByTestId('admin-answer-text').innerText();
    const weight = await firstAnswer.getAttribute('data-weight');
    await firstAnswer.click();

    await expect(table.tv.getByTestId('tv-slot').filter({ hasText: answerText })).toBeVisible();
    await expect(table.tv.getByTestId('tv-pool')).toHaveText(weight!);
    await expect(table.admin.getByTestId('admin-pool')).toHaveText(weight!);

    await closeAll(table);
  });

  test('trzy błędy oddają pytanie pozostałym drużynom', async ({ browser }) => {
    const table = await setUpTable(browser, ['Ogórki', 'Kotlety', 'Pierogi']);
    await winRace(table, 'Ogórki');

    for (let i = 1; i <= 3; i++) {
      await table.admin.getByRole('button', { name: '✖ Błędna odpowiedź' }).click();
      await expect(table.tv.getByTestId('tv-strike')).toHaveCount(i);
    }

    await expect(table.admin.getByText('Przejęcie')).toBeVisible();

    // Do przejęcia stają tylko drużyny, które jeszcze nie próbowały
    await table.admin.getByRole('button', { name: 'Odblokuj grzybki' }).click();
    await expect(table.tv.getByText('PRZEJĘCIE — KTO PIERWSZY?')).toBeVisible();
    await expect(table.teams[0].page.getByTestId('buzzer')).toHaveAttribute('data-armed', 'false');
    await expect(table.teams[0].page.getByTestId('buzzer')).toHaveText('Nie wasza kolej');
    await expect(table.teams[1].page.getByTestId('buzzer')).toHaveAttribute('data-armed', 'true');

    await closeAll(table);
  });

  test('przejmujący zgarnia pulę razem z własną odpowiedzią', async ({ browser }) => {
    const table = await setUpTable(browser, ['Ogórki', 'Kotlety']);
    await winRace(table, 'Ogórki');

    const answers = table.admin.getByTestId('admin-answer');
    const firstWeight = Number(await answers.first().getAttribute('data-weight'));
    await answers.first().click();

    for (let i = 0; i < 3; i++) await table.admin.getByRole('button', { name: '✖ Błędna odpowiedź' }).click();
    // Przy dwóch drużynach przejęcie idzie od razu do przeciwnika, bez wyścigu
    await expect(table.admin.getByText(/przejęcie — jedna próba/)).toBeVisible();

    const remaining = table.admin.getByTestId('admin-answer').filter({ has: table.admin.locator('[data-revealed="false"]') }).first()
      .or(table.admin.getByTestId('admin-answer').nth(1));
    const secondWeight = Number(await remaining.getAttribute('data-weight'));
    await remaining.click();

    const expected = firstWeight + secondWeight;
    await expect(table.admin.getByText(new RegExp(`Kotlety \\+${expected}`))).toBeVisible();
    await expect(table.tv.getByTestId('tv-award')).toHaveText(`+${expected} PUNKTÓW`);

    await closeAll(table);
  });

  test('prowadzący cofa pomyłkę jednym przyciskiem', async ({ browser }) => {
    const table = await setUpTable(browser, ['Ogórki', 'Kotlety', 'Pierogi']);
    await winRace(table, 'Pierogi');

    await table.admin.getByRole('button', { name: '✖ Błędna odpowiedź' }).click();
    await expect(table.tv.getByTestId('tv-strike')).toHaveCount(1);

    await table.admin.getByRole('button', { name: '↶ Cofnij' }).click();
    await table.admin.getByTestId('confirm-yes').click();

    await expect(table.tv.getByTestId('tv-strike')).toHaveCount(0);
    await expect(table.admin.getByText('Cofnięto ostatnią akcję')).toBeVisible();

    await closeAll(table);
  });

  test('kliknięcie odsłoniętej odpowiedzi nie jest błędem drużyny', async ({ browser }) => {
    const table = await setUpTable(browser, ['Ogórki', 'Kotlety']);
    await winRace(table, 'Ogórki');

    const answer = table.admin.getByTestId('admin-answer').first();
    await answer.click();
    await expect(answer).toHaveAttribute('data-revealed', 'true');
    await answer.click();

    await expect(table.admin.getByText(/już odsłonięta/)).toBeVisible();
    await expect(table.tv.getByTestId('tv-strike')).toHaveCount(0);

    await closeAll(table);
  });
});

test.describe('wyzerowanie gry', () => {
  test('prowadzący zaczyna od nowa bez proszenia graczy o ponowne dołączenie', async ({ browser }) => {
    const table = await setUpTable(browser, ['Ogórki', 'Kotlety']);
    await winRace(table, 'Ogórki');
    await table.admin.getByTestId('admin-answer').first().click();
    await expect(table.tv.getByTestId('tv-pool')).not.toHaveText('0');

    await table.admin.getByRole('button', { name: '⟲ Od nowa' }).click();
    await table.admin.getByTestId('confirm-yes').click();

    // Telewizor wraca do lobby z drużynami, które nadal trzymają telefony
    await expect(table.tv.getByText('CZEKAMY NA DRUŻYNY…')).toHaveCount(0);
    await expect(table.tv.getByText('OGÓRKI')).toBeVisible();
    await expect(table.tv.getByText('KOTLETY')).toBeVisible();
    await expect(table.teams[0].page.getByText('Ogórki')).toBeVisible();

    // Wybrane pytania zostają, więc powtórka to jedno kliknięcie
    await table.admin.getByRole('button', { name: 'Rozpocznij grę' }).click();
    await table.admin.getByRole('button', { name: 'Startujemy' }).click();
    await expect(table.admin.getByText('PYTANIE 1/10')).toBeVisible();
    await expect(table.admin.getByTestId('admin-pool')).toHaveText('0');

    await closeAll(table);
  });
});

test.describe('skróty do prób', () => {
  test('przewinięcie do finału zamyka rundę główną jednym kliknięciem', async ({ browser }) => {
    const table = await setUpTable(browser, ['Ogórki', 'Kotlety']);
    await winRace(table, 'Ogórki');
    await table.admin.getByTestId('admin-answer').first().click();

    await table.admin.getByText('Narzędzia ratunkowe').click();
    await table.admin.getByRole('button', { name: /Przewiń do finału/ }).click();
    await table.admin.getByTestId('confirm-yes').click();

    await expect(table.admin.getByRole('heading', { name: 'Runda główna zakończona' })).toBeVisible();
    await expect(table.tv.getByText('ZWYCIĘZCA')).toBeVisible();
    await expect(table.admin.getByPlaceholder('Imię').first()).toBeVisible();

    await closeAll(table);
  });
});

test.describe('odporność', () => {
  test('odświeżenie telewizora i telefonu nie gubi gry', async ({ browser }) => {
    const table = await setUpTable(browser, ['Ogórki', 'Kotlety']);
    await winRace(table, 'Ogórki');

    const answer = table.admin.getByTestId('admin-answer').first();
    const answerText = await answer.getByTestId('admin-answer-text').innerText();
    const weight = await answer.getAttribute('data-weight');
    await answer.click();
    await table.admin.getByRole('button', { name: '✖ Błędna odpowiedź' }).click();

    // Telewizor po F5 musi sam poprosić serwer o pełny obraz
    await table.tv.reload();
    await table.tv.getByText('KLIKNIJ, ABY ROZPOCZĄĆ').click();
    await expect(table.tv.getByTestId('tv-pool')).toHaveText(weight!);
    await expect(table.tv.getByTestId('tv-slot').filter({ hasText: answerText })).toBeVisible();
    await expect(table.tv.getByTestId('tv-strike')).toHaveCount(1);

    // Telefon wraca do swojej drużyny po tokenie z localStorage
    await table.teams[0].page.reload();
    await expect(table.teams[0].page.getByText('ODPOWIADACIE', { exact: true })).toBeVisible();

    await closeAll(table);
  });
});
