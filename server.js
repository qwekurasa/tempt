const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { put } = require('@vercel/blob');
const { handleUpload } = require('@vercel/blob/client');
const seed = require('./data/products.json');
const Shipping = require('./public/shipping.js');

const { PORT = 3000, ADMIN_PASSWORD, BOT_TOKEN, CHAT_ID } = process.env;

const S = v => (typeof v === 'string' ? v.trim() : '');
const rub = n => n.toLocaleString('ru-RU') + ' ₽';

// --- storage (Vercel Blob) ---
const isBlob = u => /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//.test(u);
const isImage = u => typeof u === 'string' && (isBlob(u) || /^\/demo\/[\w-]+\.svg$/.test(u) || (!blobHost() && /^\/mem\/[\w-]+\.\w+$/.test(u)));
// Фото из хранилища не удаляются автоматически: так ни одна ошибка не сотрёт фото живого товара.
const removeImages = urls => {
  if (process.env.LOG_DELETES) console.log('DEL (skipped)', JSON.stringify(urls));
};

// Каталог читается по прямому URL через CDN (кэш до 60 с); fresh — в обход кэша, для админки и изменений.
const blobHost = () => {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return token && `https://${token.split('_')[3].toLowerCase()}.public.blob.vercel-storage.com`;
};
// Последняя запись этого экземпляра сервера: CDN хранилища может ещё отдавать старую версию,
// и запись поверх старого списка теряла бы товары/фото.
let lastSaved = null;
async function load(fresh) {
  const host = blobHost();
  if (!host) return structuredClone(memProducts);
  if (fresh && lastSaved && Date.now() - lastSaved.at < 120e3) return structuredClone(lastSaved.items);
  const r = await fetch(`${host}/products.json${fresh ? '?t=' + Date.now() : ''}`, { cache: 'no-store' });
  if (r.status === 404) return structuredClone(seed);
  if (!r.ok) throw new Error('products: ' + r.status);
  return r.json();
}
// Курсы и тарифы доставки, меняются в админке. Значения по умолчанию — public/shipping.js.
let memSettings = Shipping.settings({}); // без Blob (локально) — в памяти
async function loadSettings(fresh) {
  const host = blobHost();
  if (!host) return memSettings;
  const r = await fetch(`${host}/settings.json${fresh ? '?t=' + Date.now() : ''}`, { cache: 'no-store' });
  return Shipping.settings(r.ok ? await r.json() : {});
}
async function saveSettings(v) {
  if (!blobHost()) return (memSettings = v);
  await put('settings.json', JSON.stringify(v), { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60 });
  return v;
}

let memProducts = seed; // без Blob (локально, e2e) — в памяти
const save = items =>
  !blobHost() ? (memProducts = structuredClone(items)) : (lastSaved = { items: structuredClone(items), at: Date.now() }, put('products.json', JSON.stringify(items), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  }));

// --- Telegram ---
async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`${method}: ${j.description}`);
  return j.result;
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
  if (process.env.NO_RATE_LIMIT) return next(); // только для e2e
  const key = req.path + req.ip;
  const now = Date.now();
  const h = (hits.get(key) || []).filter(t => now - t < ms);
  if (h.length >= max) return res.status(429).json({ error: 'Слишком много попыток, попробуйте позже' });
  h.push(now);
  hits.set(key, h);
  next();
};

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/avif': '.avif' };

// Артикул: внутренний, покупателям не отдаётся. Пустой — назначается T0001, T0002…
const nextSku = items => 'T' + String(Math.max(0, ...items.map(x => +(/^T(\d+)$/.exec(x.sku || '') || [])[1] || 0)) + 1).padStart(4, '0');
function withSku(items, product, wanted) {
  if (wanted && items.some(x => x !== product && (x.sku || '').toUpperCase() === wanted)) return null;
  product.sku = wanted || product.sku || nextSku(items.filter(x => x !== product));
  return product;
}
function fillSkus(items) {
  let changed = false;
  for (const x of [...items].reverse()) if (!x.sku) { x.sku = nextSku(items); changed = true; }
  return changed;
}
const S_SKU = b => S(b.sku).toUpperCase().replace(/\s+/g, '').slice(0, 30);

function productFields(b) {
  const p = {
    name: S(b.name).slice(0, 120),
    brand: S(b.brand).toUpperCase().slice(0, 60),
    color: S(b.color).toUpperCase().slice(0, 60),
    cat: Shipping.cat(b.cat),
    kinds: [...new Set((Array.isArray(b.kinds) ? b.kinds : [b.type]).map(t => S(t).slice(0, 40)).filter(Boolean))].slice(0, 20),
    weight: Math.min(Math.max(Math.round(Number(b.weight) * 100) / 100 || 0, 0), 100),
    price: Math.round(Number(b.price)),
    sizes: S(b.sizes).split(',').map(s => s.trim().slice(0, 20)).filter(Boolean).slice(0, 30),
    description: S(b.description).slice(0, 5000),
    sizeTable: S(b.sizeTable).slice(0, 4000),
    soldOut: b.soldOut === true,
    eta: S(b.eta).slice(0, 40),
    images: Array.isArray(b.images) ? b.images.filter(isImage).slice(0, 10) : [],
  };
  return p.name && p.brand && p.price > 0 ? p : null;
}

// --- app ---
const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '100kb' }));
// html/css/js всегда перепроверяются (ETag), чтобы после деплоя не открывалась старая версия
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, file) => /\.(html|css|js)$/.test(file) && res.setHeader('Cache-Control', 'no-cache'),
}));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.get('/api/products', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const admin = isAdmin(req);
  const items = await load(admin && 'fresh' in req.query);
  if (admin) {
    if (fillSkus(items)) await save(items);
    return res.json(items);
  }
  res.json(items.map(({ sku, ...x }) => x));
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

app.get('/api/settings', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await loadSettings(isAdmin(req) && 'fresh' in req.query));
});
// записи в products/posts/settings — по одной, иначе параллельные запросы теряют изменения друг друга
let chain = Promise.resolve();
const serial = fn => (req, res) => {
  const run = chain.then(() => fn(req, res));
  chain = run.catch(() => {});
  return run;
};

app.put('/api/settings', auth, serial(async (req, res) => {
  const v = {};
  for (const k of Object.keys(Shipping.DEFAULTS)) {
    const n = Math.round(Number(req.body[k]) * 10000) / 10000;
    if (!(n > 0 && n < 100000)) return res.status(400).json({ error: 'Заполните все поля положительными числами' });
    v[k] = n;
  }
  const contact = S(req.body.contact).replace(/^@/, '');
  if (contact && !/^[A-Za-z0-9_]{5,32}$/.test(contact)) return res.status(400).json({ error: 'Некорректный Telegram для связи' });
  v.contact = contact;
  v.types = [...new Set((Array.isArray(req.body.types) ? req.body.types : []).map(t => S(t).slice(0, 40)).filter(Boolean))].slice(0, 200);
  if (!v.types.length) v.types = Shipping.TYPES;
  res.json(await saveSettings(v));
}));

app.post('/api/upload', auth, express.raw({ type: Object.keys(EXT), limit: '4mb' }), async (req, res) => {
  const type = req.headers['content-type'];
  if (!EXT[type] || !Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ error: 'Нужен файл JPG, PNG, WEBP или AVIF' });
  }
  const name = `${crypto.randomUUID()}${EXT[type]}`;
  if (!blobHost()) { // локально и в e2e — в памяти
    memImages.set(name, { type, body: req.body });
    return res.json({ url: '/mem/' + name });
  }
  const blob = await put('images/' + name, req.body, { access: 'public', contentType: type });
  res.json({ url: blob.url });
});
const memImages = new Map();
app.get('/mem/:f', (req, res) => {
  const f = memImages.get(req.params.f);
  if (!f) return res.sendStatus(404);
  res.type(f.type).send(f.body);
});

// Прямая загрузка фото из браузера в Blob — без сжатия и без лимита 4.5 МБ
app.post('/api/upload-token', auth, express.json(), async (req, res) => {
  try {
    res.json(await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async () => ({ allowedContentTypes: Object.keys(EXT), maximumSizeInBytes: 50 * 1024 * 1024, addRandomSuffix: true }),
      onUploadCompleted: async () => {},
    }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/products', auth, serial(async (req, res) => {
  const p = productFields(req.body);
  if (!p) return res.status(400).json({ error: 'Заполните название, бренд и цену' });
  const items = await load(true);
  const product = { id: crypto.randomUUID(), ...p, createdAt: Date.now() };
  fillSkus(items);
  if (!withSku(items, product, S_SKU(req.body))) return res.status(400).json({ error: 'Такой артикул уже есть' });
  items.unshift(product);
  await save(items);
  res.json(product);
}));

app.put('/api/products/:id', auth, serial(async (req, res) => {
  const items = await load(true);
  const product = items.find(x => x.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Товар не найден' });
  const p = productFields(req.body);
  if (!p) return res.status(400).json({ error: 'Заполните название, бренд и цену' });
  const removed = product.images.filter(u => !p.images.includes(u));
  fillSkus(items);
  if (!withSku(items, product, S_SKU(req.body))) return res.status(400).json({ error: 'Такой артикул уже есть' });
  Object.assign(product, p);
  await save(items);
  removeImages(removed.filter(u => !items.some(x => x.images.includes(u))));
  res.json(product);
}));

app.delete('/api/products/:id', auth, serial(async (req, res) => {
  const items = await load(true);
  const i = items.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Товар не найден' });
  const [product] = items.splice(i, 1);
  await save(items);
  removeImages(product.images.filter(u => !items.some(x => x.images.includes(u))));
  res.json({ ok: true });
}));

app.post('/api/products/delete', auth, serial(async (req, res) => {
  const ids = new Set(Array.isArray(req.body.ids) ? req.body.ids : []);
  const items = await load(true);
  const removed = items.filter(x => ids.has(x.id));
  if (!removed.length) return res.status(400).json({ error: 'Не выбрано ни одного товара' });
  const left = items.filter(x => !ids.has(x.id));
  await save(left);
  removeImages(removed.flatMap(p => p.images).filter(u => !left.some(x => x.images.includes(u))));
  res.json({ ok: true, removed: removed.length });
}));

// --- форум: посты с фото и текстом ---
let memPosts = []; // без Blob (локально, e2e) — в памяти
async function loadPosts(fresh) {
  const host = blobHost();
  if (!host) return structuredClone(memPosts);
  const r = await fetch(`${host}/posts.json${fresh ? '?t=' + Date.now() : ''}`, { cache: 'no-store' });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error('posts: ' + r.status);
  return r.json();
}
const savePosts = items =>
  !blobHost() ? (memPosts = structuredClone(items)) : put('posts.json', JSON.stringify(items), {
    access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60,
  });
function postFields(b) {
  const p = {
    title: S(b.title).slice(0, 160),
    text: S(b.text).slice(0, 8000),
    tag: S(b.tag).slice(0, 40),
    images: Array.isArray(b.images) ? b.images.filter(isImage).slice(0, 10) : [],
    products: Array.isArray(b.products) ? b.products.filter(x => typeof x === 'string' && x.length < 80).slice(0, 20) : [],
  };
  return p.title || p.text || p.images.length || p.products.length ? p : null;
}

app.get('/api/posts', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await loadPosts(isAdmin(req) && 'fresh' in req.query));
});
app.post('/api/posts', auth, serial(async (req, res) => {
  const p = postFields(req.body);
  if (!p) return res.status(400).json({ error: 'Добавьте текст, заголовок или фото' });
  const posts = await loadPosts(true);
  const post = { id: crypto.randomUUID(), ...p, createdAt: Date.now() };
  posts.unshift(post);
  await savePosts(posts);
  res.json(post);
}));
app.put('/api/posts/:id', auth, serial(async (req, res) => {
  const posts = await loadPosts(true);
  const post = posts.find(x => x.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Пост не найден' });
  const p = postFields(req.body);
  if (!p) return res.status(400).json({ error: 'Добавьте текст, заголовок или фото' });
  const removed = post.images.filter(u => !p.images.includes(u));
  Object.assign(post, p, { updatedAt: Date.now() });
  await savePosts(posts);
  removeImages(removed);
  res.json(post);
}));
app.delete('/api/posts/:id', auth, serial(async (req, res) => {
  const posts = await loadPosts(true);
  const i = posts.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Пост не найден' });
  const [post] = posts.splice(i, 1);
  await savePosts(posts);
  removeImages(post.images);
  res.json({ ok: true });
}));

const SERVICES = { ozon: 'Ozon', yandex: 'Яндекс', cdek: 'СДЭК' };

app.post('/api/order', limit(5, 10 * 60e3), async (req, res) => {
  const b = req.body;

  const products = await load();
  const items = Array.isArray(b.items) ? b.items.slice(0, 50) : [];
  const lines = [];
  const qitems = [];
  for (const it of items) {
    const p = products.find(x => x.id === it.id);
    const qty = Math.floor(Number(it.qty));
    const size = S(it.size);
    if (!p || !(qty >= 1 && qty <= 20) || (p.sizes.length ? !p.sizes.includes(size) : size)) {
      return res.status(400).json({ error: 'Корзина устарела, обновите страницу' });
    }
    if (p.soldOut) return res.status(400).json({ error: `Товар закончился: ${p.name}` });
    qitems.push({ price: p.price, qty, weight: p.weight, cat: p.cat });
    lines.push({ p, size, qty });
  }
  const q = Shipping.quote(qitems, await loadSettings());
  lines.forEach((l, i) => (lines[i] = `${i + 1}. ${l.p.sku ? `[${l.p.sku}] ` : ''}${l.p.brand} — ${l.p.name}${l.size ? ' · ' + l.size : ''} × ${l.qty} = ${rub(l.p.price * l.qty)} + ${q.lines[i].chinaCny} ¥ по Китаю${l.p.eta ? `, срок ${l.p.eta}` : ''}`));
  const or = (v, alt) => (v === null ? alt : rub(v));
  if (!lines.length) return res.status(400).json({ error: 'Корзина пуста' });
  if (!BOT_TOKEN || !CHAT_ID) return res.status(500).json({ error: 'Приём заказов не настроен' });

  const id = crypto.randomBytes(6).toString('hex').toUpperCase();
  const text = [
    `🛒 Заказ #${id}`,
    '',
    ...lines,
    '',
    `Товары: ${rub(q.goods)}`,
    `Доставка по Китаю: ${or(q.china, q.chinaCny + ' ¥')}`,
    `Авто до РФ (≈${q.weight || '?'} кг × ${q.rate} $): ${or(q.intl, 'не посчитано')}`,
    `Перекидка на ТК: ${rub(q.tk)}`,
    `Итого${q.complete ? ' (примерно)' : ' без неизвестных частей'}: ${rub(q.total)}`,
    '',
    'Покупатель напишет вам в Telegram с номером заказа.',
  ].join('\n');

  try {
    await tg('sendMessage', { chat_id: CHAT_ID, text });
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
