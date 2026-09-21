import { expect, test } from '@playwright/test';

test.describe('strona główna', () => {
  test('prowadzi do trzech ról', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByAltText('Drużynada')).toBeVisible();

    for (const role of ['TV', 'Admin', 'Gracz']) {
      await expect(page.getByRole('link', { name: new RegExp(role) })).toBeVisible();
    }

    await page.getByRole('link', { name: /Gracz/ }).click();
    await expect(page).toHaveURL(/\/play$/);
  });

  test('panel admina jest za hasłem', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Panel prowadzącego' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gra' })).toHaveCount(0);

    await page.getByPlaceholder('Hasło').fill('zle-haslo');
    await page.getByRole('button', { name: 'Wejdź' }).click();
    // Po kilku próbach serwer odpowiada limitem zamiast „błędne hasło" — obie
    // odpowiedzi są poprawne, byle nie wpuścić do panelu
    await expect(page.getByText(/Błędne hasło|Too Many Requests|ThrottlerException/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gra', exact: true })).toHaveCount(0);
  });

  test('telewizor po starcie trzyma ekran włączony zapętlonym wideo', async ({ page }) => {
    await page.goto('/tv');
    await page.getByText('KLIKNIJ, ABY ROZPOCZĄĆ').click();

    // Telewizory ignorują Wake Lock — ekran trzyma przy życiu grające wideo
    const video = page.locator('[data-testid="keep-awake"]');
    await expect(video).toHaveCount(1);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused && v.loop && v.muted)).toBe(true);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0);
  });
});
