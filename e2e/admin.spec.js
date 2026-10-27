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

test('ADM промокод для блогера создаётся и показывается', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Пароль').fill('e2e-pass');
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByRole('button', { name: 'Промокоды' }).click();
  const f = page.locator('#promo-form');
  await f.getByLabel('Код').fill('blog' + Date.now() % 100000);
  await f.getByLabel('Скидка, ₽').fill('500');
  await f.getByLabel('Для кого / заметка').fill('канал тест');
  await f.getByRole('button', { name: 'Создать код' }).click();
  await expect(page.locator('#promo-err')).toContainText('?ref=BLOG');
  await expect(page.locator('#promo-list')).toContainText('канал тест');
});
