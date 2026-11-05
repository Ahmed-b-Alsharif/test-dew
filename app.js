const $ = s => document.querySelector(s);
let S = { settings: {}, catalogs: [], products: [] };
let filter = 'all';

async function boot() {
  try { S = await (await fetch('products.json?v=' + Date.now())).json(); S.products = S.products.filter(p => p.visible); }
  catch { $('#grid').innerHTML = '<div class="empty">Could not load the shop. Please refresh.</div>'; return; }
  const s = S.settings || {};
  document.title = (s.storeName || 'Dew Skincare') + (s.tagline ? ' | ' + s.tagline : '');
  if ($('#brand')) $('#brand').innerHTML = esc(s.storeName || 'Dew') + '<span>.</span>';
  if ($('#heroTitle')) $('#heroTitle').textContent = s.heroTitle || '';
  if ($('#heroText')) $('#heroText').textContent = s.heroText || '';
  if ($('#deliveryNote')) $('#deliveryNote').textContent = s.deliveryNote || '';
  if ($('#footName')) $('#footName').textContent = s.storeName || '';
  if ($('#year')) $('#year').textContent = new Date().getFullYear();
  if ($('#welcomeLine')) $('#welcomeLine').textContent = s.welcomeLine || '';
  if ($('#welcomeNote')) $('#welcomeNote').textContent = s.welcomeNote || '';
  if ($('#welcomeForm button')) $('#welcomeForm button').textContent = s.welcomeBtnText || 'Start shopping';
  if ($('#search')) $('#search').placeholder = s.searchPlaceholder || 'Search products';
  if ($('#drawer header h3')) $('#drawer header h3').textContent = s.cartTitle || 'Your cart';
  if ($('#checkoutBtn')) $('#checkoutBtn').textContent = s.checkoutBtnText || 'Complete order';
  
  const ig = s.instagram ? `<a href="https://instagram.com/${encodeURIComponent(s.instagram)}" target="_blank" rel="noopener">@${esc(s.instagram)}</a>` : '';
  if ($('#contact')) $('#contact').innerHTML = [esc(s.phone), esc(s.email), ig].filter(Boolean).join(' &middot; ');
  
  const marqueeStr = s.marqueeText || [s.tagline, 'Cash on delivery', 'Made in Egypt', 'Minimum order ' + egp(s.minOrder)].filter(Boolean).join(' • ');
  const row = `<span>${esc(marqueeStr)}</span>`;
  if ($('#marquee')) $('#marquee').innerHTML = row + row + row + row;
  
  renderChips(); renderGrid(); renderCart();
  let known = false; try { known = !!localStorage.getItem('dew_customer'); } catch {}
  if (!known && $('#welcomeOv')) $('#welcomeOv').classList.add('open');
}

function renderChips() {
  const all = [{ id: 'all', name: 'All' }, ...S.catalogs];
  $('#chips').innerHTML = all.map(c => `<button class="chip ${filter === c.id ? 'on' : ''}" data-id="${c.id}">${esc(c.name)}</button>`).join(' ');
  document.querySelectorAll('.chip').forEach(b => b.onclick = () => { filter = b.dataset.id; renderChips(); renderGrid(); });
}

function cover(p) {
  return p.images && p.images[0] ? `<img src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy">` : esc(p.name.slice(0, 1));
}
function priceHtml(p) {
  return eff(p) < p.price ? `<s>${egp(p.price)}</s><em>${egp(eff(p))}</em>` : egp(p.price);
}

function renderGrid() {
  const q = $('#search').value.trim().toLowerCase();
  let list = S.products.filter(p => (filter === 'all' || p.catalog === filter) &&
    (!q || (p.name + ' ' + p.tags + ' ' + p.description).toLowerCase().includes(q)));
  const sort = $('#sort').value;
  if (sort === 'low') list.sort((a, b) => eff(a) - eff(b));
  else if (sort === 'high') list.sort((a, b) => eff(b) - eff(a));
  else list.sort((a, b) => (b.featured - a.featured));
  $('#grid').innerHTML = list.length ? list.map(p => `
    <div class="card" data-id="${p.id}">
      <div class="ph">${cover(p)}${p.stock < 1 ? '<span class="tag out">Sold out</span>' : eff(p) < p.price ? '<span class="tag">Sale</span>' : ''}</div>
      <div class="info">
        <h3>${esc(p.name)}</h3>
        <div class="price">${priceHtml(p)}</div>
        ${p.stock > 0 && p.stock <= 3 ? `<div class="low">Only ${p.stock} left</div>` : ''}
        <button class="btn small" ${p.stock < 1 ? 'disabled' : ''} data-add="${p.id}" style="margin-top:auto">Add to cart</button>
      </div>
    </div>`).join('') : '<div class="empty">No products found.</div>';
  document.querySelectorAll('.card').forEach(c => c.onclick = e => {
    if (e.target.dataset.add) return;
    openProduct(c.dataset.id);
  });
  document.querySelectorAll('[data-add]').forEach(b => b.onclick = () => addToCart(b.dataset.add, 1, true));
}

function prod(id) { return S.products.find(p => p.id === id); }

function addToCart(id, qty, open) {
  const p = prod(id); if (!p || p.stock < 1) return;
  Cart.add(id, qty, p.stock);
  renderCart();
  if (open) openCart();
}

function openProduct(id) {
  const p = prod(id); if (!p) return;
  let qty = 1, img = 0;
  const imgs = p.images || [];
  const draw = () => {
    $('#prodModal').innerHTML = `
      <button class="x" id="pClose">&times;</button>
      <div class="detail">
        <div class="gal">
          <div class="ph" style="border-radius:12px;overflow:hidden">${imgs[img] ? `<img src="${esc(imgs[img])}" alt="">` : esc(p.name.slice(0, 1))}</div>
          ${imgs.length > 1 ? `<div class="thumbs">${imgs.map((u, i) => `<img src="${esc(u)}" class="${i === img ? 'on' : ''}" data-i="${i}" alt="">`).join('')}</div>` : ''}
        </div>
        <div>
          <h2>${esc(p.name)}</h2>
          <div class="price" style="font-size:1.2rem">${priceHtml(p)}</div>
          <p>${esc(p.description)}</p>
          ${p.howToUse ? `<h3 style="font-size:1rem">How to use</h3><p>${esc(p.howToUse)}</p>` : ''}
          ${p.stock > 0 && p.stock <= 3 ? `<div class="low">Only ${p.stock} left</div>` : ''}
          ${p.stock < 1 ? '<p class="low">Sold out</p>' : `
          <div style="display:flex;gap:12px;align-items:center;margin-top:12px">
            <div class="qty"><button id="qm">&minus;</button><span>${qty}</span><button id="qp">+</button></div>
            <button class="btn" id="pAdd">Add to cart</button>
          </div>`}
        </div>
      </div>`;
    $('#pClose').onclick = () => $('#prodOv').classList.remove('open');
    document.querySelectorAll('.thumbs img').forEach(t => t.onclick = () => { img = +t.dataset.i; draw(); });
    if (p.stock > 0) {
      $('#qm').onclick = () => { qty = Math.max(1, qty - 1); draw(); };
      $('#qp').onclick = () => { qty = Math.min(p.stock, qty + 1); draw(); };
      $('#pAdd').onclick = () => { addToCart(id, qty, true); $('#prodOv').classList.remove('open'); };
    }
  };
  draw();
  $('#prodOv').classList.add('open');
}

function renderCart() {
  const c = Cart.get();
  for (const id of Object.keys(c)) {
    const p = prod(id);
    if (!p || p.stock < 1) Cart.setQty(id, 0);
    else if (c[id] > p.stock) Cart.setQty(id, p.stock);
  }
  const cart = Cart.get();
  const ids = Object.keys(cart);
  $('#cartCount').textContent = Cart.count();
  let sub = 0;
  $('#cartItems').innerHTML = ids.length ? ids.map(id => {
    const p = prod(id), q = cart[id], t = eff(p) * q; sub += t;
    return `<div class="line">
      <div class="ph">${cover(p)}</div>
      <div class="grow"><b>${esc(p.name)}</b><div class="note">${egp(eff(p))} each</div>
        <div class="qty" style="margin-top:4px"><button data-m="${id}">&minus;</button><span>${q}</span><button data-p="${id}">+</button></div></div>
      <div style="text-align:right"><b>${egp(t)}</b><br><button class="rm" data-r="${id}">Remove</button></div>
    </div>`;
  }).join('') : '<p class="note" style="padding:20px 0">Your cart is empty.</p>';
  $('#cartSub').textContent = egp(sub);
  const min = S.settings.minOrder || 0;
  const ok = sub >= min && ids.length > 0;
  $('#minNote').innerHTML = ids.length && !ok ? `<div class="warn">Add ${egp(min - sub)} more to reach the ${egp(min)} minimum.</div>` : `Minimum order ${egp(min)}. Delivery is added at checkout.`;
  const b = $('#checkoutBtn');
  b.style.opacity = ok ? 1 : .5; b.style.pointerEvents = ok ? 'auto' : 'none';
  document.querySelectorAll('[data-m]').forEach(x => x.onclick = () => { Cart.setQty(x.dataset.m, (Cart.get()[x.dataset.m] || 0) - 1); renderCart(); });
  document.querySelectorAll('[data-p]').forEach(x => x.onclick = () => { const p = prod(x.dataset.p); Cart.add(x.dataset.p, 1, p.stock); renderCart(); });
  document.querySelectorAll('[data-r]').forEach(x => x.onclick = () => { Cart.setQty(x.dataset.r, 0); renderCart(); });
}
function openCart() { $('#drawer').classList.add('open'); $('#scrim').classList.add('open'); }
function closeCart() { $('#drawer').classList.remove('open'); $('#scrim').classList.remove('open'); }

if ($('#openCart')) $('#openCart').onclick = openCart;
if ($('#closeCart')) $('#closeCart').onclick = closeCart;
if ($('#scrim')) $('#scrim').onclick = closeCart;
if ($('#prodOv')) $('#prodOv').onclick = e => { if (e.target.id === 'prodOv') $('#prodOv').classList.remove('open'); };
if ($('#search')) $('#search').oninput = renderGrid;
if ($('#sort')) $('#sort').onchange = renderGrid;

if ($('#welcomeForm')) $('#welcomeForm').onsubmit = e => {
  e.preventDefault();
  const name = $('#wName').value.trim(), phone = $('#wPhone').value.trim();
  if (name.length < 2 || phone.replace(/\D/g, '').length < 8) { $('#wErr').textContent = 'Enter a valid name and phone number.'; return; }
  try { localStorage.setItem('dew_customer', JSON.stringify({ name, phone })); } catch {}
  $('#welcomeOv').classList.remove('open');
};

let taps = [];
if ($('#brand')) $('#brand').onclick = () => {
  const now = Date.now();
  taps = taps.filter(t => now - t < 3000); taps.push(now);
  if (taps.length >= 5) location.href = 'admin.html';
};

boot();
