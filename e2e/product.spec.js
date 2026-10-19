const { test, expect, a11y } = require('./fixtures');

test('F01-H4 «+» → размер → в корзине', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /TEE 01/ }).click();
  await expect(page.locator('#p-name')).toHaveText('TEE 01');
  await expect(page.locator('#p-price')).toHaveText(/^5.900.₽( · \$\d+)?$/);
  await page.getByRole('button', { name: 'Выбрать размер' }).click();
  await expect(page.getByRole('button', { name: 'В корзину' })).toBeDisabled();
  await page.getByRole('button', { name: 'M', exact: true }).click();
  await expect(page.locator('#cart-count')).toHaveText('');
  await expect(page.getByRole('button', { name: 'M', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'В корзину' }).click();
  await expect(page.locator('#p-status')).toContainText('Добавлено · M');
  await expect(page.locator('#cart-count')).toHaveText('1');
  await a11y(page);
});

test('F02 информация о товаре раскрывается', async ({ page }) => {
  await page.goto('/#/p/demo-tee-1');
  await expect(page.locator('#p-info')).toBeHidden();
  await page.getByRole('button', { name: 'Информация' }).click();
  await expect(page.locator('#p-info')).toContainText('Бренд:');
  await expect(page.locator('#p-info')).not.toContainText('Срок доставки');
});

test('F01-E3 логотип из товара возвращает в каталог', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /PANT 01/ }).click();
  await page.locator('#top .logo').click();
  await expect(page.locator('#grid .item')).toHaveCount(12);
});

test('F01-E4 только клавиатура: карточка открывается Enter', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /HOODIE 01/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/p\/demo-hoodie-1$/);
});
