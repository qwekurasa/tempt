const { test, expect, a11y } = require('./fixtures');

test.describe.configure({ mode: 'serial' });
let id;

test.beforeAll(async ({ request }) => {
  await request.post('/api/login', { data: { password: 'e2e-pass' } });
  const p = await (await request.post('/api/products', {
    data: { name: 'GALLERY TEST', brand: 'GALBRAND', price: 1000, sizes: 'M', images: ['/demo/tee.svg', '/demo/pant.svg', '/demo/hoodie.svg'] },
  })).json();
  id = p.id;
});
test.afterAll(async ({ request }) => {
  await request.post('/api/login', { data: { password: 'e2e-pass' } });
  await request.delete('/api/products/' + id);
});

test('GAL стрелки листают фото', async ({ page }) => {
  await page.goto('/#/p/' + id);
  const prev = page.getByRole('button', { name: 'Предыдущее фото' }).first();
  const next = page.getByRole('button', { name: 'Следующее фото' }).first();
  await expect(prev).toBeDisabled();
  await next.click();
  await expect(page.getByRole('button', { name: 'Фото 2' })).toHaveClass(/on/);
  await next.click();
  await expect(next).toBeDisabled();
  await prev.click();
  await expect(page.getByRole('button', { name: 'Фото 2' })).toHaveClass(/on/);
});

test('GAL фото открывается на весь экран, листается и закрывается', async ({ page }) => {
  await page.goto('/#/p/' + id);
  await page.locator('#gallery img').first().click();
  const lb = page.getByRole('dialog', { name: 'Просмотр фото' });
  await expect(lb).toBeVisible();
  await expect(page.locator('#lb-count')).toHaveText('1 / 3');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#lb-count')).toHaveText('2 / 3');
  await lb.getByRole('button', { name: 'Следующее фото' }).click();
  await expect(page.locator('#lb-count')).toHaveText('3 / 3');
  await a11y(page);
  await page.keyboard.press('Escape');
  await expect(lb).toBeHidden();
  await expect(page.getByRole('button', { name: 'Фото 3' })).toHaveClass(/on/);
});

test('GAL одно фото — стрелок нет', async ({ page }) => {
  await page.goto('/#/p/demo-tee-1');
  await expect(page.getByRole('button', { name: 'Следующее фото' }).first()).toBeHidden();
});
