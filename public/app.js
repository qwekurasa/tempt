const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rub = n => n.toLocaleString('ru-RU') + ' ₽';
const rubUsd = n => rub(n) + (settings.usd > 0 ? ' · $' + Math.round(n / settings.usd).toLocaleString('ru-RU') : '');
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
  ['home', 'product', 'cartpage', 'about', 'delivery', 'forum'].forEach(id => ($('#' + id).hidden = id !== name));
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
const qitem = (p, qty = 1) => ({ price: p.price, qty, weight: p.weight, cat: p.cat });

function renderDelivery() {
  const st = Shipping.settings(settings);
  document.querySelectorAll('#delivery [data-t]').forEach(el => (el.textContent = st[el.dataset.t]));
  $('#cats').innerHTML = Object.entries(Shipping.CATS).map(([k, label]) => `<li>${esc(label)}: ${st['cat_' + k]} ¥</li>`).join('');
  $('#rates').textContent = st.cny && st.usd ? `Курс: 1 ¥ = ${st.cny} ₽ · 1 $ = ${st.usd} ₽` : 'Курс уточняйте в Telegram';
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
let size = null;
function setBuy(open) {
  $('#buy-closed').hidden = open;
  $('#buy-open').hidden = !open;
  size = current.sizes.length ? null : '';
  $('#sizes').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', 'false'));
  $('#buy-title').textContent = current.sizes.length ? 'Выберите размер' : 'Добавить в корзину';
  $('#add').disabled = size === null;
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
  $('#lightbox').hidden = true;
  $('#dots').innerHTML = current.images.length > 1 ? current.images.map((_, i) => `<button data-i="${i}" aria-label="Фото ${i + 1}" class="${i ? '' : 'on'}"></button>`).join('') : '';
  updateArrows(0);
  $('#p-name').textContent = current.name;
  $('#p-price').textContent = $('#p-price2').textContent = rubUsd(current.price);
  $('#open').hidden = !!current.soldOut;
  const q = Shipping.quote([qitem(current)], settings);
  const ship = q.complete ? q.china + q.intl : null;
  $('#p-status').textContent = current.soldOut
    ? 'Нет в наличии'
    : ship ? `Примерная стоимость доставки до РФ: ~${rub(ship)}` : current.eta ? `Срок доставки: ${current.eta}` : '';
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
    ship && `Примерная доставка по Китаю: ~${rub(q.china)}`,
    ship && `Примерная доставка авто до РФ (18–25 дней): ~${rub(q.intl)}`,
    ship && `+ ${rub(q.tk)} за перекидку на ТК — один раз за заказ`,
  ].filter(x => x !== false && x !== undefined && x !== null).join('\n').trim();
  $('#p-info').hidden = true;
  $('#info-btn').setAttribute('aria-expanded', 'false');
  setBuy(false);
  scrollTo(0, 0);
}

// --- форум ---
let posts = null;
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const fmtDate = t => { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const linkify = t => esc(t).replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
const postProducts = ids => {
  const list = (ids || []).map(id => products.find(p => p.id === id)).filter(Boolean);
  return list.length ? `<div class="post-goods">${list.map(p => `<a href="#/p/${encodeURIComponent(p.id)}"><div class="img">${img(p.images[0])}</div><div>${esc(p.name)}</div><div class="mute">${p.soldOut ? 'Нет в наличии' : rubUsd(p.price)}</div></a>`).join('')}</div>` : '';
};
async function showForum() {
  view('forum');
  document.title = 'Форум — TEMPT';
  scrollTo(0, 0);
  if (!posts) {
    $('#posts').innerHTML = '<p class="empty">Загрузка…</p>';
    posts = await fetch('/api/posts').then(r => r.json()).catch(() => []);
  }
  $('#posts').innerHTML = posts.length ? posts.map(p => `<article class="post">
    <div class="post-date">${fmtDate(p.createdAt)}</div>
    ${p.images.length ? `<div class="post-imgs" tabindex="0" role="region" aria-label="Фото поста">${p.images.map(img).join('')}</div>${p.images.length > 1 ? `<div class="post-count">${p.images.length} фото · листайте</div>` : ''}` : ''}
    ${p.tag ? `<span class="post-tag">${esc(p.tag)}</span>` : ''}
    ${p.title ? `<h2>${esc(p.title)}</h2>` : ''}
    ${p.text ? `<div class="post-text">${linkify(p.text)}</div>` : ''}
    ${postProducts(p.products)}
  </article>`).join('') : '<p class="empty">Постов пока нет</p>';
}
$('#posts').onclick = e => {
  const im = e.target.closest('.post-imgs img');
  if (im) window.open(im.src, '_blank', 'noopener');
};

// --- галерея и просмотр фото ---
const galIndex = () => Math.round($('#gallery').scrollLeft / $('#gallery').clientWidth);
const galGo = (i, behavior = 'smooth') => $('#gallery').scrollTo({ left: i * $('#gallery').clientWidth, behavior });

function updateArrows(i) {
  const n = current.images.length;
  $('#g-prev').hidden = $('#g-next').hidden = n < 2;
  $('#g-prev').disabled = i <= 0;
  $('#g-next').disabled = i >= n - 1;
  $('#dots').querySelectorAll('button').forEach((d, j) => d.classList.toggle('on', i === j));
}

let lbIndex = 0;
function showLb(i) {
  const n = current.images.length;
  lbIndex = Math.max(0, Math.min(n - 1, i));
  $('#lb-img').src = current.images[lbIndex];
  $('#lb-count').textContent = n > 1 ? `${lbIndex + 1} / ${n}` : '';
  $('#lb-prev').hidden = $('#lb-next').hidden = n < 2;
  $('#lb-prev').disabled = lbIndex === 0;
  $('#lb-next').disabled = lbIndex === n - 1;
}
function openLb(i) {
  showLb(i);
  $('#lightbox').hidden = false;
  document.body.style.overflow = 'hidden';
  $('#lb-close').focus();
}
function closeLb() {
  $('#lightbox').hidden = true;
  document.body.style.overflow = '';
  galGo(lbIndex, 'instant');
}

// --- корзина ---
function renderCart() {
  const lines = cart.map(l => ({ ...l, p: products.find(p => p.id === l.id) }));
  const q = Shipping.quote(lines.map(l => qitem(l.p, l.qty)), settings);
  const count = cart.reduce((s, l) => s + l.qty, 0);
  $('#cart-count').textContent = count || '';
  document.querySelector('.bag').setAttribute('aria-label', `Корзина ${count}`);
  $('#cart-count2').textContent = count;
  $('#lines').innerHTML = lines.length
    ? lines.map((l, i) => `<div class="co-line"><div class="ph">${img(l.p.images[0])}</div><div><div>${esc(l.p.brand)} — ${esc(l.p.name)}</div><div class="mute">${[l.size && 'Размер ' + esc(l.size), l.p.eta && 'Срок ' + esc(l.p.eta)].filter(Boolean).join(' · ')}</div><div class="qty"><button type="button" data-i="${i}" data-d="-1">−</button>${l.qty}<button type="button" data-i="${i}" data-d="1">+</button></div></div><div class="co-sum-col">${rub(l.p.price * l.qty)}<div class="mute">+ ${q.lines[i].chinaCny} ¥${q.lines[i].china !== null ? ` ≈ ${rub(q.lines[i].china)}` : ''}</div></div></div>`).join('')
    : '<p class="co-empty">Корзина пуста<br><a class="co-link" href="#/">Перейти в каталог</a></p>';
  const or = v => (v === null ? '—' : rub(v));
  $('#subtotal').textContent = rub(q.goods);
  $('#ship-china').textContent = q.china === null ? (lines.length ? q.chinaCny + ' ¥' : '—') : rub(q.china);
  $('#ship-intl-label').textContent = q.weight ? `Авто до РФ, ~${q.weight} кг × ${q.rate} $` : 'Авто до РФ';
  $('#ship-intl').textContent = or(q.intl);
  $('#ship-tk').textContent = lines.length ? rub(q.tk) : '—';
  $('#total-label').textContent = q.complete ? 'Итого, примерно' : 'Итого без неизвестных частей';
  $('#total').textContent = rub(q.total);
  $('#ship-note').textContent = !lines.length ? '' : q.complete
    ? 'Доставка рассчитана примерно, по весу и курсу. Доставку по России посчитаем по приезду груза в РФ.'
    : 'Часть доставки посчитаем после оформления. Доставку по России — по приезду груза в РФ.';
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
  setMenu(false);
  if (!$('#lightbox').hidden) { $('#lightbox').hidden = true; document.body.style.overflow = ''; }
  const m = /^#\/p\/(.+)$/.exec(location.hash);
  if (m) return showProduct(decodeURIComponent(m[1]));
  if (location.hash === '#/cart') return showCart();
  if (location.hash === '#/forum') return showForum();
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
$('#sort').onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  sort = b.dataset.sort;
  $('#sort').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  renderGrid();
};
// меню на телефоне
const setMenu = open => {
  $('#top').classList.toggle('menu-open', open);
  $('#menu-btn').setAttribute('aria-expanded', String(open));
};
$('#menu-btn').onclick = () => setMenu(!$('#top').classList.contains('menu-open'));
document.addEventListener('click', e => {
  if (!e.target.closest('#top')) setMenu(false);
});
$('#grid').onclick = e => {
  if (e.target.closest('.item')) homeScroll = scrollY;
};
$('#gallery').onscroll = () => updateArrows(galIndex());
$('#dots').onclick = e => {
  const d = e.target.closest('button');
  if (d) galGo(Number(d.dataset.i));
};
$('#g-prev').onclick = () => galGo(galIndex() - 1);
$('#g-next').onclick = () => galGo(galIndex() + 1);
$('#gallery').onclick = e => {
  const im = e.target.closest('img');
  if (im) openLb([...$('#gallery').children].indexOf(im));
};
$('#lb-prev').onclick = () => showLb(lbIndex - 1);
$('#lb-next').onclick = () => showLb(lbIndex + 1);
$('#lb-close').onclick = closeLb;
$('#lightbox').onclick = e => {
  if (e.target.id === 'lightbox' || e.target.id === 'lb-img') closeLb();
};
let touchX = null;
$('#lightbox').addEventListener('touchstart', e => (touchX = e.touches[0].clientX), { passive: true });
$('#lightbox').addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 40) showLb(lbIndex + (dx < 0 ? 1 : -1));
});
document.addEventListener('keydown', e => {
  if (!$('#lightbox').hidden) {
    if (e.key === 'Escape') closeLb();
    if (e.key === 'ArrowLeft') showLb(lbIndex - 1);
    if (e.key === 'ArrowRight') showLb(lbIndex + 1);
  } else if (document.body.dataset.view === 'product' && !e.target.closest('input, textarea, select')) {
    if (e.key === 'ArrowLeft') galGo(galIndex() - 1);
    if (e.key === 'ArrowRight') galGo(galIndex() + 1);
  }
});
$('#open').onclick = () => setBuy(true);
$('#close').onclick = () => setBuy(false);
// выбор размера только отмечает его; в корзину — отдельной кнопкой
$('#sizes').onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  size = b.dataset.s;
  $('#sizes').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  $('#buy-title').textContent = 'Размер ' + size;
  $('#add').disabled = false;
};
$('#add').onclick = () => {
  if (size === null) return;
  addToCart(size);
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

$('#theme').onclick = () => {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  try { localStorage.theme = t; } catch {}
};
