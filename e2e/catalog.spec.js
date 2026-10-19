const { test, expect, a11y } = require('./fixtures');

const items = page => page.locator('#grid .item');

test('F01-H1 каталог показывает все товары', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /HOODIE 01/ })).toBeVisible();
  await expect(items(page)).toHaveCount(12);
  await a11y(page);
});

test('NAV вкладки О проекте / Доставка / Подборка', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Подборка' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'Доставка' }).click();
  await expect(page.getByRole('heading', { name: 'Доставка в Россию и Беларусь' })).toBeVisible();
  await expect(page.getByText('Авто быстрое: от 1 кг | 6.2 $/кг')).toBeVisible();
  await a11y(page);
  await page.getByRole('link', { name: 'О проекте' }).click();
  await expect(page.getByRole('heading', { name: 'О проекте' })).toBeVisible();
  await page.getByRole('link', { name: 'Подборка' }).click();
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
  await page.getByRole('combobox').selectOption('asc');
  await expect(page.locator('#grid .item').first()).toContainText('5 900 ₽');
  await page.getByRole('combobox').selectOption('desc');
  await expect(page.locator('#grid .item').first()).toContainText('18 900 ₽');
});
