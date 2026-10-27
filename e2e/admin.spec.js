const { test, expect, a11y } = require('./fixtures');

test('ADM-H1 вход в админку', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Пароль').fill('wrong');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByText('Неверный пароль')).toBeVisible();
  await page.getByLabel('Пароль').fill('e2e-pass');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByText('Товары (12)')).toBeVisible();
  await a11y(page);
});
