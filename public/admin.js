const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rub = n => n.toLocaleString('ru-RU') + ' ₽';
const form = $('#pf');
let products = [];
// превью в админке — уменьшенные через оптимизатор Vercel, а не оригиналы
const thumb = u => (/\.public\.blob\.vercel-storage\.com\//.test(u) ? `/_vercel/image?url=${encodeURIComponent(u)}&w=384&q=70` : u);
// категории одежды: список из настроек + уже использованные
let types = Shipping.TYPES;
const kindsOf = p => p.kinds || (p.type ? [p.type] : []);
const checkedKinds = () => [...$('#type-select').querySelectorAll('input:checked')].map(i => i.value);
function renderTypes(current = []) {
  const list = [...new Set([...types, ...products.flatMap(kindsOf)])];
  const on = new Set(current);
  $('#type-select').innerHTML = list.map(t => `<label class="kind"><input type="checkbox" value="${esc(t)}"${on.has(t) ? ' checked' : ''}>${esc(t)}</label>`).join('');
}

// изменения каталога/постов/настроек отправляются строго по очереди, чтобы не перезаписать друг друга
let queue = Promise.resolve();
function api(url, opts = {}) {
  if (!/^\/api\/(products|posts|settings)/.test(url) || !opts.method) return request(url, opts);
  const run = queue.then(() => request(url, opts));
  queue = run.catch(() => {});
  return run;
}
async function request(url, opts) {
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/api/login') showLogin();
  if (!r.ok) throw new Error(j.error || 'Ошибка');
  return j;
}

function showLogin() {
  $('#panel').hidden = true;
  $('#login').hidden = false;
}

async function showPanel() {
  $('#login').hidden = true;
  $('#panel').hidden = false;
  const [list, rates] = await Promise.all([api('/api/products?fresh'), api('/api/settings?fresh')]);
  products = list;
  for (const [k, v] of Object.entries(rates)) if ($('#rates')[k] && k !== 'types' && k !== 'sizeTemplates') $('#rates')[k].value = v || '';
  heads = rates.sizeTemplates?.length ? rates.sizeTemplates : Shipping.SIZE_TEMPLATES;
  $('#rates').sizeTemplates.value = heads.join('\n');
  renderHeads(form.sizeHead.value || heads[0]);
  types = rates.types?.length ? rates.types : Shipping.TYPES;
  $('#rates').types.value = types.join('\n');
  renderList();
  renderTypes();
}

let flashId = null;
function renderList() {
  $('#count').textContent = products.length;
  $('#brand-list').innerHTML = [...new Set(products.map(p => p.brand))].map(b => `<option value="${esc(b)}">`).join('');
  renderRows();
}

const selected = new Set();
function updateBulk() {
  for (const id of selected) if (!products.some(p => p.id === id)) selected.delete(id);
  $('#bulk').hidden = !selected.size;
  $('#bulk-count').textContent = selected.size;
}
function renderRows() {
  const q = $('#search').value.trim().toUpperCase();
  const list = q ? products.filter(p => [p.sku, p.name, p.brand].some(v => (v || '').toUpperCase().includes(q))) : products;
  $('#list').innerHTML = list.length ? list.map(p => `
    <div class="row${p.id === flashId ? ' flash' : ''}" data-row="${esc(p.id)}">
      <input type="checkbox" class="sel" data-sel="${esc(p.id)}"${selected.has(p.id) ? ' checked' : ''} aria-label="Выбрать">
      <div class="ph">${p.images[0] ? `<img src="${esc(thumb(p.images[0]))}" alt="" loading="lazy">` : ''}</div>
      <div><div>${p.sku ? `<span class="mute">${esc(p.sku)}</span> · ` : ''}${esc(p.name)}</div><div class="mute">${kindsOf(p).length ? esc(kindsOf(p).join(', ')) + ' · ' : ''}${esc(p.brand)} · ${rub(p.price)}${p.sizes.length ? ' · ' + esc(p.sizes.join(', ')) : ''}${p.weight ? ' · ' + p.weight + ' кг' : ''}${p.soldOut ? ' · нет в наличии' : ''}</div></div>
      <div class="actions"><button data-edit="${esc(p.id)}">Изменить</button><button data-dup="${esc(p.id)}">Дублировать</button><button data-del="${esc(p.id)}">Удалить</button></div>
    </div>`).join('') : '<p class="mute" style="padding:16px 0">Ничего не найдено</p>';
  updateBulk();
}
$('#list').onchange = e => {
  const id = e.target.dataset.sel;
  if (!id) return;
  e.target.checked ? selected.add(id) : selected.delete(id);
  updateBulk();
};
$('#sel-all').onclick = () => {
  const ids = [...$('#list').querySelectorAll('[data-sel]')].map(x => x.dataset.sel);
  const all = ids.every(id => selected.has(id));
  ids.forEach(id => (all ? selected.delete(id) : selected.add(id)));
  renderRows();
};
$('#bulk-cancel').onclick = () => { selected.clear(); renderRows(); };
$('#bulk-del').onclick = async () => {
  const ids = [...selected];
  if (!confirm(`Удалить выбранные товары (${ids.length})?`)) return;
  const before = products.slice();
  products = products.filter(p => !selected.has(p.id));
  if (selected.has(form.id.value)) resetForm();
  selected.clear();
  renderList();
  try {
    await api('/api/products/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
  } catch (err) {
    products = before;
    renderList();
    alert('Не удалось удалить: ' + err.message);
  }
};

function resetForm() {
  form.reset();
  form.id.value = '';
  renderTypes();
  prodPhotos.set([]);
  $('#pf-title').textContent = 'Новый товар';
  $('#pf-submit').textContent = 'Добавить';
  $('#pf-cancel').hidden = true;
  $('#pf-err').textContent = '';
}

$('#login').onsubmit = async e => {
  e.preventDefault();
  try {
    await api('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: e.target.password.value }) });
    e.target.reset();
    showPanel();
  } catch (err) {
    $('#login-err').textContent = err.message;
  }
};

$('#logout').onclick = async () => {
  await api('/api/logout', { method: 'POST' });
  showLogin();
};

// Фото грузятся как есть, без сжатия: до 4 МБ через сервер, больше — напрямую в Blob
let blobClient;
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
// HEIC и прочие форматы — в JPEG в исходном разрешении
async function toJpeg(f, max = Infinity) {
  const bmp = await createImageBitmap(f);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
}
const viaServer = f => api('/api/upload', { method: 'POST', headers: { 'Content-Type': f.type }, body: f }).then(r => r.url);
// Обрезает пустые поля (прозрачные или белые) и делает квадрат с небольшим отступом,
// чтобы вещь занимала карточку целиком. Без пустых полей файл не трогаем.
async function autoSquare(f) {
  const bmp = await createImageBitmap(f);
  const W = bmp.width, H = bmp.height, k = Math.min(1, 600 / Math.max(W, H));
  const sw = Math.max(1, Math.round(W * k)), sh = Math.max(1, Math.round(H * k));
  const sc = document.createElement('canvas'); sc.width = sw; sc.height = sh;
  const sx = sc.getContext('2d', { willReadFrequently: true }); sx.drawImage(bmp, 0, 0, sw, sh);
  const d = sx.getImageData(0, 0, sw, sh).data;
  let x0 = sw, y0 = sh, x1 = -1, y1 = -1;
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const i = (y * sw + x) * 4;
    if (d[i + 3] > 16 && !(d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return f;
  const cw = (x1 - x0 + 1) / k, ch = (y1 - y0 + 1) / k;
  if (cw * ch > W * H * 0.8 && Math.abs(W - H) < 2) return f; // уже плотный квадрат
  const side = Math.round(Math.max(cw, ch) * 1.06);
  const png = f.type === 'image/png' || f.type === 'image/webp';
  const c = document.createElement('canvas'); c.width = c.height = side;
  const cx = c.getContext('2d');
  if (!png) { cx.fillStyle = '#fff'; cx.fillRect(0, 0, side, side); }
  cx.drawImage(bmp, x0 / k, y0 / k, cw, ch, (side - cw) / 2, (side - ch) / 2, cw, ch);
  return new Promise(r => c.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.95));
}
async function uploadImage(f) {
  if (!OK_TYPES.includes(f.type)) f = await toJpeg(f);
  try { f = await autoSquare(f); } catch (e) { console.warn('autoSquare', e); }
  if (f.size <= 4 * 1024 * 1024) return viaServer(f);
  try {
    blobClient ||= await import('/blob-client.js');
    return (await blobClient.upload('images/photo' + ({ 'image/png': '.png', 'image/webp': '.webp', 'image/avif': '.avif' }[f.type] || '.jpg'), f, { access: 'public', handleUploadUrl: '/api/upload-token', contentType: f.type })).url;
  } catch (e) {
    console.warn('Прямая загрузка не удалась', e);
    let j = await toJpeg(f);
    for (const max of [4000, 3200, 2560, 2048]) {
      if (j.size <= 4 * 1024 * 1024) break;
      j = await toJpeg(f, max);
    }
    return viaServer(j);
  }
}

// Фото добавляются по одному или пачкой и копятся; загрузка — при сохранении
function photoList(input, box) {
  let items = []; // { url } — уже загруженные, { file, src } — новые
  const render = () => {
    box.innerHTML = items.map((it, i) => `<div class="pthumb" draggable="true" data-i="${i}"><img src="${esc(it.src || thumb(it.url))}" alt="" draggable="false"><button type="button" data-rm="${i}" aria-label="Убрать фото">×</button>${i ? `<button type="button" data-first="${i}" aria-label="Сделать обложкой">★</button>` : '<span class="cover">обложка</span>'}<span class="pmove">${i ? `<button type="button" data-mv="${i}" data-d="-1" aria-label="Левее">‹</button>` : '<i></i>'}${i < items.length - 1 ? `<button type="button" data-mv="${i}" data-d="1" aria-label="Правее">›</button>` : ''}</span></div>`).join('');
  };
  input.required = false;
  input.onchange = () => {
    for (const file of input.files) if (items.length < 10) items.push({ file, src: URL.createObjectURL(file) });
    input.value = '';
    render();
  };
  box.onclick = e => {
    const { rm, first, mv, d } = e.target.dataset;
    if (mv !== undefined) { const j = +mv + +d; [items[+mv], items[j]] = [items[j], items[+mv]]; }
    if (rm !== undefined) items.splice(+rm, 1);
    if (first !== undefined) items.unshift(...items.splice(+first, 1));
    render();
  };
  // перетаскивание мышью
  let from = null;
  box.ondragstart = e => { from = +e.target.closest('.pthumb')?.dataset.i; };
  box.ondragover = e => e.preventDefault();
  box.ondrop = e => {
    e.preventDefault();
    const to = e.target.closest('.pthumb');
    if (from === null || !to) return;
    items.splice(+to.dataset.i, 0, ...items.splice(from, 1));
    from = null;
    render();
  };
  return {
    set: urls => { items = (urls || []).map(url => ({ url })); render(); },
    count: () => items.length,
    async upload(progress) {
      const todo = items.filter(it => it.file).length;
      let n = 0;
      const queue = items.filter(it => it.file);
      progress(`Загрузка фото 0/${todo}`);
      // по 3 файла параллельно
      await Promise.all([0, 1, 2].map(async () => {
        for (let it; (it = queue.shift()); ) {
          it.url = await uploadImage(it.file);
          delete it.file;
          progress(`Загрузка фото ${++n}/${todo}`);
        }
      }));
      return items.map(it => it.url);
    },
  };
}
const prodPhotos = photoList(form.images, $('#pf-photos'));

form.onsubmit = async e => {
  e.preventDefault();
  const id = form.id.value;
  const btn = $('#pf-submit');
  const label = btn.textContent;
  btn.disabled = true;
  $('#pf-err').textContent = '';
  try {
    if (!prodPhotos.count()) throw new Error('Добавьте хотя бы одно фото');
    const images = await prodPhotos.upload(t => (btn.textContent = t));
    btn.textContent = 'Сохранение…';
    const body = { name: form.name.value, brand: form.brand.value, sku: form.sku.value, color: form.color.value, cat: form.cat.value, kinds: checkedKinds(), weight: form.weight.value, eta: form.eta.value, soldOut: form.soldOut.checked, price: form.price.value, sizes: form.sizes.value, description: form.description.value, sizeTable: form.sizeTable.value, sizeHead: form.sizeHead.value, images };
    const saved = await api(id ? '/api/products/' + encodeURIComponent(id) : '/api/products', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    resetForm();
    const i = products.findIndex(p => p.id === saved.id);
    i >= 0 ? (products[i] = saved) : products.unshift(saved);
    flashId = saved.id;
    renderList();
  } catch (err) {
    $('#pf-err').textContent = err.message;
    btn.textContent = label;
  } finally {
    btn.disabled = false;
  }
};

$('#pf-cancel').onclick = resetForm;
$('#search').oninput = renderRows;

$('#cat-select').innerHTML = Object.entries(Shipping.CATS).map(([k, l]) => `<option value="${k}"${k === 'm' ? ' selected' : ''}>${esc(l)}</option>`).join('');
$('#cat-fees').innerHTML = Object.entries(Shipping.CATS).map(([k, l]) => `<label>${esc(l)}<input name="cat_${k}" type="number" min="0.01" step="0.01" required></label>`).join('');
$('#admin-tabs').onclick = e => {
  const t = e.target.dataset.tab;
  if (!t) return;
  $('#products-tab').hidden = t !== 'products';
  $('#forum-tab').hidden = t !== 'forum';
  if (t === 'forum') { loadPosts(); renderPick(); }
  $('#rates').hidden = t !== 'settings';
  $('#admin-tabs').querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.target));
};

$('#rates').onsubmit = async e => {
  e.preventDefault();
  const f = e.target;
  $('#rates-err').textContent = '';
  $('#rates-submit').disabled = true;
  try {
    const body = Object.fromEntries([...Object.keys(Shipping.DEFAULTS), 'contact'].map(k => [k, f[k].value]));
    body.types = f.types.value.split('\n').map(t => t.trim()).filter(Boolean);
    body.sizeTemplates = f.sizeTemplates.value.split('\n').map(t => t.trim()).filter(Boolean);
    heads = body.sizeTemplates.length ? body.sizeTemplates : Shipping.SIZE_TEMPLATES;
    renderHeads(form.sizeHead.value);
    types = body.types.length ? body.types : Shipping.TYPES;
    renderTypes(checkedKinds());
    await api('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    $('#rates-submit').textContent = 'Сохранено ✓';
    setTimeout(() => ($('#rates-submit').textContent = 'Сохранить настройки'), 1500);
  } catch (err) {
    $('#rates-err').textContent = err.message;
  } finally {
    $('#rates-submit').disabled = false;
  }
};


function fillForm(p) {
  form.id.value = p.id;
  form.name.value = p.name;
  form.brand.value = p.brand;
  form.color.value = p.color || '';
  form.sku.value = p.sku || '';
  form.weight.value = p.weight || '';
  form.cat.value = Shipping.cat(p.cat);
  renderTypes(kindsOf(p));
  form.eta.value = p.eta || '';
  form.soldOut.checked = !!p.soldOut;
  form.price.value = p.price;
  form.sizes.value = p.sizes.join(', ');
  form.description.value = p.description;
  form.sizeTable.value = p.sizeTable || '';
  renderHeads(p.sizeHead || '');
  previewSizes();
  prodPhotos.set(p.images);
  $('#pf-submit').textContent = 'Сохранить';
  $('#pf-cancel').hidden = false;
  $('#pf-err').textContent = '';
  scrollTo({ top: 0, behavior: 'smooth' });
}

$('#list').onclick = async e => {
  const { edit, del, dup } = e.target.dataset;
  if (edit) {
    fillForm(products.find(x => x.id === edit));
    $('#pf-title').textContent = 'Редактирование';
  }
  if (dup) {
    const p = products.find(x => x.id === dup);
    e.target.disabled = true;
    e.target.textContent = 'Копирую…';
    try {
      const copy = await api('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...p, sku: '', sizes: p.sizes.join(', ') }),
      });
      products.unshift(copy);
      flashId = copy.id;
      renderList();
      fillForm(copy);
      $('#pf-title').textContent = `Копия создана · ${copy.sku} — можно изменить`;
    } catch (err) {
      alert(err.message);
      e.target.disabled = false;
      e.target.textContent = 'Дублировать';
    }
  }
  if (del && confirm('Удалить товар?')) {
    // сразу убираем из списка; при ошибке возвращаем
    const i = products.findIndex(x => x.id === del);
    const [removed] = products.splice(i, 1);
    renderList();
    if (form.id.value === del) resetForm();
    try {
      await api('/api/products/' + encodeURIComponent(del), { method: 'DELETE' });
    } catch (err) {
      products.splice(i, 0, removed);
      renderList();
      alert('Не удалось удалить: ' + err.message);
    }
  }
};

// --- форум ---
const pf = $('#postf');
const postPhotos = photoList(pf.images, $('#post-photos'));
let posts = [];
const postDate = t => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
async function loadPosts() {
  posts = await api('/api/posts?fresh');
  renderPosts();
}
function renderPosts() {
  $('#post-count').textContent = posts.length;
  $('#post-list').innerHTML = posts.map(p => `
    <div class="row">
      <div class="ph">${p.images[0] ? `<img src="${esc(thumb(p.images[0]))}" alt="" loading="lazy">` : ''}</div>
      <div><div>${esc(p.title || (p.text || '').slice(0, 60) || 'Без текста')}</div><div class="mute">${postDate(p.createdAt)}${p.tag ? ' · ' + esc(p.tag) : ''} · ${p.images.length} фото</div></div>
      <div class="actions"><button data-pedit="${esc(p.id)}">Изменить</button><button data-pdel="${esc(p.id)}">Удалить</button></div>
    </div>`).join('') || '<p class="mute" style="padding:16px 0">Постов пока нет</p>';
}
function resetPost() {
  pick = new Set(); $('#pick-search').value = ''; renderPick();
  pf.reset();
  pf.id.value = '';
  $('#post-title').textContent = 'Новый пост';
  $('#post-submit').textContent = 'Опубликовать';
  $('#post-cancel').hidden = true;
  postPhotos.set([]);
  $('#post-err').textContent = '';
}
let pick = new Set();
function renderPick() {
  const q = $('#pick-search').value.trim().toLowerCase();
  const list = products.filter(p => pick.has(p.id) || !q || [p.sku, p.name, p.brand].join(' ').toLowerCase().includes(q))
    .sort((a, b) => pick.has(b.id) - pick.has(a.id)).slice(0, 60);
  $('#pick').innerHTML = list.map(p => `<label class="pick-row"><input type="checkbox" value="${esc(p.id)}"${pick.has(p.id) ? ' checked' : ''}><span class="ph">${p.images[0] ? `<img src="${esc(thumb(p.images[0]))}" alt="" loading="lazy">` : ''}</span><span>${esc(p.sku || '')} · ${esc(p.name)}</span></label>`).join('') || '<p class="mute">Ничего не найдено</p>';
  $('#pick-count').textContent = pick.size;
}
$('#pick-search').oninput = renderPick;
$('#pick').onchange = e => { e.target.checked ? pick.add(e.target.value) : pick.delete(e.target.value); $('#pick-count').textContent = pick.size; };
pf.onsubmit = async e => {
  e.preventDefault();
  const id = pf.id.value, btn = $('#post-submit'), label = btn.textContent;
  btn.disabled = true;
  $('#post-err').textContent = '';
  try {
    const images = await postPhotos.upload(t => (btn.textContent = t));
    btn.textContent = 'Сохранение…';
    const saved = await api(id ? '/api/posts/' + encodeURIComponent(id) : '/api/posts', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: pf.title.value, tag: pf.tag.value, text: pf.text.value, images, products: [...pick] }),
    });
    const i = posts.findIndex(p => p.id === saved.id);
    i >= 0 ? (posts[i] = saved) : posts.unshift(saved);
    resetPost();
    renderPosts();
  } catch (err) {
    $('#post-err').textContent = err.message;
  } finally {
    btn.disabled = false;
    if (btn.textContent !== 'Опубликовать') btn.textContent = pf.id.value ? 'Сохранить' : 'Опубликовать';
  }
};
$('#post-cancel').onclick = resetPost;
$('#post-list').onclick = async e => {
  const { pedit, pdel } = e.target.dataset;
  if (pedit) {
    const p = posts.find(x => x.id === pedit);
    pf.id.value = p.id; pf.title.value = p.title; pf.tag.value = p.tag || ''; pf.text.value = p.text; pick = new Set(p.products || []); renderPick(); postPhotos.set(p.images);
    $('#post-title').textContent = 'Редактирование поста';
    $('#post-submit').textContent = 'Сохранить';
    $('#post-cancel').hidden = false;
    scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (pdel && confirm('Удалить пост?')) {
    const i = posts.findIndex(x => x.id === pdel);
    const [removed] = posts.splice(i, 1);
    renderPosts();
    try {
      await api('/api/posts/' + encodeURIComponent(pdel), { method: 'DELETE' });
    } catch (err) {
      posts.splice(i, 0, removed);
      renderPosts();
      alert('Не удалось удалить: ' + err.message);
    }
  }
};

resetForm();
fetch('/api/me').then(r => (r.ok ? showPanel() : showLogin()));


// предпросмотр размерной сетки
let heads = Shipping.SIZE_TEMPLATES;
function renderHeads(current) {
  const list = current && !heads.includes(current) ? [...heads, current] : heads;
  form.sizeHead.innerHTML = list.map(h => `<option value="${esc(h)}"${h === current ? ' selected' : ''}>${esc(h)}</option>`).join('') + `<option value=""${current === '' ? ' selected' : ''}>Свой — заголовок в первой строке</option>`;
}
form.sizeHead.onchange = () => previewSizes();
function sizeTableHtml() {
  const rows = Shipping.sizeGrid({ sizeTable: form.sizeTable.value, sizeHead: form.sizeHead.value });
  if (rows.length < 2) return '';
  const [h, ...b] = rows;
  return `<table class="st"><thead><tr>${h.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${b.map(r => `<tr>${h.map((_, i) => `<td>${esc(r[i] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function previewSizes() { $('#st-preview').innerHTML = sizeTableHtml(); }
form.sizeTable.oninput = previewSizes;
form.addEventListener('reset', () => setTimeout(() => { renderHeads(heads[0]); previewSizes(); }));
