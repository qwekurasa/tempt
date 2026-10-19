const { test, expect, a11y } = require('./fixtures');

async function addTee(page, size = 'M') {
  await page.goto('/#/p/demo-tee-1');
  await page.getByRole('button', { name: 'Выбрать размер' }).click();
  await page.getByRole('button', { name: size, exact: true }).click();
  await expect(page.locator('#p-status')).toContainText('Добавлено');
}

async function fill(page) {
  await page.getByLabel('ФИО').fill('Тестов Тест Тестович');
  await page.getByLabel('Telegram ник').fill('@test_buyer');
  await page.getByLabel('Телефон').fill('+7 900 000-00-00');
  await page.getByText('Пункт выдачи СДЭК').click();
  await page.getByLabel('Точный адрес пункта выдачи').fill('Москва, ул. Тестовая, 1');
}

test('F01-E5 пустая корзина: оформить нельзя', async ({ page }) => {
  await page.goto('/#/cart');
  await expect(page.getByText('Корзина пуста')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Оформить заказ' })).toBeDisabled();
  await a11y(page);
});

test('F01-H5 оформление заказа', async ({ page }) => {
  await addTee(page);
  await page.getByRole('link', { name: /^Корзина \d+$/ }).click();
  await expect(page.getByText('BRAND A — TEE 01')).toBeVisible();
  await expect(page.locator('#total')).toHaveText('5 900 ₽');
  await page.getByRole('button', { name: '+' }).click();
  await expect(page.locator('#total')).toHaveText('11 800 ₽');
  await fill(page);
  await page.getByRole('checkbox', { name: /Согласен/ }).check();
  await page.getByRole('button', { name: 'Оформить заказ' }).click();
  await expect(page.getByRole('heading', { name: /Заказ #[0-9A-F]{12} оформлен/ })).toBeVisible();
  await expect(page.locator('#cart-count2')).toHaveText('0');
});

test('F01-N1 без согласия форма не отправляется', async ({ page }) => {
  await addTee(page);
  await page.goto('/#/cart');
  await fill(page);
  let sent = false;
  page.on('request', r => r.url().endsWith('/api/order') && (sent = true));
  await page.getByRole('button', { name: 'Оформить заказ' }).click();
  await expect(page.getByRole('button', { name: 'Оформить заказ' })).toBeVisible();
  expect(sent).toBe(false);
});

test('F01-E6 двойной клик отправляет один заказ', async ({ page }) => {
  await addTee(page);
  await page.goto('/#/cart');
  await fill(page);
  await page.getByRole('checkbox', { name: /Согласен/ }).check();
  let count = 0;
  page.on('request', r => r.url().endsWith('/api/order') && count++);
  await page.getByRole('button', { name: 'Оформить заказ' }).dblclick();
  await expect(page.getByRole('heading', { name: /оформлен/ })).toBeVisible();
  expect(count).toBe(1);
});

test('F01-E7 корзина переживает перезагрузку', async ({ page }) => {
  await addTee(page, 'L');
  await page.reload();
  await expect(page.locator('#cart-count')).toHaveText('1');
});
