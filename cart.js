/* Shared cart: { productId: qty } stored in localStorage */
const Cart = {
  key: 'dew_cart',
  get() { try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch { return {}; } },
  set(c) { try { localStorage.setItem(this.key, JSON.stringify(c)); } catch {} },
  count() { return Object.values(this.get()).reduce((a, b) => a + b, 0); },
  setQty(id, qty) { const c = this.get(); if (qty > 0) c[id] = qty; else delete c[id]; this.set(c); },
  add(id, qty, max) { const c = this.get(); c[id] = Math.min((c[id] || 0) + qty, max); if (c[id] < 1) delete c[id]; this.set(c); },
  clear() { this.set({}); }
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eff = p => (p.salePrice > 0 && p.salePrice < p.price ? p.salePrice : p.price);
const egp = n => 'EGP ' + Number(n).toLocaleString('en-US');
