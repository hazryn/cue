import { expect, test } from '@playwright/test';
import { openAdmin } from '../fixtures';

test.describe('katalog pytań', () => {
  test('odpowiedzi są uporządkowane od najwyżej punktowanej', async ({ browser }) => {
    const { context, page } = await openAdmin(browser);
    await page.getByRole('button', { name: 'Pytania' }).click();

    const firstQuestion = page.locator('li.card').first();
    await expect(firstQuestion).toBeVisible();

    // Podgląd na liście: „odpowiedź waga · odpowiedź waga …"
    const preview = await firstQuestion.locator('p.text-xs').innerText();
    const previewWeights = [...preview.matchAll(/(\d+)(?= ·|$)/g)].map((m) => Number(m[1]));
    expect(previewWeights.length).toBeGreaterThan(1);
    expect(previewWeights).toEqual([...previewWeights].sort((a, b) => b - a));

    // Formularz edycji: ta sama kolejność, żeby prowadzący widział planszę tak jak gracze
    await firstQuestion.getByRole('button', { name: 'Edytuj' }).click();
    const weights = await page.locator('input[type="number"]').evaluateAll((inputs) =>
      inputs.map((input) => Number((input as HTMLInputElement).value)),
    );
    expect(weights.length).toBeGreaterThan(1);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));

    await context.close();
  });

  test('przycisk porządkuje ręcznie zmienione punkty', async ({ browser }) => {
    const { context, page } = await openAdmin(browser);
    await page.getByRole('button', { name: 'Pytania' }).click();
    await page.locator('li.card').first().getByRole('button', { name: 'Edytuj' }).click();

    // Ostatniej odpowiedzi podbijamy wagę — powinna wskoczyć na górę po sortowaniu
    const weightInputs = page.locator('input[type="number"]');
    await weightInputs.last().fill('99');
    await page.getByRole('button', { name: 'Sortuj po punktach' }).click();

    const weights = await weightInputs.evaluateAll((inputs) =>
      inputs.map((input) => Number((input as HTMLInputElement).value)),
    );
    expect(weights[0]).toBe(99);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));

    await context.close();
  });
});

test.describe('pakiety', () => {
  test('prowadzący zakłada własny pakiet i od razu go używa', async ({ browser }) => {
    const { context, page } = await openAdmin(browser);
    await page.getByRole('button', { name: 'Pytania' }).click();

    const name = `Wesele ${Date.now()}`;
    await page.getByTestId('manage-packs').click();
    await page.getByTestId('pack-new').click();
    await page.getByTestId('pack-name').fill(name);
    await page.getByTestId('pack-save').click();

    await expect(page.getByTestId('pack-row').filter({ hasText: name })).toBeVisible();
    await expect(page.getByTestId('pack-row').filter({ hasText: name })).toContainText('0 głównych');
    await page.getByRole('button', { name: 'Zamknij' }).click();

    // Nowy pakiet jest od razu dostępny w filtrach i przy zakładaniu pytania
    await expect(page.locator('select').first().locator('option', { hasText: name })).toHaveCount(1);
    await page.getByRole('button', { name: 'Nowe pytanie' }).click();
    await expect(page.locator('select').first().locator('option', { hasText: name })).toHaveCount(1);
    await page.getByRole('button', { name: 'Anuluj' }).click();

    // Sprzątamy po sobie — pusty pakiet znika bez protestu
    await page.getByTestId('manage-packs').click();
    await page.getByTestId('pack-row').filter({ hasText: name }).getByRole('button', { name: 'Usuń' }).click();
    await page.getByTestId('confirm-yes').click();
    await expect(page.getByTestId('pack-row').filter({ hasText: name })).toHaveCount(0);

    await context.close();
  });

  test('pakiet z pytaniami nie znika przez przypadek', async ({ browser }) => {
    const { context, page } = await openAdmin(browser);
    await page.getByRole('button', { name: 'Pytania' }).click();
    await page.getByTestId('manage-packs').click();

    const used = page.getByTestId('pack-row').filter({ hasText: 'Klasyka rodzinna' });
    await used.getByRole('button', { name: 'Usuń' }).click();

    await expect(page.getByText(/ma jeszcze .* pytań/)).toBeVisible();
    await expect(used).toBeVisible();

    await context.close();
  });
});
