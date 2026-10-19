const { test, expect } = require('@playwright/test');

test.describe('ADM дубликат', () => {

  test('ADM-H2 дублирование копирует всё; удаление оригинала не трогает общие фото', async ({ page, request }) => {
    await request.post('/api/login', { data: { password: 'e2e-pass' } });
    const img = 'https://teststore.public.blob.vercel-storage.com/images/dup-test.webp';
    const orig = await (await request.post('/api/products', {
      data: { name: 'DUP TEST', brand: 'DUPBRAND', color: 'black', price: 1234, sizes: 'S, M', weight: 1.5, eta: '10 дней', description: 'описание', images: [img] },
    })).json();

    await page.goto('/admin');
    await page.getByLabel('Пароль').fill('e2e-pass');
    await page.getByRole('button', { name: 'Войти' }).click();
    const rows = page.locator('.row').filter({ hasText: 'DUP TEST' });
    await expect(rows).toHaveCount(1);
    await rows.getByRole('button', { name: 'Дублировать' }).click();
    await expect(rows).toHaveCount(2);

    const list = (await (await request.get('/api/products')).json()).filter(p => p.name === 'DUP TEST');
    const copy = list.find(p => p.id !== orig.id);
    for (const k of ['brand', 'color', 'price', 'sizes', 'weight', 'eta', 'description', 'images', 'soldOut']) expect(copy[k]).toEqual(orig[k]);

    expect((await request.delete('/api/products/' + orig.id)).status()).toBe(200);
    expect((await request.delete('/api/products/' + copy.id)).status()).toBe(200);
  });
});
