const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rub = n => n.toLocaleString('ru-RU') + ' ₽';
const form = $('#pf');
let products = [];

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
  for (const [k, v] of Object.entries(rates)) if ($('#rates')[k]) $('#rates')[k].value = v || '';
  renderList();
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
      <div class="ph">${p.images[0] ? `<img src="${esc(p.images[0])}" alt="">` : ''}</div>
      <div><div>${p.sku ? `<span class="mute">${esc(p.sku)}</span> · ` : ''}${esc(p.name)}</div><div class="mute">${esc(p.brand)} · ${rub(p.price)}${p.sizes.length ? ' · ' + esc(p.sizes.join(', ')) : ''}${p.weight ? ' · ' + p.weight + ' кг' : ''}${p.soldOut ? ' · нет в наличии' : ''}</div></div>
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
  form.images.required = true;
  $('#pf-title').textContent = 'Новый товар';
  $('#pf-submit').textContent = 'Добавить';
  $('#pf-cancel').hidden = $('#img-note').hidden = true;
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
async function uploadImage(f) {
  if (f.size <= 4 * 1024 * 1024) return (await api('/api/upload', { method: 'POST', headers: { 'Content-Type': f.type }, body: f })).url;
  blobClient ||= await import('https://esm.sh/@vercel/blob@2.8.2/client');
  return (await blobClient.upload('images/' + f.name.replace(/[^\w.-]/g, '_'), f, { access: 'public', handleUploadUrl: '/api/upload-token', contentType: f.type })).url;
}

form.onsubmit = async e => {
  e.preventDefault();
  const id = form.id.value;
  const btn = $('#pf-submit');
  const label = btn.textContent;
  btn.disabled = true;
  $('#pf-err').textContent = '';
  try {
    const files = [...form.images.files].slice(0, 10);
    let images = id ? products.find(p => p.id === id).images : [];
    if (files.length) {
      images = [];
      for (const [i, f] of files.entries()) {
        btn.textContent = `Загрузка фото ${i + 1}/${files.length}`;
        images.push(await uploadImage(f));
      }
    }
    btn.textContent = 'Сохранение…';
    const body = { name: form.name.value, brand: form.brand.value, sku: form.sku.value, color: form.color.value, cat: form.cat.value, weight: form.weight.value, eta: form.eta.value, soldOut: form.soldOut.checked, price: form.price.value, sizes: form.sizes.value, description: form.description.value, images };
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
    const body = Object.fromEntries(Object.keys(Shipping.DEFAULTS).map(k => [k, f[k].value]));
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
  form.eta.value = p.eta || '';
  form.soldOut.checked = !!p.soldOut;
  form.price.value = p.price;
  form.sizes.value = p.sizes.join(', ');
  form.description.value = p.description;
  form.images.value = '';
  form.images.required = false;
  $('#pf-submit').textContent = 'Сохранить';
  $('#pf-cancel').hidden = $('#img-note').hidden = false;
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
      <div class="ph">${p.images[0] ? `<img src="${esc(p.images[0])}" alt="">` : ''}</div>
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
  $('#post-cancel').hidden = $('#post-img-note').hidden = true;
  $('#post-err').textContent = '';
}
let pick = new Set();
function renderPick() {
  const q = $('#pick-search').value.trim().toLowerCase();
  const list = products.filter(p => pick.has(p.id) || !q || [p.sku, p.name, p.brand].join(' ').toLowerCase().includes(q))
    .sort((a, b) => pick.has(b.id) - pick.has(a.id)).slice(0, 60);
  $('#pick').innerHTML = list.map(p => `<label class="pick-row"><input type="checkbox" value="${esc(p.id)}"${pick.has(p.id) ? ' checked' : ''}><span class="ph">${p.images[0] ? `<img src="${esc(p.images[0])}" alt="">` : ''}</span><span>${esc(p.sku || '')} · ${esc(p.name)}</span></label>`).join('') || '<p class="mute">Ничего не найдено</p>';
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
    const files = [...pf.images.files].slice(0, 10);
    let images = id ? posts.find(p => p.id === id).images : [];
    if (files.length) {
      images = [];
      for (const [i, f] of files.entries()) {
        btn.textContent = `Загрузка фото ${i + 1}/${files.length}`;
        images.push(await uploadImage(f));
      }
    }
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
    pf.id.value = p.id; pf.title.value = p.title; pf.tag.value = p.tag || ''; pf.text.value = p.text; pick = new Set(p.products || []); renderPick(); pf.images.value = '';
    $('#post-title').textContent = 'Редактирование поста';
    $('#post-submit').textContent = 'Сохранить';
    $('#post-cancel').hidden = $('#post-img-note').hidden = false;
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
