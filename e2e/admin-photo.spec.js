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
  await f.locator('input[name=images]').setInputFiles([file('a.png', [255, 0, 0])]);
  await f.locator('input[name=images]').setInputFiles([file('b.png', [0, 255, 0])]); // второе фото добавляется, а не заменяет
  await expect(page.locator('#pf-photos .pthumb')).toHaveCount(2);
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
  await expect(page.locator('#pf-photos .pthumb')).toHaveCount(2);
  await page.locator('#pf-photos [data-rm]').first().click();
  await page.locator('#pf-photos [data-rm]').first().click();
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

test('ADM-PHOTO порядок фото меняется стрелками', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Пароль').fill('e2e-pass');
  await page.getByRole('button', { name: 'Войти' }).click();
  const input = page.locator('#pf input[name=images]');
  await input.setInputFiles([file('a.png', [255, 0, 0]), file('b.png', [0, 255, 0]), file('c.png', [0, 0, 255])]);
  const srcs = () => page.locator('#pf-photos .pthumb img').evaluateAll(a => a.map(i => i.src));
  const before = await srcs();
  await page.locator('#pf-photos [data-mv="0"][data-d="1"]').click();
  expect(await srcs()).toEqual([before[1], before[0], before[2]]);
  await page.locator('#pf-photos [data-mv="2"][data-d="-1"]').click();
  expect(await srcs()).toEqual([before[1], before[2], before[0]]);
});

test('ST шаблон сетки в админке', async ({ page, request }) => {
  await page.goto('/admin');
  await page.getByLabel('Пароль').fill('e2e-pass');
  await page.getByRole('button', { name: 'Войти' }).click();
  const f = page.locator('#pf');
  await f.getByLabel('Название').fill('ST TPL');
  await f.getByLabel('Бренд').fill('STBRAND');
  await f.getByLabel('Цена, ₽').fill('100');
  await f.getByLabel('Шаблон размерной сетки').selectOption('Размер | Длина рукава | Длина');
  await f.locator('textarea[name=sizeTable]').fill('S|48|49\nM|50|51');
  await expect(page.locator('#st-preview th')).toHaveText(['Размер', 'Длина рукава', 'Длина']);
  await f.locator('input[name=images]').setInputFiles([file('a.png', [1, 2, 3])]);
  await page.locator('#pf-submit').click();
  await expect(page.locator('#list .row').filter({ hasText: 'ST TPL' })).toHaveCount(1);
  const p = (await (await request.get('/api/products')).json()).find(x => x.name === 'ST TPL');
  await page.goto('/#/p/' + p.id);
  await page.getByRole('button', { name: 'Размерная сетка' }).click();
  await expect(page.locator('#p-st tbody tr')).toHaveCount(2);
  await expect(page.locator('#p-st tbody tr').first().locator('td')).toHaveText(['S', '48', '49']);
  await request.post('/api/login', { data: { password: 'e2e-pass' } });
  await request.delete('/api/products/' + p.id);
});

test('BULK массовое добавление: папка с подпапками и отдельные фото', async ({ page, request }, info) => {
  test.skip(info.project.name === 'mobile');
  const fs = require('fs'), os = require('os'), path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulk-'));
  for (const [name, n] of [['BULK ONE', 2], ['BULK TWO', 1]]) {
    fs.mkdirSync(path.join(dir, 'drop', name), { recursive: true });
    for (let i = 1; i <= n; i++) fs.writeFileSync(path.join(dir, 'drop', name, `${i}.png`), png(i * 40, 0, 0));
  }
  await page.goto('/admin');
  await page.getByLabel('Пароль').fill('e2e-pass');
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByRole('button', { name: 'Массово' }).click();
  await page.locator('#bulk-dir').setInputFiles(path.join(dir, 'drop'));
  await page.locator('#bulk-files').setInputFiles([file('BULK_THREE.png', [9, 9, 9])]);
  await expect(page.locator('#bulk-list .brow')).toHaveCount(3);
  const c = page.locator('#bulk-common');
  await c.getByLabel('Бренд').fill('BULKBRAND');
  await c.getByLabel('Цена, ₽ по умолчанию').fill('2500');
  await c.getByLabel('Категория одежды').selectOption('Худи');
  await page.locator('#bulk-list input[data-k=price]').nth(1).fill('3000');
  await page.locator('#bulk-go').click();
  await expect(page.locator('#bulk-err')).toHaveText('Готово: создано 3', { timeout: 20000 });
  const made = (await (await request.get('/api/products')).json()).filter(p => p.brand === 'BULKBRAND');
  expect(made.map(p => p.name).sort()).toEqual(['BULK ONE', 'BULK THREE', 'BULK TWO']);
  expect(made.find(p => p.name === 'BULK ONE').images).toHaveLength(2);
  expect(made.find(p => p.name === 'BULK TWO').price).toBe(3000);
  expect(made.every(p => p.kinds[0] === 'Худи')).toBe(true);
  await request.post('/api/login', { data: { password: 'e2e-pass' } });
  await request.post('/api/products/delete', { data: { ids: made.map(p => p.id) } });
});

test('XL шаблон Excel: скачивание и импорт с папкой фото', async ({ page, request }, info) => {
  test.skip(info.project.name === 'mobile');
  const XLSX = require('xlsx'), fs = require('fs'), os = require('os'), path = require('path');
  await page.goto('/admin');
  await page.getByLabel('Пароль').fill('e2e-pass');
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByRole('button', { name: 'Массово' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#xl-template').click()]);
  const tpl = XLSX.readFile(await dl.path());
  expect(tpl.SheetNames).toEqual(['Товары', 'Подсказки']);
  const head = XLSX.utils.sheet_to_json(tpl.Sheets['Товары'], { header: 1 })[0];
  // заполняем таблицу как пользователь
  const rows = [head,
    ['f1', 'XL ONE', 'XLBRAND', 4100, 'S, M', 'BLACK', 'Худи, Куртки', 'худи', '0,9', '20 дней', 'Описание', 1, 'S|48|49; M|50|51', 'нет', ''],
    ['', 'XL TWO', 'XLBRAND', 1900, '', '', 'Футболки', 'футболки', '', '', '', '', '', 'да', ''],
  ];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Товары');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xl-'));
  XLSX.writeFile(wb, path.join(dir, 't.xlsx'));
  fs.mkdirSync(path.join(dir, 'photos', 'f1'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'photos', 'XL TWO'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'photos', 'f1', '1.png'), png(10, 10, 10));
  fs.writeFileSync(path.join(dir, 'photos', 'f1', '2.png'), png(20, 20, 20));
  fs.writeFileSync(path.join(dir, 'photos', 'XL TWO', 'a.png'), png(30, 30, 30));
  await page.locator('#xl-file').setInputFiles(path.join(dir, 't.xlsx'));
  await expect(page.locator('#bulk-list .brow')).toHaveCount(2);
  await page.locator('#bulk-dir').setInputFiles(path.join(dir, 'photos'));
  await expect(page.locator('#bulk-list .brow').first()).toContainText('2 фото');
  await page.locator('#bulk-go').click();
  await expect(page.locator('#bulk-err')).toHaveText('Готово: создано 2', { timeout: 20000 });
  const made = (await (await request.get('/api/products')).json()).filter(p => p.brand === 'XLBRAND');
  const one = made.find(p => p.name === 'XL ONE'), two = made.find(p => p.name === 'XL TWO');
  expect(one).toMatchObject({ price: 4100, sizes: ['S', 'M'], color: 'BLACK', kinds: ['Худи', 'Куртки'], cat: 'l', weight: 0.9, eta: '20 дней', sizeHead: 'Размер | Длина рукава | Длина', sizeTable: 'S|48|49\nM|50|51', soldOut: false });
  expect(one.images).toHaveLength(2);
  expect(two).toMatchObject({ price: 1900, kinds: ['Футболки'], cat: 'm', soldOut: true });
  expect(two.images).toHaveLength(1);
  const all = await (await request.get('/api/products?fresh')).json();
  expect(new Set(made.map(p => p.id)).size).toBe(2);
  await request.post('/api/login', { data: { password: 'e2e-pass' } });
  await request.post('/api/products/delete', { data: { ids: made.map(p => p.id) } });
});
