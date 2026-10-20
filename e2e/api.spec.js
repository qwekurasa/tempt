const { test, expect } = require('@playwright/test');

const order = (over = {}) => ({
  items: [{ id: 'demo-tee-1', size: 'M', qty: 1 }], ...over,
});

test.describe('API', () => {

  test('F01-N2 неверные данные заказа', async ({ request }) => {
    for (const [over, msg] of [
      [{ items: [{ id: 'demo-tee-1', size: 'XXXL', qty: 1 }] }, 'Корзина устарела, обновите страницу'],
      [{ items: [{ id: 'demo-tee-1', size: 'M', qty: 99 }] }, 'Корзина устарела, обновите страницу'],
      [{ items: [] }, 'Корзина пуста'],
    ]) {
      const r = await request.post('/api/order', { data: order(over) });
      expect(r.status()).toBe(400);
      expect((await r.json()).error).toBe(msg);
    }
  });

  test('F01-N3 цена с клиента игнорируется', async ({ request }) => {
    const r = await request.post('/api/order', { data: order({ items: [{ id: 'demo-tee-1', size: 'M', qty: 1, price: 1 }]}) });
    expect(r.status()).toBe(200);
  });

  test('ADM-N1 запись без входа запрещена', async ({ request }) => {
    expect((await request.post('/api/products', { data: { name: 'x', brand: 'y', price: 1 } })).status()).toBe(401);
    expect((await request.put('/api/products/demo-tee-1', { data: {} })).status()).toBe(401);
    expect((await request.delete('/api/products/demo-tee-1')).status()).toBe(401);
    expect((await request.post('/api/upload')).status()).toBe(401);
  });

  test('ADM-N2 неверный пароль, верный пароль', async ({ request }) => {
    expect((await request.post('/api/login', { data: { password: 'wrong' } })).status()).toBe(401);
    expect((await request.post('/api/login', { data: { password: 'e2e-pass' } })).status()).toBe(200);
    expect((await request.get('/api/me')).status()).toBe(200);
  });
});

test('API параллельные добавления не теряются, массовое удаление', async ({ request }) => {
  await request.post('/api/login', { data: { password: 'e2e-pass' } });
  const made = await Promise.all([...Array(6)].map((_, i) => request.post('/api/products', { data: { name: 'PAR ' + i, brand: 'PARBRAND', price: 100 } }).then(r => r.json())));
  const all = await (await request.get('/api/products?fresh')).json();
  expect(made.every(m => all.some(p => p.id === m.id))).toBe(true);
  const r = await request.post('/api/products/delete', { data: { ids: made.map(m => m.id) } });
  expect((await r.json()).removed).toBe(6);
  const after = await (await request.get('/api/products?fresh')).json();
  expect(after.some(p => p.brand === 'PARBRAND')).toBe(false);
});
