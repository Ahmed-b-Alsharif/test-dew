const $ = s => document.querySelector(s);
let D = null, SHA = null, cfg = null, tab = 'products', q = '', chain = Promise.resolve();
const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), b => b.toString(16).padStart(2, '0')).join('');
const catName = id => (D.catalogs.find(c => c.id === id) || {}).name || '-';

/* ---------- base64 helpers (UTF-8 safe) ---------- */
const enc = s => { const b = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(bin); };
const dec = b => { const bin = atob(b.replace(/\n/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(u); };

/* ---------- GitHub API ---------- */
function guessRepo() {
  const h = location.hostname;
  if (!h.endsWith('.github.io')) return '';
  const o = h.split('.')[0], seg = location.pathname.split('/')[1] || '';
  return o + '/' + (seg && !seg.includes('.') ? seg : o + '.github.io');
}
function savedCfg() {
  for (const st of [localStorage, sessionStorage]) { try { const v = JSON.parse(st.getItem('dew_gh')); if (v && v.token && v.repo) return v; } catch {} }
  return null;
}
async function gh(method, path, body) {
  const headers = { Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github+json' };
  if (body) headers['Content-Type'] = 'application/json';
  let r;
  try {
    r = await fetch(`https://api.github.com/repos/${cfg.repo}${path ? '/' + path : ''}`, { method, cache: 'no-store', headers, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    throw new Error('Your browser could not reach GitHub. Turn off any ad blocker, privacy shield or VPN for this site, or try another browser or mobile data, then sign in again.');
  }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error('That token was not accepted. Create a new one and sign in again.');
  if (r.status === 404) throw new Error('Repository or file not found. Check the repository name and that the token has access to it.');
  if (r.status === 409 || r.status === 422) throw new Error('The data changed somewhere else. Reload this page and try again.');
  if (!r.ok) throw new Error(j.message || 'GitHub error ' + r.status);
  return j;
}
async function loadData() {
  const f = await gh('GET', 'contents/products.json?t=' + Date.now());
  SHA = f.sha; D = JSON.parse(dec(f.content));
}
function save(message) {
  // saves run one after another so each uses the latest file version
  chain = chain.then(async () => {
    try {
      const r = await gh('PUT', 'contents/products.json', { message, content: enc(JSON.stringify(D, null, 2) + '\n'), sha: SHA });
      SHA = r.content.sha;
      toast('Saved. It goes live on the site in about a minute.');
    } catch (e) { toast(e.message, true); throw e; }
  });
  return chain.catch(() => {});
}
async function uploadImage(dataUrl) {
  const name = `${Date.now()}-${uid()}.jpg`;
  await gh('PUT', 'contents/images/' + name, { message: 'Add photo ' + name, content: dataUrl.split(',')[1] });
  return 'images/' + name;
}
function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.style.background = bad ? 'var(--red)' : 'var(--green)'; t.style.display = 'block';
  clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = 'none', bad ? 7000 : 3500);
}

/* ---------- login ---------- */
async function start() {
  cfg = savedCfg();
  if (!cfg) return showLogin();
  try { await loadData(); render(); } catch (e) { showLogin(e.message); }
}
function showLogin(msg) {
  const saved = savedCfg();
  $('#app').innerHTML = `<div class="login box" style="text-align:left">
    <h2 style="text-align:center">Dew Admin</h2>
    <form id="lf">
      <label>GitHub repository (username/name)</label><input id="repo" value="${esc((saved && saved.repo) || guessRepo())}" placeholder="yourname/dew-skincare" required>
      <label>Access token</label><input id="tok" type="password" placeholder="github_pat_..." required>
      <label style="font-weight:400"><input type="checkbox" id="rem" style="width:auto"> Remember on this device</label>
      <div class="err" id="le">${esc(msg || '')}</div>
      <button class="btn red" style="width:100%;margin-top:6px">Sign in</button>
    </form>
    <p class="note">Need a token? See the steps in <b>README.md</b> (a fine-grained token with Contents: Read and write for this repository only).</p>
    <p style="text-align:center"><a href="./">Back to the shop</a></p></div>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    const tok = $('#tok').value.replace(/^\s*Bearer\s+/i, '').replace(/\s+/g, '');
    if (!tok || /[^\x21-\x7e]/.test(tok)) { $('#le').textContent = 'The token has an invalid character. Copy it again from GitHub and paste it with no spaces.'; return; }
    cfg = { repo: $('#repo').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, ''), token: tok };
    $('#le').textContent = 'Checking...';
    try {
      const r = await gh('GET', '');
      if (!r.permissions || !r.permissions.push) throw new Error('This token can read the repository but not change it. It needs Contents: Read and write.');
      await loadData();
      const st = $('#rem').checked ? localStorage : sessionStorage;
      try { st.setItem('dew_gh', JSON.stringify(cfg)); } catch {}
      render();
    } catch (er) { cfg = null; $('#le').textContent = er.message; }
  };
}

/* ---------- shell ---------- */
function render() {
  const tabs = [['products', 'Products'], ['catalogs', 'Catalogs'], ['store', 'Store'], ['help', 'Help']];
  $('#app').innerHTML = `
    <div class="admin-bar"><div class="wrap"><b>Dew Admin</b>
      ${tabs.map(([k, n]) => `<button class="tab ${tab === k ? 'on' : ''}" data-t="${k}">${n}</button>`).join('')}
      <span style="flex:1"></span><a class="tab" href="./" style="text-decoration:none">View shop</a>
      <button class="tab" id="out">Sign out</button></div></div>
    <div class="wrap" style="padding-top:18px;padding-bottom:60px"><div id="view"></div></div>`;
  document.querySelectorAll('.tab[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; q = ''; render(); });
  $('#out').onclick = () => { try { localStorage.removeItem('dew_gh'); sessionStorage.removeItem('dew_gh'); } catch {} D = null; cfg = null; showLogin(); };
  ({ products, catalogs, store, help })[tab]();
}
function modal(html) { $('#modal').innerHTML = html; $('#ov').classList.add('open'); }
function closeModal() { $('#ov').classList.remove('open'); }
$('#ov').onclick = e => { if (e.target.id === 'ov') closeModal(); };
const searchBox = () => `<input id="q" value="${esc(q)}" placeholder="Search" style="padding:9px 14px;border-radius:999px;border:1.5px solid #cfd3cc;margin-bottom:12px">`;
function bindSearch() { const el = $('#q'); if (!el) return; el.oninput = () => { q = el.value; const pos = q.length; render(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); }; }

/* ---------- products ---------- */
function products() {
  const list = D.products.filter(p => !q || (p.name + p.tags).toLowerCase().includes(q.toLowerCase()));
  $('#view').innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><h2>Products</h2><button class="btn red" id="newP">+ New product</button></div>
    <p class="note">Orders arrive on WhatsApp. After each order, lower the stock here so customers can't over-order.</p>
    ${searchBox()}
    <div class="scroll"><table><tr><th></th><th>Name</th><th>Catalog</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr>
    ${list.map(p => `<tr><td>${p.images[0] ? `<img class="thumb" src="${esc(p.images[0])}" alt="">` : '<div class="thumb"></div>'}</td>
      <td><b>${esc(p.name)}</b></td><td>${esc(catName(p.catalog))}</td>
      <td>${p.salePrice > 0 && p.salePrice < p.price ? `<s class="note">${egp(p.price)}</s> ${egp(p.salePrice)}` : egp(p.price)}</td>
      <td><input type="number" min="0" value="${p.stock}" data-s="${p.id}" style="width:74px;padding:6px 8px;border:1.5px solid #cfd3cc;border-radius:8px"></td>
      <td><button class="pill ${p.visible ? 'g' : ''}" data-v="${p.id}" style="border:0;cursor:pointer">${p.visible ? 'Live' : 'Hidden'}</button></td>
      <td style="white-space:nowrap"><button class="btn small" data-e="${p.id}">Edit</button> <button class="btn small ghost" data-x="${p.id}" style="color:var(--red)">Delete</button></td></tr>`).join('') || '<tr><td colspan="7" class="note">No products.</td></tr>'}</table></div>`;
  bindSearch();
  $('#newP').onclick = () => productForm();
  document.querySelectorAll('[data-e]').forEach(b => b.onclick = () => productForm(b.dataset.e));
  document.querySelectorAll('[data-s]').forEach(i => i.onchange = () => {
    const p = D.products.find(x => x.id === i.dataset.s); p.stock = Math.max(0, Math.floor(Number(i.value) || 0));
    save('Stock: ' + p.name + ' = ' + p.stock);
  });
  document.querySelectorAll('[data-v]').forEach(b => b.onclick = async () => {
    const p = D.products.find(x => x.id === b.dataset.v); p.visible = !p.visible; render(); save((p.visible ? 'Show ' : 'Hide ') + p.name);
  });
  document.querySelectorAll('[data-x]').forEach(b => b.onclick = async () => {
    const p = D.products.find(x => x.id === b.dataset.x);
    if (confirm('Delete "' + p.name + '"?')) { D.products = D.products.filter(x => x !== p); render(); save('Delete ' + p.name); }
  });
}
function productForm(id) {
  if (!D.catalogs.length) { alert('Create a catalog first.'); return; }
  const p = id ? D.products.find(x => x.id === id) : { name: '', catalog: D.catalogs[0].id, price: '', salePrice: '', stock: 0, description: '', howToUse: '', tags: '', images: [], visible: true, featured: false };
  let images = [...p.images];
  const paint = () => {
    $('#imgs').innerHTML = images.map((u, i) => `<div><img src="${esc(u)}" alt=""><button type="button" data-d="${i}">&times;</button></div>`).join('');
    document.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { images.splice(+b.dataset.d, 1); paint(); });
  };
  modal(`<h2>${id ? 'Edit' : 'New'} product</h2><div class="form-grid">
    <div class="full"><label>Name</label><input id="pn" value="${esc(p.name)}"></div>
    <div><label>Catalog</label><select id="pc">${D.catalogs.map(c => `<option value="${c.id}" ${c.id === p.catalog ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div><label>Quantity in stock</label><input id="ps" type="number" min="0" value="${p.stock}"></div>
    <div><label>Price before discount (EGP)</label><input id="pp" type="number" min="0" value="${p.price}"></div>
    <div><label>Price after discount (optional)</label><input id="pd" type="number" min="0" value="${p.salePrice || ''}"></div>
    <div class="full"><label>Description</label><textarea id="pdesc" rows="3">${esc(p.description)}</textarea></div>
    <div class="full"><label>How to use</label><textarea id="phow" rows="2">${esc(p.howToUse)}</textarea></div>
    <div class="full"><label>Tags (comma separated)</label><input id="ptags" value="${esc(p.tags)}"></div>
    <div class="full"><label>Photos (first is the cover, up to 8)</label><div class="imgs" id="imgs"></div><input type="file" id="pf" accept="image/*" multiple></div>
    <div><label><input type="checkbox" id="pv" ${p.visible ? 'checked' : ''} style="width:auto"> Visible in the store</label></div>
    <div><label><input type="checkbox" id="pfe" ${p.featured ? 'checked' : ''} style="width:auto"> Feature on homepage</label></div></div>
    <div class="err" id="me"></div>
    <div style="display:flex;gap:8px;margin-top:10px"><button class="btn red" id="pSave">Save</button><button class="btn ghost" id="pX">Cancel</button></div>`);
  paint();
  $('#pX').onclick = closeModal;
  $('#pf').onchange = async e => {
    $('#me').style.color = 'var(--muted)'; $('#me').textContent = 'Uploading photo...';
    for (const f of e.target.files) {
      if (images.length >= 8) break;
      try { images.push(await uploadImage(await resize(f))); paint(); }
      catch (er) { $('#me').style.color = 'var(--red)'; $('#me').textContent = er.message; return; }
    }
    $('#me').textContent = ''; e.target.value = '';
  };
  $('#pSave').onclick = () => {
    const name = $('#pn').value.trim(), price = Number($('#pp').value);
    if (!name) { $('#me').textContent = 'Product name is required.'; return; }
    if (!(price > 0)) { $('#me').textContent = 'Enter the price.'; return; }
    const data = { name, catalog: $('#pc').value, price, salePrice: Number($('#pd').value) || 0, stock: Math.max(0, Math.floor(Number($('#ps').value) || 0)),
      description: $('#pdesc').value.trim(), howToUse: $('#phow').value.trim(), tags: $('#ptags').value.trim(), images, visible: $('#pv').checked, featured: $('#pfe').checked };
    if (id) Object.assign(p, data); else D.products.unshift({ id: uid(), ...data });
    closeModal(); render(); save((id ? 'Update ' : 'Add ') + name);
  };
}
function resize(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1000 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => rej(new Error('Could not read that image.'));
    img.src = url;
  });
}

/* ---------- catalogs ---------- */
function catalogs() {
  $('#view').innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><h2>Catalogs</h2><button class="btn red" id="newC">+ New catalog</button></div>
    <div class="scroll"><table><tr><th>Name</th><th>Description</th><th>Products</th><th></th></tr>
    ${D.catalogs.map(c => `<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.description)}</td><td>${D.products.filter(p => p.catalog === c.id).length}</td>
      <td style="white-space:nowrap"><button class="btn small" data-e="${c.id}">Edit</button> <button class="btn small ghost" data-x="${c.id}" style="color:var(--red)">Delete</button></td></tr>`).join('')}</table></div>`;
  $('#newC').onclick = () => catForm();
  document.querySelectorAll('[data-e]').forEach(b => b.onclick = () => catForm(b.dataset.e));
  document.querySelectorAll('[data-x]').forEach(b => b.onclick = () => {
    const c = D.catalogs.find(x => x.id === b.dataset.x);
    if (D.products.some(p => p.catalog === c.id)) { alert('Move or delete this catalog\'s products first.'); return; }
    if (confirm('Delete "' + c.name + '"?')) { D.catalogs = D.catalogs.filter(x => x !== c); render(); save('Delete catalog ' + c.name); }
  });
}
function catForm(id) {
  const c = id ? D.catalogs.find(x => x.id === id) : { name: '', description: '' };
  modal(`<h2>${id ? 'Edit' : 'New'} catalog</h2><label>Name</label><input id="cn" value="${esc(c.name)}"><label>Description</label><input id="cd" value="${esc(c.description)}">
    <div class="err" id="me"></div><div style="display:flex;gap:8px;margin-top:10px"><button class="btn red" id="cs">Save</button><button class="btn ghost" id="cx">Cancel</button></div>`);
  $('#cx').onclick = closeModal;
  $('#cs').onclick = () => {
    const name = $('#cn').value.trim(); if (!name) { $('#me').textContent = 'Catalog name is required.'; return; }
    if (id) { c.name = name; c.description = $('#cd').value.trim(); } else D.catalogs.push({ id: uid(), name, description: $('#cd').value.trim() });
    closeModal(); render(); save('Catalog ' + name);
  };
}

/* ---------- store settings ---------- */
function store() {
  const s = D.settings;
  const f = (k, label, type = 'text') => `<div><label>${label}</label><input id="s_${k}" type="${type}" value="${esc(s[k])}"></div>`;
  $('#view').innerHTML = `<h2>Store settings</h2><div class="box"><div class="form-grid">
    ${f('storeName', 'Store name')}${f('tagline', 'Tagline')}
    ${f('heroTitle', 'Hero headline')}${f('heroText', 'Hero paragraph')}
    ${f('welcomeLine', 'Welcome screen headline')}${f('welcomeNote', 'Welcome screen note')}
    ${f('whatsapp', 'WhatsApp number (with country code)')}${f('phone', 'Phone')}
    ${f('email', 'Email')}${f('instagram', 'Instagram handle (no @)')}
    ${f('minOrder', 'Minimum order (EGP)', 'number')}${f('deliveryNote', 'Delivery note')}
    ${f('deliveryCairo', 'Cairo & Giza delivery (EGP)', 'number')}${f('deliveryAlex', 'Alexandria delivery (EGP)', 'number')}
    </div><button class="btn red" id="ss" style="margin-top:10px">Save settings</button></div>`;
  $('#ss').onclick = () => {
    for (const k of Object.keys(s)) { const el = $('#s_' + k); if (el) s[k] = el.type === 'number' ? Math.max(0, Number(el.value) || 0) : el.value.trim(); }
    save('Update store settings');
  };
}

/* ---------- help ---------- */
function help() {
  $('#view').innerHTML = `<h2>How this works</h2><div class="box">
    <p>This shop lives on GitHub. Every change you save here is stored in your GitHub repository and appears on the site after about a minute.</p>
    <p><b>Orders</b> are sent to your WhatsApp when a customer taps the button at checkout. There is no order list or customer list on this version, so keep your WhatsApp chat as the record.</p>
    <p><b>Stock</b> does not go down by itself. After an order, change the number in the Stock column.</p>
    <p><b>Your token</b> is the admin password. Never share it. If it leaks, delete it in GitHub (Settings, Developer settings, Personal access tokens) and make a new one. Use <b>Sign out</b> on shared devices.</p></div>`;
}

start();
