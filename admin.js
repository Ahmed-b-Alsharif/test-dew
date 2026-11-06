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
  const base={"announcement":{"show":true,"text":"Buy 2 Get 1 Free | Free delivery on orders over 600 EGP","link":"#shop"},"header":{"logo":"Dew","logoImage":"","links":[{"label":"Shop","url":"#shop"},{"label":"Our Story","url":"#about"},{"label":"Contact","url":"#contact"}]},"hero":{"show":true,"title":"Your Skin. Your Natural Glow.","text":"Thoughtful skincare, made with love in Egypt.","button":"Discover the collection","url":"#shop","image":""},"categories":{"show":true,"title":"Shop by category","items":[{"title":"Face Care","image":"","url":"#shop"},{"title":"Lip Care","image":"","url":"#shop"},{"title":"Body Care","image":"","url":"#shop"},{"title":"Hair Care","image":"","url":"#shop"}]},"products":{"show":true,"title":"Our Best Sellers","limit":5},"promo":{"show":true,"title":"A little more love for your skin","text":"Explore your everyday skincare essentials.","button":"Shop now","url":"#shop","image":""},"benefits":{"show":true,"items":["Made in Egypt","Thoughtfully selected ingredients","Cruelty-free","Delivery across Egypt"]},"reviews":{"show":true,"title":"Kind words from our customers","items":[{"name":"Your customer","text":"Customer feedback will appear here.","stars":5}]},"social":{"show":true,"title":"A little Dew every day","handle":"@dew_skincaree","images":["","","","","",""]},"newsletter":{"show":true,"title":"Stay in the glow","text":"Get updates, skincare tips and special offers.","button":"Join us"},"footer":{"show":true,"about":"Natural skincare, made with love in Egypt.","copyright":"All rights reserved.","links":[{"label":"About","url":"#about"},{"label":"Contact","url":"#contact"}]},"theme":{"green":"#1c524e","cream":"#fbf8f1","ink":"#183b35","accent":"#e7eee5"}};
  const h=D.settings.homepage||(D.settings.homepage=JSON.parse(JSON.stringify(base)));
  const mergeObj=(a,b)=>{if(!b)return a;for(const k of Object.keys(b)){if(b[k]&&typeof b[k]==='object'&&!Array.isArray(b[k]))a[k]=mergeObj(a[k]||{},b[k]);else a[k]=b[k];}return a;};mergeObj(h,base);
  const sections=[['announcement','Announcement bar','Offer strip at the very top'],['header','Header & logo','Logo and navigation links'],['hero','Hero banner','Main image and headline'],['categories','Collection list','Shop by category tiles'],['products','Featured products','Product cards on homepage'],['promo','Image banner','Second promotional banner'],['benefits','Benefits','Trust and delivery messages'],['reviews','Reviews','Customer testimonials'],['social','Instagram gallery','Social photo strip'],['newsletter','Newsletter','Email signup area'],['footer','Footer','Bottom links and brand details']];
  let selected='hero';
  const pathSet=(obj,path,value)=>{const bits=path.split('.');let cur=obj;for(let i=0;i<bits.length-1;i++){const k=/^\d+$/.test(bits[i])?+bits[i]:bits[i];if(cur[k]===undefined)cur[k]=/^\d+$/.test(bits[i+1])?[]:{};cur=cur[k];}const last=bits.at(-1);cur[/^\d+$/.test(last)?+last:last]=value;};
  const field=(path,label,value,type='text')=>`<div class="editor-field"><label>${label}</label><input type="${type}" data-hp="${path}" value="${esc(value??'')}"></div>`;
  const area=(path,label,value)=>`<div class="editor-field"><label>${label}</label><textarea rows="3" data-hp="${path}">${esc(value??'')}</textarea></div>`;
  const photo=(path,label,value)=>`<div class="editor-field"><label>${label}</label><div class="homepage-upload-preview">${value?'<img src="'+esc(value)+'" alt="">':'<span>Image preview</span>'}<label class="media-add">Upload photo<input type="file" accept="image/*" data-hp-upload="${path}"></label></div></div>`;
  const editorFor=key=>{
    const x=h[key]||{};
    if(key==='announcement')return field('announcement.text','Announcement text',x.text)+field('announcement.link','Link destination',x.link);
    if(key==='header')return field('header.logo','Logo text (used if no logo image)',x.logo)+photo('header.logoImage','Store logo',x.logoImage)+(x.links||[]).map((v,i)=>field('header.links.'+i+'.label','Navigation link '+(i+1),v.label)+field('header.links.'+i+'.url','Link destination',v.url)).join('');
    if(key==='hero')return field('hero.title','Headline',x.title)+area('hero.text','Supporting text',x.text)+field('hero.button','Button label',x.button)+field('hero.url','Button destination',x.url)+photo('hero.image','Hero image',x.image);
    if(key==='categories')return field('categories.title','Section heading',x.title)+(x.items||[]).map((v,i)=>'<div class="editor-subgroup"><b>Category '+(i+1)+'</b>'+field('categories.items.'+i+'.title','Name',v.title)+field('categories.items.'+i+'.url','Destination',v.url)+photo('categories.items.'+i+'.image','Category image',v.image)+'</div>').join('');
    if(key==='products')return field('products.title','Section heading',x.title)+field('products.limit','Number of products',x.limit,'number');
    if(key==='promo')return field('promo.title','Headline',x.title)+area('promo.text','Supporting text',x.text)+field('promo.button','Button label',x.button)+field('promo.url','Button destination',x.url)+photo('promo.image','Banner image',x.image);
    if(key==='benefits')return area('benefits.items','One benefit per line',(x.items||[]).join('\n'));
    if(key==='reviews')return field('reviews.title','Section heading',x.title)+field('reviews.items.0.name','Customer name',x.items?.[0]?.name)+area('reviews.items.0.text','Review text',x.items?.[0]?.text);
    if(key==='social')return field('social.title','Section heading',x.title)+field('social.handle','Instagram handle',x.handle)+(x.images||[]).map((v,i)=>photo('social.images.'+i,'Instagram photo '+(i+1),v)).join('');
    if(key==='newsletter')return field('newsletter.title','Headline',x.title)+area('newsletter.text','Supporting text',x.text)+field('newsletter.button','Button label',x.button);
    if(key==='footer')return area('footer.about','About Dew',x.about)+field('footer.copyright','Copyright text',x.copyright);
    return '';
  };
  const preview=()=>{
    const image=(src,cls='')=>src?'<img class="'+cls+'" src="'+esc(src)+'" alt="">':'<div class="'+cls+' homepage-preview-placeholder">DEW</div>';
    const P=D.products.filter(p=>p.visible);
    $('#homepageLivePreview').innerHTML=`
      <div class="hp-preview-ann">${h.announcement.show?esc(h.announcement.text):'Announcement bar hidden'}</div>
      <div class="hp-preview-header"><b>${h.header.logoImage?image(h.header.logoImage,'hp-preview-logo'):esc(h.header.logo)}</b><span>☰　Shop　Our Story　Contact　　♧</span></div>
      ${h.hero.show?'<section class="hp-preview-hero"><div><small>NATURAL SKINCARE · MADE IN EGYPT</small><h2>'+esc(h.hero.title)+'</h2><p>'+esc(h.hero.text)+'</p><span>'+esc(h.hero.button)+'</span></div>'+image(h.hero.image)+'</section>':''}
      ${h.categories.show?'<section class="hp-preview-section"><small>EXPLORE</small><h3>'+esc(h.categories.title)+'</h3><div class="hp-preview-cats">'+(h.categories.items||[]).map(v=>'<div>'+image(v.image)+'<b>'+esc(v.title)+'</b></div>').join('')+'</div></section>':''}
      ${h.products.show?'<section class="hp-preview-section"><small>THE DEW EDIT</small><h3>'+esc(h.products.title)+'</h3><div class="hp-preview-products">'+P.slice(0,4).map(p=>'<div>'+image(p.images?.[0])+'<b>'+esc(p.name)+'</b></div>').join('')+'</div></section>':''}
      ${h.promo.show?'<section class="hp-preview-promo">'+image(h.promo.image)+'<div><h3>'+esc(h.promo.title)+'</h3><p>'+esc(h.promo.text)+'</p><span>'+esc(h.promo.button)+'</span></div></section>':''}
      <div class="hp-preview-footer">Dew Skincare · Made in Egypt</div>`;
  };
  const drawEditor=()=>{
    const sec=sections.find(v=>v[0]===selected)||sections[2];
    $('#homepageSectionNav').innerHTML=sections.map(([k,n,d])=>`<button class="hp-section-nav ${selected===k?'active':''}" data-section="${k}"><b>${n}</b><small>${d}</small><span>${h[k]?.show===false?'Hidden':'Visible'}</span></button>`).join('');
    $('#homepageEditorPanel').innerHTML=`<div class="homepage-editor-title"><div><span class="admin-eyebrow">EDITING STOREFRONT SECTION</span><h3>${sec[1]}</h3><p>${sec[2]}</p></div><label class="editor-check"><input type="checkbox" id="sectionVisible" ${h[selected]?.show===false?'':'checked'}> Show section</label></div><div class="homepage-editor-fields">${editorFor(selected)}</div><div class="homepage-editor-footer"><button class="admin-primary" id="saveHomepage">Save and publish</button></div>`;
    document.querySelectorAll('[data-section]').forEach(b=>b.onclick=()=>{selected=b.dataset.section;drawEditor();});
    $('#sectionVisible').onchange=e=>{h[selected].show=e.target.checked;drawEditor();preview();};
    document.querySelectorAll('[data-hp]').forEach(el=>{const update=()=>{let v=el.value;if(el.type==='number')v=Math.min(20,Math.max(1,Number(v)||5));if(selected==='benefits'&&el.dataset.hp==='benefits.items')v=v.split('\n').map(x=>x.trim()).filter(Boolean);pathSet(h,el.dataset.hp,v);preview();};el.oninput=update;el.onchange=update;});
    $('#homepageEditorPanel').addEventListener('change',async e=>{const el=e.target.closest('[data-hp-upload]');if(!el)return;const file=el.files?.[0];if(!file)return;try{const path=await uploadImage(await resize(file));pathSet(h,el.dataset.hpUpload,path);drawEditor();preview();toast('Image uploaded. Save and publish to show it on the storefront.');}catch(err){toast(err.message,true);}});
    $('#saveHomepage').onclick=()=>save('Update homepage');
  };
  $('#view').innerHTML=`<div class="hp-intro"><div><span class="admin-eyebrow">ONLINE STORE / THEME EDITOR</span><h2>Edit your storefront visually.</h2><p>Select a section on the left. The preview shows exactly which part you are changing.</p></div><a class="admin-view-store" href="./" target="_blank">Open live store ↗</a></div><div class="homepage-theme-editor"><aside class="homepage-section-list"><div class="homepage-section-list-head"><b>Homepage sections</b><small>Click a section to edit it</small></div><div id="homepageSectionNav"></div></aside><section class="homepage-editor-work"><div class="homepage-editor-card" id="homepageEditorPanel"></div><div class="homepage-preview-card"><div class="homepage-preview-top"><b>Live preview</b><span>Visual guide · Desktop</span></div><div class="homepage-preview-browser"><div class="homepage-browser-dots">● ● ●</div><div id="homepageLivePreview"></div></div></div></section></div>`;
  drawEditor();preview();
}

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
  const query=q.toLowerCase();
  const list=D.products.filter(p=>(!query||(p.name+' '+(p.tags||'')).toLowerCase().includes(query)));
  const live=D.products.filter(p=>p.visible).length;
  const low=D.products.filter(p=>Number(p.stock||0)<=5).length;
  $('#view').innerHTML=`
    <div class="shopify-page-head"><div><span class="admin-eyebrow">CATALOGUE</span><h2>Products</h2><p>Manage your products, prices, stock and storefront visibility.</p></div><button class="admin-primary" id="newP">＋ Add product</button></div>
    <div class="shopify-metrics"><div><span>All products</span><b>${D.products.length}</b></div><div><span>Active</span><b>${live}</b></div><div><span>Low stock</span><b>${low}</b></div></div>
    <div class="shopify-toolbar"><div class="shopify-search"><span>⌕</span><input id="q" value="${esc(q)}" placeholder="Search products by name or tag"></div><span class="shopify-muted">${list.length} products</span></div>
    <div class="admin-panel table-panel"><div class="admin-table-wrap"><table class="shopify-table"><thead><tr><th>Product</th><th>Status</th><th>Collection</th><th>Price</th><th>Inventory</th><th>Homepage</th><th></th></tr></thead><tbody>
    ${list.map(p=>`<tr><td><div class="product-cell"><div class="product-thumb">${p.images?.[0]?`<img src="${esc(p.images[0])}" alt="">`:'<span>DEW</span>'}</div><div><b>${esc(p.name)}</b><small>${esc(p.tags||'No tags')}</small></div></div></td>
      <td><span class="shopify-status ${p.visible?'is-live':'is-draft'}"><i></i>${p.visible?'Active':'Draft'}</span></td>
      <td>${esc(catName(p.catalog))}</td><td><b>${p.salePrice>0&&p.salePrice<p.price?egp(p.salePrice):egp(p.price)}</b>${p.salePrice>0&&p.salePrice<p.price?`<small class="old-price">${egp(p.price)}</small>`:''}</td>
      <td><span class="${Number(p.stock||0)<=5?'inventory-low':''}">${Number(p.stock||0)} in stock</span></td>
      <td>${p.featured?'<span class="shopify-featured">Featured</span>':'—'}</td>
      <td><div class="table-actions"><button class="text-link" data-e="${p.id}">Edit</button><button class="text-link danger-link" data-x="${p.id}">Delete</button></div></td></tr>`).join('')||'<tr><td colspan="7" class="empty-note">No products found. Add your first product to get started.</td></tr>'}
    </tbody></table></div></div>`;
  $('#newP').onclick=()=>productForm();
  const search=$('#q');search.oninput=()=>{q=search.value;const pos=q.length;products();const next=$('#q');next.focus();next.setSelectionRange(pos,pos);};
  document.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>productForm(b.dataset.e));
  document.querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>{const p=D.products.find(x=>x.id===b.dataset.x);if(p&&confirm('Delete "'+p.name+'"?')){D.products=D.products.filter(x=>x!==p);render();save('Delete '+p.name);}});
}
function productForm(id) {
  const p = id ? D.products.find(x => x.id === id) : { name:'', catalog:D.catalogs[0]?.id||'', price:'', salePrice:'', stock:0, description:'', howToUse:'', tags:'', images:[], visible:true, featured:false };
  if (!p) return;
  let images=[...(p.images||[])];
  const moneyLabel=n=>'EGP '+Number(n||0).toLocaleString('en-US');
  $('#view').innerHTML=`
    <div class="editor-breadcrumb"><button class="text-link" id="backProducts">← Products</button><span>/</span><b>${id?'Edit product':'Add product'}</b></div>
    <div class="shopify-page-head product-editor-head"><div><span class="admin-eyebrow">PRODUCTS / ${id?'EDIT':'NEW'}</span><h2>${id?esc(p.name):'Add product'}</h2><p>Organize product details just like Shopify Admin.</p></div><div class="editor-head-actions"><button class="admin-view-store" id="cancelProduct">Discard</button><button class="admin-primary" id="saveProduct">Save</button></div></div>
    <div class="product-editor-layout">
      <div class="product-editor-main">
        <section class="editor-panel"><h3>Product information</h3><div class="editor-field"><label>Title</label><input id="pn" value="${esc(p.name)}" placeholder="e.g. Dew Lip Balm"></div><div class="editor-field"><label>Description</label><textarea id="pdesc" rows="6" placeholder="Describe your product">${esc(p.description)}</textarea></div></section>
        <section class="editor-panel"><div class="editor-panel-title"><h3>Media</h3><span>Up to 8 images</span></div><div class="product-media-grid" id="productMedia"></div><label class="media-add">＋ Add images<input type="file" id="pf" accept="image/*" multiple></label><p class="editor-hint">The first image is the main product photo customers see.</p></section>
        <section class="editor-panel"><h3>Pricing</h3><div class="editor-two-col"><div class="editor-field"><label>Price (EGP)</label><input id="pp" type="number" min="0" step="1" value="${esc(p.price)}"></div><div class="editor-field"><label>Compare-at price / Sale price (EGP)</label><input id="pd" type="number" min="0" step="1" value="${esc(p.salePrice||'')}"><small>Enter a lower price to show a sale.</small></div></div><div class="price-preview" id="pricePreview">${moneyLabel(p.salePrice>0&&p.salePrice<p.price?p.salePrice:p.price)}</div></section>
        <section class="editor-panel"><h3>Inventory</h3><div class="editor-field"><label>Available quantity</label><input id="ps" type="number" min="0" step="1" value="${Number(p.stock||0)}"></div><p class="editor-hint">Stock is updated when customers place orders.</p></section>
        <section class="editor-panel"><h3>Product organization</h3><div class="editor-two-col"><div class="editor-field"><label>Collection</label><select id="pc">${D.catalogs.map(c=>`<option value="${esc(c.id)}" ${c.id===p.catalog?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="editor-field"><label>Tags</label><input id="ptags" value="${esc(p.tags||'')}" placeholder="lip care, skincare, gift"></div></div><div class="editor-field"><label>How to use</label><textarea id="phow" rows="3" placeholder="Usage instructions">${esc(p.howToUse||'')}</textarea></div></section>
      </div>
      <aside class="product-editor-side"><section class="editor-panel"><h3>Status</h3><select id="pvStatus"><option value="active" ${p.visible?'selected':''}>Active</option><option value="draft" ${!p.visible?'selected':''}>Draft</option></select><p class="editor-hint">Active products can appear in your storefront.</p></section><section class="editor-panel"><h3>Sales channels</h3><label class="editor-check"><input id="pfe" type="checkbox" ${p.featured?'checked':''}> Feature on homepage</label><p class="editor-hint">Featured products appear in the homepage product section.</p></section><section class="editor-panel"><h3>Store preview</h3><div class="mini-product-preview" id="miniProductPreview"><div class="mini-product-photo">${images[0]?'<img src="'+esc(images[0])+'" alt="">':'<span>DEW</span>'}</div><b id="miniProductName">${esc(p.name||'Product title')}</b><span id="miniProductPrice">${moneyLabel(p.salePrice>0&&p.salePrice<p.price?p.salePrice:p.price)}</span></div></section></aside>
    </div>`;
  const paint=()=>{$('#productMedia').innerHTML=images.map((u,i)=>`<div class="product-media-item"><img src="${esc(u)}" alt=""><button type="button" data-remove-image="${i}" aria-label="Remove image">×</button>${i===0?'<small>Cover</small>':''}</div>`).join('')+'<div class="product-media-empty">＋</div>';document.querySelectorAll('[data-remove-image]').forEach(b=>b.onclick=()=>{images.splice(+b.dataset.removeImage,1);paint();});const mini=$('#miniProductPreview .mini-product-photo');mini.innerHTML=images[0]?'<img src="'+esc(images[0])+'" alt="">':'<span>DEW</span>';};
  const refreshPreview=()=>{$('#miniProductName').textContent=$('#pn').value||'Product title';const v=Number($('#pd').value)>0&&Number($('#pd').value)<Number($('#pp').value)?Number($('#pd').value):Number($('#pp').value);$('#miniProductPrice').textContent=moneyLabel(v);$('#pricePreview').textContent=moneyLabel(v);};
  paint();$('#backProducts').onclick=()=>{tab='products';render();};$('#cancelProduct').onclick=()=>{tab='products';render();};
  $('#pn').oninput=refreshPreview;$('#pp').oninput=refreshPreview;$('#pd').oninput=refreshPreview;
  $('#pf').onchange=async e=>{const files=[...e.target.files];if(images.length+files.length>8){toast('You can add up to 8 product photos.',true);}for(const file of files.slice(0,8-images.length)){try{const path=await uploadImage(await resize(file));images.push(path);paint();}catch(err){toast(err.message,true);break;}}e.target.value='';};
  $('#saveProduct').onclick=()=>{const name=$('#pn').value.trim(),price=Number($('#pp').value);if(!name){toast('Product title is required.',true);return;}if(!(price>0)){toast('Enter a valid price.',true);return;}const data={name,catalog:$('#pc').value,price,salePrice:Number($('#pd').value)||0,stock:Math.max(0,Math.floor(Number($('#ps').value)||0)),description:$('#pdesc').value.trim(),howToUse:$('#phow').value.trim(),tags:$('#ptags').value.trim(),images,visible:$('#pvStatus').value==='active',featured:$('#pfe').checked};if(id)Object.assign(p,data);else D.products.unshift({id:uid(),...data});tab='products';render();save((id?'Update ':'Add ')+name);};
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
  const rows=D.catalogs.map(c=>({...c,items:D.products.filter(p=>p.catalog===c.id)}));
  $('#view').innerHTML=`
    <div class="shopify-page-head"><div><span class="admin-eyebrow">PRODUCT ORGANIZATION</span><h2>Collections</h2><p>Group products so customers can browse your store easily.</p></div><button class="admin-primary" id="newC">＋ Create collection</button></div>
    <div class="shopify-metrics"><div><span>Collections</span><b>${rows.length}</b></div><div><span>Products assigned</span><b>${D.products.filter(p=>D.catalogs.some(c=>c.id===p.catalog)).length}</b></div><div><span>Unassigned products</span><b>${D.products.filter(p=>!D.catalogs.some(c=>c.id===p.catalog)).length}</b></div></div>
    <div class="collection-grid">${rows.map(c=>{const cover=c.image||c.items.find(p=>p.images?.[0])?.images?.[0];return `<article class="collection-card"><div class="collection-cover">${cover?`<img src="${esc(cover)}" alt="">`:'<span>DEW</span>'}<span class="collection-count">${c.items.length} products</span></div><div class="collection-card-body"><div><h3>${esc(c.name)}</h3><p>${esc(c.description||'No description added')}</p></div><div class="collection-card-actions"><button class="text-link" data-e="${c.id}">Edit collection</button><button class="text-link danger-link" data-x="${c.id}">Delete</button></div></div></article>`;}).join('')||'<div class="admin-panel empty-note">No collections yet. Create your first collection to organize your products.</div>'}</div>`;
  $('#newC').onclick=()=>catForm();
  document.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>catForm(b.dataset.e));
  document.querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>{const c=D.catalogs.find(x=>x.id===b.dataset.x);if(!c)return;if(D.products.some(p=>p.catalog===c.id)){alert('Move these products to another collection first.');return;}if(confirm('Delete collection "'+c.name+'"?')){D.catalogs=D.catalogs.filter(x=>x!==c);render();save('Delete collection '+c.name);}});
}
function catForm(id) {
  const c=id?D.catalogs.find(x=>x.id===id):{name:'',description:'',image:''};if(!c)return;
  let image=c.image||'';
  const selected=new Set(D.products.filter(p=>p.catalog===c.id).map(p=>p.id));
  $('#view').innerHTML=`
    <div class="editor-breadcrumb"><button class="text-link" id="backCollections">← Collections</button><span>/</span><b>${id?'Edit collection':'New collection'}</b></div>
    <div class="shopify-page-head product-editor-head"><div><span class="admin-eyebrow">COLLECTIONS / ${id?'EDIT':'NEW'}</span><h2>${id?esc(c.name):'Create collection'}</h2><p>Arrange products into an easy-to-browse group.</p></div><div class="editor-head-actions"><button class="admin-view-store" id="cancelCollection">Discard</button><button class="admin-primary" id="saveCollection">Save</button></div></div>
    <div class="product-editor-layout collection-editor-layout"><div class="product-editor-main">
      <section class="editor-panel"><h3>Collection details</h3><div class="editor-field"><label>Title</label><input id="cn" value="${esc(c.name)}" placeholder="e.g. Lip Care"></div><div class="editor-field"><label>Description</label><textarea id="cd" rows="5" placeholder="Describe this collection">${esc(c.description||'')}</textarea></div></section>
      <section class="editor-panel"><h3>Collection image</h3><div class="collection-editor-image" id="collectionPreview">${image?'<img src="'+esc(image)+'" alt="">':'<span>DEW</span>'}</div><label class="media-add">＋ Upload image<input type="file" id="cf" accept="image/*"></label><p class="editor-hint">Choose a landscape image to represent this collection in your storefront.</p></section>
      <section class="editor-panel"><div class="editor-panel-title"><h3>Products</h3><span id="selectedProductCount">${selected.size} selected</span></div><div class="collection-product-picker">${D.products.map(p=>`<label class="collection-product-option"><input type="checkbox" data-collection-product="${esc(p.id)}" ${selected.has(p.id)?'checked':''}><span class="product-thumb">${p.images?.[0]?'<img src="'+esc(p.images[0])+'" alt="">':'DEW'}</span><span><b>${esc(p.name)}</b><small>${moneyLabelCat(p.price)} · ${Number(p.stock||0)} in stock</small></span></label>`).join('')||'<p class="editor-hint">Add products first, then assign them to this collection.</p>'}</div></section>
    </div><aside class="product-editor-side"><section class="editor-panel"><h3>Collection status</h3><span class="shopify-status is-live"><i></i>Available on storefront</span><p class="editor-hint">Collections are displayed in your store when linked from the homepage or navigation.</p></section><section class="editor-panel"><h3>Search preview</h3><div class="collection-search-preview"><b id="collectionPreviewTitle">${esc(c.name||'Collection title')}</b><p id="collectionPreviewDesc">${esc(c.description||'Collection description')}</p><small>DEW SKINCARE</small></div></section></aside></div>`;
  function moneyLabelCat(n){return 'EGP '+Number(n||0).toLocaleString('en-US');}
  const updateCount=()=>{$('#selectedProductCount').textContent=document.querySelectorAll('[data-collection-product]:checked').length+' selected';};
  $('#backCollections').onclick=()=>{tab='catalogs';render();};$('#cancelCollection').onclick=()=>{tab='catalogs';render();};
  document.querySelectorAll('[data-collection-product]').forEach(el=>el.onchange=updateCount);
  $('#cn').oninput=()=>$('#collectionPreviewTitle').textContent=$('#cn').value||'Collection title';$('#cd').oninput=()=>$('#collectionPreviewDesc').textContent=$('#cd').value||'Collection description';
  $('#cf').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{image=await uploadImage(await resize(file));$('#collectionPreview').innerHTML='<img src="'+esc(image)+'" alt="">';}catch(err){toast(err.message,true);}};
  $('#saveCollection').onclick=()=>{const name=$('#cn').value.trim();if(!name){toast('Collection title is required.',true);return;}const chosen=[...document.querySelectorAll('[data-collection-product]:checked')].map(x=>x.dataset.collectionProduct);D.products.forEach(p=>{if(chosen.includes(p.id))p.catalog=c.id;else if(p.catalog===c.id)p.catalog=D.catalogs.find(x=>x.id!==c.id)?.id||'';});if(id){c.name=name;c.description=$('#cd').value.trim();c.image=image;}else D.catalogs.push({id:uid(),name,description:$('#cd').value.trim(),image});tab='catalogs';render();save('Save collection '+name);};
}

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
