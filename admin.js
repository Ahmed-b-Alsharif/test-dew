const $ = s => document.querySelector(s);
let D = null, SHA = null, ordersList = [], ordersSHA = null, cfg = null, tab = 'overview', q = '', chain = Promise.resolve();
const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), b => b.toString(16).padStart(2, '0')).join('');
const catName = id => (D.catalogs.find(c => c.id === id) || {}).name || '-';

/* ---------- base64 helpers ---------- */
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
    throw new Error('Your browser could not reach GitHub. Turn off ad blocker or VPN, then sign in again.');
  }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error('That token was not accepted. Create a new one and sign in again.');
  if (r.status === 404 && path.includes('orders.json')) { return { content: enc('[]\n'), sha: null }; }
  if (r.status === 404) throw new Error('Repository or file not found. Check repository name and token permissions (needs repo scope).');
  if (r.status === 409 || r.status === 422) throw new Error('The data changed somewhere else. Reload this page and try again.');
  if (!r.ok) throw new Error(j.message || 'GitHub error ' + r.status);
  return j;
}

async function loadData() {
  const f = await gh('GET', 'contents/products.json?t=' + Date.now());
  SHA = f.sha; D = JSON.parse(dec(f.content));
  if (!D.discounts) D.discounts = [];

  try {
    const ord = await gh('GET', 'contents/orders.json?t=' + Date.now());
    ordersSHA = ord.sha;
    ordersList = JSON.parse(dec(ord.content));
  } catch {
    ordersList = [];
    ordersSHA = null;
  }
}

function save(message) {
  chain = chain.then(async () => {
    try {
      const r = await gh('PUT', 'contents/products.json', { message, content: enc(JSON.stringify(D, null, 2) + '\n'), sha: SHA });
      SHA = r.content.sha;
      toast('Saved. It goes live on the site in about a minute.');
    } catch (e) { toast(e.message, true); throw e; }
  });
  return chain.catch(() => {});
}

function saveOrders(message) {
  chain = chain.then(async () => {
    try {
      const r = await gh('PUT', 'contents/orders.json', { message, content: enc(JSON.stringify(ordersList, null, 2) + '\n'), sha: ordersSHA });
      ordersSHA = r.content.sha;
      toast('Orders updated.');
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
      <label>GitHub repository (username/name)</label><input id="repo" value="${esc((saved && saved.repo) || guessRepo())}" placeholder="yourname/test-dew" required>
      <label>Access token (Classic token with 'repo' scope)</label><input id="tok" type="password" placeholder="ghp_..." required>
      <label style="font-weight:400"><input type="checkbox" id="rem" style="width:auto"> Remember on this device</label>
      <div class="err" id="le">${esc(msg || '')}</div>
      <button class="btn red" style="width:100%;margin-top:6px">Sign in</button>
    </form>
    <p class="note">Need a token? GitHub Settings -> Developer settings -> Personal access tokens -> Tokens (classic) -> Generate new token with <b>repo</b> scope.</p>
    <p style="text-align:center"><a href="./">Back to the shop</a></p></div>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    const tok = $('#tok').value.replace(/^\s*Bearer\s+/i, '').replace(/\s+/g, '');
    if (!tok || /[^\x21-\x7e]/.test(tok)) { $('#le').textContent = 'The token has an invalid character. Check your input.'; return; }
    cfg = { repo: $('#repo').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, ''), token: tok };
    $('#le').textContent = 'Checking...';
    try {
      const r = await gh('GET', '');
      if (!r.permissions || !r.permissions.push) throw new Error('Token needs repo read and write permissions.');
      await loadData();
      const st = $('#rem').checked ? localStorage : sessionStorage;
      try { st.setItem('dew_gh', JSON.stringify(cfg)); } catch {}
      render();
    } catch (er) { cfg = null; $('#le').textContent = er.message; }
  };
}

/* ---------- shell ---------- */
function render() {
  const tabs = [['overview','Overview'],['homepage','Homepage'],['products','Products'],['catalogs','Collections'],['orders','Orders'],['customers','Customers'],['inventory','Inventory'],['discounts','Discounts'],['store','Settings'],['help','Help']];
  const names = Object.fromEntries(tabs);
  $('#app').innerHTML = `
    <div class="admin-shell">
      <aside class="admin-sidebar">
        <a class="admin-brand" href="./"><span class="admin-mark">dew</span><span><b>Dew Skincare</b><small>STORE ADMIN</small></span></a>
        <div class="side-caption">STORE MANAGEMENT</div>
        <nav class="admin-nav">${tabs.map(([k,n]) => `<button class="side-link ${tab===k?'active':''}" data-t="${k}"><span class="side-dot"></span><span>${n}</span>${k==='orders'&&ordersList.length?`<i>${ordersList.length}</i>`:''}</button>`).join('')}</nav>
        <div class="sidebar-bottom"><span class="status-dot"></span><span><b>Store connected</b><small>GitHub sync enabled</small></span></div>
      </aside>
      <main class="admin-main">
        <header class="admin-topbar"><div><div class="admin-eyebrow">DEW SKINCARE / ADMIN</div><h1>${names[tab]||'Overview'}</h1></div><div class="top-actions"><a class="admin-view-store" href="./" target="_blank">View storefront ↗</a><button class="admin-signout" id="out">Sign out</button></div></header>
        <section class="admin-content" id="view"></section>
      </main>
    </div>`;
  document.querySelectorAll('.side-link[data-t]').forEach(b => b.onclick = () => { tab=b.dataset.t; q=''; render(); });
  $('#out').onclick = () => { try { localStorage.removeItem('dew_gh'); sessionStorage.removeItem('dew_gh'); } catch {} D=null; cfg=null; showLogin(); };
  ({ overview, homepage, products, catalogs, orders, customers, inventory, discounts, store, help })[tab]();
}
function modal(html) { $('#modal').innerHTML = html; $('#ov').classList.add('open'); }
function closeModal() { $('#ov').classList.remove('open'); }
$('#ov').onclick = e => { if (e.target.id === 'ov') closeModal(); };
const searchBox = () => `<input id="q" value="${esc(q)}" placeholder="Search" style="padding:9px 14px;border-radius:999px;border:1.5px solid #cfd3cc;margin-bottom:12px">`;
function bindSearch() { const el = $('#q'); if (!el) return; el.oninput = () => { q = el.value; const pos = q.length; render(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); }; }


/* ---------- homepage editor ---------- */
function homepage() {
  const base={"announcement":{"show":true,"text":"Buy 2 Get 1 Free  |  Free delivery on orders over 600 EGP","link":"#shop"},"header":{"logo":"Dew","links":[{"label":"Shop","url":"#shop"},{"label":"Our Story","url":"#about"},{"label":"Contact","url":"#contact"}]},"hero":{"show":true,"title":"Your Skin. Your Natural Glow.","text":"Thoughtful skincare, made with love in Egypt.","button":"Discover the collection","url":"#shop","image":""},"categories":{"show":true,"title":"Shop by category","items":[{"title":"Face Care","image":"","url":"#shop"},{"title":"Lip Care","image":"","url":"#shop"},{"title":"Body Care","image":"","url":"#shop"},{"title":"Hair Care","image":"","url":"#shop"}]},"products":{"show":true,"title":"Our Best Sellers","limit":5},"promo":{"show":true,"title":"A little more love for your skin","text":"Explore your everyday skincare essentials.","button":"Shop now","url":"#shop","image":""},"benefits":{"show":true,"items":["Made in Egypt","Thoughtfully selected ingredients","Cruelty-free","Delivery across Egypt"]},"reviews":{"show":true,"title":"Kind words from our customers","items":[{"name":"Your customer","text":"Customer feedback will appear here.","stars":5}]},"social":{"show":true,"title":"A little Dew every day","handle":"@dew_skincaree","images":["","","","","",""]},"newsletter":{"show":true,"title":"Stay in the glow","text":"Get updates, skincare tips and special offers.","button":"Join us"},"footer":{"show":true,"about":"Natural skincare, made with love in Egypt.","copyright":"All rights reserved.","links":[{"label":"About","url":"#about"},{"label":"Contact","url":"#contact"}]},"theme":{"green":"#1c524e","cream":"#fbf8f1","ink":"#183b35","accent":"#e7eee5"}};
  const h=D.settings.homepage||(D.settings.homepage=JSON.parse(JSON.stringify(base)));
  const val=(o,k,d='')=>o&&o[k]!==undefined?o[k]:d;
  const field=(path,label,value,type='text')=>`<div class="hp-field"><label>${label}</label><input type="${type}" data-hp="${path}" value="${esc(value??'')}"></div>`;
  const area=(path,label,value,rows=3)=>`<div class="hp-field hp-wide"><label>${label}</label><textarea rows="${rows}" data-hp="${path}">${esc(value??'')}</textarea></div>`;
  const toggle=(key,obj)=>`<label class="hp-toggle"><input type="checkbox" data-hp-show="${key}" ${obj.show!==false?'checked':''}><span class="hp-switch"></span><span>Show this section on the storefront</span></label>`;
  const photo=(path,label,value)=>`<div class="hp-photo-field"><div><label>${label}</label><small>Recommended: landscape image</small></div><div class="hp-photo-control">${value?`<img src="${esc(value)}" alt="">`:'<div class="hp-photo-empty">DEW</div>'}<label class="hp-upload">Upload photo<input type="file" accept="image/*" data-hp-upload="${path}"></label></div></div>`;
  const section=(id,title,desc,body,obj,key)=>`<article class="hp-card"><div class="hp-card-head"><div><span class="hp-step">${id}</span><div><h3>${title}</h3><p>${desc}</p></div></div>${toggle(key||id.toLowerCase(),obj||{})}</div><div class="hp-card-body">${body}</div></article>`;
  const categories=(h.categories.items||[]);
  const benefits=(h.benefits.items||[]);
  const socials=(h.social.images||['','','','','','']);
  $('#view').innerHTML=`
    <div class="hp-intro"><div><span class="admin-eyebrow">YOUR STOREFRONT</span><h2>Make your homepage yours.</h2><p>Change words, photos and sections here. No code or JSON needed.</p></div><a class="admin-view-store" href="./" target="_blank">Preview storefront ↗</a></div>
    <div class="hp-savebar"><div><b>Homepage changes</b><small>Changes are saved to your live storefront after publishing.</small></div><button class="admin-primary" id="homeSave">Save and publish changes</button></div>
    ${section('01','Announcement bar','The slim offer message at the top of your website.',field('announcement.text','Announcement text',val(h.announcement,'text'))+field('announcement.link','When clicked, go to',val(h.announcement,'link','#shop')),h.announcement,'announcement')}
    ${section('02','Main navigation','Your logo and links in the website header.',field('header.logo','Store logo text',val(h.header,'logo','Dew'))+(h.header.links||[]).map((x,i)=>field('header.links.'+i+'.label','Link '+(i+1)+' name',x.label)+field('header.links.'+i+'.url','Link '+(i+1)+' destination',x.url)).join(''),h.header,'header')}
    ${section('03','Hero banner','The large first section visitors see.',field('hero.title','Main headline',val(h.hero,'title'))+area('hero.text','Supporting text',val(h.hero,'text'),3)+field('hero.button','Button text',val(h.hero,'button'))+field('hero.url','Button destination',val(h.hero,'url'))+photo('hero.image','Hero image',val(h.hero,'image')),h.hero,'hero')}
    ${section('04','Shop by category','Show your main product categories.',field('categories.title','Section heading',val(h.categories,'title'))+categories.map((x,i)=>'<div class="hp-subcard"><b>Category '+(i+1)+'</b>'+field('categories.items.'+i+'.title','Category name',x.title)+field('categories.items.'+i+'.url','Category destination',x.url)+photo('categories.items.'+i+'.image','Category photo',x.image)+'</div>').join(''),h.categories,'categories')}
    ${section('05','Featured products','Choose the heading and how many products appear.',field('products.title','Section heading',val(h.products,'title'))+field('products.limit','Number of products to show',val(h.products,'limit',5),'number'),h.products,'products')}
    ${section('06','Promotional banner','A second banner for a campaign or special offer.',field('promo.title','Headline',val(h.promo,'title'))+area('promo.text','Supporting text',val(h.promo,'text'),2)+field('promo.button','Button text',val(h.promo,'button'))+field('promo.url','Button destination',val(h.promo,'url'))+photo('promo.image','Promotion image',val(h.promo,'image')),h.promo,'promo')}
    ${section('07','Why shop with Dew','The trust points shown below products.',area('benefits.items','One benefit per line',benefits.join('\n'),4),h.benefits,'benefits')}
    ${section('08','Customer reviews','The review section heading and first featured review.',field('reviews.title','Section heading',val(h.reviews,'title'))+field('reviews.items.0.name','Customer name',h.reviews.items?.[0]?.name||'')+area('reviews.items.0.text','Review text',h.reviews.items?.[0]?.text||'',2),h.reviews,'reviews')}
    ${section('09','Instagram gallery','Your Instagram heading and handle.',field('social.title','Section heading',val(h.social,'title'))+field('social.handle','Instagram handle',val(h.social,'handle'))+socials.map((x,i)=>photo('social.images.'+i,'Instagram photo '+(i+1),x)).join(''),h.social,'social')}
    ${section('10','Newsletter signup','The email signup section near the bottom.',field('newsletter.title','Headline',val(h.newsletter,'title'))+area('newsletter.text','Supporting text',val(h.newsletter,'text'),2)+field('newsletter.button','Button text',val(h.newsletter,'button')),h.newsletter,'newsletter')}
    ${section('11','Footer','The information at the bottom of your website.',area('footer.about','About your brand',val(h.footer,'about'),2)+field('footer.copyright','Copyright line',val(h.footer,'copyright')),h.footer,'footer')}
    <article class="hp-card"><div class="hp-card-head"><div><span class="hp-step">12</span><div><h3>Store colours</h3><p>Change the colours used across your homepage.</p></div></div></div><div class="hp-card-body hp-color-grid">${[['green','Main green'],['cream','Background'],['ink','Text'],['accent','Soft accent']].map(([k,l])=>`<div class="hp-color-field"><label>${l}</label><input type="color" data-hp="theme.${k}" value="${esc(h.theme?.[k]||'#1c524e')}"><code>${esc(h.theme?.[k]||'#1c524e')}</code></div>`).join('')}</div></article>
    <div class="hp-bottom-save"><button class="admin-primary" id="homeSaveBottom">Save and publish changes</button><a class="admin-view-store" href="./" target="_blank">Preview storefront ↗</a></div>`;
  const setPath=(obj,path,value)=>{const bits=path.split('.');let cur=obj;for(let i=0;i<bits.length-1;i++){const key=/^\d+$/.test(bits[i])?Number(bits[i]):bits[i];if(cur[key]===undefined)cur[key]=/^\d+$/.test(bits[i+1])?[]:{};cur=cur[key];}const last=bits.at(-1);cur[/^\d+$/.test(last)?Number(last):last]=value;};
  const bind=el=>{const path=el.dataset.hp;if(!path)return;let v=el.value;if(el.type==='number')v=Math.max(1,Math.min(20,Number(v)||5));if(path==='benefits.items')v=v.split('\n').map(x=>x.trim()).filter(Boolean);setPath(h,path,v);if(el.type==='color')el.nextElementSibling.textContent=v;};
  document.querySelectorAll('[data-hp]').forEach(el=>{el.addEventListener('input',()=>bind(el));el.addEventListener('change',()=>bind(el));});
  document.querySelectorAll('[data-hp-show]').forEach(el=>el.onchange=()=>{h[el.dataset.hpShow].show=el.checked;});
  $('#view').addEventListener('change',async event=>{const el=event.target.closest('[data-hp-upload]');if(!el)return;const file=el.files?.[0];if(!file)return;const box=el.closest('.hp-photo-field');const label=box.querySelector('.hp-upload');label.textContent='Uploading…';try{const path=await uploadImage(await resize(file));setPath(h,el.dataset.hpUpload,path);const preview=box.querySelector('.hp-photo-control');preview.querySelector('img,.hp-photo-empty')?.remove();const img=document.createElement('img');img.src=path;img.alt='';preview.prepend(img);label.innerHTML='Change photo<input type="file" accept="image/*" data-hp-upload="'+el.dataset.hpUpload+'">';toast('Photo uploaded. Remember to save and publish.');}catch(e){label.textContent='Upload failed';toast(e.message,true);}});
  const publish=()=>{D.settings.homepage=h;save('Update homepage design');};
  $('#homeSave').onclick=publish;$('#homeSaveBottom').onclick=publish;
}

/* ---------- overview / customers / inventory ---------- */
function overview() {
  const revenue=ordersList.reduce((n,o)=>n+Number(o.total||0),0);
  const low=D.products.filter(p=>Number(p.stock||0)<=5);
  const counts={};
  ordersList.forEach(o=>(o.lines||[]).forEach(l=>{const k=l.name||'Product';counts[k]=(counts[k]||0)+Number(l.qty||1);}));
  const top=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5);
  $('#view').innerHTML=`<div class="welcome-strip"><div><span class="admin-eyebrow">WELCOME TO YOUR STORE</span><h2>Good to see you.</h2><p>Here is what is happening with Dew Skincare.</p></div><a class="admin-primary" href="./" target="_blank">View storefront ↗</a></div>
    <div class="overview-stats">
      <article><span>Total products</span><b>${D.products.length}</b><small>In your catalogue</small></article>
      <article><span>Total orders</span><b>${ordersList.length}</b><small>Orders recorded</small></article>
      <article><span>Order value</span><b>${egp(revenue)}</b><small>Across all saved orders</small></article>
      <article><span>Low stock</span><b>${low.length}</b><small>Products with 5 or fewer left</small></article>
    </div>
    <div class="overview-columns"><article class="admin-panel"><div class="panel-heading"><div><h3>Recent orders</h3><p>Your latest customer orders</p></div><button class="text-link" data-go="orders">View all</button></div>${ordersList.slice().reverse().slice(0,5).map(o=>`<div class="overview-row"><div><b>${esc(o.customer?.first||'Customer')} ${esc(o.customer?.last||'')}</b><small>#${esc(o.number||'—')} · ${esc(new Date(o.date||Date.now()).toLocaleDateString())}</small></div><strong>${egp(o.total||0)}</strong></div>`).join('')||'<p class="empty-note">No orders yet. New orders will appear here.</p>'}</article>
    <article class="admin-panel"><div class="panel-heading"><div><h3>Top products</h3><p>Based on saved orders</p></div><button class="text-link" data-go="products">Manage</button></div>${top.map(([n,c])=>`<div class="overview-row"><b>${esc(n)}</b><strong>${c} sold</strong></div>`).join('')||'<p class="empty-note">Sales data will appear here when orders come in.</p>'}<div class="low-stock-note"><b>${low.length} products need attention</b><small>${low.slice(0,3).map(p=>esc(p.name)+' ('+p.stock+')').join(' · ')||'All products have more than 5 in stock.'}</small><button class="text-link" data-go="inventory">Open inventory</button></div></article></div>`;
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{tab=b.dataset.go;render();});
}
function customers() {
  const map=new Map();
  ordersList.forEach(o=>{const c=o.customer||{};const key=c.phone||c.whatsapp||((c.first||'')+(c.last||''));if(!map.has(key))map.set(key,{...c,count:0,total:0,last:o.date});const x=map.get(key);x.count++;x.total+=Number(o.total||0);if(new Date(o.date||0)>new Date(x.last||0))x.last=o.date;});
  const rows=[...map.values()];
  $('#view').innerHTML=`<div class="page-heading"><div><h2>Customers</h2><p>Customer details collected from orders.</p></div><span class="admin-count">${rows.length} customers</span></div><div class="admin-panel table-panel"><div class="admin-table-wrap"><table><thead><tr><th>Customer</th><th>Phone</th><th>Orders</th><th>Total spent</th><th>Last order</th></tr></thead><tbody>${rows.map(c=>`<tr><td><b>${esc((c.first||'')+' '+(c.last||''))}</b></td><td>${esc(c.phone||'—')}</td><td>${c.count}</td><td>${egp(c.total)}</td><td>${c.last?new Date(c.last).toLocaleDateString():'—'}</td></tr>`).join('')||'<tr><td colspan="5">Customers appear here after their first order.</td></tr>'}</tbody></table></div></div>`;
}
function inventory() {
  const rows=D.products.slice().sort((a,b)=>Number(a.stock||0)-Number(b.stock||0));
  $('#view').innerHTML=`<div class="page-heading"><div><h2>Inventory</h2><p>Keep track of available stock for every product.</p></div><span class="admin-count">${rows.reduce((n,p)=>n+Number(p.stock||0),0)} units in stock</span></div><div class="admin-panel table-panel"><div class="admin-table-wrap"><table><thead><tr><th>Product</th><th>Price</th><th>Available</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(p=>`<tr><td><b>${esc(p.name)}</b></td><td>${egp(p.salePrice>0&&p.salePrice<p.price?p.salePrice:p.price)}</td><td><input class="stock-input" type="number" min="0" value="${Number(p.stock||0)}" data-inv="${p.id}"></td><td><span class="stock-status ${p.stock<=0?'out':p.stock<=5?'low':''}">${p.stock<=0?'Out of stock':p.stock<=5?'Low stock':'In stock'}</span></td><td><button class="text-link" data-edit-inv="${p.id}">Edit product</button></td></tr>`).join('')}</tbody></table></div></div>`;
  document.querySelectorAll('[data-inv]').forEach(el=>el.onchange=()=>{const p=D.products.find(x=>x.id===el.dataset.inv);p.stock=Math.max(0,Math.floor(Number(el.value)||0));save('Update inventory for '+p.name);inventory();});
  document.querySelectorAll('[data-edit-inv]').forEach(b=>b.onclick=()=>productForm(b.dataset.editInv));
}

/* ---------- products ---------- */
/* ---------- products ---------- */
function products() {
  const list = D.products.filter(p => !q || (p.name + p.tags).toLowerCase().includes(q.toLowerCase()));
  $('#view').innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><h2>Products</h2><button class="btn red" id="newP">+ New product</button></div>
    <p class="note">Manage your catalog items, prices, and stock.</p>
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
    <div class="full"><label>Photos (first is cover, up to 8)</label><div class="imgs" id="imgs"></div><input type="file" id="pf" accept="image/*" multiple></div>
    <div><label><input type="checkbox" id="pv" ${p.visible ? 'checked' : ''} style="width:auto"> Visible in store</label></div>
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
    img.onerror = () => rej(new Error('Could not read image.'));
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
    if (D.products.some(p => p.catalog === c.id)) { alert('Move or delete products in this catalog first.'); return; }
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

/* ---------- orders ---------- */
function orders() {
  $('#view').innerHTML = `<h2>Orders (${ordersList.length})</h2>
    <p class="note">View and manage customer orders, payment status, fulfillment, and tracking numbers.</p>
    <div class="scroll"><table>
      <tr><th>Order #</th><th>Date</th><th>Customer</th><th>Total</th><th>Payment</th><th>Fulfillment</th><th>Tracking #</th><th></th></tr>
      ${ordersList.length ? ordersList.map((o, idx) => `<tr>
        <td><b>${esc(o.number)}</b></td>
        <td>${esc(new Date(o.date || Date.now()).toLocaleDateString())}</td>
        <td>${esc(o.customer.first + ' ' + o.customer.last)}<br><small class="note">${esc(o.customer.phone)}</small></td>
        <td><b>${egp(o.total)}</b></td>
        <td><select data-opay="${idx}" style="padding:4px 6px;border-radius:6px;border:1px solid #cfd3cc">
          <option ${o.paymentStatus === 'Unpaid (COD)' ? 'selected' : ''}>Unpaid (COD)</option>
          <option ${o.paymentStatus === 'Paid' ? 'selected' : ''}>Paid</option>
        </select></td>
        <td><select data-ofull="${idx}" style="padding:4px 6px;border-radius:6px;border:1px solid #cfd3cc">
          <option ${o.fulfillmentStatus === 'Pending' ? 'selected' : ''}>Pending</option>
          <option ${o.fulfillmentStatus === 'Processing' ? 'selected' : ''}>Processing</option>
          <option ${o.fulfillmentStatus === 'Shipped' ? 'selected' : ''}>Shipped</option>
          <option ${o.fulfillmentStatus === 'Delivered' ? 'selected' : ''}>Delivered</option>
          <option ${o.fulfillmentStatus === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
        </select></td>
        <td><input type="text" value="${esc(o.trackingNumber || '')}" placeholder="Tracking #" data-otrack="${idx}" style="width:110px;padding:4px 6px;border:1px solid #cfd3cc;border-radius:6px"></td>
        <td style="white-space:nowrap"><button class="btn small" data-view="${idx}">View</button> <button class="btn small ghost" data-delord="${idx}" style="color:var(--red)">Delete</button></td>
      </tr>`).join('') : '<tr><td colspan="8" class="note">No orders yet. Orders placed on your website will appear here automatically.</td></tr>'}
    </table></div>`;

  document.querySelectorAll('[data-opay]').forEach(sel => sel.onchange = () => {
    ordersList[sel.dataset.opay].paymentStatus = sel.value;
    saveOrders('Update payment status');
  });

  document.querySelectorAll('[data-ofull]').forEach(sel => sel.onchange = () => {
    ordersList[sel.dataset.ofull].fulfillmentStatus = sel.value;
    saveOrders('Update fulfillment status');
  });

  document.querySelectorAll('[data-otrack]').forEach(input => input.onchange = () => {
    ordersList[input.dataset.otrack].trackingNumber = input.value.trim();
    saveOrders('Update tracking number');
  });

  document.querySelectorAll('[data-view]').forEach(btn => btn.onclick = () => {
    const o = ordersList[btn.dataset.view];
    const c = o.customer;
    modal(`<h2>Order ${esc(o.number)}</h2>
      <p><b>Date:</b> ${new Date(o.date || Date.now()).toLocaleString()}</p>
      <p><b>Payment Status:</b> ${esc(o.paymentStatus || 'Unpaid (COD)')} | <b>Fulfillment:</b> ${esc(o.fulfillmentStatus || 'Pending')}</p>
      <p><b>Tracking Number:</b> ${esc(o.trackingNumber || 'None yet')}</p>
      <h3>Customer details</h3>
      <p><b>Name:</b> ${esc(c.first + ' ' + c.last)}<br><b>Phone:</b> ${esc(c.phone)}<br><b>WhatsApp:</b> ${esc(c.whatsapp)}<br><b>Area:</b> ${o.area === 'alex' ? 'Alexandria' : 'Cairo & Giza'}<br><b>Address:</b> ${esc(c.address)}</p>
      <h3>Order items</h3>
      <ul>${o.lines.map(l => `<li>${esc(l.name)} &times; ${l.qty} — ${egp(l.total)} (${egp(l.unit)} each)</li>`).join('')}</ul>
      <p><b>Items Cost:</b> ${egp(o.itemsTotal)}<br><b>Shipping Cost:</b> ${egp(o.delivery)}<br>${o.discount ? '<b>Discount (' + esc(o.promoCode) + '):</b> -' + egp(o.discount) + '<br>' : ''}<b>Total:</b> ${egp(o.total)}</p>
      <button class="btn red" id="mCloseBtn" style="margin-top:12px">Close</button>`);
    $('#mCloseBtn').onclick = closeModal;
  });

  document.querySelectorAll('[data-delord]').forEach(btn => btn.onclick = () => {
    if (confirm('Delete this order record?')) {
      ordersList.splice(btn.dataset.delord, 1);
      render();
      saveOrders('Delete order');
    }
  });
}

/* ---------- discounts ---------- */
function discounts() {
  if (!D.discounts) D.discounts = [];
  $('#view').innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><h2>Promo Codes & Discounts</h2><button class="btn red" id="newDisc">+ New promo code</button></div>
    <p class="note">Create Shopify-style promo codes for percentage discounts, fixed amounts, or free shipping.</p>
    <div class="scroll"><table><tr><th>Code</th><th>Type</th><th>Value</th><th>Min Spend</th><th>Status</th><th></th></tr>
    ${D.discounts.map(d => `<tr>
      <td><b>${esc(d.code)}</b></td>
      <td>${d.type === 'percentage' ? 'Percentage (%)' : d.type === 'fixed' ? 'Fixed amount (EGP)' : 'Free Shipping'}</td>
      <td>${d.type === 'percentage' ? d.value + '%' : d.type === 'fixed' ? egp(d.value) : 'Free delivery'}</td>
      <td>${d.minSpend ? egp(d.minSpend) : 'None'}</td>
      <td><button class="pill ${d.active ? 'g' : ''}" data-toggledisc="${d.id}" style="border:0;cursor:pointer">${d.active ? 'Active' : 'Inactive'}</button></td>
      <td style="white-space:nowrap"><button class="btn small" data-editdisc="${d.id}">Edit</button> <button class="btn small ghost" data-deldisc="${d.id}" style="color:var(--red)">Delete</button></td>
    </tr>`).join('') || '<tr><td colspan="6" class="note">No promo codes created yet.</td></tr>'}</table></div>`;

  $('#newDisc').onclick = () => discForm();
  document.querySelectorAll('[data-editdisc]').forEach(b => b.onclick = () => discForm(b.dataset.editdisc));
  document.querySelectorAll('[data-toggledisc]').forEach(b => b.onclick = () => {
    const d = D.discounts.find(x => x.id === b.dataset.toggledisc);
    d.active = !d.active; render(); save('Toggle discount ' + d.code);
  });
  document.querySelectorAll('[data-deldisc]').forEach(b => b.onclick = () => {
    const d = D.discounts.find(x => x.id === b.dataset.deldisc);
    if (confirm('Delete promo code "' + d.code + '"?')) {
      D.discounts = D.discounts.filter(x => x !== d); render(); save('Delete discount ' + d.code);
    }
  });
}

function discForm(id) {
  const d = id ? D.discounts.find(x => x.id === id) : { id: uid(), code: '', type: 'percentage', value: 10, minSpend: 0, active: true };
  modal(`<h2>${id ? 'Edit' : 'New'} promo code</h2><div class="form-grid">
    <div class="full"><label>Promo code</label><input id="dc" value="${esc(d.code)}" placeholder="e.g. SAVE20"></div>
    <div><label>Discount type</label><select id="dt">
      <option value="percentage" ${d.type === 'percentage' ? 'selected' : ''}>Percentage (%)</option>
      <option value="fixed" ${d.type === 'fixed' ? 'selected' : ''}>Fixed amount (EGP)</option>
      <option value="free_shipping" ${d.type === 'free_shipping' ? 'selected' : ''}>Free shipping</option>
    </select></div>
    <div><label>Value (percentage or EGP)</label><input id="dv" type="number" min="0" value="${d.value}"></div>
    <div class="full"><label>Minimum order spend (EGP, 0 for none)</label><input id="dm" type="number" min="0" value="${d.minSpend || 0}"></div>
    <div class="full"><label><input type="checkbox" id="da" ${d.active ? 'checked' : ''} style="width:auto"> Active</label></div></div>
    <div class="err" id="me"></div>
    <div style="display:flex;gap:8px;margin-top:10px"><button class="btn red" id="dSave">Save</button><button class="btn ghost" id="dX">Cancel</button></div>`);
  $('#dX').onclick = closeModal;
  $('#dSave').onclick = () => {
    const code = $('#dc').value.trim().toUpperCase();
    if (!code) { $('#me').textContent = 'Promo code is required.'; return; }
    d.code = code;
    d.type = $('#dt').value;
    d.value = Number($('#dv').value) || 0;
    d.minSpend = Number($('#dm').value) || 0;
    d.active = $('#da').checked;
    if (!id) D.discounts.push(d);
    closeModal(); render(); save('Promo code ' + code);
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
    <div class="full">${f('telegramProxyUrl', 'Telegram proxy URL (Vercel api/telegram)')}</div>
    <div class="full"><label><input type="checkbox" id="s_telegramEnabled" ${s.telegramEnabled ? 'checked' : ''} style="width:auto"> Enable Telegram order notifications</label></div>
    </div><button class="btn red" id="ss" style="margin-top:10px">Save settings</button></div>`;
  $('#ss').onclick = () => {
    for (const k of Object.keys(s)) {
      const el = $('#s_' + k);
      if (el) {
        if (el.type === 'checkbox') s[k] = el.checked;
        else s[k] = el.type === 'number' ? Math.max(0, Number(el.value) || 0) : el.value.trim();
      }
    }
    save('Update store settings');
  };
}

/* ---------- help ---------- */
function help() {
  $('#view').innerHTML = `<h2>How this works</h2><div class="box">
    <p>This shop lives on GitHub. Every order placed on your website is automatically saved in your <b>orders.json</b> file and sent instantly to your Telegram bot.</p>
    <p><b>Orders</b> include payment status tracking (Paid vs COD), fulfillment statuses (Pending, Processing, Shipped, Delivered, Cancelled), and delivery tracking numbers.</p>
    <p><b>Promo Codes</b> can be created in the Discounts tab and applied by customers at checkout.</p></div>`;
}

start();
