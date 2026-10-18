const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rub = n => n.toLocaleString('ru-RU') + ' ₽';
const img = src => (src ? `<img src="${esc(src)}" alt="" loading="lazy">` : '');

let products = [];
let brand = '';
let current = null;
let size = '';
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

function renderNav() {
  const brands = [...new Set(products.map(p => p.brand))].sort();
  $('#brands').innerHTML = ['', ...brands]
    .map(b => `<button data-b="${esc(b)}" class="${b === brand ? 'on' : ''}">${esc(b || 'Все')}</button>`)
    .join('');
}

function renderGrid() {
  const list = brand ? products.filter(p => p.brand === brand) : products;
  $('#grid').innerHTML = list.length
    ? list.map(p => `<button class="item" data-id="${esc(p.id)}"><div class="ph">${img(p.images[0])}</div><div class="meta"><span>${esc(p.name)}</span><span class="mute">${rub(p.price)}</span></div></button>`).join('')
    : '<p class="empty">Нет товаров</p>';
}

function renderAdd() {
  const need = current.sizes.length && !size;
  $('#add').disabled = need;
  $('#add').textContent = need ? 'Выберите размер' : 'Добавить в корзину';
}

function openProduct(id) {
  current = products.find(p => p.id === id);
  size = '';
  $('#gallery').innerHTML = current.images.map(img).join('');
  $('#p-brand').textContent = current.brand;
  $('#p-name').textContent = current.name;
  $('#p-price').textContent = rub(current.price);
  $('#p-desc').textContent = current.description;
  $('#sizes').innerHTML = current.sizes.map(s => `<button data-s="${esc(s)}">${esc(s)}</button>`).join('');
  $('#sizes').hidden = !current.sizes.length;
  renderAdd();
  show('#modal');
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

$('#brands').onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  brand = b.dataset.b;
  history.replaceState(null, '', brand ? '#' + encodeURIComponent(brand) : location.pathname);
  renderNav();
  renderGrid();
};
$('#grid').onclick = e => {
  const b = e.target.closest('.item');
  if (b) openProduct(b.dataset.id);
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
  hide();
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
$('#modal').onclick = e => { if (e.target === e.currentTarget) hide(); };
document.querySelectorAll('[data-close]').forEach(b => (b.onclick = hide));
document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });

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
  const b = decodeURIComponent(location.hash.slice(1));
  brand = products.some(p => p.brand === b) ? b : '';
  renderNav();
  renderGrid();
  renderCart();
})();
