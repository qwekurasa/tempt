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
