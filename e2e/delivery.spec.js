const { test, expect } = require('./fixtures');

test.describe.configure({ mode: 'serial' });

const S = { cny: 12, usd: 90, auto1: 6.2, auto10: 4.5, tk: 250, cat_s: 5, cat_m: 10, cat_l: 15, cat_xl: 20 };

test('SHIP настройки сохраняются целиком, частичные — нет', async ({ request }) => {
  await request.post('/api/login', { data: { password: 'e2e-pass' } });
  expect((await request.put('/api/settings', { data: { cny: 12, usd: 90 } })).status()).toBe(400);
  expect((await request.put('/api/settings', { data: S })).status()).toBe(200);
});

test('SHIP страница доставки берёт тарифы из настроек', async ({ page }) => {
  await page.goto('/#/delivery');
  await expect(page.locator('#rates')).toHaveText('Курс: 1 ¥ = 12 ₽ · 1 $ = 90 ₽');
  await expect(page.getByText('Авто быстрое: от 10 кг | 4.5 $/кг')).toBeVisible();
  await expect(page.getByText('Мелкое: носки, аксессуары: 5 ¥')).toBeVisible();
  await expect(page.getByText(/Самолёт/)).toHaveCount(0);
});

test('SHIP товар: примерная стоимость доставки', async ({ page }) => {
  // TEE: 0.3 кг → 1 кг × 6.2 $ × 90 = 558; по Китаю 10 ¥ × 12 = 120
  await page.goto('/#/p/demo-tee-1');
  await expect(page.locator('#p-status')).toHaveText('Примерная стоимость доставки до РФ: ~678 ₽');
  await page.getByRole('button', { name: 'Информация' }).click();
  await expect(page.locator('#p-info')).not.toContainText('Ozon');
  await expect(page.locator('#p-info')).not.toContainText('за перекидку на ТК');
});

test('SHIP корзина: по Китаю за каждую вещь, тариф от 10 кг, ТК раз за заказ', async ({ page }) => {
  await page.goto('/#/p/demo-runner-1');
  await page.getByRole('button', { name: 'Выбрать размер' }).click();
  await page.getByRole('button', { name: '42', exact: true }).click();
  await page.getByRole('button', { name: 'В корзину' }).click();
  await page.goto('/#/cart');
  await expect(page.locator('#ship-intl')).toHaveText('725 ₽'); // 1.3 кг × 6.2 × 90
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: '+' }).click();
  // 8 пар: 10.4 кг → 4.5 $/кг
  await expect(page.locator('#subtotal')).toHaveText('151 200 ₽');
  await expect(page.locator('#ship-china')).toHaveText('1 920 ₽'); // 20 ¥ × 8 × 12
  await expect(page.locator('#ship-intl-label')).toHaveText('Авто до РФ, ~10.4 кг × 4.5 $');
  await expect(page.locator('#ship-intl')).toHaveText('4 212 ₽');
  await expect(page.locator('#ship-tk')).toHaveText('250 ₽');
  await expect(page.locator('#total')).toHaveText('157 582 ₽');
  await expect(page.locator('#total-label')).toHaveText('Итого, примерно');
});

test('SHIP-N1 настройки без входа не меняются', async ({ request }) => {
  expect((await request.put('/api/settings', { data: S })).status()).toBe(401);
});
