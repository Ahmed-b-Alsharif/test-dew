const $ = s => document.querySelector(s);
let S, area = null, appliedDiscount = null;

(async function () {
  try { S = await (await fetch('products.json?v=' + Date.now())).json(); }
  catch { $('#sumBody').innerHTML = '<p class="note">Could not load the shop. Please refresh.</p>'; return; }
  S.products = S.products.filter(p => p.visible);
  if (!S.discounts) S.discounts = [];
  const s = S.settings;
  $('#lblCairo').textContent = `Cairo & Giza - ${egp(s.deliveryCairo)}`;
  $('#lblAlex').textContent = `Alexandria - ${egp(s.deliveryAlex)}`;
  try {
    const c = JSON.parse(localStorage.getItem('dew_customer') || 'null');
    if (c) {
      const parts = c.name.split(' ');
      $('#first').value = parts[0] || ''; $('#last').value = parts.slice(1).join(' ');
      $('#phone').value = c.phone;
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
  let delivery = area === 'alex' ? S.settings.deliveryAlex : area === 'cairo' ? S.settings.deliveryCairo : 0;

  let discount = 0;
  if (appliedDiscount) {
    if (appliedDiscount.type === 'percentage') {
      discount = Math.round((items * appliedDiscount.value) / 100);
    } else if (appliedDiscount.type === 'fixed') {
      discount = Math.min(items, appliedDiscount.value);
    } else if (appliedDiscount.type === 'free_shipping') {
      discount = delivery;
      delivery = 0;
    }
  }

  return { ls, items, delivery, discount, total: Math.max(0, items + delivery - (appliedDiscount && appliedDiscount.type === 'free_shipping' ? 0 : discount)) };
}

function render() {
  const t = totals();
  if (!t.ls.length) {
    $('#sumBody').innerHTML = '<p class="note">Your cart is empty.</p><a class="btn" href="./">Go shopping</a>';
    $('#submit').disabled = true; return;
  }

  const discHtml = appliedDiscount ? `<div class="sum-line" style="color:var(--green)"><span>Discount (${esc(appliedDiscount.code)})</span><b>-${egp(t.discount)}</b></div>` : '';

  $('#sumBody').innerHTML = t.ls.map(l => `<div class="sum-line"><span>${esc(l.name)} &times; ${l.qty}<br><span class="note">${egp(l.unit)} each</span></span><b>${egp(l.total)}</b></div>`).join('') +
    `<div class="sum-line"><span>Items</span><b>${egp(t.items)}</b></div>
     <div class="sum-line"><span>Delivery</span><b>${area ? egp(t.delivery) : 'Choose area'}</b></div>
     ${discHtml}
     <div class="sum-line total"><span>Total</span><span>${egp(t.total)}</span></div>` +
    `<div style="margin:14px 0 8px;display:flex;gap:8px">
       <input id="promoInput" placeholder="Promo code" style="flex:1;padding:8px 12px;border:1.5px solid #cfd3cc;border-radius:999px;font-size:.9rem" value="${appliedDiscount ? esc(appliedDiscount.code) : ''}">
       <button type="button" class="btn small" id="applyPromo">${appliedDiscount ? 'Remove' : 'Apply'}</button>
     </div>
     <div id="promoErr" class="note" style="margin-bottom:8px"></div>` +
    (t.items < S.settings.minOrder ? `<div class="warn">Minimum order is ${egp(S.settings.minOrder)} for items.</div>` : '');

  $('#applyPromo').onclick = () => {
    const codeInput = $('#promoInput').value.trim().toUpperCase();
    if (appliedDiscount) {
      appliedDiscount = null;
      render();
      return;
    }
    if (!codeInput) return;
    const disc = (S.discounts || []).find(d => d.code === codeInput && d.active);
    if (!disc) {
      $('#promoErr').textContent = 'Invalid or inactive promo code.';
      $('#promoErr').style.color = 'var(--red)';
      return;
    }
    if (disc.minSpend && t.items < disc.minSpend) {
      $('#promoErr').textContent = `Minimum spend for this code is ${egp(disc.minSpend)}.`;
      $('#promoErr').style.color = 'var(--red)';
      return;
    }
    appliedDiscount = disc;
    $('#promoErr').textContent = 'Promo code applied successfully!';
    $('#promoErr').style.color = 'var(--green)';
    render();
  };

  $('#submit').disabled = t.items < S.settings.minOrder;
}

const ref = () => { const d = new Date(); return 'DEW-' + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + Math.floor(1000 + Math.random() * 9000); };

$('#form').onsubmit = async e => {
  e.preventDefault();
  $('#err').textContent = '';
  const t = totals();
  const first = $('#first').value.trim(), last = $('#last').value.trim(), address = $('#address').value.trim();
  const phone = $('#phone').value.trim();
  if (!area) { $('#err').textContent = 'Choose a delivery area.'; return; }
  if (!first || !last || address.length < 6 || phone.replace(/\D/g, '').length < 8) {
    $('#err').textContent = 'Please fill in your name, address and phone number.'; return;
  }
  if (!t.ls.length) { $('#err').textContent = 'Your cart is empty.'; return; }
  if (t.items < S.settings.minOrder) { $('#err').textContent = `Minimum order is ${egp(S.settings.minOrder)}.`; return; }
  try { localStorage.setItem('dew_customer', JSON.stringify({ name: first + ' ' + last, phone })); } catch {}

  const o = {
    number: ref(),
    date: new Date().toISOString(),
    status: 'Pending',
    lines: t.ls,
    itemsTotal: t.items,
    delivery: t.delivery,
    discount: t.discount,
    promoCode: appliedDiscount ? appliedDiscount.code : null,
    total: t.total,
    area,
    customer: { first, last, phone, address }
  };

  // Send the order to the configured Telegram notification endpoint, if one is set.
  if (S.settings.telegramEnabled && S.settings.telegramProxyUrl) {
    try {
      await fetch(S.settings.telegramProxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(o)
      });
    } catch (err) {
      console.error('Notification proxy failed', err);
    }
  }

  Cart.clear();
  done(o);
};

function done(o) {
  $('#page').innerHTML = `<div class="box ok-box" style="grid-column:1/-1;text-align:center;padding:40px">
    <h2>Order placed successfully!</h2>
    <p>Your order reference is <b>${esc(o.number)}</b>. Total: <b>${egp(o.total)}</b> (cash on delivery).</p>
    <p style="color:var(--muted)">We have received your order and will contact you shortly.</p>
    <a class="btn red" href="./" style="margin-top:16px">Back to the shop</a></div>`;
}
