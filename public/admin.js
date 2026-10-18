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
  products = await api('/api/products?fresh');
  $('#count').textContent = products.length;
  $('#brand-list').innerHTML = [...new Set(products.map(p => p.brand))].map(b => `<option value="${esc(b)}">`).join('');
  $('#list').innerHTML = products.map(p => `
    <div class="row">
      <div class="ph">${p.images[0] ? `<img src="${esc(p.images[0])}" alt="">` : ''}</div>
      <div><div>${esc(p.name)}</div><div class="mute">${esc(p.brand)} · ${rub(p.price)}${p.sizes.length ? ' · ' + esc(p.sizes.join(', ')) : ''}${p.soldOut ? ' · нет в наличии' : ''}</div></div>
      <div class="actions"><button data-edit="${esc(p.id)}">Изменить</button><button data-del="${esc(p.id)}">Удалить</button></div>
    </div>`).join('');
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

const toBlob = (canvas, type) => new Promise(r => canvas.toBlob(r, type, 0.85));

async function compress(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
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
    const body = { name: form.name.value, brand: form.brand.value, color: form.color.value, soldOut: form.soldOut.checked, price: form.price.value, sizes: form.sizes.value, description: form.description.value, images };
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

$('#bot-setup').onclick = async () => {
  try {
    const j = await api('/api/tg-setup', { method: 'POST' });
    alert(`Бот @${j.bot} подключён`);
  } catch (err) {
    alert(err.message);
  }
};

$('#list').onclick = async e => {
  const edit = e.target.dataset.edit, del = e.target.dataset.del;
  if (edit) {
    const p = products.find(x => x.id === edit);
    form.id.value = p.id;
    form.name.value = p.name;
    form.brand.value = p.brand;
    form.color.value = p.color || '';
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
