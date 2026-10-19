const { test, expect } = require('./fixtures');

test.describe.configure({ mode: 'serial' });

test('SHIP курсы из админки → примерная доставка в товаре и корзине', async ({ page, request }) => {
  await request.post('/api/login', { data: { password: 'e2e-pass' } });
  expect((await request.put('/api/settings', { data: { cny: 12, usd: 90 } })).status()).toBe(200);
  expect((await request.put('/api/settings', { data: { cny: 0, usd: 90 } })).status()).toBe(400);

  await page.goto('/#/delivery');
  await expect(page.locator('#rates')).toHaveText('Курс: 1 ¥ = 12 ₽ · 1 $ = 90 ₽');

  // TEE: 0.3 кг → считается как 1 кг. Авто 6.2·90 = 558 + сбор 10–15 ¥ (120–180 ₽)
  await page.goto('/#/p/demo-tee-1');
  await expect(page.locator('#p-status')).toHaveText('Доставка до РФ: авто ~680–740 ₽ · самолёт ~2 550–2 610 ₽');
  await page.getByRole('button', { name: 'Информация' }).click();
  await expect(page.locator('#p-info')).not.toContainText('Ozon');
  await expect(page.locator('#p-info')).toContainText('Примерный вес: 0.3 кг');

  await page.getByRole('button', { name: 'Выбрать размер' }).click();
  await page.getByRole('button', { name: 'M', exact: true }).click();
  await page.goto('/#/cart');
  await expect(page.locator('#ship-auto')).toHaveText('~680–740 ₽');
});

test('SHIP-N1 курсы без входа не меняются', async ({ request }) => {
  expect((await request.put('/api/settings', { data: { cny: 1, usd: 1 } })).status()).toBe(401);
});
