const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { put, del, list } = require('@vercel/blob');
const seed = require('./data/products.json');

const { PORT = 3000, ADMIN_PASSWORD, BOT_TOKEN, CHAT_ID } = process.env;

const S = v => (typeof v === 'string' ? v.trim() : '');
const rub = n => n.toLocaleString('ru-RU') + ' ₽';

// --- storage (Vercel Blob) ---
const isBlob = u => /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//.test(u);
const isImage = u => typeof u === 'string' && (isBlob(u) || /^\/demo\/[\w-]+\.svg$/.test(u));
const removeImages = urls => {
  const b = urls.filter(isBlob);
  return b.length ? del(b) : null;
};

async function load() {
  const { blobs } = await list({ prefix: 'products/' });
  if (!blobs.length) return structuredClone(seed);
  const latest = blobs.reduce((a, b) => (a.uploadedAt > b.uploadedAt ? a : b));
  const r = await fetch(latest.url);
  if (!r.ok) throw new Error('products: ' + r.status);
  return r.json();
}
async function save(items) {
  const blob = await put('products/data.json', JSON.stringify(items), {
    access: 'public',
    addRandomSuffix: true,
    contentType: 'application/json',
  });
  const { blobs } = await list({ prefix: 'products/' });
  const old = blobs.filter(b => b.url !== blob.url).map(b => b.url);
  if (old.length) await del(old);
}

// --- auth ---
const SECRET = crypto.createHash('sha256').update('tempt:' + (ADMIN_PASSWORD || crypto.randomUUID())).digest();
const sign = v => crypto.createHmac('sha256', SECRET).update(v).digest('hex');
const sameHash = (a, b) =>
  crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest());

function isAdmin(req) {
  const m = /(?:^|;\s*)admin=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  return !!exp && !!sig && Number(exp) > Date.now() && sameHash(sig, sign(exp));
}
const auth = (req, res, next) => (isAdmin(req) ? next() : res.status(401).json({ error: 'Нужна авторизация' }));

const hits = new Map();
const limit = (max, ms) => (req, res, next) => {
  const key = req.path + req.ip;
  const now = Date.now();
  const h = (hits.get(key) || []).filter(t => now - t < ms);
  if (h.length >= max) return res.status(429).json({ error: 'Слишком много попыток, попробуйте позже' });
  h.push(now);
  hits.set(key, h);
  next();
};

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/avif': '.avif' };

function productFields(b) {
  const p = {
    name: S(b.name),
    brand: S(b.brand).toUpperCase(),
    price: Math.round(Number(b.price)),
    sizes: S(b.sizes).split(',').map(s => s.trim()).filter(Boolean),
    description: S(b.description),
    images: Array.isArray(b.images) ? b.images.filter(isImage).slice(0, 10) : [],
  };
  return p.name && p.brand && p.price > 0 ? p : null;
}

// --- app ---
const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.get('/api/products', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await load());
});

app.post('/api/login', limit(10, 15 * 60e3), (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(500).json({ error: 'ADMIN_PASSWORD не задан' });
  if (!sameHash(S(req.body.password), ADMIN_PASSWORD)) return res.status(401).json({ error: 'Неверный пароль' });
  const exp = String(Date.now() + 7 * 864e5);
  res.setHeader('Set-Cookie', `admin=${exp}.${sign(exp)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${req.secure ? '; Secure' : ''}`);
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/me', auth, (req, res) => res.json({ ok: true }));

app.post('/api/upload', auth, express.raw({ type: Object.keys(EXT), limit: '4mb' }), async (req, res) => {
  const type = req.headers['content-type'];
  if (!EXT[type] || !Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ error: 'Нужен файл JPG, PNG, WEBP или AVIF' });
  }
  const blob = await put(`images/${crypto.randomUUID()}${EXT[type]}`, req.body, { access: 'public', contentType: type });
  res.json({ url: blob.url });
});

app.post('/api/products', auth, async (req, res) => {
  const p = productFields(req.body);
  if (!p) return res.status(400).json({ error: 'Заполните название, бренд и цену' });
  const items = await load();
  const product = { id: crypto.randomUUID(), ...p, createdAt: Date.now() };
  items.unshift(product);
  await save(items);
  res.json(product);
});

app.put('/api/products/:id', auth, async (req, res) => {
  const items = await load();
  const product = items.find(x => x.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Товар не найден' });
  const p = productFields(req.body);
  if (!p) return res.status(400).json({ error: 'Заполните название, бренд и цену' });
  const removed = product.images.filter(u => !p.images.includes(u));
  Object.assign(product, p);
  await save(items);
  await removeImages(removed);
  res.json(product);
});

app.delete('/api/products/:id', auth, async (req, res) => {
  const items = await load();
  const i = items.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Товар не найден' });
  const [product] = items.splice(i, 1);
  await save(items);
  await removeImages(product.images);
  res.json({ ok: true });
});

const SERVICES = { ozon: 'Ozon', yandex: 'Яндекс', cdek: 'СДЭК' };

app.post('/api/order', limit(5, 10 * 60e3), async (req, res) => {
  const b = req.body;
  const name = S(b.name), tg = S(b.tg).replace(/^@/, ''), phone = S(b.phone), address = S(b.address);
  const service = SERVICES[b.service];
  if (name.length < 3 || name.length > 150) return res.status(400).json({ error: 'Укажите ФИО' });
  if (!/^[A-Za-z0-9_]{5,32}$/.test(tg)) return res.status(400).json({ error: 'Некорректный Telegram ник' });
  if (!/^\+?[\d\s()-]{10,20}$/.test(phone)) return res.status(400).json({ error: 'Некорректный номер телефона' });
  if (!service) return res.status(400).json({ error: 'Выберите службу доставки' });
  if (address.length < 5 || address.length > 300) return res.status(400).json({ error: 'Укажите адрес пункта выдачи' });

  const products = await load();
  const items = Array.isArray(b.items) ? b.items.slice(0, 50) : [];
  const lines = [];
  let total = 0;
  for (const it of items) {
    const p = products.find(x => x.id === it.id);
    const qty = Math.floor(Number(it.qty));
    const size = S(it.size);
    if (!p || !(qty >= 1 && qty <= 20) || (p.sizes.length ? !p.sizes.includes(size) : size)) {
      return res.status(400).json({ error: 'Корзина устарела, обновите страницу' });
    }
    total += p.price * qty;
    lines.push(`${lines.length + 1}. ${p.brand} — ${p.name}${size ? ' · ' + size : ''} × ${qty} = ${rub(p.price * qty)}`);
  }
  if (!lines.length) return res.status(400).json({ error: 'Корзина пуста' });
  if (!BOT_TOKEN || !CHAT_ID) return res.status(500).json({ error: 'Приём заказов не настроен' });

  const id = Date.now().toString(36).toUpperCase();
  const text = [
    `🛒 Заказ #${id}`,
    '',
    ...lines,
    '',
    `Итого: ${rub(total)}`,
    '',
    `ФИО: ${name}`,
    `Telegram: @${tg}`,
    `Телефон: ${phone}`,
    `Доставка: ${service}`,
    `Адрес ПВЗ: ${address}`,
  ].join('\n');

  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text }),
    });
    if (!r.ok) throw new Error(await r.text());
  } catch (e) {
    console.error('Telegram:', e.message);
    return res.status(502).json({ error: 'Не удалось отправить заказ, попробуйте позже' });
  }
  res.json({ ok: true, id });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status === 413 ? 413 : 500).json({ error: err.status === 413 ? 'Файл слишком большой' : 'Ошибка сервера' });
});

module.exports = app;
if (require.main === module) app.listen(PORT, () => console.log(`tempt: http://localhost:${PORT}`));
