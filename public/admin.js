const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rub = n => n.toLocaleString('ru-RU') + ' ₽';
const form = $('#pf');
let products = [];

async function api(url, opts) {
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
  $('#count').textContent = products.length;
  $('#brand-list').innerHTML = [...new Set(products.map(p => p.brand))].map(b => `<option value="${esc(b)}">`).join('');
  renderList();
}

function renderList() {
  const q = $('#search').value.trim().toUpperCase();
  const list = q ? products.filter(p => [p.sku, p.name, p.brand].some(v => (v || '').toUpperCase().includes(q))) : products;
  $('#list').innerHTML = list.length ? list.map(p => `
    <div class="row">
      <div class="ph">${p.images[0] ? `<img src="${esc(p.images[0])}" alt="">` : ''}</div>
      <div><div>${p.sku ? `<span class="mute">${esc(p.sku)}</span> · ` : ''}${esc(p.name)}</div><div class="mute">${esc(p.brand)} · ${rub(p.price)}${p.sizes.length ? ' · ' + esc(p.sizes.join(', ')) : ''}${p.weight ? ' · ' + p.weight + ' кг' : ''}${p.soldOut ? ' · нет в наличии' : ''}</div></div>
      <div class="actions"><button data-edit="${esc(p.id)}">Изменить</button><button data-dup="${esc(p.id)}">Дублировать</button><button data-del="${esc(p.id)}">Удалить</button></div>
    </div>`).join('') : '<p class="mute" style="padding:16px 0">Ничего не найдено</p>';
}

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

const toBlob = (canvas, type) => new Promise(r => canvas.toBlob(r, type, 0.92));

// Фото до 4 МБ грузятся как есть; тяжелее — уменьшаются до 2560px с высоким качеством (лимит запроса Vercel 4.5 МБ)
const ORIGINAL_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
async function compress(file) {
  if (ORIGINAL_OK.includes(file.type) && file.size <= 4 * 1024 * 1024) return file;
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 2560 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const webp = await toBlob(c, 'image/webp');
  return webp && webp.type === 'image/webp' ? webp : toBlob(c, 'image/jpeg');
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
        const blob = await compress(f);
        images.push((await api('/api/upload', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob })).url);
      }
    }
    btn.textContent = 'Сохранение…';
    const body = { name: form.name.value, brand: form.brand.value, sku: form.sku.value, color: form.color.value, cat: form.cat.value, weight: form.weight.value, eta: form.eta.value, soldOut: form.soldOut.checked, price: form.price.value, sizes: form.sizes.value, description: form.description.value, images };
    await api(id ? '/api/products/' + encodeURIComponent(id) : '/api/products', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    resetForm();
    showPanel();
  } catch (err) {
    $('#pf-err').textContent = err.message;
    btn.textContent = label;
  } finally {
    btn.disabled = false;
  }
};

$('#pf-cancel').onclick = resetForm;
$('#search').oninput = renderList;

$('#cat-select').innerHTML = Object.entries(Shipping.CATS).map(([k, l]) => `<option value="${k}"${k === 'm' ? ' selected' : ''}>${esc(l)}</option>`).join('');
$('#cat-fees').innerHTML = Object.entries(Shipping.CATS).map(([k, l]) => `<label>${esc(l)}<input name="cat_${k}" type="number" min="0.01" step="0.01" required></label>`).join('');
$('#admin-tabs').onclick = e => {
  const t = e.target.dataset.tab;
  if (!t) return;
  $('#products-tab').hidden = t !== 'products';
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


$('#list').onclick = async e => {
  const edit = e.target.dataset.edit, del = e.target.dataset.del, dup = e.target.dataset.dup;
  if (dup) {
    const p = products.find(x => x.id === dup);
    e.target.disabled = true;
    try {
      await api('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...p, sku: '', sizes: p.sizes.join(', ') }),
      });
      showPanel();
    } catch (err) {
      alert(err.message);
      e.target.disabled = false;
    }
  }
  if (edit) {
    const p = products.find(x => x.id === edit);
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
    $('#pf-title').textContent = 'Редактирование';
    $('#pf-submit').textContent = 'Сохранить';
    $('#pf-cancel').hidden = $('#img-note').hidden = false;
    scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (del && confirm('Удалить товар?')) {
    try {
      await api('/api/products/' + encodeURIComponent(del), { method: 'DELETE' });
      showPanel();
    } catch (err) {
      alert(err.message);
    }
  }
};

resetForm();
fetch('/api/me').then(r => (r.ok ? showPanel() : showLogin()));
