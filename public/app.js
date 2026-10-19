const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rub = n => n.toLocaleString('ru-RU') + ' ₽';
const img = src => (src ? `<img src="${esc(src)}" alt="" loading="lazy">` : '');
const store = (k, v) => { try { return v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch {} };

let products = [];
let brand = '';
let current = null;
let homeScroll = 0;
let dense = store('dense') !== '0';
let cart = [];
try { cart = JSON.parse(store('cart')) || []; } catch {}

const saveCart = () => store('cart', JSON.stringify(cart));

function view(name) {
  const wasProduct = document.body.dataset.view === 'product';
  ['home', 'product', 'cartpage'].forEach(id => ($('#' + id).hidden = id !== name));
  document.body.dataset.view = name;
  document.body.classList.toggle('co', name === 'cartpage');
  return wasProduct;
}

// --- каталог ---
function renderBrands() {
  const list = [...new Set(products.map(p => p.brand))].sort();
  $('#brands').innerHTML = ['', ...list]
    .map(b => `<a href="${b ? '#/b/' + encodeURIComponent(b) : '#/'}"${b === brand ? ' class="on" aria-current="page"' : ''}>${esc(b || 'Все')}</a>`)
    .join('');
}

function renderGrid() {
  const list = brand ? products.filter(p => p.brand === brand) : products;
  $('#grid').classList.toggle('large', !dense);
  $('#density').textContent = dense ? '+' : '−';
  $('#grid').innerHTML = list.length
    ? list.map(p => `<a class="item${p.soldOut ? ' out' : ''}" href="#/p/${encodeURIComponent(p.id)}"><div class="img">${img(p.images[0])}</div><div class="cap">${esc(p.name)}${p.soldOut ? '<br>Нет в наличии' : ''}</div></a>`).join('')
    : '<p class="empty">Ничего не найдено</p>';
}

function showHome() {
  const fromProduct = view('home');
  document.title = brand ? `${brand} — TEMPT` : 'TEMPT';
  renderBrands();
  renderGrid();
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
  $('#p-status').textContent = current.soldOut ? 'Нет в наличии' : current.eta ? `Срок доставки: ${current.eta}` : '';
  $('#sizes').innerHTML = current.sizes.map(s => `<button data-s="${esc(s)}">${esc(s)}</button>`).join('');
  $('#buy-title').textContent = 'Выберите размер';
  $('#p-info').textContent = [
    current.description,
    '',
    'Бренд: ' + current.brand,
    current.color && 'Цвет: ' + current.color,
    current.sizes.length && 'Размеры: ' + current.sizes.join(', '),
    current.eta && 'Срок доставки: ' + current.eta,
    'Доставка до пункта выдачи Ozon, Яндекс или СДЭК. Статус заказа пришлём в Telegram.',
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
  const b = /^#\/b\/(.+)$/.exec(location.hash);
  brand = b && products.some(p => p.brand === decodeURIComponent(b[1])) ? decodeURIComponent(b[1]) : '';
  showHome();
}

// --- события ---
$('#density').onclick = () => {
  dense = !dense;
  store('dense', dense ? '1' : '0');
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
  products = await (await fetch('/api/products')).json();
  cart = cart.filter(l => products.some(p => p.id === l.id));
  saveCart();
  renderCart();
  route();
})();
