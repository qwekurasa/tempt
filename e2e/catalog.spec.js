const { test, expect, a11y } = require('./fixtures');

const items = page => page.locator('#grid .item');

test('F01-H1 каталог показывает все товары', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /HOODIE 01/ })).toBeVisible();
  await expect(items(page)).toHaveCount(12);
  await a11y(page);
});

test('F01-H2 бренды в шапке', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'BRAND B', exact: true }).click();
  await expect(items(page)).toHaveCount(4);
  await expect(page.getByRole('link', { name: 'BRAND B', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'Все', exact: true }).click();
  await expect(items(page)).toHaveCount(12);
});

test('F04 плотность сетки переключается и запоминается', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Изменить размер сетки' }).click();
  await expect(page.locator('#grid')).toHaveClass(/large/);
  await page.reload();
  await expect(page.locator('#grid')).toHaveClass(/large/);
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
  await expect(page.getByRole('link', { name: 'BRAND B', exact: true })).toHaveAttribute('aria-current', 'page');
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

test('F01-E8 бренд из шапки отмечается в фильтрах, «Все» снимает', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'BRAND C', exact: true }).click();
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Фильтры' }).click();
  await expect(page.getByRole('checkbox', { name: 'BRAND C' })).toBeChecked();
  await page.getByRole('link', { name: 'Все', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'BRAND C' })).not.toBeChecked();
  await expect(page.locator('#count')).toHaveText('12 товаров');
});
