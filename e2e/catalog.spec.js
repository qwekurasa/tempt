const { test, expect, a11y } = require('./fixtures');

test('F01-H1 каталог показывает товары', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /HOODIE 01/ })).toBeVisible();
  await expect(page.locator('#count')).toHaveText('12 товаров');
  await a11y(page);
});

test('F01-H2 фильтр по бренду, размеру и сброс', async ({ page, isMobile }, info) => {
  await page.goto('/');
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Фильтры' }).click();
  await page.getByRole('checkbox', { name: 'BRAND B' }).check();
  await expect(page.locator('#count')).toHaveText('4 товара');
  await page.getByRole('checkbox', { name: 'XL', exact: true }).check();
  await expect(page.locator('#count')).toHaveText('3 товара');
  await page.getByRole('button', { name: 'Сбросить' }).click();
  await expect(page.locator('#count')).toHaveText('12 товаров');
});

test('F01-H3 сортировка по цене', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox').selectOption('asc');
  await expect(page.getByRole('link').filter({ hasText: '₽' }).first()).toContainText('5 900 ₽');
  await page.getByRole('combobox').selectOption('desc');
  await expect(page.getByRole('link').filter({ hasText: '₽' }).first()).toContainText('18 900 ₽');
});

test('F01-E1 старая ссылка #/b/BRAND отмечает бренд', async ({ page }) => {
  await page.goto('/#/b/BRAND%20C');
  await expect(page.locator('#count')).toHaveText('4 товара');
});

test('F01-E2 несуществующий товар ведёт в каталог', async ({ page }) => {
  await page.goto('/#/p/nope');
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('#count')).toHaveText('12 товаров');
});
