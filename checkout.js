const $ = s => document.querySelector(s);
let S, area = null;

(async function () {
  try { S = await (await fetch('products.json?v=' + Date.now())).json(); }
  catch { $('#sumBody').innerHTML = '<p class="note">Could not load the shop. Please refresh.</p>'; return; }
  S.products = S.products.filter(p => p.visible);
  const s = S.settings;
  $('#lblCairo').textContent = `Cairo & Giza - ${egp(s.deliveryCairo)}`;
  $('#lblAlex').textContent = `Alexandria - ${egp(s.deliveryAlex)}`;
  try {
    const c = JSON.parse(localStorage.getItem('dew_customer') || 'null');
    if (c) {
      const parts = c.name.split(' ');
      $('#first').value = parts[0] || ''; $('#last').value = parts.slice(1).join(' ');
      $('#phone').value = c.phone; $('#whatsapp').value = c.phone;
    }
  } catch {}
  document.querySelectorAll('input[name=area]').forEach(r => r.onchange = () => {
    area = r.value;
    $('#optCairo').classList.toggle('on', area === 'cairo');
    $('#optAlex').classList.toggle('on', area === 'alex');
    render();
  });
  render();
})();

function lines() {
  const cart = Cart.get();
  return Object.keys(cart).map(id => {
    const p = S.products.find(x => x.id === id);
    if (!p || p.stock < 1) return null;
    const qty = Math.min(cart[id], p.stock);
    return { id, name: p.name, qty, unit: eff(p), total: eff(p) * qty };
  }).filter(Boolean);
}

function totals() {
  const ls = lines();
  const items = ls.reduce((a, l) => a + l.total, 0);
  const delivery = area === 'alex' ? S.settings.deliveryAlex : area === 'cairo' ? S.settings.deliveryCairo : 0;
  return { ls, items, delivery, total: items + delivery };
}

function render() {
  const t = totals();
  if (!t.ls.length) {
    $('#sumBody').innerHTML = '<p class="note">Your cart is empty.</p><a class="btn" href="./">Go shopping</a>';
    $('#submit').disabled = true; return;
  }
  $('#sumBody').innerHTML = t.ls.map(l => `<div class="sum-line"><span>${esc(l.name)} &times; ${l.qty}<br><span class="note">${egp(l.unit)} each</span></span><b>${egp(l.total)}</b></div>`).join('') +
    `<div class="sum-line"><span>Items</span><b>${egp(t.items)}</b></div>
     <div class="sum-line"><span>Delivery</span><b>${area ? egp(t.delivery) : 'Choose area'}</b></div>
     <div class="sum-line total"><span>Total</span><span>${egp(t.total)}</span></div>` +
    (t.items < S.settings.minOrder ? `<div class="warn">Minimum order is ${egp(S.settings.minOrder)} for items.</div>` : '');
  $('#submit').disabled = t.items < S.settings.minOrder;
}

// Orders are sent to the shop owner on WhatsApp (there is no server on GitHub Pages).
const ref = () => { const d = new Date(); return 'DEW-' + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + Math.floor(1000 + Math.random() * 9000); };

$('#form').onsubmit = e => {
  e.preventDefault();
  $('#err').textContent = '';
  const t = totals();
  const first = $('#first').value.trim(), last = $('#last').value.trim(), address = $('#address').value.trim();
  const phone = $('#phone').value.trim(), whatsapp = $('#whatsapp').value.trim();
  if (!area) { $('#err').textContent = 'Choose a delivery area.'; return; }
  if (!first || !last || address.length < 6 || phone.replace(/\D/g, '').length < 8 || whatsapp.replace(/\D/g, '').length < 8) {
    $('#err').textContent = 'Please fill in name, address, phone and WhatsApp number.'; return;
  }
  if (!t.ls.length) { $('#err').textContent = 'Your cart is empty.'; return; }
  if (t.items < S.settings.minOrder) { $('#err').textContent = `Minimum order is ${egp(S.settings.minOrder)}.`; return; }
  try { localStorage.setItem('dew_customer', JSON.stringify({ name: first + ' ' + last, phone })); } catch {}
  const o = { number: ref(), lines: t.ls, itemsTotal: t.items, delivery: t.delivery, total: t.total, area, customer: { first, last, phone, whatsapp, address } };
  Cart.clear();
  done(o);
};

function done(o) {
  const c = o.customer;
  const msg = [`New order ${o.number}`, '',
    ...o.lines.map(l => `${l.qty} x ${l.name} @ ${egp(l.unit)} = ${egp(l.total)}`), '',
    `Items: ${egp(o.itemsTotal)}`, `Delivery: ${egp(o.delivery)}`, `Total: ${egp(o.total)} (cash on delivery)`, '',
    `Name: ${c.first} ${c.last}`, `Phone: ${c.phone}`, `WhatsApp: ${c.whatsapp}`,
    `Address: ${c.address}`, `Area: ${o.area === 'alex' ? 'Alexandria' : 'Cairo & Giza'}`].join('\n');
  const num = String(S.settings.whatsapp).replace(/\D/g, '');
  const link = `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  $('#page').innerHTML = `<div class="box ok-box" style="grid-column:1/-1">
    <h2>Almost done</h2>
    <p>Your order <b>${esc(o.number)}</b> is ready. Total: <b>${egp(o.total)}</b>, cash on delivery.</p>
    <p><b>Tap the button below to send your order to us on WhatsApp.</b> The order is only placed once we receive that message.</p>
    <a class="btn red" href="${link}" target="_blank" rel="noopener">Send order on WhatsApp</a>
    <p><a href="./">Back to the shop</a></p></div>`;
  window.open(link, '_blank');
}
