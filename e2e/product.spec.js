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
  await expect(page.locator('#p-status')).toContainText('Добавлено · KHAKI · M');
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

test('ST размерная сетка на странице товара', async ({ page, request }) => {
  await request.post('/api/login', { data: { password: 'e2e-pass' } });
  const p = await (await request.post('/api/products', { data: { name: 'ST TEST', brand: 'STBRAND', price: 10, sizes: 'S, M',
    sizeTable: 'Size | Length | 1/2 Chest | Sleeve | Weight (kg) | Height (cm)\nS    | 64     | 63        | 56     | 45–60       | 155–165\nM    | 66     | 65        | 57     | 50–65       | 165–170' } })).json();
  await page.goto('/#/p/' + p.id);
  await expect(page.locator('#p-st')).toBeHidden();
  await page.getByRole('button', { name: 'Размерная сетка' }).click();
  await expect(page.locator('#p-st table tr')).toHaveCount(3);
  await expect(page.locator('#p-st th').nth(2)).toHaveText(/1\/2 Chest/i);
  await expect(page.locator('#p-st tbody tr').first().locator('td').last()).toHaveText('155–165');
  await page.goto('/#/p/demo-tee-1');
  await expect(page.getByRole('button', { name: 'Размерная сетка' })).toBeHidden();
  await request.delete('/api/products/' + p.id);
});

test('COLOR выбор цвета у товара и в заказе', async ({ page, request }) => {
  await request.post('/api/login', { data: { password: 'e2e-pass' } });
  const p = await (await request.post('/api/products', { data: { name: 'COLOR TEST', brand: 'CBRAND', price: 100, sizes: 'M', color: 'black, cream white' } })).json();
  expect(p.color).toBe('BLACK, CREAM WHITE');
  await page.goto('/#/p/' + p.id);
  await page.getByRole('button', { name: 'Выбрать размер' }).click();
  await expect(page.locator('#buy-title')).toHaveText('Выберите цвет и размер');
  await page.locator('#sizes').getByRole('button', { name: 'M', exact: true }).click();
  await expect(page.getByRole('button', { name: 'В корзину' })).toBeDisabled();
  await page.locator('#colors').getByRole('button', { name: 'CREAM WHITE' }).click();
  await page.getByRole('button', { name: 'В корзину' }).click();
  await expect(page.locator('#p-status')).toContainText('CREAM WHITE');
  await page.goto('/#/cart');
  await expect(page.locator('.co-line').filter({ hasText: 'COLOR TEST' })).toContainText('Цвет CREAM WHITE');
  const bad = await request.post('/api/order', { data: { items: [{ id: p.id, size: 'M', color: 'RED', qty: 1 }] } });
  expect(bad.status()).toBe(400);
  await request.delete('/api/products/' + p.id);
});
