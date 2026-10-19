const { test, expect, a11y } = require('./fixtures');

test('FORUM пост из админки виден в ленте с датой, удаляется', async ({ page, request }, info) => {
  await request.post('/api/login', { data: { password: 'e2e-pass' } });
  expect((await request.post('/api/posts', { data: {} })).status()).toBe(400);
  const post = await (await request.post('/api/posts', {
    data: { title: 'Подборка худи', tag: 'Подборка', text: 'Пять худи на осень\nhttps://t.me/example', images: ['/demo/hoodie.svg', '/demo/tee.svg'] },
  })).json();

  await page.goto('/#/forum');
  const card = page.locator('.post').filter({ hasText: 'Подборка худи' });
  await expect(card.locator('.post-date')).toHaveText(/\d{1,2} [а-я]+ \d{4}/);
  await expect(card.locator('.post-imgs img')).toHaveCount(2);
  await expect(card.getByRole('link', { name: 'https://t.me/example' })).toBeVisible();
  await a11y(page);

  expect((await request.delete('/api/posts/' + post.id)).status()).toBe(200);
  expect((await page.request.post('/api/posts', { data: { title: 'x' } })).status()).toBe(401);
});
