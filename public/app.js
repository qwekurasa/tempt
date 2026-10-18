const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rub = n => n.toLocaleString('ru-RU') + ' ₽';
const img = src => (src ? `<img src="${esc(src)}" alt="" loading="lazy">` : '');

let products = [];
const PER = 24;
const sel = { brand: new Set(), color: new Set(), size: new Set() };
let sort = 'new';
let page = 1;
let current = null;
let size = '';
let homeScroll = 0;
let cart = [];
try { cart = JSON.parse(localStorage.getItem('cart')) || []; } catch {}

const saveCart = () => localStorage.setItem('cart', JSON.stringify(cart));

function show(sel) {
  $(sel).classList.add('open');
  $('#overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function hide() {
  document.querySelectorAll('.open').forEach(el => el.classList.remove('open'));
  document.body.style.overflow = '';
}

const uniq = arr => [...new Set(arr.filter(Boolean))];
const GROUPS = [
  ['brand', 'Бренды', () => uniq(products.map(p => p.brand)).sort()],
  ['color', 'Цвет', () => uniq(products.map(p => p.color)).sort()],
  ['size', 'Размер', () => uniq(products.flatMap(p => p.sizes))],
];

function renderFilters() {
  $('#filters').innerHTML = '<div class="f-head"><span>Фильтры</span><button id="clear">Сбросить</button></div>' +
    GROUPS.map(([key, title, values]) => {
      const vals = values();
      return vals.length
        ? `<div class="f-group"><h4>${title}</h4>${vals.map(v => `<label><input type="checkbox" data-g="${key}" value="${esc(v)}"${sel[key].has(v) ? ' checked' : ''}>${esc(v)}</label>`).join('')}</div>`
        : '';
    }).join('');
}

function renderCards() {
  const match = (key, v) => !sel[key].size || [].concat(v).some(x => sel[key].has(x));
  const list = products.filter(p => match('brand', p.brand) && match('color', p.color || '') && match('size', p.sizes));
  if (sort !== 'new') list.sort((a, b) => (sort === 'asc' ? a.price - b.price : b.price - a.price));
  const pages = Math.max(1, Math.ceil(list.length / PER));
  page = Math.min(page, pages);
  $('#count').textContent = `${list.length} ${list.length % 10 === 1 && list.length % 100 !== 11 ? 'товар' : [2, 3, 4].includes(list.length % 10) && ![12, 13, 14].includes(list.length % 100) ? 'товара' : 'товаров'}`;
  $('#cards').innerHTML = list.length
    ? list.slice((page - 1) * PER, page * PER).map(p => `<a class="card" href="#/p/${encodeURIComponent(p.id)}"><div class="img">${img(p.images[0])}</div><div class="meta"><span>${esc(p.name)}</span><span>${rub(p.price)}</span></div></a>`).join('')
    : '<p class="empty">Ничего не найдено</p>';
  const nums = [...Array(pages).keys()].map(i => i + 1).filter(n => n === 1 || n === pages || Math.abs(n - page) <= 1);
  $('#pages').innerHTML = pages > 1
    ? `<button data-p="${page - 1}"${page === 1 ? ' disabled' : ''}>‹</button>` +
      nums.map((n, i) => (i && n - nums[i - 1] > 1 ? '<span>…</span>' : '') + `<button data-p="${n}" class="${n === page ? 'on' : ''}">${n}</button>`).join('') +
      `<button data-p="${page + 1}"${page === pages ? ' disabled' : ''}>›</button>`
    : '';
}

function showHome() {
  const fromProduct = !$('#product').hidden;
  $('#product').hidden = true;
  $('#home').hidden = false;
  document.body.classList.remove('soft');
  document.title = 'TEMPT';
  renderFilters();
  renderCards();
  scrollTo(0, fromProduct ? homeScroll : 0);
}

function renderAdd() {
  const need = current.sizes.length && !size;
  $('#add').disabled = need;
  $('#add').textContent = need ? 'Выберите размер' : 'В корзину';
}

function showProduct(id) {
  current = products.find(p => p.id === id);
  if (!current) return (location.hash = '#/');
  size = '';
  $('#home').hidden = true;
  $('#product').hidden = false;
  document.body.classList.add('soft');
  document.title = `${current.name} — TEMPT`;
  $('#gallery').innerHTML = current.images.map(img).join('');
  $('#gallery').scrollLeft = 0;
  $('#dots').innerHTML = current.images.length > 1 ? current.images.map((_, i) => `<button data-i="${i}" class="${i ? '' : 'on'}"></button>`).join('') : '';
  $('#p-title').innerHTML = `${esc(current.brand)} – ${esc(current.name)}${current.color ? '<br>' + esc(current.color) : ''}`;
  $('#p-overview').textContent = [
    'Бренд: ' + current.brand,
    current.color && 'Цвет: ' + current.color,
    current.sizes.length && 'Размеры: ' + current.sizes.join(', '),
  ].filter(Boolean).join('\n');
  $('#p-desc').textContent = current.description;
  $('#p-desc-sec').hidden = !current.description;
  $('#sizes').innerHTML = current.sizes.map(s => `<button data-s="${esc(s)}">${esc(s)}</button>`).join('');
  $('#sizes').hidden = !current.sizes.length;
  $('#p-price').textContent = rub(current.price);
  renderAdd();
  scrollTo(0, 0);
}

function route() {
  hide();
  const m = /^#\/p\/(.+)$/.exec(location.hash);
  if (m) return showProduct(decodeURIComponent(m[1]));
  const b = /^#\/b\/(.+)$/.exec(location.hash);
  if (b) sel.brand = new Set([decodeURIComponent(b[1])]);
  showHome();
}

function cartView(view) {
  $('#view-cart').hidden = $('#foot-cart').hidden = view !== 'cart';
  $('#checkout').hidden = view !== 'checkout';
  $('#done').hidden = view !== 'done';
  $('#cart-title').textContent = view === 'checkout' ? 'Оформление' : 'Корзина';
}

function renderCart() {
  const lines = cart.map(l => ({ ...l, p: products.find(p => p.id === l.id) }));
  const total = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
  $('#cart-count').textContent = cart.reduce((s, l) => s + l.qty, 0);
  $('#lines').innerHTML = lines.length
    ? lines.map((l, i) => `<div class="line"><div class="ph">${img(l.p.images[0])}</div><div><div>${esc(l.p.name)}</div><div class="mute">${esc(l.p.brand)}${l.size ? ' · ' + esc(l.size) : ''}</div><div class="qty"><button data-i="${i}" data-d="-1">−</button>${l.qty}<button data-i="${i}" data-d="1">+</button></div></div><div>${rub(l.p.price * l.qty)}</div></div>`).join('')
    : '<p class="mute">Корзина пуста</p>';
  $('#total').textContent = $('#total2').textContent = rub(total);
  $('#to-checkout').disabled = !lines.length;
}

$('#filters').onchange = e => {
  const { g } = e.target.dataset;
  e.target.checked ? sel[g].add(e.target.value) : sel[g].delete(e.target.value);
  page = 1;
  renderCards();
};
$('#filters').onclick = e => {
  if (e.target.id !== 'clear') return;
  Object.values(sel).forEach(s => s.clear());
  page = 1;
  renderFilters();
  renderCards();
};
$('#filters-toggle').onclick = () => $('#filters').classList.toggle('shown');
$('#sort').onchange = e => {
  sort = e.target.value;
  page = 1;
  renderCards();
};
$('#pages').onclick = e => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  page = Number(b.dataset.p);
  renderCards();
  scrollTo(0, 0);
};
$('#cards').onclick = e => {
  if (e.target.closest('.card')) homeScroll = scrollY;
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
$('#sizes').onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  size = b.dataset.s;
  $('#sizes').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  renderAdd();
};
$('#add').onclick = () => {
  const l = cart.find(l => l.id === current.id && l.size === size);
  l ? l.qty++ : cart.push({ id: current.id, size, qty: 1 });
  saveCart();
  renderCart();
  cartView('cart');
  show('#cart');
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
$('#open-cart').onclick = () => { cartView('cart'); show('#cart'); };
$('#to-checkout').onclick = () => cartView('checkout');
$('#back').onclick = () => cartView('cart');
$('#overlay').onclick = hide;
document.querySelectorAll('[data-close]').forEach(b => (b.onclick = hide));
document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
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
    cartView('done');
  } catch (err) {
    $('#err').textContent = err.message;
  } finally {
    $('#submit').disabled = false;
  }
};

(async () => {
  products = await (await fetch('/api/products')).json();
  cart = cart.filter(l => products.some(p => p.id === l.id));
  saveCart();
  renderCart();
  route();
})();
