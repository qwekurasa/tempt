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

// новые категории одежды из товара (например, из Excel) сразу попадают в общий список
async function addKinds(kinds) {
  if (!kinds || !kinds.length) return;
  const st = await loadSettings(true);
  const list = st.types && st.types.length ? st.types : Shipping.TYPES;
  const fresh = kinds.filter(k => !list.some(t => t.toLowerCase() === k.toLowerCase()));
  if (fresh.length) await saveSettings({ ...st, types: [...list, ...fresh] });
}

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
    color: S(b.color).toUpperCase().split(',').map(c => c.trim()).filter(Boolean).slice(0, 20).join(', ').slice(0, 300),
    cat: Shipping.cat(b.cat),
    kinds: [...new Set((Array.isArray(b.kinds) ? b.kinds : [b.type]).map(t => S(t).slice(0, 40)).filter(Boolean))].slice(0, 20),
    weight: Math.min(Math.max(Math.round(Number(b.weight) * 100) / 100 || 0, 0), 100),
    price: Math.round(Number(b.price)),
    sizes: S(b.sizes).split(',').map(s => s.trim().slice(0, 20)).filter(Boolean).slice(0, 30),
    description: S(b.description).slice(0, 5000),
    sizeTable: S(b.sizeTable).slice(0, 4000),
    sizeHead: S(b.sizeHead).slice(0, 300),
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
  v.sizeTemplates = (Array.isArray(req.body.sizeTemplates) ? req.body.sizeTemplates : []).map(t => S(t).slice(0, 300)).filter(Boolean).slice(0, 50);
  if (!v.sizeTemplates.length) v.sizeTemplates = Shipping.SIZE_TEMPLATES;
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
  await addKinds(product.kinds);
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
  await addKinds(product.kinds);
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

// --- импорт ассортимента с Yupoo (сервер забирает страницы и фото: браузеру мешают CORS и Referer) ---
const YUPOO = /^https:\/\/([a-z0-9-]+)\.x\.yupoo\.com\//i;
const unesc = t => t.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
async function yupooGet(url) {
  const m = YUPOO.exec(url);
  if (!m) throw Object.assign(new Error('Нужна ссылка вида https://имя.x.yupoo.com/...'), { status: 400 });
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', 'Accept-Language': 'ru,en;q=0.8', Referer: `https://${m[1]}.x.yupoo.com/` } });
  if (!r.ok) throw Object.assign(new Error('Yupoo ответил ' + r.status), { status: 502 });
  return { html: await r.text(), origin: `https://${m[1]}.x.yupoo.com` };
}
app.get('/api/yupoo/list', auth, async (req, res) => {
  try {
    const base = S(req.query.url).replace(/[?#].*$/, '');
    if (/\/albums\/\d+/.test(base)) return res.json({ albums: [{ url: base, title: '' }] });
    const albums = new Map();
    for (let page = 1; page <= 30; page++) {
      const { html, origin } = await yupooGet(`${base}?page=${page}`);
      const before = albums.size;
      for (const tag of html.match(/<a\b[^>]*class="album__main"[^>]*>/g) || []) {
        const href = /href="([^"]+)"/.exec(tag)?.[1], title = /title="([^"]*)"/.exec(tag)?.[1] || '';
        const id = /\/albums\/(\d+)/.exec(href || '')?.[1];
        if (id && !albums.has(id)) albums.set(id, { url: `${origin}/albums/${id}?uid=1`, title: unesc(title).trim() });
      }
      if (albums.size === before) break;
    }
    res.json({ albums: [...albums.values()] });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});
app.get('/api/yupoo/ping', async (req, res) => { // временная проверка доступа к Yupoo с Vercel
  try { const { html } = await yupooGet('https://noghost.x.yupoo.com/collections/5157086?page=1'); const img = await fetch('https://photo.yupoo.com/noghost/15e81d6f4a/a87119d8.jpeg', { headers: { Referer: 'https://noghost.x.yupoo.com/' } }); res.json({ albums: (html.match(/class="album__main"/g) || []).length, img: img.status, size: (await img.arrayBuffer()).byteLength }); } catch (e) { res.json({ error: e.message }); }
});
app.get('/api/yupoo/album', auth, async (req, res) => {
  try {
    const { html } = await yupooGet(S(req.query.url));
    const title = unesc((/class="showalbumheader__gallerytitle"[^>]*>([\s\S]*?)<\//.exec(html)?.[1] || '').replace(/<[^>]+>/g, '')).trim();
    const descHtml = /class="showalbumheader__gallerysubtitle[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] || '';
    const desc = unesc(descHtml.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
    const photos = [...new Set([...html.matchAll(/data-origin-src="(https:\/\/photo\.yupoo\.com\/[^"]+)"/g)].map(m => m[1]))];
    res.json({ title, desc, photos });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});
app.get('/api/yupoo/img', auth, async (req, res) => {
  const u = S(req.query.u);
  if (!/^https:\/\/photo\.yupoo\.com\//.test(u)) return res.status(400).end();
  const owner = /photo\.yupoo\.com\/([^/]+)\//.exec(u)[1];
  const get = url => fetch(url, { headers: { Referer: `https://${owner}.x.yupoo.com/`, 'User-Agent': 'Mozilla/5.0' } });
  let r = await get(u);
  if (!r.ok) return res.status(502).end();
  let buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 4.3 * 1024 * 1024) { // ответ функции Vercel ограничен 4.5 МБ — берём версию поменьше
    r = await get(u.replace(/\/[^/]+$/, '/big.jpg'));
    if (r.ok) buf = Buffer.from(await r.arrayBuffer());
  }
  res.set('Content-Type', r.headers.get('content-type') || 'image/jpeg');
  res.send(buf);
});

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
    const size = S(it.size), color = S(it.color);
    const colors = Shipping.colorsOf(p || {});
    if (!p || !(qty >= 1 && qty <= 20) || (p.sizes.length ? !p.sizes.includes(size) : size) || (colors.length > 1 ? !colors.includes(color) : color && !colors.includes(color))) {
      return res.status(400).json({ error: 'Корзина устарела, обновите страницу' });
    }
    if (p.soldOut) return res.status(400).json({ error: `Товар закончился: ${p.name}` });
    qitems.push({ price: p.price, qty, weight: p.weight, cat: p.cat });
    lines.push({ p, size, color: colors.length > 1 ? color : colors[0] || '', qty });
  }
  const q = Shipping.quote(qitems, await loadSettings());
  lines.forEach((l, i) => (lines[i] = `${i + 1}. ${l.p.sku ? `[${l.p.sku}] ` : ''}${l.p.brand} — ${l.p.name}${l.color ? ' · ' + l.color : ''}${l.size ? ' · ' + l.size : ''} × ${l.qty} = ${rub(l.p.price * l.qty)} + ${q.lines[i].chinaCny} ¥ по Китаю${l.p.eta ? `, срок ${l.p.eta}` : ''}`));
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
