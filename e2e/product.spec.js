const { test, expect, a11y } = require('./fixtures');

test('F01-H4 выбор размера и добавление в корзину', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /TEE 01/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('TEE 01');
  const add = page.getByRole('button', { name: 'Выберите размер' });
  await expect(add).toBeDisabled();
  await page.getByRole('button', { name: 'M', exact: true }).click();
  await page.getByRole('button', { name: 'В корзину' }).click();
  await expect(page.getByRole('button', { name: 'Добавлено ✓' })).toBeVisible();
  await expect(page.locator('#cart-count')).toHaveText('1');
  await a11y(page);
});

test('F01-E3 назад из товара возвращает в каталог', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /PANT 01/ }).click();
  await page.goBack();
  await expect(page.locator('#count')).toBeVisible();
});

test('F01-E4 только клавиатура: карточка открывается Enter', async ({ page }) => {
  await page.goto('/');
  const card = page.getByRole('link', { name: /HOODIE 01/ });
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/p\/demo-hoodie-1$/);
});
