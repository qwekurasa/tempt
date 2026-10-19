const { test, expect } = require('@playwright/test');

test('SKU назначается, уникален, ищется, скрыт от покупателей', async ({ page, request }) => {
  await request.post('/api/login', { data: { password: 'e2e-pass' } });
  const base = { brand: 'SKUBRAND', price: 500, sizes: 'M', images: ['/demo/tee.svg'] };

  const a = await (await request.post('/api/products', { data: { ...base, name: 'SKU AUTO' } })).json();
  expect(a.sku).toMatch(/^T\d{4}$/);
  const b = await (await request.post('/api/products', { data: { ...base, name: 'SKU MANUAL', sku: 'ab 777' } })).json();
  expect(b.sku).toBe('AB777');
  const dupe = await request.post('/api/products', { data: { ...base, name: 'SKU CLASH', sku: 'AB777' } });
  expect(dupe.status()).toBe(400);
  expect((await dupe.json()).error).toBe('Такой артикул уже есть');

  // покупателю артикул не отдаётся
  const pub = await (await page.request.get('/api/products')).json();
  expect(pub.find(p => p.id === b.id).sku).toBeUndefined();

  await page.goto('/admin');
  await page.getByLabel('Пароль').fill('e2e-pass');
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByLabel('Поиск товара').fill('ab777');
  await expect(page.locator('.row')).toHaveCount(1);
  await expect(page.locator('.row')).toContainText('SKU MANUAL');

  // копия получает новый артикул
  await page.locator('.row').getByRole('button', { name: 'Дублировать' }).click();
  await page.getByLabel('Поиск товара').fill('SKU MANUAL');
  await expect(page.locator('.row')).toHaveCount(2);
  const all = await (await request.get('/api/products?fresh')).json();
  const skus = all.filter(p => p.name === 'SKU MANUAL').map(p => p.sku);
  expect(new Set(skus).size).toBe(2);

  for (const p of all.filter(p => p.brand === 'SKUBRAND')) await request.delete('/api/products/' + p.id);
});
