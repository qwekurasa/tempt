const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { put, del } = require('@vercel/blob');
const seed = require('./data/products.json');

const { PORT = 3000, ADMIN_PASSWORD, BOT_TOKEN, CHAT_ID, PAYMENT_DETAILS } = process.env;

const S = v => (typeof v === 'string' ? v.trim() : '');
const rub = n => n.toLocaleString('ru-RU') + ' ₽';

// --- storage (Vercel Blob) ---
const isBlob = u => /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//.test(u);
const isImage = u => typeof u === 'string' && (isBlob(u) || /^\/demo\/[\w-]+\.svg$/.test(u));
const removeImages = urls => {
  const b = urls.filter(isBlob);
  return b.length ? del(b) : null;
};

// Каталог читается по прямому URL через CDN (кэш до 60 с); fresh — в обход кэша, для админки и изменений.
const blobHost = () => {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return token && `https://${token.split('_')[3].toLowerCase()}.public.blob.vercel-storage.com`;
};
async function load(fresh) {
  const host = blobHost();
  if (!host) return structuredClone(seed);
  const r = await fetch(`${host}/products.json${fresh ? '?t=' + Date.now() : ''}`, { cache: 'no-store' });
  if (r.status === 404) return structuredClone(seed);
  if (!r.ok) throw new Error('products: ' + r.status);
  return r.json();
}
const save = items =>
  put('products.json', JSON.stringify(items), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });

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
let botName;
const botUsername = async () => (botName ||= (await tg('getMe')).username);

// Шаблон сообщения клиенту после нажатия Start в боте
const orderText = o => `Здравствуйте, ${o.name}!

У вас оформлен заказ #${o.id}:

${o.lines.join('\n')}

Итого к оплате: ${rub(o.total)}

Реквизиты для оплаты:
${PAYMENT_DETAILS || 'менеджер пришлёт их отдельно'}

После оплаты пришлите, пожалуйста, скриншот чека в этот чат.`;

const loadOrder = async id => {
  const r = blobHost() && (await fetch(`${blobHost()}/orders/${id}.json?t=${Date.now()}`, { cache: 'no-store' }));
  return r && r.ok ? r.json() : null;
};
const saveOrder = order =>
  put(`orders/${order.id}.json`, JSON.stringify(order), { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });

// Команды владельца в чате CHAT_ID: /status ID текст, /msg CHAT текст
async function onOwnerMessage(msg) {
  const reply = text => tg('sendMessage', { chat_id: msg.chat.id, text });
  const st = /^\/status(?:@\w+)?\s+#?([0-9A-Fa-f]{12})\s+([\s\S]+)$/.exec(msg.text || '');
  if (st) {
    const order = await loadOrder(st[1].toUpperCase());
    if (!order) return reply('Заказ не найден.');
    if (!order.chat) return reply(`Клиент @${order.tg} ещё не открыл бота — статус отправить некуда.`);
    await tg('sendMessage', { chat_id: order.chat, text: `Заказ #${order.id}: ${st[2].trim()}` });
    return reply(`Отправлено @${order.tg}.`);
  }
  const dm = /^\/msg(?:@\w+)?\s+(-?\d+)\s+([\s\S]+)$/.exec(msg.text || '');
  if (dm) {
    await tg('sendMessage', { chat_id: dm[1], text: dm[2].trim() });
    return reply('Отправлено.');
  }
  if ((msg.text || '').startsWith('/')) {
    return reply('Команды:\n/status ID текст — статус заказа клиенту\n/msg ЧАТ текст — ответ клиенту (номер чата приходит вместе с его сообщением)');
  }
}

async function onBotMessage(msg) {
  const chat_id = msg.chat.id;
  const m = /^\/start(?:\s+([0-9A-F]{12}))?$/.exec(msg.text || '');
  if (!m) {
    await tg('sendMessage', { chat_id: CHAT_ID, text: `💬 @${msg.from.username || 'без ника'} · чат ${chat_id}\nОтветить: /msg ${chat_id} текст` });
    return tg('forwardMessage', { chat_id: CHAT_ID, from_chat_id: chat_id, message_id: msg.message_id });
  }
  if (!m[1]) return tg('sendMessage', { chat_id, text: 'Здравствуйте! Оформите заказ на сайте — после оформления здесь появятся состав заказа и реквизиты для оплаты.' });
  const order = await loadOrder(m[1]);
  if (!order) return tg('sendMessage', { chat_id, text: 'Заказ не найден.' });
  if ((msg.from.username || '').toLowerCase() !== order.tg.toLowerCase()) {
    return tg('sendMessage', { chat_id, text: `Заказ оформлен на другой Telegram-ник. Откройте бота с аккаунта @${order.tg}.` });
  }
  await tg('sendMessage', { chat_id, text: orderText(order) });
  if (order.chat !== chat_id) await saveOrder({ ...order, chat: chat_id });
  await tg('sendMessage', { chat_id: CHAT_ID, text: `Клиент @${order.tg} получил реквизиты по заказу #${order.id}\nСтатус: /status ${order.id} текст` });
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

function productFields(b) {
  const p = {
    name: S(b.name).slice(0, 120),
    brand: S(b.brand).toUpperCase().slice(0, 60),
    color: S(b.color).toUpperCase().slice(0, 60),
    price: Math.round(Number(b.price)),
    sizes: S(b.sizes).split(',').map(s => s.trim().slice(0, 20)).filter(Boolean).slice(0, 30),
    description: S(b.description).slice(0, 5000),
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
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.get('/api/products', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await load(isAdmin(req) && 'fresh' in req.query));
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
  const items = await load(true);
  const product = { id: crypto.randomUUID(), ...p, createdAt: Date.now() };
  items.unshift(product);
  await save(items);
  res.json(product);
});

app.put('/api/products/:id', auth, async (req, res) => {
  const items = await load(true);
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
  const items = await load(true);
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
  const name = S(b.name), nick = S(b.tg).replace(/^@/, ''), phone = S(b.phone), address = S(b.address);
  const service = SERVICES[b.service];
  if (name.length < 3 || name.length > 150) return res.status(400).json({ error: 'Укажите ФИО' });
  if (!/^[A-Za-z0-9_]{5,32}$/.test(nick)) return res.status(400).json({ error: 'Некорректный Telegram ник' });
  if (!/^\+?[\d\s()-]{10,20}$/.test(phone)) return res.status(400).json({ error: 'Некорректный номер телефона' });
  if (!service) return res.status(400).json({ error: 'Выберите службу доставки' });
  if (address.length < 5 || address.length > 300) return res.status(400).json({ error: 'Укажите адрес пункта выдачи' });
  if (b.consent !== 'on') return res.status(400).json({ error: 'Нужно согласие на обработку персональных данных' });

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
    if (p.soldOut) return res.status(400).json({ error: `Товар закончился: ${p.name}` });
    total += p.price * qty;
    lines.push(`${lines.length + 1}. ${p.brand} — ${p.name}${size ? ' · ' + size : ''} × ${qty} = ${rub(p.price * qty)}${p.eta ? `, срок ${p.eta}` : ''}`);
  }
  if (!lines.length) return res.status(400).json({ error: 'Корзина пуста' });
  if (!BOT_TOKEN || !CHAT_ID) return res.status(500).json({ error: 'Приём заказов не настроен' });

  const id = crypto.randomBytes(6).toString('hex').toUpperCase();
  const text = [
    `🛒 Заказ #${id}`,
    '',
    ...lines,
    '',
    `Итого: ${rub(total)}`,
    '',
    `ФИО: ${name}`,
    `Telegram: @${nick}`,
    `Телефон: ${phone}`,
    `Доставка: ${service}`,
    `Адрес ПВЗ: ${address}`,
  ].join('\n');

  try {
    await tg('sendMessage', { chat_id: CHAT_ID, text });
  } catch (e) {
    console.error('Telegram:', e.message);
    return res.status(502).json({ error: 'Не удалось отправить заказ, попробуйте позже' });
  }
  let bot = null;
  if (blobHost()) {
    try {
      await saveOrder({ id, name, tg: nick, lines, total });
      bot = await botUsername();
    } catch (e) {
      console.error('order save:', e.message);
    }
  }
  res.json({ ok: true, id, bot });
});

app.post('/api/tg-webhook', async (req, res) => {
  if (!sameHash(S(req.get('X-Telegram-Bot-Api-Secret-Token')), sign('webhook'))) return res.sendStatus(403);
  const msg = req.body.message;
  try {
    if (msg && String(msg.chat.id) === String(CHAT_ID)) await onOwnerMessage(msg);
    else if (msg && msg.chat.type === 'private') await onBotMessage(msg);
  } catch (e) {
    console.error('webhook:', e.message);
  }
  res.sendStatus(200);
});

app.post('/api/tg-setup', auth, async (req, res) => {
  if (!BOT_TOKEN || !CHAT_ID) return res.status(400).json({ error: 'Не заданы BOT_TOKEN и CHAT_ID' });
  await tg('setWebhook', { url: `https://${req.get('host')}/api/tg-webhook`, secret_token: sign('webhook'), allowed_updates: ['message'] });
  res.json({ ok: true, bot: await botUsername() });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status === 413 ? 413 : 500).json({ error: err.status === 413 ? 'Файл слишком большой' : 'Ошибка сервера' });
});

module.exports = app;
if (require.main === module) app.listen(PORT, () => console.log(`tempt: http://localhost:${PORT}`));
