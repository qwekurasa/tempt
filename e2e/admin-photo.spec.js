const { test, expect } = require('./fixtures');
const zlib = require('zlib');
const base = require('@playwright/test'); // локально нет Blob: прямая загрузка ожидаемо даёт 400 и уходит в запасной путь

// маленький PNG заданного цвета
function png(r, g, b, n = 8, noise = false) {
  const crc = buf => { let c, k = -1; for (const x of buf) { c = (k ^ x) & 0xff; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; k = (k >>> 8) ^ c; } return (k ^ -1) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.concat([...Array(n)].map(() => { const row = Buffer.alloc(1 + n * 3); for (let i = 0; i < n; i++) { row[1 + i * 3] = noise ? Math.random() * 256 : r; row[2 + i * 3] = noise ? Math.random() * 256 : g; row[3 + i * 3] = noise ? Math.random() * 256 : b; } return row; }));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 0 })), chunk('IEND', Buffer.alloc(0))]);
}
const file = (name, c) => ({ name, mimeType: 'image/png', buffer: png(...c) });

test('ADM-PHOTO добавление, замена фото и дубликат', async ({ page, request }) => {
  await page.goto('/admin');
  await page.getByLabel('Пароль').fill('e2e-pass');
  await page.getByRole('button', { name: 'Войти' }).click();
  const f = page.locator('#pf');
  await f.getByLabel('Название').fill('PHOTO TEST');
  await f.getByLabel('Бренд').fill('PHOTOBRAND');
  await f.getByLabel('Цена, ₽').fill('1000');
  await f.locator('#type-select').getByLabel('Худи', { exact: true }).check();
  await f.locator('#type-select').getByLabel('Куртки', { exact: true }).check();
  await f.locator('input[name=images]').setInputFiles([file('a.png', [255, 0, 0]), file('b.png', [0, 255, 0])]);
  await page.locator('#pf-submit').click();
  const row = page.locator('#list .row').filter({ hasText: 'PHOTO TEST' });
  await expect(row).toHaveCount(1);
  let p = (await (await request.get('/api/products')).json()).find(x => x.name === 'PHOTO TEST');
  expect(p.images).toHaveLength(2);
  expect(p.kinds).toEqual(['Худи', 'Куртки']);
  for (const u of p.images) expect((await request.get(u)).status()).toBe(200);

  // дубликат, затем у копии меняем фото — у оригинала фото остаются
  await row.getByRole('button', { name: 'Дублировать' }).click();
  await expect(page.locator('#pf-title')).toContainText('Копия создана');
  await f.locator('input[name=images]').setInputFiles([file('c.png', [0, 0, 255])]);
  await page.locator('#pf-submit').click();
  await expect(page.locator('#pf-title')).toHaveText('Новый товар');
  const all = (await (await request.get('/api/products')).json()).filter(x => x.name === 'PHOTO TEST');
  expect(all).toHaveLength(2);
  const orig = all.find(x => x.id === p.id), copy = all.find(x => x.id !== p.id);
  expect(orig.images).toEqual(p.images);
  expect(copy.images).toHaveLength(1);
  for (const u of [...orig.images, ...copy.images]) expect((await request.get(u)).status()).toBe(200);

  // на сайте фото видно
  await page.goto('/#/p/' + p.id);
  await expect(page.locator('#gallery img')).toHaveCount(2);
  expect(await page.locator('#gallery img').first().evaluate(i => i.complete && i.naturalWidth)).toBe(8);

  await request.post('/api/login', { data: { password: 'e2e-pass' } });
  await request.post('/api/products/delete', { data: { ids: all.map(x => x.id) } });
});

base.test('ADM-PHOTO большой файл (>4 МБ) загружается', async ({ page, request }) => {
  const big = { name: 'big.png', mimeType: 'image/png', buffer: png(0, 0, 0, 1400, true) };
  expect(big.buffer.length).toBeGreaterThan(4 * 1024 * 1024);
  await page.goto('/admin');
  await page.getByLabel('Пароль').fill('e2e-pass');
  await page.getByRole('button', { name: 'Войти' }).click();
  const f = page.locator('#pf');
  await f.getByLabel('Название').fill('BIG PHOTO');
  await f.getByLabel('Бренд').fill('PHOTOBRAND');
  await f.getByLabel('Цена, ₽').fill('1000');
  await f.locator('input[name=images]').setInputFiles([big]);
  await page.locator('#pf-submit').click();
  await expect(page.locator('#list .row').filter({ hasText: 'BIG PHOTO' })).toHaveCount(1, { timeout: 30000 });
  const p = (await (await request.get('/api/products')).json()).find(x => x.name === 'BIG PHOTO');
  expect(p.images).toHaveLength(1);
  expect((await request.get(p.images[0])).status()).toBe(200);
  await request.post('/api/login', { data: { password: 'e2e-pass' } });
  await request.post('/api/products/delete', { data: { ids: [p.id] } });
});
