const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rub = n => n.toLocaleString('ru-RU') + ' ₽';
const img = src => (src ? `<img src="${esc(src)}" alt="" loading="lazy">` : '');
const store = (k, v) => { try { return v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch {} };

let products = [];
const sel = { brand: new Set(), color: new Set(), size: new Set() };
let sort = 'new';
let current = null;
let homeScroll = 0;
let settings = {};
let cart = [];
try { cart = JSON.parse(store('cart')) || []; } catch {}

const saveCart = () => store('cart', JSON.stringify(cart));

function view(name) {
  const wasProduct = document.body.dataset.view === 'product';
  ['home', 'product', 'cartpage', 'about', 'delivery'].forEach(id => ($('#' + id).hidden = id !== name));
  document.querySelectorAll('#tabs a').forEach(a => {
    const on = a.dataset.tab === name;
    a.classList.toggle('on', on);
    on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  });
  document.body.dataset.view = name;
  document.body.classList.toggle('co', name === 'cartpage');
  return wasProduct;
}

// --- каталог ---
const uniq = arr => [...new Set(arr.filter(Boolean))];
const GROUPS = [
  ['brand', 'Бренды', () => uniq(products.map(p => p.brand)).sort()],
  ['color', 'Цвет', () => uniq(products.map(p => p.color)).sort()],
  ['size', 'Размер', () => uniq(products.flatMap(p => p.sizes))],
];
const oneBrand = () => (sel.brand.size === 1 ? [...sel.brand][0] : '');

// --- доставка ---
const round10 = n => Math.round(n / 10) * 10;
const range = ([a, b]) => `~${round10(a).toLocaleString('ru-RU')}–${rub(round10(b))}`;

// Примерная доставка до РФ: вес (не меньше 1 кг) × тариф $/кг × курс $ + сбор по Китаю (¥ за позицию)
function shipEstimate(kg, positions = 1) {
  const s = settings;
  if (!kg || !s.cny || !s.usd) return null;
  const w = Math.max(kg, 1);
  const fee = [s.chinaFeeMin * s.cny * positions, s.chinaFeeMax * s.cny * positions];
  const auto = w * (w >= 10 ? s.auto10 : s.auto1) * s.usd;
  const air = w * s.air * s.usd;
  return { auto: [auto + fee[0], auto + fee[1]], air: [air + fee[0], air + fee[1]] };
}

function renderDelivery() {
  document.querySelectorAll('#delivery [data-s]').forEach(el => (el.textContent = settings[el.dataset.s] ?? '—'));
  $('#rates').textContent = settings.cny && settings.usd
    ? `Курс: 1 ¥ = ${settings.cny} ₽ · 1 $ = ${settings.usd} ₽`
    : 'Курс уточняйте в Telegram';
}

function renderFilters() {
  $('#filters').innerHTML = '<div class="f-head"><span>Фильтры</span><button id="clear">Сбросить</button></div>' +
    GROUPS.map(([key, title, values]) => {
      const vals = values();
      return vals.length
        ? `<div class="f-group"><h4>${title}</h4>${vals.map(v => `<label><input type="checkbox" data-g="${key}" value="${esc(v)}"${sel[key].has(v) ? ' checked' : ''}>${esc(v)}</label>`).join('')}</div>`
        : '';
    }).join('');
}

function renderGrid() {
  const match = (key, v) => !sel[key].size || [].concat(v).some(x => sel[key].has(x));
  const list = products.filter(p => match('brand', p.brand) && match('color', p.color || '') && match('size', p.sizes));
  if (sort !== 'new') list.sort((a, b) => (sort === 'asc' ? a.price - b.price : b.price - a.price));
  const n = list.length;
  $('#count').textContent = `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'товар' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'товара' : 'товаров'}`;
  $('#grid').innerHTML = n
    ? list.map(p => `<a class="item${p.soldOut ? ' out' : ''}" href="#/p/${encodeURIComponent(p.id)}"><div class="img">${img(p.images[0])}</div><div class="cap">${esc(p.name)}<br>${p.soldOut ? 'Нет в наличии' : rub(p.price)}</div></a>`).join('')
    : '<p class="empty">Ничего не найдено</p>';
}

function refresh() {
  renderFilters();
  renderGrid();
}

function showHome() {
  const fromProduct = view('home');
  document.title = oneBrand() ? `${oneBrand()} — TEMPT` : 'TEMPT';
  refresh();
  scrollTo(0, fromProduct ? homeScroll : 0);
}

// --- товар ---
function setBuy(open) {
  $('#buy-closed').hidden = open;
  $('#buy-open').hidden = !open;
}

function addToCart(size) {
  const l = cart.find(l => l.id === current.id && l.size === size);
  l ? (l.qty = Math.min(20, l.qty + 1)) : cart.push({ id: current.id, size, qty: 1 });
  saveCart();
  renderCart();
  $('#p-status').innerHTML = `Добавлено${size ? ' · ' + esc(size) : ''} · <a href="#/cart">Корзина</a>`;
}

function showProduct(id) {
  current = products.find(p => p.id === id);
  if (!current) return (location.hash = '#/');
  view('product');
  document.title = `${current.name} — TEMPT`;
  $('#gallery').innerHTML = current.images.map(img).join('');
  $('#gallery').scrollLeft = 0;
  $('#dots').innerHTML = current.images.length > 1 ? current.images.map((_, i) => `<button data-i="${i}" aria-label="Фото ${i + 1}" class="${i ? '' : 'on'}"></button>`).join('') : '';
  $('#p-name').textContent = current.name;
  $('#p-price').textContent = $('#p-price2').textContent = rub(current.price);
  $('#open').hidden = !!current.soldOut;
  const ship = shipEstimate(current.weight);
  $('#p-status').textContent = current.soldOut
    ? 'Нет в наличии'
    : ship ? `Доставка до РФ: авто ${range(ship.auto)} · самолёт ${range(ship.air)}` : current.eta ? `Срок доставки: ${current.eta}` : '';
  $('#sizes').innerHTML = current.sizes.map(s => `<button data-s="${esc(s)}">${esc(s)}</button>`).join('');
  $('#buy-title').textContent = 'Выберите размер';
  $('#p-info').textContent = [
    current.description,
    '',
    'Бренд: ' + current.brand,
    current.color && 'Цвет: ' + current.color,
    current.sizes.length && 'Размеры: ' + current.sizes.join(', '),
    current.eta && 'Срок доставки: ' + current.eta,
    current.weight && `Примерный вес: ${current.weight} кг`,
    ship && `Доставка до РФ, авто (18–25 дней): ${range(ship.auto)}`,
    ship && `Доставка до РФ, самолёт (2–7 дней): ${range(ship.air)}`,
  ].filter(x => x !== false && x !== undefined && x !== null).join('\n').trim();
  $('#p-info').hidden = true;
  $('#info-btn').setAttribute('aria-expanded', 'false');
  setBuy(false);
  scrollTo(0, 0);
}

// --- корзина ---
function renderCart() {
  const lines = cart.map(l => ({ ...l, p: products.find(p => p.id === l.id) }));
  const total = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
  const count = cart.reduce((s, l) => s + l.qty, 0);
  $('#cart-count').textContent = count || '';
  document.querySelector('.bag').setAttribute('aria-label', `Корзина ${count}`);
  $('#cart-count2').textContent = count;
  $('#lines').innerHTML = lines.length
    ? lines.map((l, i) => `<div class="co-line"><div class="ph">${img(l.p.images[0])}</div><div><div>${esc(l.p.brand)} — ${esc(l.p.name)}</div><div class="mute">${[l.size && 'Размер ' + esc(l.size), l.p.eta && 'Срок ' + esc(l.p.eta)].filter(Boolean).join(' · ')}</div><div class="qty"><button type="button" data-i="${i}" data-d="-1">−</button>${l.qty}<button type="button" data-i="${i}" data-d="1">+</button></div></div><div>${rub(l.p.price * l.qty)}</div></div>`).join('')
    : '<p class="co-empty">Корзина пуста<br><a class="co-link" href="#/">Перейти в каталог</a></p>';
  $('#subtotal').textContent = $('#total').textContent = rub(total);
  const weight = lines.reduce((s, l) => s + (l.p.weight || 0) * l.qty, 0);
  const ship = lines.length && lines.every(l => l.p.weight) ? shipEstimate(weight, lines.length) : null;
  $('#ship-auto').textContent = ship ? range(ship.auto) : '—';
  $('#ship-air').textContent = ship ? range(ship.air) : '—';
  $('#ship-note').textContent = ship
    ? `Примерно, по весу ~${Math.round(weight * 10) / 10} кг. Точную сумму и доставку по России посчитаем по приезду груза.`
    : lines.length ? 'Стоимость доставки посчитаем после оформления.' : '';
  $('#submit').disabled = !lines.length;
}

function showCart() {
  view('cartpage');
  document.title = 'Корзина — TEMPT';
  $('#co-main').hidden = false;
  $('#done').hidden = true;
  renderCart();
  scrollTo(0, 0);
}

function route() {
  const m = /^#\/p\/(.+)$/.exec(location.hash);
  if (m) return showProduct(decodeURIComponent(m[1]));
  if (location.hash === '#/cart') return showCart();
  if (location.hash === '#/about' || location.hash === '#/delivery') {
    const page = location.hash.slice(2);
    view(page);
    document.title = (page === 'about' ? 'О проекте' : 'Доставка') + ' — TEMPT';
    if (page === 'delivery') renderDelivery();
    return scrollTo(0, 0);
  }
  const b = /^#\/b\/(.+)$/.exec(location.hash);
  if (b) sel.brand = new Set([decodeURIComponent(b[1])]);
  showHome();
}

// --- события ---
$('#filters').onchange = e => {
  const { g } = e.target.dataset;
  e.target.checked ? sel[g].add(e.target.value) : sel[g].delete(e.target.value);
  if (location.hash.startsWith('#/b/')) history.replaceState(null, '', '#/');
  renderGrid();
};
$('#filters').onclick = e => {
  if (e.target.id !== 'clear') return;
  Object.values(sel).forEach(s => s.clear());
  if (location.hash.startsWith('#/b/')) history.replaceState(null, '', '#/');
  refresh();
};
$('#filters-toggle').onclick = () => {
  const open = $('#filters').classList.toggle('shown');
  $('#filters-toggle').setAttribute('aria-expanded', String(open));
};
$('#sort').onchange = e => {
  sort = e.target.value;
  renderGrid();
};
$('#grid').onclick = e => {
  if (e.target.closest('.item')) homeScroll = scrollY;
};
$('#gallery').onscroll = () => {
  const g = $('#gallery');
  const i = Math.round(g.scrollLeft / g.clientWidth);
  $('#dots').querySelectorAll('button').forEach((d, j) => d.classList.toggle('on', i === j));
};
$('#dots').onclick = e => {
  const d = e.target.closest('button');
  if (d) $('#gallery').scrollTo({ left: d.dataset.i * $('#gallery').clientWidth, behavior: 'smooth' });
};
$('#open').onclick = () => (current.sizes.length ? setBuy(true) : addToCart(''));
$('#close').onclick = () => setBuy(false);
$('#sizes').onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  $('#sizes').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  $('#buy-title').textContent = 'Добавлено';
  addToCart(b.dataset.s);
};
$('#info-btn').onclick = () => {
  const open = $('#p-info').hidden;
  $('#p-info').hidden = !open;
  $('#info-btn').setAttribute('aria-expanded', String(open));
};
$('#lines').onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  const l = cart[b.dataset.i];
  l.qty = Math.min(20, l.qty + Number(b.dataset.d));
  if (l.qty < 1) cart.splice(b.dataset.i, 1);
  saveCart();
  renderCart();
};
$('#back').onclick = () => (history.length > 1 ? history.back() : (location.hash = '#/'));
addEventListener('hashchange', route);

$('#checkout').onsubmit = async e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  data.items = cart;
  $('#err').textContent = '';
  $('#submit').disabled = true;
  try {
    const r = await fetch('/api/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Ошибка отправки');
    cart = [];
    saveCart();
    renderCart();
    e.target.reset();
    $('#order-id').textContent = '#' + j.id;
    $('#bot-link').hidden = !j.bot;
    $('#done-text').textContent = j.bot
      ? 'Нажмите кнопку ниже и Start в боте — пришлём состав заказа и реквизиты для оплаты.'
      : 'Мы свяжемся с вами в Telegram и пришлём реквизиты для оплаты.';
    if (j.bot) $('#bot-link').href = `https://t.me/${encodeURIComponent(j.bot)}?start=${j.id}`;
    $('#co-main').hidden = true;
    $('#done').hidden = false;
    scrollTo(0, 0);
  } catch (err) {
    $('#err').textContent = err.message;
  } finally {
    $('#submit').disabled = !cart.length;
  }
};

(async () => {
  [products, settings] = await Promise.all([
    fetch('/api/products').then(r => r.json()),
    fetch('/api/settings').then(r => (r.ok ? r.json() : {})).catch(() => ({})),
  ]);
  cart = cart.filter(l => products.some(p => p.id === l.id));
  saveCart();
  renderCart();
  route();
})();
