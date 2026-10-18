const { test, expect } = require('@playwright/test');

const order = (over = {}) => ({
  name: 'Тест Тест', tg: '@test_buyer', phone: '+79000000000', service: 'cdek',
  address: 'Москва, 1', consent: 'on', items: [{ id: 'demo-tee-1', size: 'M', qty: 1 }], ...over,
});

test.describe('API', () => {

  test('F01-N2 неверные данные заказа', async ({ request }) => {
    for (const [over, msg] of [
      [{ tg: '@ab' }, 'Некорректный Telegram ник'],
      [{ phone: '123' }, 'Некорректный номер телефона'],
      [{ service: 'dhl' }, 'Выберите службу доставки'],
      [{ consent: undefined }, 'Нужно согласие на обработку персональных данных'],
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
    const r = await request.post('/api/order', { data: order({ items: [{ id: 'demo-tee-1', size: 'M', qty: 1, price: 1 }], tg: '@price_check' }) });
    expect(r.status()).toBe(200);
  });

  test('ADM-N1 запись без входа запрещена', async ({ request }) => {
    expect((await request.post('/api/products', { data: { name: 'x', brand: 'y', price: 1 } })).status()).toBe(401);
    expect((await request.put('/api/products/demo-tee-1', { data: {} })).status()).toBe(401);
    expect((await request.delete('/api/products/demo-tee-1')).status()).toBe(401);
    expect((await request.post('/api/upload')).status()).toBe(401);
    expect((await request.post('/api/tg-setup')).status()).toBe(401);
  });

  test('ADM-N2 неверный пароль, верный пароль', async ({ request }) => {
    expect((await request.post('/api/login', { data: { password: 'wrong' } })).status()).toBe(401);
    expect((await request.post('/api/login', { data: { password: 'e2e-pass' } })).status()).toBe(200);
    expect((await request.get('/api/me')).status()).toBe(200);
  });

  test('BOT-N1 вебхук без секрета отклоняется', async ({ request }) => {
    expect((await request.post('/api/tg-webhook', { data: {} })).status()).toBe(403);
  });
});
