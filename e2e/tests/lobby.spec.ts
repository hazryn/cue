import { expect, test } from '@playwright/test';
import { freshGame, joinAsTeam, openAdmin, openTv } from '../fixtures';

test.describe('lobby', () => {
  test.beforeEach(async () => {
    await freshGame();
  });

  test('drużyny dołączają telefonami i pojawiają się na telewizorze', async ({ browser }) => {
    const tv = await openTv(browser);
    await expect(tv.page.getByText('CZEKAMY NA DRUŻYNY…')).toBeVisible();

    const alfa = await joinAsTeam(browser, 'Ogórki Kiszone');
    await expect(tv.page.getByText('OGÓRKI KISZONE')).toBeVisible();
    await expect(tv.page.getByText('GOTOWI')).toBeVisible();

    const beta = await joinAsTeam(browser, 'Kotlety');
    await expect(tv.page.getByText('KOTLETY')).toBeVisible();

    await alfa.context.close();
    await beta.context.close();
    await tv.context.close();
  });

  test('dwie drużyny nie mogą mieć tej samej nazwy', async ({ browser }) => {
    const first = await joinAsTeam(browser, 'Bliźniaki');

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto('/play');
    // Kolizję wykrywamy po znormalizowanej nazwie, więc ogonki i wielkość liter nie pomogą
    await page.getByPlaceholder('np. Ogórki Kiszone').fill('bliźniaki');
    await page.getByRole('button', { name: 'Dołącz do gry' }).click();
    await expect(page.getByText(/Taka drużyna już gra/)).toBeVisible();

    await context.close();
    await first.context.close();
  });

  test('telefon po odświeżeniu wraca do swojej drużyny', async ({ browser }) => {
    const team = await joinAsTeam(browser, 'Powracający');
    await team.page.reload();
    await expect(team.page.getByText('Powracający')).toBeVisible();
    await expect(team.page.getByPlaceholder('np. Ogórki Kiszone')).toHaveCount(0);
    await team.context.close();
  });

  test('telefon z tokenem z poprzedniej gry dołącza do nowej', async ({ browser }) => {
    // Dokładnie ten przypadek wysypywał się na unikalności device_token:
    // telefon trzyma token w localStorage i przynosi go do każdej kolejnej gry.
    const veteran = await joinAsTeam(browser, 'Weterani');
    await freshGame();

    await veteran.page.reload();
    await expect(veteran.page.getByPlaceholder('np. Ogórki Kiszone')).toBeVisible();

    await veteran.page.getByPlaceholder('np. Ogórki Kiszone').fill('Weterani');
    await veteran.page.getByRole('button', { name: 'Dołącz do gry' }).click();

    await expect(veteran.page.getByText(/duplicate key|constraint|Błąd serwera/i)).toHaveCount(0);
    await expect(veteran.page.getByTestId('buzzer')).toBeVisible();

    await veteran.context.close();
  });

  test('prowadzący wyrzuca drużynę, a jej telefon może dołączyć ponownie', async ({ browser }) => {
    const admin = await openAdmin(browser);
    const team = await joinAsTeam(browser, 'Intruzi');
    const tv = await openTv(browser);
    await expect(tv.page.getByText('Intruzi', { exact: true })).toBeVisible();

    await admin.page.getByRole('button', { name: 'Wyrzuć' }).click();
    await admin.page.getByTestId('confirm-yes').click();

    // Telefon nie udaje, że dalej gra — dostaje wyjaśnienie
    await expect(team.page.getByTestId('play-evicted')).toContainText('usunął Waszą drużynę');
    await expect(tv.page.getByText('Intruzi', { exact: true })).toHaveCount(0);

    // Ten sam telefon wraca bez przeszkód — wcześniej blokował go własny token
    await team.page.getByRole('button', { name: 'Dołącz jeszcze raz' }).click();
    await team.page.getByPlaceholder('np. Ogórki Kiszone').fill('Intruzi');
    await team.page.getByRole('button', { name: 'Dołącz do gry' }).click();
    await expect(team.page.getByTestId('buzzer')).toBeVisible();
    await expect(tv.page.getByText('Intruzi', { exact: true })).toBeVisible();

    await tv.context.close();
    await team.context.close();
    await admin.context.close();
  });

  test('odświeżony telefon wyrzuconej drużyny dołącza ponownie tym samym tokenem', async ({ browser }) => {
    const admin = await openAdmin(browser);
    const team = await joinAsTeam(browser, 'Uparci');

    await admin.page.getByRole('button', { name: 'Wyrzuć' }).click();
    await admin.page.getByTestId('confirm-yes').click();
    await expect(team.page.getByTestId('play-evicted')).toBeVisible();

    // Odświeżenie zamiast przycisku: token wciąż leży w localStorage
    await team.page.reload();
    await team.page.getByPlaceholder('np. Ogórki Kiszone').fill('Uparci Znowu');
    await team.page.getByRole('button', { name: 'Dołącz do gry' }).click();
    await expect(team.page.getByTestId('buzzer')).toBeVisible();

    await team.context.close();
    await admin.context.close();
  });

  test('admin nie wystartuje gry z jedną drużyną', async ({ browser }) => {
    const admin = await openAdmin(browser);
    const solo = await joinAsTeam(browser, 'Samotnicy');

    await admin.page.getByRole('button', { name: /Losuj/ }).click();
    await expect(admin.page.getByRole('button', { name: 'Rozpocznij grę' })).toBeDisabled();
    await expect(admin.page.getByText(/co najmniej dwóch drużyn/)).toBeVisible();

    await solo.context.close();
    await admin.context.close();
  });
});
