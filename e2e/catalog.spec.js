const { test, expect, a11y } = require('./fixtures');

const items = page => page.locator('#grid .item');

test('F01-H1 каталог показывает все товары', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /HOODIE 01/ })).toBeVisible();
  await expect(items(page)).toHaveCount(12);
  await a11y(page);
});

test('NAV вкладки О проекте / Доставка / Форум', async ({ page }, info) => {
  const mobile = info.project.name === 'mobile';
  const open = async () => { if (mobile) await page.getByRole('button', { name: 'Меню' }).click(); };
  await page.goto('/');
  await open();
  await expect(page.getByRole('img', { name: 'TEMPT' }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Доставка' }).click();
  await expect(page.getByRole('heading', { name: 'Доставка в Россию и Беларусь' })).toBeVisible();
  if (mobile) await expect(page.getByRole('link', { name: 'О проекте' })).toBeHidden();
  await expect(page.getByText('Авто быстрое: от 1 кг | 6.2 $/кг')).toBeVisible();
  await a11y(page);
  await open();
  await page.getByRole('link', { name: 'О проекте' }).click();
  await expect(page.getByRole('heading', { name: 'О проекте' })).toBeVisible();
  await page.getByRole('link', { name: 'Форум' }).first().isVisible() || await open();
  await page.locator('#top .logo').click();
  await expect(page.locator('#grid .item')).toHaveCount(12);
});

test('F01-E1 ссылка #/b/BRAND открывает бренд', async ({ page }) => {
  await page.goto('/#/b/BRAND%20C');
  await expect(items(page)).toHaveCount(4);
});

test('F01-E2 несуществующий товар ведёт в каталог', async ({ page }) => {
  await page.goto('/#/p/nope');
  await expect(page).toHaveURL(/#\/$/);
  await expect(items(page)).toHaveCount(12);
});

test('F01-H5 фильтры слева: бренд + размер, сброс', async ({ page }, info) => {
  await page.goto('/');
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Фильтры' }).click();
  await page.getByRole('checkbox', { name: 'BRAND B' }).check();
  await expect(page.locator('#count')).toHaveText('4 товара');
  await page.getByRole('checkbox', { name: 'XL', exact: true }).check();
  await expect(page.locator('#count')).toHaveText('3 товара');
  await page.getByRole('button', { name: 'Сбросить' }).click();
  await expect(page.locator('#count')).toHaveText('12 товаров');
});

test('F01-H6 сортировка по цене', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Дешевле' }).click();
  await expect(page.locator('#grid .item').first()).toContainText('5 900 ₽');
  await page.getByRole('button', { name: 'Дороже' }).click();
  await expect(page.locator('#grid .item').first()).toContainText('18 900 ₽');
});

test('CAT категория одежды: фильтр в каталоге', async ({ page, request }, info) => {
  test.skip(info.project.name === 'mobile');
  await request.post('/api/login', { data: { password: 'e2e-pass' } });
  const p = await (await request.post('/api/products', { data: { name: 'TYPE TEST', brand: 'TYPEBRAND', price: 10, kinds: ['Ветровки', 'Куртки'] } })).json();
  expect(p.kinds).toEqual(['Ветровки', 'Куртки']);
  await page.goto('/');
  await page.locator('#filters').getByLabel('Ветровки').check();
  await expect(page.locator('#grid .item')).toHaveCount(1);
  await expect(page.locator('#grid .item')).toContainText('TYPE TEST');
  await page.locator('#filters').getByLabel('Ветровки').uncheck();
  await page.locator('#filters').getByLabel('Куртки').check();
  await expect(page.locator('#grid .item')).toContainText('TYPE TEST');
  await request.delete('/api/products/' + p.id);
});
