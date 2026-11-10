const $ = s => document.querySelector(s);
let D = null, SHA = null, ordersList = [], ordersSHA = null, imageLibrary = [], tab = (() => { try { return sessionStorage.getItem('dew_admin_tab') || 'overview'; } catch { return 'overview'; } })(), q = '', chain = Promise.resolve();
const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), b => b.toString(16).padStart(2, '0')).join('');
const catName = id => (D.catalogs.find(c => c.id === id) || {}).name || '-';
const isNativeApp = (() => { try { return location.protocol === 'capacitor:' || !!window.Capacitor?.isNativePlatform?.(); } catch { return false; } })();
if (isNativeApp) document.documentElement.classList.add('dew-native-app');

/* ---------- base64 helpers ---------- */
const enc = s => { const b = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(bin); };
const dec = b => { const bin = atob(b.replace(/\n/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(u); };

/* ---------- Secure admin API ---------- */
const ADMIN_API='https://dew-orders-api.aalshari.workers.dev', ADMIN_SESSION_KEY='dew_admin_session';
try { localStorage.removeItem('dew_gh'); localStorage.removeItem('dew_orders_api_key'); sessionStorage.removeItem('dew_gh'); } catch {}
function adminToken(){try{return localStorage.getItem(ADMIN_SESSION_KEY)||''}catch{return ''}}
async function gh(method,path,body){
 const cleanPath=String(path||'').split('?')[0],url=ADMIN_API+'/api/admin/github?path='+encodeURIComponent(cleanPath);
 const headers={Authorization:'Bearer '+adminToken(),Accept:'application/vnd.github+json'};
 if(body)headers['Content-Type']='application/json';
 let r;try{r=await fetch(url,{method,cache:'no-store',headers,body:body?JSON.stringify(body):undefined})}catch{throw Error('Could not reach the secure Dew admin service.')}
 const data=await r.json().catch(()=>({}));
 if(r.status===401)throw Error('Your admin session expired. Please sign in again.');
 if(!r.ok)throw Error(data.message||data.error||'Admin service error '+r.status);
 return data;
}
async function loadData() {
  const f = await gh('GET', 'contents/products.json?t=' + Date.now());
  SHA = f.sha; D = JSON.parse(dec(f.content));
  try { if (localStorage.getItem('dew_published_product_routes') === null) localStorage.setItem('dew_published_product_routes', JSON.stringify(productRouteSlugs())); } catch {}
  if (!D.discounts) D.discounts = [];
  D.catalogs = Array.isArray(D.catalogs) ? D.catalogs : [];
  D.catalogs.forEach(c => { if (!Array.isArray(c.productIds)) c.productIds = D.products.filter(p => p.catalog === c.id).map(p => p.id); });

  const response=await fetch(ADMIN_API+'/api/orders',{headers:{Authorization:'Bearer '+adminToken()}});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok)throw Error(result.error||'Could not load orders.');
  ordersList=result.orders||[];ordersSHA=null;
  try { await refreshImageLibrary(); } catch (e) { imageLibrary = []; }
}

function productRouteSlugs() {
  const slugOf=p=>String(p.shopifyHandle||p.name||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  return [...new Set((D.products||[]).filter(p=>p.visible).map(slugOf).filter(Boolean))].sort();
}
async function putGithubFileLatest(path, payload) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    let sha;
    try {
      const current = await gh('GET', 'contents/' + path);
      sha = current.sha;
    } catch (e) {
      if (!/404|not found/i.test(e.message)) throw e;
    }
    try {
      return await gh('PUT', 'contents/' + path, { ...payload, ...(sha ? { sha } : {}) });
    } catch (e) {
      lastError = e;
      if (!/sha|409|422|does not match|expected|conflict/i.test(e.message) || attempt === 3) throw e;
      await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError || new Error('Could not update ' + path);
}

async function refreshProductSitemap(previousSlugs = []) {
  const origin='https://dewskincaree.com';
  const slugs=productRouteSlugs();
  const page='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="../"><title>Product | Dew Skincare</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="styles.css?v=20261109-4"></head><body><div id="productApp"><div class="dew-loading">Dew Skincare</div></div><script src="cart.js?v=20261107-3"></script><script src="product.js?v=20261109-4"></script></body></html>';
  const missing=slugs.filter(slug=>!previousSlugs.includes(slug));
  for(let i=0;i<missing.length;i+=5){
    await Promise.all(missing.slice(i,i+5).map(async slug=>{
      await putGithubFileLatest(slug+'/index.html',{message:'Publish product page: '+slug,content:enc(page)});
    }));
  }
  const urls=[origin+'/',...slugs.map(slug=>origin+'/'+slug+'/')];
  const xml='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.map(loc=>'  <url><loc>'+loc.replace(/&/g,'&amp;')+'</loc><lastmod>'+new Date().toISOString().slice(0,10)+'</lastmod></url>').join('\n')+'\n</urlset>\n';
  await putGithubFileLatest('sitemap.xml',{message:'Refresh product SEO sitemap',content:enc(xml)});
}
function save(message) {
  chain = chain.then(async () => {
    try {
      const r = await gh('PUT', 'contents/products.json', { message, content: enc(JSON.stringify(D, null, 2) + '\n'), sha: SHA });
      SHA = r.content.sha;
      const currentSlugs=productRouteSlugs();
      let previousSlugs=[];
      try { previousSlugs=JSON.parse(localStorage.getItem('dew_published_product_routes')||'[]'); } catch {}
      if(JSON.stringify(currentSlugs)!==JSON.stringify(previousSlugs)){
        try {
          await refreshProductSitemap(previousSlugs);
          try { localStorage.setItem('dew_published_product_routes',JSON.stringify(currentSlugs)); } catch {}
          toast('Saved. Product links and sitemap updated.');
        } catch (seoError) { toast('Products saved, but the SEO sitemap could not refresh: '+seoError.message,true); }
      } else toast('Saved.');
    } catch (e) { toast(e.message, true); throw e; }
  });
  return chain.catch(() => {});
}

function saveOrders(message){
 chain=chain.then(async()=>{
  try{
   const response=await fetch(ADMIN_API+'/api/orders',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+adminToken()},body:JSON.stringify({orders:ordersList})});
   const result=await response.json().catch(()=>({}));if(!response.ok||!result.ok)throw Error(result.error||'Could not update orders.');
   toast('Orders updated.');
  }catch(e){toast(e.message,true);throw e}
 });return chain.catch(()=>{});
}

async function refreshImageLibrary() {
  const files = await gh('GET', 'contents/images');
  imageLibrary = Array.isArray(files) ? files.filter(x => x.type === 'file' && /\.(webp|png|jpe?g|gif|avif)$/i.test(x.name || '')).map(x => ({ name: x.name, path: x.path, url: x.path })) : [];
  return imageLibrary;
}
async function uploadImage(dataUrl) {
  const isWebP = /^data:image\/webp;base64,/i.test(dataUrl);
  const extension = isWebP ? 'webp' : 'jpg';
  const name = `${Date.now()}-${uid()}.${extension}`;
  const path = 'images/' + name;
  await gh('PUT', 'contents/' + path, { message: 'Add optimized photo ' + name, content: dataUrl.split(',')[1] });
  imageLibrary = [{ name, path, url: path }, ...imageLibrary.filter(x => x.path !== path)];
  return path;
}
function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.style.background = bad ? 'var(--red)' : 'var(--green)'; t.style.display = 'block';
  clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = 'none', bad ? 7000 : 3500);
}

/* ---------- login ---------- */
async function start(){
 if(!adminToken())return showLogin();
 try{await loadData();render()}catch(e){try{localStorage.removeItem(ADMIN_SESSION_KEY)}catch{}showLogin(e.message)}
}
function showLogin(msg){
 $('#app').innerHTML=`<div class="login box" style="text-align:left"><h2 style="text-align:center">Dew Admin</h2><p style="text-align:center">Private store management</p><form id="lf">
 <label>Username</label><input id="adminUser" type="text" autocomplete="username" required>
 <label>Password</label><input id="adminPass" type="password" autocomplete="current-password" required>
 <div class="err" id="le">${esc(msg||'')}</div><button class="btn red" style="width:100%;margin-top:6px">Sign in</button></form>
 <p class="note">Authorized Dew administrators only.</p><p style="text-align:center"><a href="./">Back to the shop</a></p></div>`;
 $('#lf').onsubmit=async e=>{
  e.preventDefault();const username=$('#adminUser').value.trim(),password=$('#adminPass').value;$('#le').textContent='Signing in...';
  try{
   const response=await fetch(ADMIN_API+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
   const result=await response.json().catch(()=>({}));if(!response.ok||!result.ok||!result.token)throw Error(result.error||'Sign-in failed.');
   localStorage.setItem(ADMIN_SESSION_KEY,result.token);$('#adminPass').value='';await loadData();render();
  }catch(er){try{localStorage.removeItem(ADMIN_SESSION_KEY)}catch{}$('#le').textContent=er.message}
 };
}

/* ---------- shell ---------- */
function render() {
  try { sessionStorage.setItem('dew_admin_tab',tab); } catch {}
  const tabs = [['overview','Overview'],['homepage','Theme editor'],['pages','Pages'],['products','Products'],['catalogs','Collections'],['media','Media library'],['orders','Orders'],['customers','Customers'],['inventory','Inventory'],['discounts','Discounts'],['store','Settings'],['help','Help']];
  const names = Object.fromEntries(tabs);
  const mobileNav = isNativeApp ? `<nav class="app-bottom-nav" aria-label="Main navigation">
    <button class="app-tab ${tab==='overview'?'active':''}" data-t="overview"><span class="app-tab-icon">⌂</span><span>Home</span></button>
    <button class="app-tab ${tab==='orders'?'active':''}" data-t="orders"><span class="app-tab-icon">▤</span><span>Orders</span>${ordersList.length?`<i>${ordersList.length}</i>`:''}</button>
    <button class="app-tab ${tab==='products'?'active':''}" data-t="products"><span class="app-tab-icon">◇</span><span>Products</span></button>
    <button class="app-tab ${tab==='more' || !['overview','orders','products'].includes(tab)?'active':''}" data-t="more"><span class="app-tab-icon">☰</span><span>Menu</span></button>
  </nav>` : '';
  $('#app').innerHTML = `
    <div class="admin-shell">
      <aside class="admin-sidebar">
        <a class="admin-brand" href="./"><span class="admin-mark">dew</span><span><b>Dew Skincare</b><small>STORE ADMIN</small></span></a>
        <div class="side-caption">STORE MANAGEMENT</div>
        <nav class="admin-nav">${tabs.map(([k,n]) => `<button class="side-link ${tab===k?'active':''}" data-t="${k}"><span class="side-dot"></span><span>${n}</span>${k==='orders'&&ordersList.length?`<i>${ordersList.length}</i>`:''}</button>`).join('')}</nav>
        <div class="sidebar-bottom"><span class="status-dot"></span><span><b>Store connected</b><small>GitHub sync enabled</small></span></div>
      </aside>
      <main class="admin-main">
        <header class="admin-topbar"><div><div class="admin-eyebrow">DEW SKINCARE / ADMIN</div><h1>${tab==='more'?'Menu':(names[tab]||'Overview')}</h1></div><div class="top-actions"><a class="admin-view-store" href="https://dewskincaree.com/" target="_blank" rel="noopener noreferrer">View storefront ↗</a><button class="admin-signout" id="out">Sign out</button></div></header>
        <section class="admin-content" id="view"></section>
      </main>
      ${mobileNav}
    </div>`;
  document.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab=b.dataset.t; q=''; render(); });
  $('#out').onclick=async()=>{const token=adminToken();try{await fetch(ADMIN_API+'/api/admin/logout',{method:'POST',headers:{Authorization:'Bearer '+token}})}catch{}try{localStorage.removeItem(ADMIN_SESSION_KEY)}catch{}D=null;showLogin()};
  ({ overview, homepage, pages, products, catalogs, media, orders, customers, inventory, discounts, store, help, more })[tab]();
}
function modal(html) { $('#modal').innerHTML = html; $('#ov').classList.add('open'); }
function closeModal() { $('#ov').classList.remove('open'); }
$('#ov').onclick = e => { if (e.target.id === 'ov') closeModal(); };
const searchBox = () => `<input id="q" value="${esc(q)}" placeholder="Search" style="padding:9px 14px;border-radius:999px;border:1.5px solid #cfd3cc;margin-bottom:12px">`;
function bindSearch() { const el = $('#q'); if (!el) return; el.oninput = () => { q = el.value; const pos = q.length; render(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); }; }


/* ---------- homepage editor ---------- */
function homepage() {
  const base={"announcement":{"show":true,"text":"Buy 2 Get 1 Free | Free delivery on orders over 600 EGP","link":"#shop"},"header":{"logo":"Dew","logoImage":"","links":[{"label":"Shop","url":"#shop"},{"label":"Our Story","url":"#about"},{"label":"Contact","url":"#contact"}]},"hero":{"show":true,"title":"Your Skin. Your Natural Glow.","text":"Thoughtful skincare, made with love in Egypt.","button":"Discover the collection","url":"#shop","image":"","showButton":true,"buttonPosition":"left"},"categories":{"show":true,"title":"Shop by category","items":[{"title":"Face Care","image":"","url":"#shop"},{"title":"Lip Care","image":"","url":"#shop"},{"title":"Body Care","image":"","url":"#shop"},{"title":"Hair Care","image":"","url":"#shop"}]},"products":{"show":true,"title":"Our Best Sellers","limit":5,"productIds":[]},"productSections":[],"promo":{"show":true,"title":"A little more love for your skin","text":"Explore your everyday skincare essentials.","button":"Shop now","url":"#shop","image":"","showButton":true,"buttonPosition":"left"},"benefits":{"show":true,"items":["Made in Egypt","Thoughtfully selected ingredients","Cruelty-free","Delivery across Egypt"]},"reviews":{"show":true,"title":"Kind words from our customers","items":[{"name":"Your customer","text":"Customer feedback will appear here.","stars":5}]},"social":{"show":true,"title":"A little Dew every day","handle":"@dew_skincaree","images":["","","","","",""]},"newsletter":{"show":true,"title":"Stay in the glow","text":"Get updates, skincare tips and special offers.","button":"Join us"},"footer":{"show":true,"about":"Natural skincare, made with love in Egypt.","copyright":"All rights reserved.","links":[{"label":"About","url":"#about"},{"label":"Contact","url":"#contact"}]},"customBanners":{"show":true,"items":[]},"theme":{"green":"#1c524e","cream":"#fbf8f1","ink":"#183b35","accent":"#e7eee5"}};
  const h=D.settings.homepage||(D.settings.homepage=JSON.parse(JSON.stringify(base)));if(!Array.isArray(h.announcement?.messages))h.announcement.messages=[h.announcement?.text||base.announcement.text];
  const mergeObj=(a,b)=>{if(!b)return a;for(const k of Object.keys(b)){if(b[k]&&typeof b[k]==='object'&&!Array.isArray(b[k]))a[k]=mergeObj(a[k]||{},b[k]);else a[k]=b[k];}return a;};mergeObj(h,base);
  const sections=[['announcement','Announcement bar','Messages, motion and visibility'],['header','Header & navigation','Logo, menu links and positioning'],['hero','Hero banner','Full-width image, text and button'],['customBanners','Custom banners','Add, position and customize extra banners'],['categories','Collection list','Shop by category tiles'],['products','Featured products','Product cards on homepage'],['promo','Image banner','Promotional image and text'],['benefits','Benefits','Trust and delivery messages'],['reviews','Reviews','Customer testimonials'],['social','Instagram gallery','Social photo strip'],['newsletter','Newsletter','Email signup area'],['footer','Footer','Bottom links and brand details'],['productPage','Product page','Edit the actual storefront product page'],['theme','Theme settings','Store colours and shared styling']];
  let selected='hero';
  const pathSet=(obj,path,value)=>{const bits=path.split('.');let cur=obj;for(let i=0;i<bits.length-1;i++){const k=/^\d+$/.test(bits[i])?+bits[i]:bits[i];if(cur[k]===undefined)cur[k]=/^\d+$/.test(bits[i+1])?[]:{};cur=cur[k];}const last=bits.at(-1);cur[/^\d+$/.test(last)?+last:last]=value;};
  const field=(path,label,value,type='text')=>`<div class="editor-field"><label>${label}</label><input type="${type}" data-hp="${path}" value="${esc(value??'')}"></div>`;
  const area=(path,label,value)=>`<div class="editor-field"><label>${label}</label><textarea rows="3" data-hp="${path}">${esc(value??'')}</textarea></div>`;
  const photo=(path,label,value)=>{const hint=path==='hero.image'?'Use a wide photo. It automatically adjusts its crop for laptop and phone screens.':path==='promo.image'?'The banner image automatically resizes for laptop and phone screens without stretching.':path==='header.logoImage'?'Your logo keeps its proportions on every screen.':'';return `<div class="editor-field"><label>${label}</label><div class="homepage-upload-preview">${value?'<img src="'+esc(value)+'" alt="">':'<span>Image preview</span>'}<label class="media-add">Upload photo<input type="file" accept="image/*" data-hp-upload="${path}"></label></div>${hint?'<small class="editor-hint">'+hint+'</small>':''}</div>`;};
  const editorFor=key=>{
    const x=h[key]||{};
    if(key==='productPage'){const p=D.settings.productPage||(D.settings.productPage={});const defaults={addCartText:'Add to cart',buyNowText:'Buy it now',howToUseTitle:'How to use',detailsTitle:'Product details',shippingTitle:'Shipping & payment',currencyPrefix:'EGP ',currencySuffix:'',headingColor:'#1c524e',textColor:'#65746a',priceColor:'#1d2e25',buttonColor:'#1c524e',buttonTextColor:'#ffffff',buttonBorderColor:'#1c524e',buttonRadius:3,buttonHeight:50,buttonFontSize:13,priceFontSize:21,quantityWidth:42,quantityHeight:47,quantityFontSize:13,quantityBackground:'#eaf2ec',quantityBorderColor:'#9dbba7',buttonLayout:'vertical',showTags:true,tagsPosition:'under-description',showStock:true,showQuantity:true,showDeliveryNotes:true,showHowToUse:true,showDetails:true,showShipping:true,showCategory:true};for(const [k,v] of Object.entries(defaults))if(p[k]===undefined)p[k]=v;if(p.quantityBackground==='#ffffff')p.quantityBackground='#eaf2ec';const f=(k,label,type='text')=>field('productPage.'+k,label,p[k],type);const col=(k,label)=>f(k,label,'color');const ck=(k,label)=>'<label class="editor-check"><input type="checkbox" data-hp="productPage.'+k+'" '+(p[k]?'checked':'')+'> '+label+'</label>';return '<div class="theme-editor-group"><h4>What customers can see</h4><div class="editor-two-col">'+ck('showCategory','Show collection name')+ck('showTags','Show product tags')+ck('showStock','Show stock availability')+ck('showQuantity','Show quantity selector')+ck('showDeliveryNotes','Show delivery and payment notes')+ck('showHowToUse','Show How to use')+ck('showDetails','Show Product details')+ck('showShipping','Show Shipping & payment')+'</div>'+ '<div class="editor-field"><label>Product tags position</label><select data-hp="productPage.tagsPosition"><option value="under-description" '+(p.tagsPosition==='under-description'?'selected':'')+'>Under description</option><option value="under-title" '+(p.tagsPosition==='under-title'?'selected':'')+'>Under product title</option><option value="below-price" '+(p.tagsPosition==='below-price'?'selected':'')+'>Below price</option><option value="inside-details" '+(p.tagsPosition==='inside-details'?'selected':'')+'>Inside product details</option></select></div></div><div class="theme-editor-group"><h4>Product page wording</h4><div class="editor-two-col">'+f('addCartText','Add to cart button')+f('buyNowText','Buy it now button')+f('howToUseTitle','How to use heading')+f('detailsTitle','Product details heading')+f('shippingTitle','Shipping heading')+f('currencyPrefix','Price prefix (e.g. EGP )')+f('currencySuffix','Price suffix')+'</div></div><div class="theme-editor-group"><h4>Product page colours</h4><div class="editor-two-col">'+col('headingColor','Product title colour')+col('textColor','Description colour')+col('priceColor','Price colour')+col('buttonColor','Button background')+col('buttonTextColor','Button text')+col('buttonBorderColor','Button border')+col('quantityBackground','Quantity box background')+col('quantityBorderColor','Quantity box border')+'</div></div><div class="theme-editor-group"><h4>Button and quantity sizing</h4><div class="editor-two-col">'+f('priceFontSize','Price text size (px)','number')+f('buttonFontSize','Button text size (px)','number')+f('buttonHeight','Button height (px)','number')+f('buttonRadius','Button corner radius (px)','number')+f('quantityWidth','Quantity box width (px)','number')+f('quantityHeight','Quantity box height (px)','number')+f('quantityFontSize','Quantity number size (px)','number')+'</div><div class="editor-field"><label>Button arrangement</label><select data-hp="productPage.buttonLayout"><option value="vertical" '+(p.buttonLayout==='vertical'?'selected':'')+'>Stack buttons vertically</option><option value="horizontal" '+(p.buttonLayout==='horizontal'?'selected':'')+'>Side by side</option></select></div></div>';}
    if(key==='theme')return '<div class="theme-editor-group"><h4>Store-wide colours</h4><p class="editor-hint">These colours are used across the storefront theme.</p><div class="editor-two-col">'+field('theme.green','Primary brand colour',h.theme.green,'color')+field('theme.cream','Background colour',h.theme.cream,'color')+field('theme.ink','Main text colour',h.theme.ink,'color')+field('theme.accent','Soft accent colour',h.theme.accent,'color')+'</div></div>';
    if(key==='announcement'){const messages=Array.isArray(x.messages)?x.messages:[x.text||''];return '<div class="editor-field"><label>Announcement messages</label><p class="editor-hint">Each message has its own field. Add as many as you need; customers will see them separated in the announcement bar.</p><div id="announcementMessageList">'+messages.map((m,i)=>'<div class="announcement-message-row"><input type="text" data-ann-message="'+i+'" value="'+esc(m)+'" placeholder="Enter announcement '+(i+1)+'"><button type="button" class="admin-danger" data-ann-remove="'+i+'" '+(messages.length===1?'disabled':'')+'>Remove</button></div>').join('')+'</div><button type="button" class="admin-view-store" id="addAnnouncementMessage">＋ Add another message</button></div>'+'<div class="editor-two-col">'+
'<div class="editor-field"><label>Animation style</label><select data-hp="announcement.mode"><option value="static" '+((x.mode||'static')==='static'?'selected':'')+'>Static message</option><option value="scroll" '+(x.mode==='scroll'?'selected':'')+'>Scrolling ticker</option><option value="marquee" '+(x.mode==='marquee'?'selected':'')+'>Continuous moving line (Marquee)</option></select></div>'+
'<div class="editor-field"><label>Animation speed</label><select data-hp="announcement.speed"><option value="slow" '+((x.speed||'normal')==='slow'?'selected':'')+'>Slow</option><option value="normal" '+((x.speed||'normal')==='normal'?'selected':'')+'>Normal</option><option value="fast" '+(x.speed==='fast'?'selected':'')+'>Fast</option></select></div></div>'+field('announcement.link','Optional link destination',x.link);}
    if(key==='header')return field('header.logo','Logo text (used if no logo image)',x.logo)+photo('header.logoImage','Store logo',x.logoImage)+
      '<div class="editor-two-col"><div class="editor-field"><label>Logo position</label><select data-hp="header.logoPosition"><option value="left" '+((x.logoPosition||'center')==='left'?'selected':'')+'>Left</option><option value="center" '+((x.logoPosition||'center')==='center'?'selected':'')+'>Centre</option><option value="right" '+((x.logoPosition||'center')==='right'?'selected':'')+'>Right</option></select></div><div class="editor-field"><label>Navigation position</label><select data-hp="header.navPosition"><option value="left" '+((x.navPosition||'left')==='left'?'selected':'')+'>Left</option><option value="center" '+((x.navPosition||'left')==='center'?'selected':'')+'>Centre</option><option value="right" '+((x.navPosition||'left')==='right'?'selected':'')+'>Right</option></select></div></div>'+
      '<div class="editor-subgroup"><b>Navigation links</b><p class="editor-hint">Add your own links, reorder them, or remove links you do not need.</p>'+
      (x.links||[]).map((v,i)=>'<div class="nav-link-editor" data-nav-row="'+i+'"><div class="editor-two-col">'+field('header.links.'+i+'.label','Link label',v.label)+field('header.links.'+i+'.url','Destination (URL or page.html?slug=...)',v.url)+'</div><div class="nav-link-actions"><button type="button" class="admin-view-store" data-nav-up="'+i+'" '+(!i?'disabled':'')+'>↑</button><button type="button" class="admin-view-store" data-nav-down="'+i+'" '+(i===(x.links||[]).length-1?'disabled':'')+'>↓</button><button type="button" class="admin-danger" data-nav-remove="'+i+'">Remove</button></div></div>').join('')+
      '<button type="button" class="admin-view-store" id="addHeaderLink">＋ Add navigation link</button></div>';
    if(key==='hero')return field('hero.title','Headline',x.title)+area('hero.text','Supporting text',x.text)+photo('hero.image','Hero image',x.image)+'<div class="editor-subgroup"><b>Hero button</b><p class="editor-hint">You can hide the button or choose where it sits under the text.</p><label class="editor-check"><input type="checkbox" data-hp="hero.showButton" '+(x.showButton===false?'':'checked')+'> Show button</label>'+field('hero.button','Button label',x.button)+field('hero.url','Button destination',x.url)+'<div class="editor-field"><label>Button alignment</label><select data-hp="hero.buttonPosition"><option value="left" '+((x.buttonPosition||'left')==='left'?'selected':'')+'>Left</option><option value="center" '+(x.buttonPosition==='center'?'selected':'')+'>Centre</option><option value="right" '+(x.buttonPosition==='right'?'selected':'')+'>Right</option></select></div></div>';
    if(key==='customBanners'){const items=x.items||(x.items=[]);const bannerFields=items.map((b,i)=>'<div class="editor-subgroup custom-banner-editor"><div class="editor-panel-title"><b>Banner '+(i+1)+'</b><div class="nav-link-actions"><button type="button" class="admin-view-store" data-banner-up="'+i+'" '+(!i?'disabled':'')+'>↑</button><button type="button" class="admin-view-store" data-banner-down="'+i+'" '+(i===items.length-1?'disabled':'')+'>↓</button><button type="button" class="admin-danger" data-banner-remove="'+i+'">Remove</button></div></div><label class="editor-check"><input type="checkbox" data-hp="customBanners.items.'+i+'.show" '+(b.show===false?'':'checked')+'> Show this banner</label>'+field('customBanners.items.'+i+'.title','Headline',b.title)+area('customBanners.items.'+i+'.text','Supporting text',b.text)+photo('customBanners.items.'+i+'.image','Banner image',b.image)+'<div class="editor-field"><label>Show banner at</label><select data-hp="customBanners.items.'+i+'.position"><option value="top" '+((b.position||'middle')==='top'?'selected':'')+'>Top of homepage (below header)</option><option value="middle" '+(b.position==='middle'?'selected':'')+'>Middle (after best sellers)</option><option value="bottom" '+(b.position==='bottom'?'selected':'')+'>Bottom (above footer)</option></select></div><div class="editor-subgroup"><b>Banner button</b><label class="editor-check"><input type="checkbox" data-hp="customBanners.items.'+i+'.showButton" '+(b.showButton===false?'':'checked')+'> Show button</label>'+field('customBanners.items.'+i+'.button','Button label',b.button)+field('customBanners.items.'+i+'.url','Button destination',b.url)+'<div class="editor-field"><label>Button alignment</label><select data-hp="customBanners.items.'+i+'.buttonPosition"><option value="left" '+((b.buttonPosition||'left')==='left'?'selected':'')+'>Left</option><option value="center" '+(b.buttonPosition==='center'?'selected':'')+'>Centre</option><option value="right" '+(b.buttonPosition==='right'?'selected':'')+'>Right</option></select></div></div></div>').join('');return '<p class="editor-hint">Add as many banners as you like. Choose whether each appears near the top, in the middle, or at the bottom of the homepage. Move banners up or down to change their order when they share a location.</p>'+bannerFields+'<button type="button" class="admin-view-store" id="addCustomBanner">＋ Add banner</button>';}    if(key==='categories'){if(x.limit===undefined)x.limit=4;return field('categories.title','Section heading',x.title)+field('categories.limit','Number of collections to show',x.limit,'number')+'<p class="editor-hint">Collections are pulled automatically from Admin → Collections. Add, edit, or delete collections there; this setting only controls how many appear on the storefront.</p><p class="editor-hint">Current collections: '+D.catalogs.length+'</p>';}    if(key==='products'){
      if(!Array.isArray(x.productIds))x.productIds=[];
      if(!Array.isArray(h.productSections))h.productSections=[];
      const choices=(ids,attr,index)=>D.products.filter(p=>p.visible).map(p=>'<label class="product-section-choice"><input type="checkbox" '+attr+'="'+index+'" data-product-id="'+esc(p.id)+'" '+(ids.includes(p.id)?'checked':'')+'><span>'+esc(p.name)+'</span></label>').join('');
      const custom=h.productSections.map((v,i)=>'<div class="editor-subgroup product-section-editor"><div class="editor-panel-title"><b>Section '+(i+1)+'</b><div class="nav-link-actions"><button type="button" class="admin-view-store" data-product-section-up="'+i+'" '+(!i?'disabled':'')+'>↑</button><button type="button" class="admin-view-store" data-product-section-down="'+i+'" '+(i===h.productSections.length-1?'disabled':'')+'>↓</button><button type="button" class="admin-danger" data-product-section-remove="'+i+'">Remove</button></div></div><label class="editor-check"><input type="checkbox" data-hp="productSections.'+i+'.show" '+(v.show===false?'':'checked')+'> Show this section</label>'+field('productSections.'+i+'.title','Section heading',v.title)+field('productSections.'+i+'.limit','Number of products',v.limit||5,'number')+'<div class="editor-field"><label>Place this section</label><select data-hp="productSections.'+i+'.position">'+[['before-hero','Before hero banner (very top)'],['after-hero','After hero banner'],['before-collections','Before collection list'],['after-collections','After collection list'],['before-best-sellers','Before Best Sellers'],['after-best-sellers','After Best Sellers'],['before-image-banner','Before promotional image banner'],['after-image-banner','After promotional image banner'],['before-benefits','Before benefits'],['before-reviews','Before reviews'],['before-instagram','Before Instagram gallery'],['before-newsletter','Before newsletter'],['above-footer','At the bottom (above footer)']].map(([value,label])=>'<option value="'+value+'" '+((v.position||'after-best-sellers')===value?'selected':'')+'>'+label+'</option>').join('')+'</select><small class="editor-hint">Choose the exact homepage area where this product section should appear.</small></div>'+'<label class="editor-check"><input type="checkbox" data-hp="productSections.'+i+'.showViewAll" '+(v.showViewAll===false?'':'checked')+'> Show View All button</label>'+field('productSections.'+i+'.viewAllText','View All button text',v.viewAllText||'View all')+field('productSections.'+i+'.viewAllUrl','View All destination',v.viewAllUrl||'#shop')+'<div class="editor-field"><label>Select products</label><div class="product-section-choices">'+choices(v.productIds||[],'data-custom-section-product',i)+'</div></div></div>').join('');
      return field('products.title','Section heading',x.title)+field('products.limit','Number of products to show',x.limit,'number')+'<div class="editor-field"><label>Choose Best Seller products</label><div class="product-section-choices">'+choices(x.productIds,'data-best-seller-product',1)+'</div><p class="editor-hint">Select products in the order you want them displayed. If none are selected, featured products are shown automatically.</p></div><div class="editor-subgroup"><h4>Additional homepage product sections</h4><p class="editor-hint">Create as many sections as you need. Each section has its own title, products, product count and optional View All button.</p>'+custom+'<button type="button" class="admin-view-store" id="addProductSection">＋ Add product section</button></div>';
    }
    if(key==='promo')return field('promo.title','Headline',x.title)+area('promo.text','Supporting text',x.text)+photo('promo.image','Banner image',x.image)+'<div class="editor-subgroup"><b>Banner button</b><label class="editor-check"><input type="checkbox" data-hp="promo.showButton" '+(x.showButton===false?'':'checked')+'> Show button</label>'+field('promo.button','Button label',x.button)+field('promo.url','Button destination',x.url)+'<div class="editor-field"><label>Button alignment</label><select data-hp="promo.buttonPosition"><option value="left" '+((x.buttonPosition||'left')==='left'?'selected':'')+'>Left</option><option value="center" '+(x.buttonPosition==='center'?'selected':'')+'>Centre</option><option value="right" '+(x.buttonPosition==='right'?'selected':'')+'>Right</option></select></div></div>';
    if(key==='benefits')return area('benefits.items','One benefit per line',(x.items||[]).join('\n'));
    if(key==='reviews')return field('reviews.title','Section heading',x.title)+field('reviews.items.0.name','Customer name',x.items?.[0]?.name)+area('reviews.items.0.text','Review text',x.items?.[0]?.text);
    if(key==='social'){if(x.postsToShow===undefined)x.postsToShow=3;return field('social.title','Section heading',x.title)+field('social.handle','Instagram handle',x.handle)+field('social.postsToShow','Number of Instagram posts to show (1–25)',x.postsToShow,'number')+'<p class="editor-hint">Choose how many of your latest Instagram posts appear on the homepage. The gallery loads directly from your connected account; no fallback photos need to be uploaded here.</p>';}
    if(key==='newsletter')return field('newsletter.title','Headline',x.title)+area('newsletter.text','Supporting text',x.text)+field('newsletter.button','Button label',x.button);
    if(key==='footer')return area('footer.about','About Dew',x.about)+field('footer.copyright','Copyright text',x.copyright)+(x.links||[]).map((v,i)=>field('footer.links.'+i+'.label','Footer link '+(i+1)+' label',v.label)+field('footer.links.'+i+'.url','Footer link '+(i+1)+' destination',v.url)).join('');
    return '';
  };
  const preview=()=>{
    const image=(src,cls='')=>src?'<img class="'+cls+'" src="'+esc(src)+'" alt="">':'<div class="'+cls+' homepage-preview-placeholder">DEW</div>';
    const P=D.products.filter(p=>p.visible),pp=D.settings.productPage||{},isProduct=selected==='productPage';
    const ann=(Array.isArray(h.announcement.messages)?h.announcement.messages:[h.announcement.text||'']).filter(Boolean).join(' · ');
    const section=(key,html)=>'<section class="hp-preview-section '+(selected===key?'is-selected':'')+'" data-preview-section="'+key+'">'+html+'</section>';
    const bannerPreview=position=>{const list=h.customBanners?.show===false?[]:(h.customBanners?.items||[]).filter(b=>b.show!==false&&(b.position||'middle')===position);return list.length?section('customBanners',list.map(b=>'<div class="hp-preview-custom-banner">'+image(b.image)+'<div><b>'+esc(b.title||'Your banner headline')+'</b><p>'+esc(b.text||'')+'</p>'+(b.showButton!==false?'<span>'+esc(b.button||'Shop now')+' · '+esc(b.buttonPosition||'left')+'</span>':'')+'</div></div>').join('')):'';};
    let content='';
    if(isProduct){
      const sample=P[0]||{name:'Your product name',price:220,description:'Your product description appears here.',images:[],tags:'Natural, Made in Egypt',options:[],variants:[],stock:12};
      const sampleImage=sample.images?.[0]?image(sample.images[0]):'<div class="hp-preview-product-placeholder">DEW<br><small>PRODUCT PHOTO</small></div>';
      const sampleOptions=(sample.options||[]).map(o=>'<label class="hp-preview-option"><b>'+esc(o.name)+'</b><span>' +esc((o.values||[])[0]||'Choose option')+'　⌄</span></label>').join('');
      const samplePrice=Number(sample.salePrice)>0&&Number(sample.salePrice)<Number(sample.price)?Number(sample.salePrice):Number(sample.price||220);
      content='<main class="hp-preview-store-product" data-preview-section="productPage"><div class="hp-preview-breadcrumb">Home　/　Shop　/　'+esc(sample.name)+'</div><div class="hp-preview-store-grid"><div class="hp-preview-store-gallery"><div class="hp-preview-store-main-image">'+sampleImage+'</div><div class="hp-preview-thumbs"><span>'+sampleImage+'</span><span>'+sampleImage+'</span><span>'+sampleImage+'</span></div></div><div class="hp-preview-store-info"><small class="hp-preview-store-kicker" '+(pp.showCategory===false?'hidden':'')+'>FACE CARE　·　DEW SKINCARE</small><h2>'+esc(sample.name)+'</h2><div class="hp-preview-store-tags" '+(pp.showTags===false?'hidden':'')+'>'+esc(sample.tags||'Natural · Made in Egypt')+'</div><div class="hp-preview-store-price"><strong style="color:'+esc(pp.priceColor||'#1d2e25')+';font-size:'+(pp.priceFontSize||21)+'px">'+esc(pp.currencyPrefix||'EGP ')+samplePrice.toLocaleString('en-US')+esc(pp.currencySuffix||'')+'</strong>'+(samplePrice<Number(sample.price||0)?'<del>'+esc(pp.currencyPrefix||'EGP ')+Number(sample.price).toLocaleString('en-US')+'</del>':'')+'</div><p class="hp-preview-store-description">'+esc(sample.description||'Discover your new everyday skincare essential.')+'</p><div class="hp-preview-store-options">'+(sampleOptions||'<label class="hp-preview-option"><b>Size</b><span>Choose an option　⌄</span></label>')+'</div><div class="hp-preview-store-stock" '+(pp.showStock===false?'hidden':'')+'>●　In stock</div><div class="hp-preview-store-qty" '+(pp.showQuantity===false?'hidden':'')+'><small>Quantity</small><div><b>−</b><strong>1</strong><b>＋</b></div></div><div class="hp-preview-store-actions"><button style="background:'+esc(pp.buttonColor||'#1c524e')+';color:'+esc(pp.buttonTextColor||'#fff')+';border-color:'+esc(pp.buttonBorderColor||'#1c524e')+';border-radius:'+(pp.buttonRadius||3)+'px;min-height:'+(pp.buttonHeight||50)+'px">'+esc(pp.addCartText||'Add to cart')+'</button><button class="hp-preview-store-buy" style="border-radius:'+(pp.buttonRadius||3)+'px;min-height:'+(pp.buttonHeight||50)+'px">'+esc(pp.buyNowText||'Buy it now')+'</button></div><p class="hp-preview-store-delivery" '+(pp.showDeliveryNotes===false?'hidden':'')+'>✓ Secure checkout　 ·　✓ Delivery across Egypt</p><div class="hp-preview-product-accordions">'+(pp.showHowToUse!==false?'<details open><summary>'+esc(pp.howToUseTitle||'How to use')+'</summary><p>Product instructions appear here.</p></details>':'')+(pp.showDetails!==false?'<details><summary>'+esc(pp.detailsTitle||'Product details')+'</summary></details>':'')+(pp.showShipping!==false?'<details><summary>'+esc(pp.shippingTitle||'Shipping & payment')+'</summary></details>':'')+'</div></div></div></main>';
    }
    else if(selected==='theme'){content='<div class="hp-preview-theme"><h2>Store-wide theme colours</h2><div class="hp-preview-swatches">'+[['Primary',h.theme.green],['Background',h.theme.cream],['Text',h.theme.ink],['Accent',h.theme.accent]].map(([n,v])=>'<div><i style="background:'+esc(v)+'"></i><b>'+n+'</b><small>'+esc(v)+'</small></div>').join('')+'</div><div class="hp-preview-hero" style="background:'+esc(h.theme.cream)+';color:'+esc(h.theme.ink)+'"><div><small>NATURAL SKINCARE · MADE IN EGYPT</small><h2>'+esc(h.hero.title)+'</h2><p>'+esc(h.hero.text)+'</p>'+(h.hero.showButton!==false?'<span style="background:'+esc(h.theme.green)+'">'+esc(h.hero.button)+'</span>':'')+'</div>'+image(h.hero.image)+'</div></div>';}
    else{
      content=bannerPreview('top')+(h.hero.show?section('hero','<div class="hp-preview-hero" style="background:'+esc(h.theme.cream)+';color:'+esc(h.theme.ink)+'"><div><small>NATURAL SKINCARE · MADE IN EGYPT</small><h2>'+esc(h.hero.title)+'</h2><p>'+esc(h.hero.text)+'</p>'+(h.hero.showButton!==false?'<span style="background:'+esc(h.theme.green)+'">'+esc(h.hero.button)+'</span>':'')+'</div>'+image(h.hero.image)+'</div>'):'')+
      (h.categories.show?section('categories','<small>EXPLORE</small><h3>'+esc(h.categories.title)+'</h3><div class="hp-preview-cats">'+D.catalogs.slice(0,Math.max(1,Math.min(100,Number(h.categories.limit)||4))).map(v=>'<div>'+image(v.image)+'<b>'+esc(v.name)+'</b></div>').join('')+'</div>'):'')+
      (h.products.show?section('products','<small>THE DEW EDIT</small><h3>'+esc(h.products.title)+'</h3><div class="hp-preview-products">'+(h.products.productIds?.length?P.filter(p=>h.products.productIds.includes(p.id)):P.slice().sort((a,b)=>(b.featured?1:0)-(a.featured?1:0))).slice(0,Math.max(1,Number(h.products.limit)||5)).map(p=>'<div>'+image(p.images?.[0])+'<b>'+esc(p.name)+'</b></div>').join('')+'</div>'):'')+(h.productSections||[]).filter(v=>v.show!==false).map(v=>section('products','<h3>'+esc(v.title||'Product section')+'</h3><div class="hp-preview-products">'+P.filter(p=>(v.productIds||[]).includes(p.id)).slice(0,Math.max(1,Number(v.limit)||5)).map(p=>'<div>'+image(p.images?.[0])+'<b>'+esc(p.name)+'</b></div>').join('')+'</div>'+(v.showViewAll!==false?'<span>'+esc(v.viewAllText||'View all')+' ↗</span>':''))).join('')+bannerPreview('middle')+
      (h.promo.show?section('promo','<div class="hp-preview-promo">'+image(h.promo.image)+'<div><h3>'+esc(h.promo.title)+'</h3><p>'+esc(h.promo.text)+'</p><span>'+esc(h.promo.button)+'</span></div></div>'):'')+
      (h.benefits.show?section('benefits','<h3>Why choose Dew</h3><div class="hp-preview-cats">'+(h.benefits.items||[]).map(v=>'<b>'+esc(v)+'</b>').join('')+'</div>'):'')+      (h.reviews.show?section('reviews','<h3>'+esc(h.reviews.title)+'</h3><blockquote>“'+esc(h.reviews.items?.[0]?.text||'Customer reviews appear here.')+'”</blockquote>'):'')+
      (h.social.show?section('social','<h3>'+esc(h.social.title)+'</h3><div class="hp-preview-note">Latest Instagram posts load live on the storefront</div>'):'')+
      (h.newsletter.show?section('newsletter','<h3>'+esc(h.newsletter.title)+'</h3><p>'+esc(h.newsletter.text)+'</p><span>'+esc(h.newsletter.button)+'</span>'):'')+bannerPreview('bottom');
    }
    $('#homepageLivePreview').innerHTML='<div class="hp-preview-ann '+(selected==='announcement'?'is-selected':'')+'" data-preview-section="announcement">'+(h.announcement.show?esc(ann):'Announcement bar hidden')+'</div><div class="hp-preview-header '+(selected==='header'?'is-selected':'')+'" data-preview-section="header"><b>'+(h.header.logoImage?image(h.header.logoImage,'hp-preview-logo'):esc(h.header.logo))+'</b><span>'+(h.header.links||[]).map(v=>esc(v.label)).join('　')+'　♧</span></div>'+content+'<div class="hp-preview-footer '+(selected==='footer'?'is-selected':'')+'" data-preview-section="footer">Dew Skincare · Made in Egypt</div>';
    $('#homepageLivePreview').querySelectorAll('[data-preview-section]').forEach(el=>el.onclick=()=>{selected=el.dataset.previewSection;drawEditor();preview();});
  };
  const drawEditor=()=>{
    const sec=sections.find(v=>v[0]===selected)||sections[2];const isTemplate=selected==='productPage'||selected==='theme';
    $('#homepageSectionNav').innerHTML=sections.map(([k,n,d])=>`<button class="hp-section-nav ${selected===k?'active':''}" data-section="${k}"><b>${n}</b><small>${d}</small><span>${h[k]?.show===false?'Hidden':'Visible'}</span></button>`).join('');
    $('#homepageEditorPanel').innerHTML=`<div class="homepage-editor-title"><div><span class="admin-eyebrow">THEME CUSTOMIZER / ${isTemplate?'TEMPLATE SETTINGS':'HOMEPAGE SECTION'}</span><h3>${sec[1]}</h3><p>${sec[2]}</p></div>${isTemplate?'':'<label class="editor-check"><input type="checkbox" id="sectionVisible" '+(h[selected]?.show===false?'':'checked')+'> Show section</label>'}</div><div class="homepage-editor-fields">${editorFor(selected)}</div><div class="homepage-editor-footer"><button class="admin-primary" id="saveHomepage">Save and publish theme</button></div>`;
    document.querySelectorAll('[data-section]').forEach(b=>b.onclick=()=>{selected=b.dataset.section;drawEditor();});
    $('#sectionVisible')?.addEventListener('change',e=>{h[selected].show=e.target.checked;drawEditor();preview();});
    document.querySelectorAll('[data-ann-message]').forEach(el=>el.oninput=()=>{const i=Number(el.dataset.annMessage);h.announcement.messages=h.announcement.messages||[];h.announcement.messages[i]=el.value;h.announcement.text=h.announcement.messages[0]||'';preview();});
    $('#addAnnouncementMessage')?.addEventListener('click',()=>{h.announcement.messages=h.announcement.messages||[h.announcement.text||''];h.announcement.messages.push('');selected='announcement';drawEditor();preview();const inputs=document.querySelectorAll('[data-ann-message]');inputs[inputs.length-1]?.focus();});
    document.querySelectorAll('[data-ann-remove]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.annRemove);h.announcement.messages.splice(i,1);if(!h.announcement.messages.length)h.announcement.messages.push('');h.announcement.text=h.announcement.messages[0]||'';drawEditor();preview();});
    document.querySelectorAll('[data-hp]').forEach(el=>{const update=()=>{let v=el.type==='checkbox'?el.checked:el.value;if(el.type==='number')v=Math.min(1000,Math.max(0,Number(v)||0));if(selected==='benefits'&&el.dataset.hp==='benefits.items')v=v.split('\n').map(x=>x.trim()).filter(Boolean);if(selected==='announcement'&&el.dataset.hp==='announcement.messages')v=v.split('\n').map(x=>x.trim()).filter(Boolean);pathSet(selected==='productPage'?D.settings:h,el.dataset.hp,v);preview();};el.oninput=update;el.onchange=update;});
    $('#saveHomepage').onclick=()=>save('Update storefront theme');
    $('#addHeaderLink')?.addEventListener('click',()=>{h.header.links=h.header.links||[];h.header.links.push({label:'New link',url:'./#shop'});drawEditor();preview();});
    document.querySelectorAll('[data-best-seller-product]').forEach(el=>el.onchange=()=>{const id=el.dataset.productId;h.products.productIds=Array.isArray(h.products.productIds)?h.products.productIds:[];if(el.checked){if(!h.products.productIds.includes(id))h.products.productIds.push(id);}else h.products.productIds=h.products.productIds.filter(v=>v!==id);preview();});
    document.querySelectorAll('[data-custom-section-product]').forEach(el=>el.onchange=()=>{const i=Number(el.dataset.customSectionProduct),id=el.dataset.productId,v=h.productSections[i];v.productIds=Array.isArray(v.productIds)?v.productIds:[];if(el.checked){if(!v.productIds.includes(id))v.productIds.push(id);}else v.productIds=v.productIds.filter(x=>x!==id);preview();});
    $('#addProductSection')?.addEventListener('click',()=>{h.productSections=h.productSections||[];h.productSections.push({id:uid(),show:true,title:'New product section',productIds:[],limit:5,position:'after-best-sellers',showViewAll:true,viewAllText:'View all',viewAllUrl:'#shop'});drawEditor();preview();});
    document.querySelectorAll('[data-product-section-remove]').forEach(b=>b.onclick=()=>{h.productSections.splice(+b.dataset.productSectionRemove,1);drawEditor();preview();});
    document.querySelectorAll('[data-product-section-up]').forEach(b=>b.onclick=()=>{const i=+b.dataset.productSectionUp;if(i>0)[h.productSections[i-1],h.productSections[i]]=[h.productSections[i],h.productSections[i-1]];drawEditor();preview();});
    document.querySelectorAll('[data-product-section-down]').forEach(b=>b.onclick=()=>{const i=+b.dataset.productSectionDown;if(i<h.productSections.length-1)[h.productSections[i+1],h.productSections[i]]=[h.productSections[i],h.productSections[i+1]];drawEditor();preview();});
    document.querySelectorAll('[data-nav-remove]').forEach(b=>b.onclick=()=>{h.header.links.splice(+b.dataset.navRemove,1);drawEditor();preview();});
    document.querySelectorAll('[data-nav-up]').forEach(b=>b.onclick=()=>{const i=+b.dataset.navUp;if(i>0)[h.header.links[i-1],h.header.links[i]]=[h.header.links[i],h.header.links[i-1]];drawEditor();preview();});
    document.querySelectorAll('[data-nav-down]').forEach(b=>b.onclick=()=>{const i=+b.dataset.navDown;if(i<h.header.links.length-1)[h.header.links[i+1],h.header.links[i]]=[h.header.links[i],h.header.links[i+1]];drawEditor();preview();});
    $('#addCustomBanner')?.addEventListener('click',()=>{h.customBanners.items=h.customBanners.items||[];h.customBanners.items.push({id:uid(),show:true,title:'Your banner headline',text:'Add a short message for your customers.',image:'',position:'middle',showButton:true,button:'Shop now',url:'#shop',buttonPosition:'left'});drawEditor();preview();});
    document.querySelectorAll('[data-banner-remove]').forEach(b=>b.onclick=()=>{h.customBanners.items.splice(+b.dataset.bannerRemove,1);drawEditor();preview();});
    document.querySelectorAll('[data-banner-up]').forEach(b=>b.onclick=()=>{const i=+b.dataset.bannerUp;if(i>0)[h.customBanners.items[i-1],h.customBanners.items[i]]=[h.customBanners.items[i],h.customBanners.items[i-1]];drawEditor();preview();});
    document.querySelectorAll('[data-banner-down]').forEach(b=>b.onclick=()=>{const i=+b.dataset.bannerDown;if(i<h.customBanners.items.length-1)[h.customBanners.items[i+1],h.customBanners.items[i]]=[h.customBanners.items[i],h.customBanners.items[i+1]];drawEditor();preview();});
  };
  $('#view').innerHTML=`<div class="hp-intro"><div><span class="admin-eyebrow">ONLINE STORE / THEME CUSTOMIZER</span><h2>Customize your entire store in one place.</h2><p>Choose any section or product template on the left. Changes appear in the preview as you edit them.</p></div><a class="admin-view-store" href="./" target="_blank">Open live store ↗</a></div><div class="homepage-theme-editor"><aside class="homepage-section-list"><div class="homepage-section-list-head"><b>Theme structure</b><small>Homepage, product template and global styles</small></div><div id="homepageSectionNav"></div></aside><section class="homepage-editor-work"><div class="homepage-editor-card" id="homepageEditorPanel"></div><div class="homepage-preview-card"><div class="homepage-preview-top"><b>Store preview</b><span>Click a section in the preview to edit it</span></div><div class="homepage-preview-browser"><div class="homepage-browser-dots">● ● ●</div><div id="homepageLivePreview"></div></div></div></section></div>`;
  drawEditor();preview();
  $('#homepageEditorPanel').addEventListener('change',async e=>{const el=e.target.closest('[data-hp-upload]');if(!el)return;const file=el.files?.[0];if(!file)return;try{const path=await uploadImage(await resize(file));pathSet(h,el.dataset.hpUpload,path);drawEditor();preview();toast('Image uploaded. Save and publish to show it on the storefront.');}catch(err){toast(err.message,true);}});
}


/* ---------- uploaded media library ---------- */
function media() {
  const draw=()=>{
    const files=imageLibrary||[];
    $('#view').innerHTML='<div class="shopify-page-head"><div><span class="admin-eyebrow">STORE CONTENT</span><h2>Media library</h2><p>Every photo uploaded through Admin is saved here and can be reused across your store.</p></div><label class="admin-primary media-upload-trigger">＋ Upload photos<input type="file" id="mediaUpload" accept="image/*" multiple hidden></label></div>'+
      '<div class="shopify-metrics"><div><span>Saved images</span><b>'+files.length+'</b></div><div><span>Format</span><b>WebP</b></div><div><span>Storage</span><b>Website images</b></div></div>'+
      '<div class="media-library-grid">'+(files.map((f,i)=>'<article class="media-library-card"><div class="media-library-thumb"><img src="'+esc(f.url)+'" alt="'+esc(f.name)+'" loading="lazy"></div><div class="media-library-info"><b title="'+esc(f.name)+'">'+esc(f.name)+'</b><button type="button" class="text-link" data-copy-media="'+i+'">Copy image path</button></div></article>').join('')||'<div class="admin-panel empty-note">No uploaded photos yet. Upload an image and it will be saved here.</div>')+'</div>';
    $('#mediaUpload').onchange=async e=>{
      const files=[...e.target.files||[]];if(!files.length)return;
      const input=e.target;input.disabled=true;
      for(const file of files){try{await uploadImage(await resize(file));}catch(err){toast(err.message,true);break;}}
      input.disabled=false;input.value='';await refreshImageLibrary();draw();toast('Photos uploaded and saved to the website.');
    };
    document.querySelectorAll('[data-copy-media]').forEach(b=>b.onclick=()=>{const item=files[+b.dataset.copyMedia];if(item){navigator.clipboard?.writeText(item.path).then(()=>toast('Image path copied.')).catch(()=>toast(item.path));}});
  };
  draw();
}

/* ---------- Custom pages manager ---------- */
function pages(){
 if(!Array.isArray(D.pages))D.pages=[];
 const slugify=t=>String(t||'page').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'page';
 const draw=()=>{
  $('#view').innerHTML='<div class="page-heading"><div><span class="admin-eyebrow">ONLINE STORE / CONTENT</span><h2>Pages</h2><p>Create About Us, FAQs, Contact, Delivery & Returns, and any custom page.</p></div><button class="admin-primary" id="newPage">＋ Add page</button></div>'+
  '<div class="admin-panel table-panel"><div class="admin-table-wrap"><table><thead><tr><th>Page</th><th>URL</th><th>Status</th><th>Show in navigation</th><th></th></tr></thead><tbody>'+(D.pages.map((p,i)=>'<tr><td><b>'+esc(p.title)+'</b></td><td><code>page.html?slug='+esc(p.slug)+'</code></td><td>'+(p.published?'Published':'Draft')+'</td><td>'+(p.showInHeader?'Header':p.showInFooter?'Footer':'—')+'</td><td><button class="text-link" data-page-edit="'+i+'">Edit</button> <button class="text-link" data-page-delete="'+i+'">Delete</button></td></tr>').join('')||'<tr><td colspan="5">No pages yet. Create your first page.</td></tr>')+'</tbody></table></div></div>';
  $('#newPage').onclick=()=>editPage();
  document.querySelectorAll('[data-page-edit]').forEach(b=>b.onclick=()=>editPage(+b.dataset.pageEdit));
  document.querySelectorAll('[data-page-delete]').forEach(b=>b.onclick=()=>{const p=D.pages[+b.dataset.pageDelete];if(confirm('Delete '+p.title+'?')){D.pages.splice(+b.dataset.pageDelete,1);save('Delete page '+p.title);draw();}});
 };
 function editPage(index){
  const old=index===undefined?null:D.pages[index],p=old?{...old}:{title:'',slug:'',intro:'',content:'',image:'',seoTitle:'',seoDescription:'',published:false,showInHeader:false,showInFooter:false};
  modal('<h2>'+(old?'Edit page':'Create page')+'</h2><div class="editor-field"><label>Page title</label><input id="pageTitle" value="'+esc(p.title)+'" placeholder="About Us"></div><div class="editor-field"><label>URL handle</label><input id="pageSlug" value="'+esc(p.slug)+'" placeholder="about-us"><small>Customer URL: page.html?slug=about-us</small></div><div class="editor-field"><label>Short introduction</label><textarea id="pageIntro" rows="2">'+esc(p.intro)+'</textarea></div><div class="editor-field"><label>Page content</label><textarea id="pageContent" rows="10" placeholder="Write your page content here. Separate paragraphs with a blank line.">'+esc(p.content)+'</textarea></div><div class="editor-field"><label>Page image URL (optional)</label><input id="pageImage" value="'+esc(p.image)+'" placeholder="https://..."><label class="media-add">Upload page image<input type="file" id="pageImageFile" accept="image/*"></label></div><div class="editor-two-col"><label><input id="pagePublished" type="checkbox" '+(p.published?'checked':'')+'> Publish page</label><label><input id="pageHeader" type="checkbox" '+(p.showInHeader?'checked':'')+'> Add to header navigation</label><label><input id="pageFooter" type="checkbox" '+(p.showInFooter?'checked':'')+'> Add to footer navigation</label></div><div class="editor-field"><label>SEO title</label><input id="pageSeoTitle" value="'+esc(p.seoTitle)+'"></div><div class="editor-field"><label>SEO description</label><textarea id="pageSeoDesc" rows="2">'+esc(p.seoDescription)+'</textarea></div><div class="modal-actions"><button class="admin-view-store" id="cancelPage">Cancel</button><button class="admin-primary" id="savePage">Save page</button></div>');
  $('#cancelPage').onclick=closeModal;
  $('#pageImageFile')?.addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{$('#pageImage').value=await uploadImage(await resize(file));toast('Page image uploaded. Save the page to publish it.');}catch(err){toast(err.message,true);}});
  $('#savePage').onclick=()=>{
   const title=$('#pageTitle').value.trim();if(!title){toast('Page title is required.',true);return;}
   let slug=slugify($('#pageSlug').value||title);if(D.pages.some((v,i)=>i!==index&&v.slug===slug)){toast('That URL handle is already used. Choose another.',true);return;}
   const data={title,slug,intro:$('#pageIntro').value.trim(),content:$('#pageContent').value.trim(),image:$('#pageImage').value.trim(),published:$('#pagePublished').checked,showInHeader:$('#pageHeader').checked,showInFooter:$('#pageFooter').checked,seoTitle:$('#pageSeoTitle').value.trim(),seoDescription:$('#pageSeoDesc').value.trim()};
   if(index===undefined)D.pages.push(data);else D.pages[index]=data;
   closeModal();save((old?'Update ':'Create ')+title);draw();
  };
 }
 draw();
}

function overview() {
  const periodParam = new URLSearchParams(location.search).get('period');
  const days = periodParam === null ? 30 : Number(periodParam);
  const cutoff = days > 0 ? Date.now() - days * 86400000 : 0;
  const periodOrders = ordersList.filter(o => {
    const time = new Date(o.date || 0).getTime();
    return Number.isFinite(time) && time >= cutoff && o.fulfillmentStatus !== 'Cancelled';
  });
  const revenue = periodOrders.reduce((n,o)=>n+Number(o.total||0),0);
  const average = periodOrders.length ? revenue / periodOrders.length : 0;
  const low = D.products.filter(p=>Number(p.stock||0)<=5);
  const counts = {};
  periodOrders.forEach(o=>(o.lines||[]).forEach(l=>{const k=l.name||'Product';counts[k]=(counts[k]||0)+Number(l.qty||1);}));
  const top=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const buckets = Array.from({length:7},(_,i)=>({label:days===7?'Day '+(i+1):['-6','-5','-4','-3','-2','-1','Today'][i],value:0}));
  periodOrders.forEach(o=>{
    const d=new Date(o.date||0); if(!Number.isFinite(d.getTime()))return;
    const age=Math.floor((Date.now()-d.getTime())/86400000);
    const slot=days===7?6-age:Math.min(6,Math.max(0,Math.floor((6-age/Math.max(1,days))*1)));
    if(slot>=0&&slot<7)buckets[slot].value+=Number(o.total||0);
  });
  const max=Math.max(1,...buckets.map(x=>x.value));
  const customerCount=new Set(ordersList.map(o=>o.customer?.phone).filter(Boolean)).size;
  const repeatCount=[...ordersList.reduce((m,o)=>{const p=o.customer?.phone;if(p)m.set(p,(m.get(p)||0)+1);return m;},new Map()).values()].filter(n=>n>1).length;
  $('#view').innerHTML=`<div class="welcome-strip"><div><span class="admin-eyebrow">STORE PERFORMANCE</span><h2>Your store at a glance.</h2><p>Track sales, orders and customer activity for your selected period.</p></div><a class="admin-primary" href="./" target="_blank">View storefront ↗</a></div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:18px 0"><b>Analytics overview</b><select id="analyticsPeriod" style="padding:9px 13px;border:1px solid #d8ded8;border-radius:10px;background:#fff"><option value="7" ${days===7?'selected':''}>Last 7 days</option><option value="30" ${days===30?'selected':''}>Last 30 days</option><option value="90" ${days===90?'selected':''}>Last 90 days</option><option value="0" ${days===0?'selected':''}>All time</option></select></div>
    <div class="overview-stats">
      <article><span>Sales</span><b>${egp(revenue)}</b><small>Excludes cancelled orders</small></article>
      <article><span>Orders</span><b>${periodOrders.length}</b><small>In selected period</small></article>
      <article><span>Average order value</span><b>${egp(average)}</b><small>Sales divided by orders</small></article>
      <article><span>Customers</span><b>${customerCount}</b><small>${repeatCount} repeat customers overall</small></article>
    </div>
    <div class="overview-columns"><article class="admin-panel"><div class="panel-heading"><div><h3>Sales activity</h3><p>Daily sales trend within the selected period</p></div></div><div style="height:190px;display:flex;align-items:flex-end;gap:10px;padding:18px 4px 4px;border-bottom:1px solid #e8ece7">${buckets.map((b,i)=>`<div title="${egp(b.value)}" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:7px"><b style="font-size:11px;color:#52645c">${b.value?egp(b.value).replace('EGP ',''):''}</b><div style="width:100%;max-width:42px;height:${Math.max(3,b.value/max*100)}%;background:#1c524e;border-radius:7px 7px 2px 2px"></div><small style="font-size:10px;color:#78847d">${b.label}</small></div>`).join('')}</div></article>
    <article class="admin-panel"><div class="panel-heading"><div><h3>Top products</h3><p>Units sold in selected period</p></div><button class="text-link" data-go="products">Manage</button></div>${top.map(([n,c])=>`<div class="overview-row"><b>${esc(n)}</b><strong>${c} sold</strong></div>`).join('')||'<p class="empty-note">Sales data will appear here when orders come in.</p>'}<div class="low-stock-note"><b>${low.length} products need attention</b><small>${low.slice(0,3).map(p=>esc(p.name)+' ('+p.stock+')').join(' · ')||'All products have more than 5 in stock.'}</small><button class="text-link" data-go="inventory">Open inventory</button></div></article></div>
    <article class="admin-panel" style="margin-top:18px"><div class="panel-heading"><div><h3>Recent orders</h3><p>Latest customer orders</p></div><button class="text-link" data-go="orders">View all</button></div>${ordersList.slice().sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)).slice(0,5).map(o=>`<div class="overview-row"><div><b>${esc(o.customer?.first||'Customer')} ${esc(o.customer?.last||'')}</b><small>#${esc(o.number||'—')} · ${esc(new Date(o.date||Date.now()).toLocaleDateString())}</small></div><strong>${egp(o.total||0)}</strong></div>`).join('')||'<p class="empty-note">No orders yet. New orders will appear here.</p>'}</article>`;
  $('#analyticsPeriod').onchange=()=>{const v=$('#analyticsPeriod').value;history.replaceState(null,'',location.pathname+(v==='30'?'':'?period='+v));overview();};
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{tab=b.dataset.go;render();});
}
function exportCustomersExcel(rows) {
  if (typeof XLSX === 'undefined') {
    toast('Excel export library did not load. Refresh the admin page and try again.', true);
    return;
  }
  const data = rows.map(c => {
    const history = c.orders.slice().sort((a,b) => new Date(b.date||0)-new Date(a.date||0));
    const latest = history[0] || {};
    return {
      'Customer name': ((c.first||'')+' '+(c.last||'')).trim(),
      'Phone number': c.phone || '',
      'Address': latest.customer?.address || c.address || '',
      'Total orders': c.count,
      'Total spent (EGP)': Number(c.total||0)
    };
  });
  const ws = XLSX.utils.json_to_sheet(data, {header:['Customer name','Phone number','Address','Total orders','Total spent (EGP)']});
  ws['!cols'] = [{wch:26},{wch:18},{wch:48},{wch:14},{wch:20}];
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:E1');
  for (let row=1; row<=range.e.r; row++) {
    const cell=ws[XLSX.utils.encode_cell({r:row,c:4})];
    if(cell) cell.z='#,##0.00 "EGP"';
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Customers');
  XLSX.writeFile(wb, 'Dew-Customers.xlsx');
  toast('Customer Excel file exported.');
}

function customers() {
  const map=new Map();
  ordersList.forEach(o=>{const c=o.customer||{},key=c.phone||c.whatsapp||((c.first||'')+(c.last||''));if(!map.has(key))map.set(key,{...c,phone:c.phone||'',count:0,total:0,last:o.date,orders:[]});const x=map.get(key);x.count++;x.total+=Number(o.total||0);x.orders.push(o);if(new Date(o.date||0)>new Date(x.last||0))x.last=o.date;});
  const rows=[...map.values()].sort((a,b)=>new Date(b.last||0)-new Date(a.last||0));
  const filtered=()=>rows.filter(c=>!q||((c.first||'')+' '+(c.last||'')+' '+(c.phone||'')).toLowerCase().includes(q.toLowerCase()));
  const native=isNativeApp;
  $('#view').innerHTML=`<div class="shopify-page-head"><div><span class="admin-eyebrow">RELATIONSHIPS</span><h2>Customers</h2><p>Understand your customers and their purchase history.</p></div><button class="admin-view-store" id="exportCustomers">Export Excel</button></div>
    <div class="shopify-metrics"><div><span>Total customers</span><b>${rows.length}</b></div><div><span>Total orders</span><b>${ordersList.length}</b></div><div><span>Customer sales</span><b>${egp(rows.reduce((n,c)=>n+c.total,0))}</b></div></div>
    <div class="shopify-toolbar"><div class="shopify-search"><span>⌕</span><input id="q" value="${esc(q)}" placeholder="Search by customer name or phone"></div><span class="shopify-muted" id="customerCount">${filtered().length} customers</span></div>
    ${native?'<div class="dew-customer-list" id="dewCustomerList"></div>':`<div class="admin-panel table-panel"><div class="admin-table-wrap"><table class="customers-mobile-table"><thead><tr><th>Customer</th><th>Phone</th><th>Orders</th><th>Total spent</th><th></th></tr></thead><tbody>${filtered().map(c=>`<tr><td><b>${esc((c.first||'')+' '+(c.last||''))}</b></td><td>${esc(c.phone||'—')}</td><td>${c.count}</td><td>${egp(c.total)}</td><td><button class="btn small" data-customer="${rows.indexOf(c)}">View</button></td></tr>`).join('')||'<tr><td colspan="5">No customers yet.</td></tr>'}</tbody></table></div></div>`}`;
  $('#exportCustomers').onclick=()=>exportCustomersExcel(rows);
  function showCustomer(index){const c=rows[index];if(!c)return;const history=c.orders.slice().sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));modal(`<h2>${esc((c.first||'')+' '+(c.last||''))}</h2><p><b>Phone:</b> ${esc(c.phone||'—')}<br><b>Address:</b> ${esc(history[0]?.customer?.address||'—')}<br><b>Total orders:</b> ${c.count}<br><b>Total spent:</b> ${egp(c.total)}<br><b>Last order:</b> ${c.last?new Date(c.last).toLocaleString():'—'}</p><h3>Order history</h3>${history.map(o=>`<div class="overview-row"><div><b>${esc(o.number||'Order')}</b><small>${esc(new Date(o.date||0).toLocaleDateString())} · ${esc(o.fulfillmentStatus||'Pending')}</small></div><strong>${egp(o.total)}</strong></div>`).join('')||'<p>No orders found.</p>'}<button class="btn" style="margin-top:16px" onclick="document.getElementById('ov').classList.remove('open')">Close</button>`);}
  const draw=()=>{const list=filtered(),el=$('#dewCustomerList');$('#customerCount').textContent=list.length+' customers';if(el)el.innerHTML=list.map(c=>{const i=rows.indexOf(c),name=((c.first||'')+' '+(c.last||'')).trim()||'Guest customer';return `<button class="dew-customer-card" data-customer="${i}"><span class="dew-customer-avatar">${esc(name[0].toUpperCase())}</span><span class="dew-customer-main"><b>${esc(name)}</b><small>${esc(c.phone||'No phone number')}</small><small>${c.count} ${c.count===1?'order':'orders'} · Last order ${c.last?new Date(c.last).toLocaleDateString():'—'}</small></span><span class="dew-customer-spend"><b>${egp(c.total)}</b><small>Total spent</small></span><span class="dew-card-chevron">›</span></button>`;}).join('')||'<div class="dew-mobile-empty">Customers will appear here after their first order.</div>';};
  $('#q').oninput=()=>{q=$('#q').value;draw();};
  if(native){draw();$('#dewCustomerList').onclick=e=>{const b=e.target.closest('[data-customer]');if(b)showCustomer(Number(b.dataset.customer));};}
  else document.querySelectorAll('[data-customer]').forEach(b=>b.onclick=()=>showCustomer(Number(b.dataset.customer)));
}
function inventory() {
  const rows=D.products.slice().sort((a,b)=>Number(a.stock||0)-Number(b.stock||0));
  $('#view').innerHTML=`<div class="page-heading"><div><h2>Inventory</h2><p>Keep track of available stock for every product.</p></div><span class="admin-count">${rows.reduce((n,p)=>n+Number(p.stock||0),0)} units in stock</span></div><div class="admin-panel table-panel"><div class="admin-table-wrap"><table class="inventory-mobile-table"><thead><tr><th>Product</th><th>Price</th><th>Available</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(p=>`<tr><td><b>${esc(p.name)}</b></td><td>${egp(p.salePrice>0&&p.salePrice<p.price?p.salePrice:p.price)}</td><td><input class="stock-input" type="number" min="0" value="${Number(p.stock||0)}" data-inv="${p.id}"></td><td><span class="stock-status ${p.stock<=0?'out':p.stock<=5?'low':''}">${p.stock<=0?'Out of stock':p.stock<=5?'Low stock':'In stock'}</span></td><td><button class="text-link" data-edit-inv="${p.id}">Edit product</button></td></tr>`).join('')}</tbody></table></div></div>`;
  document.querySelectorAll('[data-inv]').forEach(el=>el.onchange=()=>{const p=D.products.find(x=>x.id===el.dataset.inv);p.stock=Math.max(0,Math.floor(Number(el.value)||0));save('Update inventory for '+p.name);inventory();});
  document.querySelectorAll('[data-edit-inv]').forEach(b=>b.onclick=()=>productForm(b.dataset.editInv));}
/* ---------- products ---------- */
/* ---------- products ---------- */
function products() {
  const query=q.toLowerCase();
  let activeFilter='All';
  const list=()=>D.products.filter(p=>(!query||(p.name+' '+(p.tags||'')).toLowerCase().includes(query))&&(activeFilter==='All'||(activeFilter==='Active'?!!p.visible:!p.visible)));
  const live=D.products.filter(p=>p.visible).length;
  const low=D.products.filter(p=>Number(p.stock||0)<=5).length;
  const native=isNativeApp;
  $('#view').innerHTML=`
    <div class="shopify-page-head"><div><span class="admin-eyebrow">CATALOGUE</span><h2>Products</h2><p>Manage your products, prices, stock and storefront visibility.</p></div><button class="admin-primary" id="newP">＋ Add product</button></div>
    <div class="shopify-metrics"><div><span>All products</span><b>${D.products.length}</b></div><div><span>Active</span><b>${live}</b></div><div><span>Low stock</span><b>${low}</b></div></div>
    <div class="shopify-toolbar"><div class="shopify-search"><span>⌕</span><input id="q" value="${esc(q)}" placeholder="Search products by name or tag"></div><div class="dew-mobile-toolbar-actions"><button class="admin-view-store" id="exportProducts">Export Excel</button><button class="admin-view-store" id="importProducts">Import CSV / Excel</button><input id="productExcelFile" type="file" accept=".xlsx,.xls,.csv" hidden><span class="shopify-muted">${list().length} products</span></div></div>
    ${native?`<div class="dew-mobile-filter-row" id="productFilters">${['All','Active','Draft'].map(x=>`<button class="dew-mobile-filter ${x==='All'?'active':''}" data-product-filter="${x}">${x}</button>`).join('')}</div>
    <div class="dew-product-list" id="dewProductList"></div>`:`<div class="admin-panel table-panel"><div class="admin-table-wrap"><table class="shopify-table products-mobile-table"><thead><tr><th>Product</th><th>Status</th><th>Collection</th><th>Price</th><th>Inventory</th><th>Homepage</th><th></th></tr></thead><tbody>
    ${list().map(p=>`<tr><td><div class="product-cell"><div class="product-thumb">${p.images?.[0]?`<img src="${esc(p.images[0])}" alt="">`:'<span>DEW</span>'}</div><div><b>${esc(p.name)}</b><small>${esc(p.tags||'No tags')}</small></div></div></td><td><span class="shopify-status ${p.visible?'is-live':'is-draft'}"><i></i>${p.visible?'Active':'Draft'}</span></td><td>${esc(catName(p.catalog))}</td><td><b>${p.salePrice>0&&p.salePrice<p.price?egp(p.salePrice):egp(p.price)}</b></td><td>${Number(p.stock||0)} in stock</td><td>${p.featured?'Featured':'—'}</td><td><button class="text-link" data-e="${p.id}">Edit</button></td></tr>`).join('')||'<tr><td colspan="7" class="empty-note">No products found.</td></tr>'}</tbody></table></div></div>`}
  `;
  $('#newP').onclick=()=>productForm();
  $('#exportProducts').onclick=()=>exportProductsExcel();
  $('#importProducts').onclick=()=>$('#productExcelFile').click();
  $('#productExcelFile').onchange=async e=>{try{await importProductsExcel(e.target.files[0]);}catch(err){toast(err.message,true);}e.target.value='';};
  const draw=()=>{const rows=list();const el=$('#dewProductList');if(el)el.innerHTML=rows.map(p=>`
    <article class="dew-product-card"><div class="dew-product-image">${p.images?.[0]?`<img src="${esc(p.images[0])}" alt="">`:'<span>DEW</span>'}</div><div class="dew-product-info"><b>${esc(p.name)}</b><span class="dew-product-status ${p.visible?'active':'draft'}">${p.visible?'Active':'Draft'}</span><strong>${egp(p.salePrice>0&&p.salePrice<p.price?p.salePrice:p.price)}</strong><small>${Number(p.stock||0)} in stock · ${esc(catName(p.catalog))}</small>${p.featured?'<small class="dew-product-featured">Featured on homepage</small>':''}</div><button class="dew-card-more" data-e="${p.id}" aria-label="Edit product">›</button></article>`).join('')||'<div class="dew-mobile-empty">No products found. Try another search or add a product.</div>';};
  const search=$('#q');search.oninput=()=>{q=search.value;draw();const count=document.querySelector('.dew-mobile-toolbar-actions .shopify-muted');if(count)count.textContent=list().length+' products';};
  document.querySelectorAll('[data-product-filter]').forEach(b=>b.onclick=()=>{activeFilter=b.dataset.productFilter;document.querySelectorAll('[data-product-filter]').forEach(x=>x.classList.toggle('active',x===b));draw();});
  document.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>productForm(b.dataset.e));
  if(native)draw();
}
function productForm(id) {
  const p = id ? D.products.find(x => x.id === id) : { name:'', catalog:D.catalogs[0]?.id||'', price:'', salePrice:'', stock:0, description:'', howToUse:'', tags:'', images:[], visible:true, featured:false };
  if (!p) return;
  let images=[...(p.images||[])];
  let optionRows=(p.options||[]).map(x=>({name:x.name,values:[...(x.values||[])]}));
  let variantRows=(p.variants||[]).map(v=>({...v,options:{...(v.options||{})}}));
  const moneyLabel=n=>'EGP '+Number(n||0).toLocaleString('en-US');
  $('#view').innerHTML=`
    <div class="editor-breadcrumb"><button class="text-link" id="backProducts">← Products</button><span>/</span><b>${id?'Edit product':'Add product'}</b></div>
    <div class="shopify-page-head product-editor-head"><div><span class="admin-eyebrow">PRODUCTS / ${id?'EDIT':'NEW'}</span><h2>${id?esc(p.name):'Add product'}</h2><p>Organize product details just like Shopify Admin.</p></div><div class="editor-head-actions"><button class="admin-view-store" id="cancelProduct">Discard</button><button class="admin-primary" id="saveProduct">Save</button></div></div>
    <div class="product-editor-layout">
      <div class="product-editor-main">
        <section class="editor-panel"><div class="editor-panel-title"><h3>Media</h3><span>Up to 8 images</span></div><div class="product-media-grid" id="productMedia"></div><label class="media-add">＋ Add images<input type="file" id="pf" accept="image/*" multiple></label><p class="editor-hint">Product photos are automatically fitted to 1000 × 1250 px (4:5). The full photo is preserved without cropping and adapts to phone and desktop screens.</p></section>
        <section class="editor-panel"><h3>Product information</h3><div class="editor-field"><label>Title</label><input id="pn" value="${esc(p.name)}" placeholder="e.g. Dew Lip Balm"></div><div class="editor-field"><label>Description</label><textarea id="pdesc" rows="6" placeholder="Describe your product">${esc(p.description)}</textarea></div></section>
        <section class="editor-panel" id="pricingPanel"><h3>Base product pricing</h3><p class="editor-hint">Used only when this product has no variants. Each variant has its own price and sale price below.</p><div class="editor-two-col"><div class="editor-field"><label>Price (EGP)</label><input id="pp" type="number" min="0" step="1" value="${esc(p.price)}"></div><div class="editor-field"><label>Compare-at price / Sale price (EGP)</label><input id="pd" type="number" min="0" step="1" value="${esc(p.salePrice||'')}"><small>Enter a lower price to show a sale.</small></div></div><div class="price-preview" id="pricePreview">${moneyLabel(p.salePrice>0&&p.salePrice<p.price?p.salePrice:p.price)}</div></section>
        <section class="editor-panel"><div class="editor-panel-title"><h3>Variants</h3><span>Options such as Size, Color, Scent or Volume</span></div><div id="variantOptions"></div><button type="button" class="admin-view-store shopify-add-option" id="addVariantOption">＋ Add another option</button><div id="variantTable" style="margin-top:14px"></div><p class="editor-hint">Each variant has its own photo, price, sale price, quantity, SKU and barcode.</p></section>
        <section class="editor-panel" id="inventoryPanel"><h3>Base product inventory</h3><div class="editor-field"><label>Available quantity (used when there are no variants)</label><input id="ps" type="number" min="0" step="1" value="${Number(p.stock||0)}"></div><p class="editor-hint">For products with variants, stock is managed separately for each variant.</p></section>
        <section class="editor-panel"><h3>Search engine listing</h3>
        <p class="editor-hint">Customize how this product appears in Google search results. Use the words customers actually search for, such as moisturizer, lip balm, or sunscreen.</p>
        <div class="editor-field"><label>URL handle</label><input id="pHandle" value="${esc(p.shopifyHandle||String(p.name||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''))}" placeholder="moisturizer"><small>Product link: product.html?handle=your-product-name. You can edit this handle.</small></div>
        <div class="editor-field"><label>SEO page title</label><input id="pSeoTitle" maxlength="70" value="${esc(p.seoTitle||'')}" placeholder="${esc(p.name||'Product name')} | Dew Skincare"><small>Recommended: around 50–60 characters.</small></div>
        <div class="editor-field"><label>Meta description</label><textarea id="pSeoDescription" rows="3" maxlength="320" placeholder="Describe this product clearly and naturally for customers searching on Google.">${esc(p.seoDescription||'')}</textarea><small>Recommended: around 140–160 characters.</small></div>
      </section><section class="editor-panel"><h3>Product organization</h3><div class="editor-two-col"><div class="editor-field"><label>Collection membership</label><p class="editor-hint">Manage collections separately in Admin → Collections. Removing a collection never deletes its products.</p></div><div class="editor-field"><label>Tags</label><input id="ptags" value="${esc(p.tags||'')}" placeholder="lip care, skincare, gift"></div></div><div class="editor-field"><label>How to use</label><textarea id="phow" rows="3" placeholder="Usage instructions">${esc(p.howToUse||'')}</textarea></div></section>
      </div>
      <aside class="product-editor-side"><section class="editor-panel"><h3>Status</h3><select id="pvStatus"><option value="active" ${p.visible?'selected':''}>Active</option><option value="draft" ${!p.visible?'selected':''}>Draft</option></select><p class="editor-hint">Active products can appear in your storefront.</p></section><section class="editor-panel"><h3>Sales channels</h3><label class="editor-check"><input id="pfe" type="checkbox" ${p.featured?'checked':''}> Feature on homepage</label><p class="editor-hint">Featured products appear in the homepage product section.</p></section><section class="editor-panel"><h3>Store preview</h3><div class="mini-product-preview" id="miniProductPreview"><div class="mini-product-photo">${images[0]?'<img src="'+esc(images[0])+'" alt="">':'<span>DEW</span>'}</div><b id="miniProductName">${esc(p.name||'Product title')}</b><span id="miniProductPrice">${moneyLabel(p.salePrice>0&&p.salePrice<p.price?p.salePrice:p.price)}</span></div></section></aside>
    </div>`;
  const paint=()=>{$('#productMedia').innerHTML=images.map((u,i)=>`<div class="product-media-item ${i===0?'is-cover':''}" draggable="true" data-drag-image="${i}" title="Drag to rearrange"><img src="${esc(u)}" alt=""><button type="button" data-remove-image="${i}" aria-label="Remove image">×</button>${i===0?'<small>Cover photo</small>':'<small>Photo '+(i+1)+'</small>'}</div>`).join('')+'<div class="product-media-empty">＋</div>';document.querySelectorAll('[data-remove-image]').forEach(b=>b.onclick=()=>{images.splice(+b.dataset.removeImage,1);paint();});let dragIndex=-1;document.querySelectorAll('[data-drag-image]').forEach(item=>{item.addEventListener('dragstart',e=>{dragIndex=+item.dataset.dragImage;item.classList.add('is-dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(dragIndex));});item.addEventListener('dragend',()=>{dragIndex=-1;document.querySelectorAll('[data-drag-image]').forEach(x=>x.classList.remove('is-dragging','is-drop-target'));});item.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';item.classList.add('is-drop-target');});item.addEventListener('dragleave',()=>item.classList.remove('is-drop-target'));item.addEventListener('drop',e=>{e.preventDefault();item.classList.remove('is-drop-target');const from=dragIndex>=0?dragIndex:Number(e.dataTransfer.getData('text/plain')),to=+item.dataset.dragImage;if(!Number.isInteger(from)||from<0||from>=images.length||from===to)return;const [moved]=images.splice(from,1);images.splice(to,0,moved);paint();});});const mini=$('#miniProductPreview .mini-product-photo');mini.innerHTML=images[0]?'<img src="'+esc(images[0])+'" alt="">':'<span>DEW</span>';};
  const refreshPreview=()=>{$('#miniProductName').textContent=$('#pn').value||'Product title';const v=Number($('#pd').value)>0&&Number($('#pd').value)<Number($('#pp').value)?Number($('#pd').value):Number($('#pp').value);$('#miniProductPrice').textContent=moneyLabel(v);$('#pricePreview').textContent=moneyLabel(v);};
  const escAttr=s=>esc(s);
  const makeCombos=opts=>{if(!opts.length)return [];return opts.reduce((acc,opt)=>acc.flatMap(base=>opt.values.map(value=>({...base,[opt.name]:value}))),[{}]);};
  const optionIsMapped=(v,opts)=>opts.every(o=>o.name&&o.values.includes(String(v.options?.[o.name]??'')));
  let editingOptionRows=new Set(optionRows.map((_,i)=>i));
  let expandedVariantRows=new Set();
  let groupByOption=optionRows[0]?.name||'';
  const renderVariants=()=>{
    const opts=optionRows.filter(o=>o.name.trim()&&o.values.length),combos=makeCombos(opts);
    if(!variantRows.length&&combos.length){
      variantRows=combos.map(o=>({id:uid(),options:o,price:Number($('#pp').value||p.price||0),salePrice:Number($('#pd').value||p.salePrice||0),stock:0,sku:'',barcode:''}));
    }else if(variantRows.length&&opts.length){
      const existing=new Set(variantRows.filter(v=>optionIsMapped(v,opts)).map(v=>JSON.stringify(opts.map(o=>String(v.options?.[o.name]??'')))));
      combos.forEach(o=>{const key=JSON.stringify(opts.map(x=>String(o[x.name]??'')));if(!existing.has(key)){variantRows.push({id:uid(),options:o,price:Number($('#pp').value||p.price||0),salePrice:0,stock:0,sku:'',barcode:''});existing.add(key);}});
    }
    if(!opts.some(o=>o.name===groupByOption))groupByOption=opts[0]?.name||'';
    $('#pricingPanel').hidden=opts.length>0;
    $('#inventoryPanel').hidden=opts.length>0;
    $('#variantOptions').innerHTML=optionRows.map((o,i)=>{
      const editing=editingOptionRows.has(i);
      return '<section class="shopify-option-card '+(editing?'is-editing':'')+'"><div class="shopify-option-heading"><span class="shopify-drag">⠿</span><div class="shopify-option-body">'+
        (editing?'<label>Option name</label><input class="shopify-option-name" data-opt-name="'+i+'" value="'+escAttr(o.name)+'" placeholder="e.g. Size, Color, Scent">':'<b>'+esc(o.name||'New option')+'</b>')+
        (editing?'<div class="shopify-option-values"><label>Option values</label><div class="shopify-value-chips">'+o.values.map((v,vi)=>'<span class="shopify-value-chip">'+esc(v)+'<button type="button" aria-label="Remove '+esc(v)+'" data-opt-value-remove="'+i+'" data-value-index="'+vi+'">×</button></span>').join('')+'</div><div class="shopify-add-value"><input data-opt-new-value="'+i+'" placeholder="Add a value"><button type="button" class="admin-view-store" data-opt-value-add="'+i+'">Add</button></div></div>':'<div class="shopify-option-summary">'+o.values.map(v=>'<span>'+esc(v)+'</span>').join('')+'</div>')+
        '</div><div class="shopify-option-actions">'+(editing?'<button type="button" class="admin-primary shopify-done" data-opt-done="'+i+'">Done</button>':'<button type="button" class="admin-view-store" data-opt-edit="'+i+'">Edit</button>')+'<button type="button" class="text-link danger-link" data-opt-remove="'+i+'">Delete</button></div></div></section>';
    }).join('');
    document.querySelectorAll('[data-opt-name]').forEach(el=>el.onchange=()=>{const row=optionRows[+el.dataset.optName],oldName=row.name,newName=el.value.trim();if(oldName!==newName){variantRows.forEach(v=>{if(v.options&&Object.prototype.hasOwnProperty.call(v.options,oldName)){v.options[newName]=v.options[oldName];delete v.options[oldName];}});row.name=newName;}renderVariants();});
    document.querySelectorAll('[data-opt-new-value]').forEach(el=>{const add=()=>{const i=+el.dataset.optNewValue,value=el.value.trim();if(!value)return;const row=optionRows[i];if(!row.values.some(v=>v.toLowerCase()===value.toLowerCase()))row.values.push(value);renderVariants();};el.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();add();}};});
    document.querySelectorAll('[data-opt-value-add]').forEach(b=>b.onclick=()=>{const input=document.querySelector('[data-opt-new-value="'+b.dataset.optValueAdd+'"]');const value=input?.value.trim();if(!value)return;const row=optionRows[+b.dataset.optValueAdd];if(!row.values.some(v=>v.toLowerCase()===value.toLowerCase()))row.values.push(value);renderVariants();});
    document.querySelectorAll('[data-opt-value-remove]').forEach(b=>b.onclick=()=>{const oi=+b.dataset.optValueRemove,vi=+b.dataset.valueIndex,row=optionRows[oi],removed=row.values[vi];row.values.splice(vi,1);variantRows=variantRows.filter(v=>String(v.options?.[row.name]??'')!==String(removed));renderVariants();});
    document.querySelectorAll('[data-opt-done]').forEach(b=>b.onclick=()=>{editingOptionRows.delete(+b.dataset.optDone);renderVariants();});
    document.querySelectorAll('[data-opt-edit]').forEach(b=>b.onclick=()=>{editingOptionRows.add(+b.dataset.optEdit);renderVariants();});
    document.querySelectorAll('[data-opt-remove]').forEach(el=>el.onclick=()=>{const index=+el.dataset.optRemove,removed=optionRows.splice(index,1)[0];variantRows.forEach(v=>{if(v.options)delete v.options[removed.name];});editingOptionRows=new Set([...editingOptionRows].filter(i=>i!==index).map(i=>i>index?i-1:i));renderVariants();});
    const groupValues=opts.find(o=>o.name===groupByOption)?.values||[];
    const grouped=groupByOption?[...groupValues.map(value=>({value,rows:variantRows.map((v,i)=>({v,i})).filter(x=>String(x.v.options?.[groupByOption]??'')===String(value))})).filter(g=>g.rows.length),{value:'Unassigned',rows:variantRows.map((v,i)=>({v,i})).filter(x=>!groupValues.includes(String(x.v.options?.[groupByOption]??'')))}].filter(g=>g.rows.length):[{value:'',rows:variantRows.map((v,i)=>({v,i}))}];
    const optionSelect=(v,oi,o,vi)=>'<select data-voption="'+vi+'" data-vo="'+oi+'" aria-label="'+esc(o.name)+'"><option value="">Choose '+esc(o.name)+'</option>'+o.values.map(x=>'<option value="'+esc(x)+'" '+(String(v.options?.[o.name]??'')===String(x)?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select>';
    const variantRow=({v,i})=>'<article class="shopify-variant-row"><div class="shopify-variant-main"><div class="variant-media-controls"><div class="shopify-variant-thumb variant-linked-photo">'+(v.image?'<img src="'+esc(v.image)+'" alt="Linked product photo">':'<span>No photo linked</span>')+'</div><button type="button" class="variant-choose-photo" data-vpick="'+i+'">Link existing photo</button>'+(v.image?'<button type="button" class="variant-unlink-photo" data-vunlink="'+i+'">Remove link</button>':'')+'</div><div class="shopify-variant-name"><b>'+esc(Object.values(v.options||{}).filter(Boolean).join(' / ')||'Choose options')+'</b><div class="shopify-variant-selects">'+opts.map((o,oi)=>optionSelect(v,oi,o,i)).join('')+'</div></div><label class="shopify-variant-price"><span>Price</span><input type="number" min="0" step="1" data-vfield="price" data-vi="'+i+'" value="'+Number(v.price??p.price??0)+'"></label><label class="shopify-variant-stock"><span>Available</span><input type="number" min="0" step="1" data-vfield="stock" data-vi="'+i+'" value="'+Number(v.stock||0)+'"></label><button type="button" class="shopify-variant-more" data-variant-details="'+i+'">'+(expandedVariantRows.has(i)?'Hide details':'Edit details')+'⌄</button><button type="button" class="text-link danger-link" data-vremove="'+i+'">Remove</button></div>'+(expandedVariantRows.has(i)?'<div class="shopify-variant-details"><label><span>Sale price (EGP)</span><input type="number" min="0" step="1" data-vfield="salePrice" data-vi="'+i+'" value="'+(Number(v.salePrice||0)||'')+'"></label><label><span>SKU</span><input data-vfield="sku" data-vi="'+i+'" value="'+esc(v.sku||'')+'" placeholder="SKU"></label><label><span>Barcode</span><input data-vfield="barcode" data-vi="'+i+'" value="'+esc(v.barcode||'')+'" placeholder="Barcode"></label></div>':'')+'</article>';
    $('#variantTable').innerHTML=opts.length?'<div class="shopify-variant-toolbar"><b>'+variantRows.length+' variants</b><label>Group by <select id="variantGroupBy">'+opts.map(o=>'<option value="'+esc(o.name)+'" '+(groupByOption===o.name?'selected':'')+'>'+esc(o.name)+'</option>').join('')+'</select></label></div><div class="shopify-variant-list">'+grouped.map(g=>(g.value?'<div class="shopify-variant-group-title">'+(g.value==='Unassigned'?'Needs option values':esc(groupByOption)+': '+esc(g.value))+'</div>':'')+g.rows.map(variantRow).join('')).join('')+'</div><button type="button" class="admin-view-store shopify-add-variant" id="addSingleVariant">＋ Add another variant</button>':'<p class="empty-note">Add an option and its values to create variants.</p>';
    $('#variantGroupBy')?.addEventListener('change',e=>{groupByOption=e.target.value;renderVariants();});
    document.querySelectorAll('[data-vfield]').forEach(el=>el.onchange=()=>{const v=variantRows[+el.dataset.vi],k=el.dataset.vfield;v[k]=['price','salePrice','stock'].includes(k)?Math.max(0,Number(el.value||0)):el.value.trim();});
    document.querySelectorAll('[data-voption]').forEach(el=>el.onchange=()=>{const v=variantRows[+el.dataset.voption],o=opts[+el.dataset.vo];v.options={...(v.options||{}),[o.name]:el.value};renderVariants();});
    // Variant photos are references to the product gallery; selecting one never uploads or copies a file.
    document.querySelectorAll('[data-vpick]').forEach(el=>el.onclick=()=>{
      const vi=+el.dataset.vpick;
      const choices=[...new Set(images.filter(Boolean))];
      if(!choices.length){toast('Upload product photos first, then link one to this variant.',true);return;}
      modal('<div class="media-picker-modal"><div class="editor-panel-title"><h3>Link an existing product photo</h3><button type="button" class="text-link" id="closeMediaPicker">Close</button></div><p class="editor-hint">This only links the selected photo. It does not upload or create another image.</p><div class="media-picker-grid">'+choices.map((src,ci)=>'<button type="button" class="media-picker-item" data-vpick-image="'+ci+'"><img src="'+esc(src)+'" alt=""><small>Product photo '+(ci+1)+'</small></button>').join('')+'</div></div>');
      $('#closeMediaPicker').onclick=closeModal;
      document.querySelectorAll('[data-vpick-image]').forEach(b=>b.onclick=()=>{variantRows[vi].image=choices[+b.dataset.vpickImage];closeModal();renderVariants();toast('Existing product photo linked. No new upload created.');});
    });
    document.querySelectorAll('[data-vunlink]').forEach(el=>el.onclick=()=>{variantRows[+el.dataset.vunlink].image='';renderVariants();});
    document.querySelectorAll('[data-vremove]').forEach(el=>el.onclick=()=>{variantRows.splice(+el.dataset.vremove,1);renderVariants();});
    document.querySelectorAll('[data-variant-details]').forEach(b=>b.onclick=()=>{const i=+b.dataset.variantDetails;expandedVariantRows.has(i)?expandedVariantRows.delete(i):expandedVariantRows.add(i);renderVariants();});
    $('#addSingleVariant')?.addEventListener('click',()=>{variantRows.push({id:uid(),options:{},price:Number($('#pp').value||p.price||0),salePrice:0,stock:0,sku:'',barcode:''});expandedVariantRows.add(variantRows.length-1);renderVariants();});
  };
  $('#addVariantOption').onclick=()=>{optionRows.push({name:'',values:[]});editingOptionRows.add(optionRows.length-1);renderVariants();};
  renderVariants();
  paint();$('#backProducts').onclick=()=>{tab='products';render();};$('#cancelProduct').onclick=()=>{tab='products';render();};
  let productHandleEdited=!!p.shopifyHandle;$('#pHandle').oninput=()=>{productHandleEdited=true;};$('#pn').oninput=()=>{refreshPreview();if(!productHandleEdited)$('#pHandle').value=$('#pn').value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');};$('#pp').oninput=refreshPreview;$('#pd').oninput=refreshPreview;
  $('#pf').onchange=async e=>{const files=[...e.target.files];if(images.length+files.length>8){toast('You can add up to 8 product photos.',true);}for(const file of files.slice(0,8-images.length)){try{const path=await uploadImage(await resizeProductImage(file));images.push(path);paint();}catch(err){toast(err.message,true);break;}}e.target.value='';};
  $('#saveProduct').onclick=async()=>{const saveButton=$('#saveProduct');if(saveButton.disabled)return;saveButton.disabled=true;saveButton.textContent='Saving...';const name=$('#pn').value.trim(),enteredPrice=Number($('#pp').value);if(!name){toast('Product title is required.',true);saveButton.disabled=false;saveButton.textContent='Save';return;}const cleanOptions=optionRows.filter(o=>o.name.trim()&&o.values.length).map(o=>({name:o.name.trim(),values:[...new Set(o.values)]}));const cleanVariants=cleanOptions.length?variantRows:[];if(!cleanOptions.length&&!(enteredPrice>0)){toast('Enter a valid product price.',true);saveButton.disabled=false;saveButton.textContent='Save';return;}if(cleanOptions.length&&(!cleanVariants.length||cleanVariants.some(v=>!(Number(v.price)>0)||cleanOptions.some(o=>!o.values.includes(String(v.options?.[o.name]??'')))))){toast('Complete every variant: choose its option values and enter its own price.',true);saveButton.disabled=false;saveButton.textContent='Save';return;}const price=cleanOptions.length?Number(cleanVariants[0].price):enteredPrice;const shopifyHandle=$('#pHandle').value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');if(!shopifyHandle){toast('Enter a URL handle for this product.',true);saveButton.disabled=false;saveButton.textContent='Save';return;}if(D.products.some(x=>x.id!==id&&(x.shopifyHandle||String(x.name||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''))===shopifyHandle)){toast('This product URL handle is already used. Choose another.',true);saveButton.disabled=false;saveButton.textContent='Save';return;}const data={name,shopifyHandle,seoTitle:$('#pSeoTitle').value.trim(),seoDescription:$('#pSeoDescription').value.trim(),price,salePrice:cleanOptions.length?Number(cleanVariants[0].salePrice||0):Number($('#pd').value)||0,stock:cleanOptions.length?cleanVariants.reduce((n,v)=>n+Number(v.stock||0),0):Math.max(0,Math.floor(Number($('#ps').value)||0)),description:$('#pdesc').value.trim(),howToUse:$('#phow').value.trim(),tags:$('#ptags').value.trim(),images,visible:$('#pvStatus').value==='active',featured:$('#pfe').checked,options:cleanOptions,variants:cleanVariants};let savedId=id;if(id)Object.assign(p,data);else{savedId=uid();D.products.unshift({id:savedId,...data});}save((id?'Update ':'Add ')+name).then(()=>{const heading=$('.product-editor-head h2');if(heading)heading.textContent=name;}).catch(()=>{}).finally(()=>{const b=$('#saveProduct');if(b){b.disabled=false;b.textContent='Save';}});};
}

function exportProductsExcel(){
  if(!window.XLSX){toast('Excel tools are still loading. Refresh and try again.',true);return;}
  const rows=[];
  D.products.forEach(p=>{
    const vars=p.variants?.length?p.variants:[{options:{},price:p.price,salePrice:p.salePrice,stock:p.stock,sku:p.sku||'',barcode:p.barcode||''}];
    vars.forEach(v=>rows.push({productId:p.id,name:p.name,description:p.description||'',collection:p.catalog||'',tags:p.tags||'',visible:p.visible?'Active':'Draft',featured:p.featured?'Yes':'No',image1:p.images?.[0]||'',image2:p.images?.[1]||'',image3:p.images?.[2]||'',price:v.price??p.price,salePrice:v.salePrice??p.salePrice??'',stock:v.stock??p.stock,sku:v.sku||'',barcode:v.barcode||'',variantImage:v.image||'',option1Name:p.options?.[0]?.name||'',option1Value:v.options?.[p.options?.[0]?.name]||'',option2Name:p.options?.[1]?.name||'',option2Value:v.options?.[p.options?.[1]?.name]||'',option3Name:p.options?.[2]?.name||'',option3Value:v.options?.[p.options?.[2]?.name]||''}));
  });
  const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Products');XLSX.writeFile(wb,'dew-products.xlsx');
}
async function importProductsExcel(file){
  if(!file)return;
  if(!window.XLSX)throw new Error('Import tools are still loading. Refresh and try again.');
  const wb=XLSX.read(await file.arrayBuffer(),{type:'array',raw:true});
  const sheet=wb.Sheets[wb.SheetNames[0]],rows=XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false});
  if(!rows.length)throw new Error('The spreadsheet is empty.');
  const norm=s=>String(s||'').trim().toLowerCase().replace(/[\s_-]+/g,' ');
  const headers=Object.keys(rows[0]),headerMap=new Map(headers.map(h=>[norm(h),h]));
  const col=(r,...names)=>{for(const n of names){const h=headerMap.get(norm(n));if(h!==undefined&&r[h]!==''&&r[h]!==null&&r[h]!==undefined)return r[h];}return '';};
  const isShopify=headerMap.has('handle')&&headerMap.has('title')&&(headerMap.has('variant price')||headerMap.has('body (html)'));
  const number=(v,fallback=0)=>{const n=Number(String(v??'').replace(/[, EGP$]/g,''));return Number.isFinite(n)?n:fallback;};
  const cleanHtml=v=>String(v||'').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<\/(p|div|li|h[1-6])>/gi,'\n').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  const splitNames=v=>String(v||'').split(/[;,|]/).map(x=>x.trim()).filter(Boolean);
  const groups=new Map();
  if(isShopify){
    rows.forEach((r,i)=>{
      const handle=String(col(r,'Handle')||'').trim();
      const title=String(col(r,'Title')||'').trim();
      if(!handle&&!title)return;
      const key=handle||('title:'+title.toLowerCase());
      if(!groups.has(key)){
        const collectionValue=col(r,'Collection','Collections','Collection title','Collection name');
        const type=String(col(r,'Type')||'').trim();
        groups.set(key,{handle,name:title||handle,description:cleanHtml(col(r,'Body (HTML)','Body','Description')),tags:String(col(r,'Tags')||''),visible:!['false','0','draft','archived'].includes(String(col(r,'Published','Status')||'true').toLowerCase()),images:[],collectionNames:splitNames(collectionValue),type,variants:[],optionNames:[],featured:false});
      }
      const g=groups.get(key);
      const image=String(col(r,'Image Src','Image URL')||'').trim();
      if(image&&!g.images.includes(image))g.images.push(image);
      const variantPriceRaw=col(r,'Variant Price','Price');
      if(variantPriceRaw===''||variantPriceRaw===null||variantPriceRaw===undefined)return;
      const sale=number(variantPriceRaw,-1);
      if(sale<0)throw new Error('Invalid variant price on CSV row '+(i+2)+'.');
      const compareRaw=col(r,'Variant Compare At Price','Compare At Price');
      const compare=number(compareRaw,0);
      const opts={};
      for(let n=1;n<=3;n++){
        const on=String(col(r,'Option'+n+' Name')||'').trim(),ov=String(col(r,'Option'+n+' Value')||'').trim();
        if(on&&ov){opts[on]=ov;if(!g.optionNames.includes(on))g.optionNames.push(on);}
      }
      g.variants.push({id:uid(),options:opts,price:compare>sale?compare:sale,salePrice:compare>sale?sale:0,stock:Math.max(0,Math.floor(number(col(r,'Variant Inventory Qty','Inventory quantity'),0))),sku:String(col(r,'Variant SKU','SKU')||''),barcode:String(col(r,'Variant Barcode','Barcode')||''),image:String(col(r,'Variant Image','Image Src')||'')});
    });
  }else{
    const required=['name','price'];if(required.some(k=>!headerMap.has(k)))throw new Error('This CSV is not a Shopify export or a Dew template. Expected Shopify columns such as Handle, Title and Variant Price, or Dew columns name and price.');
    rows.forEach((r,i)=>{
      const name=String(col(r,'name')||'').trim(),price=number(col(r,'price'),-1);
      if(!name||price<0)throw new Error('Invalid product name or price on spreadsheet row '+(i+2)+'.');
      const key=String(col(r,'productId')||'').trim()||('new:'+name);
      if(!groups.has(key))groups.set(key,{id:String(col(r,'productId')||'').trim()||uid(),name,description:String(col(r,'description')||''),tags:String(col(r,'tags')||''),visible:String(col(r,'visible')||'Active').toLowerCase()!=='draft',featured:String(col(r,'featured')||'').toLowerCase()==='yes',images:[col(r,'image1'),col(r,'image2'),col(r,'image3')].map(String).filter(Boolean),collectionNames:splitNames(col(r,'collection')),variants:[],optionNames:[]});
      const g=groups.get(key),opts={};
      for(let n=1;n<=3;n++){const on=String(col(r,'option'+n+'Name')||'').trim(),ov=String(col(r,'option'+n+'Value')||'').trim();if(on&&ov){opts[on]=ov;if(!g.optionNames.includes(on))g.optionNames.push(on);}}
      g.variants.push({id:uid(),options:opts,price,salePrice:number(col(r,'salePrice'),0),stock:Math.max(0,Math.floor(number(col(r,'stock'),0))),sku:String(col(r,'sku')||''),barcode:String(col(r,'barcode')||''),image:String(col(r,'variantImage')||'')});
    });
  }
  if(!groups.size)throw new Error('No products were found in this file.');
  const incoming=[];
  for(const g of groups.values()){
    if(!g.variants.length)continue;
    const options=g.optionNames.map(name=>({name,values:[...new Set(g.variants.map(v=>v.options[name]).filter(Boolean))]}));
    const first=g.variants[0],existing=D.products.find(p=>(g.handle&&p.shopifyHandle===g.handle)||String(p.name||'').trim().toLowerCase()===String(g.name||'').trim().toLowerCase());
    const id=g.id||existing?.id||uid();
    const catalogNames=g.collectionNames.length?g.collectionNames:(g.type?[g.type]:[]);
    const catalogName=catalogNames[0]||'';
    let catalog='';
    if(catalogName){
      let c=D.catalogs.find(x=>String(x.name||'').trim().toLowerCase()===catalogName.toLowerCase());
      if(!c){c={id:uid(),name:catalogName,description:'',image:''};D.catalogs.push(c);}
      catalog=c.id;
    }
    incoming.push({id,name:g.name,shopifyHandle:g.handle||undefined,description:g.description||existing?.description||'',catalog:catalog||existing?.catalog||'',tags:g.tags||existing?.tags||'',visible:g.visible,featured:existing?.featured||g.featured||false,images:g.images.length?g.images:(existing?.images||[]),howToUse:existing?.howToUse||'',options,variants:g.variants,price:first.price,salePrice:first.salePrice,stock:g.variants.reduce((n,v)=>n+v.stock,0)});
  }
  if(!incoming.length)throw new Error('Products were found, but none had a valid variant price.');
  const collectionCount=D.catalogs.length;
  const preview=incoming.slice(0,8).map(p=>'<tr><td>'+esc(p.name)+'</td><td>'+esc(catName(p.catalog))+'</td><td>'+egp(p.salePrice>0?p.salePrice:p.price)+'</td><td>'+p.variants.length+'</td></tr>').join('');
  const newCount=incoming.filter(p=>!D.products.some(x=>x.id===p.id||String(x.name||'').trim().toLowerCase()===p.name.trim().toLowerCase())).length;
  const updateCount=incoming.length-newCount;  const note=isShopify&&!headerMap.has('collection')&&!headerMap.has('collections')&&!headerMap.has('collection title')&&!headerMap.has('collection name')?'Shopify product CSV files normally do not include collection membership. This import will use each product’s Type as its collection when available. You can edit collections afterwards.':'';
  modal('<div class="shopify-page-head"><div><span class="admin-eyebrow">SHOPIFY CSV IMPORT</span><h2>Review products</h2><p>Check the products before saving them to your Dew store.</p></div></div><div class="shopify-metrics"><div><span>Products</span><b>'+incoming.length+'</b></div><div><span>New</span><b>'+newCount+'</b></div><div><span>Matching names to update</span><b>'+updateCount+'</b></div><div><span>Collections in store</span><b>'+D.catalogs.length+'</b></div></div>'+(note?'<p class="editor-hint">'+esc(note)+'</p>':'')+'<div class="admin-table-wrap"><table class="shopify-table"><thead><tr><th>Product</th><th>Collection</th><th>Price</th><th>Variants</th></tr></thead><tbody>'+preview+'</tbody></table></div>'+(incoming.length>8?'<p class="editor-hint">Showing the first 8 products. All '+incoming.length+' will be imported.</p>':'')+'<p class="editor-hint">Product descriptions, prices, variants, stock, SKUs, barcodes and image links will be imported. Existing products with matching names will be updated rather than duplicated.</p><div class="editor-head-actions" style="justify-content:flex-end;margin-top:18px"><button class="admin-view-store" id="cancelProductImport">Cancel</button><button class="admin-primary" id="confirmProductImport">Import '+incoming.length+' products</button></div>');  $('#cancelProductImport').onclick=closeModal;
  $('#confirmProductImport').onclick=async()=>{
    const btn=$('#confirmProductImport');btn.disabled=true;btn.textContent='Importing...';
    try{
      const byName=new Map(D.products.map(p=>[String(p.name||'').trim().toLowerCase(),p]));
      const merged=incoming.map(p=>{const old=byName.get(p.name.trim().toLowerCase());if(old){p.id=old.id;p.images=p.images.length?p.images:old.images;p.catalog=p.catalog||old.catalog;p.description=p.description||old.description;p.tags=p.tags||old.tags;p.featured=old.featured||p.featured;}return p;});
      const ids=new Set(merged.map(p=>p.id));D.products=[...D.products.filter(p=>!ids.has(p.id)),...merged];
      const saved=await gh('PUT','contents/products.json',{message:'Import products from '+(isShopify?'Shopify CSV':'CSV/Excel'),content:enc(JSON.stringify(D,null,2)+'\n'),sha:SHA});
      SHA=saved.content.sha;
      closeModal();toast('Imported '+merged.length+' products successfully.');products();
    }catch(err){btn.disabled=false;btn.textContent='Try import again';toast(err.message,true);}
  };
}
function resizeProductImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const width = 1080, height = 1387;
      // Fill the portrait canvas edge-to-edge; crop excess from the longer dimension.
      const scale = Math.max(width / img.width, height / img.height);
      const drawWidth = Math.round(img.width * scale);
      const drawHeight = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;      const context = canvas.getContext('2d', { alpha: false });
      context.fillStyle = '#f1f3ed';
      context.fillRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(img, Math.round((width - drawWidth) / 2), Math.round((height - drawHeight) / 2), drawWidth, drawHeight);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error('Could not optimize this product photo. Please try another image.'));
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not prepare the product photo.'));
        reader.readAsDataURL(blob);
      }, 'image/webp', 0.84);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read this product photo.')); };
    img.src = url;
  });
}

function resize(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const maxSide = 1600;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const context = canvas.getContext('2d', { alpha: false });
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      canvas.toBlob(blob => {
        if (!blob) {
          reject(new Error('Could not optimize this image. Please try another photo.'));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not prepare the optimized image.'));
        reader.readAsDataURL(blob);
      }, 'image/webp', 0.78);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image.'));
    };
    img.src = url;
  });
}

/* ---------- catalogs ---------- */
function catalogs() {
  const rows=D.catalogs.map(c=>({...c,items:D.products.filter(p=>(c.productIds||[]).includes(p.id))}));
  $('#view').innerHTML=`
    <div class="shopify-page-head"><div><span class="admin-eyebrow">PRODUCT ORGANIZATION</span><h2>Collections</h2><p>Group products so customers can browse your store easily.</p></div><button class="admin-primary" id="newC">＋ Create collection</button></div>
    <div class="shopify-metrics"><div><span>Collections</span><b>${rows.length}</b></div><div><span>Products assigned</span><b>${D.catalogs.reduce((n,c)=>n+(c.productIds||[]).filter(id=>D.products.some(p=>p.id===id)).length,0)}</b></div><div><span>Unassigned products</span><b>${D.products.filter(p=>!D.catalogs.some(c=>(c.productIds||[]).includes(p.id))).length}</b></div></div>
    <div class="collection-grid">${rows.map(c=>{const cover=c.image||c.items.find(p=>p.images?.[0])?.images?.[0];return `<article class="collection-card"><div class="collection-cover">${cover?`<img src="${esc(cover)}" alt="">`:'<span>DEW</span>'}<span class="collection-count">${c.items.length} products</span></div><div class="collection-card-body"><div><h3>${esc(c.name)}</h3><p>${esc(c.description||'No description added')}</p></div><div class="collection-card-actions"><button class="text-link" data-e="${c.id}">Edit collection</button><button class="text-link danger-link" data-x="${c.id}">Delete</button></div></div></article>`;}).join('')||'<div class="admin-panel empty-note">No collections yet. Create your first collection to organize your products.</div>'}</div>`;
  $('#newC').onclick=()=>catForm();
  document.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>catForm(b.dataset.e));
  document.querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>{const c=D.catalogs.find(x=>x.id===b.dataset.x);if(!c)return;if(confirm('Delete collection "'+c.name+'"? Products will stay in your store and will not be deleted.')){D.catalogs=D.catalogs.filter(x=>x!==c);render();save('Delete collection '+c.name);}});
}
function catForm(id) {
  const c=id?D.catalogs.find(x=>x.id===id):{name:'',description:'',image:'',desktopImage:'',mobileImage:''};if(!c)return;
  let image=c.image||'',desktopImage=c.desktopImage||'',mobileImage=c.mobileImage||'';
  const selected=new Set(c.productIds||D.products.filter(p=>p.catalog===c.id).map(p=>p.id));
  $('#view').innerHTML=`
    <div class="editor-breadcrumb"><button class="text-link" id="backCollections">← Collections</button><span>/</span><b>${id?'Edit collection':'New collection'}</b></div>
    <div class="shopify-page-head product-editor-head"><div><span class="admin-eyebrow">COLLECTIONS / ${id?'EDIT':'NEW'}</span><h2>${id?esc(c.name):'Create collection'}</h2><p>Arrange products into an easy-to-browse group.</p></div><div class="editor-head-actions"><button class="admin-view-store" id="cancelCollection">Discard</button><button class="admin-primary" id="saveCollection">Save</button></div></div>
    <div class="product-editor-layout collection-editor-layout"><div class="product-editor-main">
      <section class="editor-panel"><h3>Collection details</h3><div class="editor-field"><label>Title</label><input id="cn" value="${esc(c.name)}" placeholder="e.g. Lip Care"></div><div class="editor-field"><label>Description</label><textarea id="cd" rows="5" placeholder="Describe this collection">${esc(c.description||'')}</textarea></div></section>
      <section class="editor-panel"><h3>Collection images</h3><p class="editor-hint">Upload separate images for desktop and mobile. The storefront automatically selects the best one for each screen. If either is empty, the general collection image is used instead.</p><div class="editor-field"><label>Desktop image — recommended 2400 × 1000 px</label><div class="collection-editor-image" id="collectionDesktopPreview">${desktopImage?'<img src="'+esc(desktopImage)+'" alt="">':image?'<img src="'+esc(image)+'" alt="">':'<span>Desktop preview</span>'}</div><label class="media-add">＋ Upload desktop image<input type="file" id="cfd" accept="image/*"></label><button type="button" class="text-link danger-link" id="removeDesktopImage" ${desktopImage?'':'disabled'}>Remove desktop image</button></div><div class="editor-field"><label>Mobile image — recommended 1080 × 1350 px</label><div class="collection-editor-image" id="collectionMobilePreview">${mobileImage?'<img src="'+esc(mobileImage)+'" alt="">':image?'<img src="'+esc(image)+'" alt="">':'<span>Mobile preview</span>'}</div><label class="media-add">＋ Upload mobile image<input type="file" id="cfm" accept="image/*"></label><button type="button" class="text-link danger-link" id="removeMobileImage" ${mobileImage?'':'disabled'}>Remove mobile image</button></div><div class="editor-field"><label>General image (fallback)</label><div class="collection-editor-image" id="collectionPreview">${image?'<img src="'+esc(image)+'" alt="">':'<span>DEW</span>'}</div><label class="media-add">＋ Upload general image<input type="file" id="cf" accept="image/*"></label></div></section>
      <section class="editor-panel"><div class="editor-panel-title"><h3>Products</h3><span id="selectedProductCount">${selected.size} selected</span></div><div class="collection-product-picker">${D.products.map(p=>`<label class="collection-product-option"><input type="checkbox" data-collection-product="${esc(p.id)}" ${selected.has(p.id)?'checked':''}><span class="product-thumb">${p.images?.[0]?'<img src="'+esc(p.images[0])+'" alt="">':'DEW'}</span><span><b>${esc(p.name)}</b><small>${moneyLabelCat(p.price)} · ${Number(p.stock||0)} in stock</small></span></label>`).join('')||'<p class="editor-hint">Add products first, then assign them to this collection.</p>'}</div></section>
    </div><aside class="product-editor-side"><section class="editor-panel"><h3>Collection status</h3><span class="shopify-status is-live"><i></i>Available on storefront</span><p class="editor-hint">Collections are displayed in your store when linked from the homepage or navigation.</p></section><section class="editor-panel"><h3>Search preview</h3><div class="collection-search-preview"><b id="collectionPreviewTitle">${esc(c.name||'Collection title')}</b><p id="collectionPreviewDesc">${esc(c.description||'Collection description')}</p><small>DEW SKINCARE</small></div></section></aside></div>`;
  function moneyLabelCat(n){return 'EGP '+Number(n||0).toLocaleString('en-US');}
  const updateCount=()=>{$('#selectedProductCount').textContent=document.querySelectorAll('[data-collection-product]:checked').length+' selected';};
  $('#backCollections').onclick=()=>{tab='catalogs';render();};$('#cancelCollection').onclick=()=>{tab='catalogs';render();};
  document.querySelectorAll('[data-collection-product]').forEach(el=>el.onchange=updateCount);
  $('#cn').oninput=()=>$('#collectionPreviewTitle').textContent=$('#cn').value||'Collection title';$('#cd').oninput=()=>$('#collectionPreviewDesc').textContent=$('#cd').value||'Collection description';
  const uploadCollectionImage=async(input,field,preview)=>{const file=input.files?.[0];if(!file)return;try{const path=await uploadImage(await resize(file));if(field==='image')image=path;else if(field==='desktopImage'){desktopImage=path;$('#removeDesktopImage').disabled=false;}else{mobileImage=path;$('#removeMobileImage').disabled=false;}$(preview).innerHTML='<img src="'+esc(path)+'" alt="">';}catch(err){toast(err.message,true);}};
  $('#cf').onchange=e=>uploadCollectionImage(e.target,'image','#collectionPreview');
  $('#cfd').onchange=e=>uploadCollectionImage(e.target,'desktopImage','#collectionDesktopPreview');
  $('#cfm').onchange=e=>uploadCollectionImage(e.target,'mobileImage','#collectionMobilePreview');
  $('#removeDesktopImage').onclick=()=>{desktopImage='';$('#collectionDesktopPreview').innerHTML=image?'<img src="'+esc(image)+'" alt="">':'<span>Desktop preview</span>';$('#removeDesktopImage').disabled=true;};
  $('#removeMobileImage').onclick=()=>{mobileImage='';$('#collectionMobilePreview').innerHTML=image?'<img src="'+esc(image)+'" alt="">':'<span>Mobile preview</span>';$('#removeMobileImage').disabled=true;};
  $('#saveCollection').onclick=()=>{const name=$('#cn').value.trim();if(!name){toast('Collection title is required.',true);return;}const chosen=[...document.querySelectorAll('[data-collection-product]:checked')].map(x=>x.dataset.collectionProduct);if(id){c.name=name;c.description=$('#cd').value.trim();c.image=image;c.desktopImage=desktopImage;c.mobileImage=mobileImage;c.productIds=chosen;}else D.catalogs.push({id:uid(),name,description:$('#cd').value.trim(),image,desktopImage,mobileImage,productIds:chosen});tab='catalogs';render();save('Save collection '+name);};
}

function orders() {
  const money = value => egp(Number(value || 0));
  const dateText = value => {
    const d = new Date(value || Date.now());
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString([], {day:'numeric',month:'short',year:'numeric'});
  };
  const timeText = value => {
    const d = new Date(value || Date.now());
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  };
  const customerName = o => [o.customer?.first,o.customer?.last].filter(Boolean).join(' ') || 'Guest customer';
  const fulfillment = o => o.fulfillmentStatus || 'Pending';
  const payment = o => o.paymentStatus || 'Unpaid (COD)';
  const isFulfilled = o => ['Shipped','Delivered'].includes(fulfillment(o));
  const badge = (value, kind) => '<span class="dew-order-badge '+kind+'">'+esc(value)+'</span>';

  $('#view').innerHTML = `
    <section class="dew-orders-page">
      <div class="dew-orders-heading">
        <div><p class="dew-orders-eyebrow">STORE MANAGEMENT</p><h2>Orders</h2><p class="dew-orders-subtitle">${ordersList.length} total orders</p></div>
      </div>
      <div class="dew-orders-stats">
        <button class="dew-order-stat active" data-order-filter="All"><span>All orders</span><b>${ordersList.length}</b></button>
        <button class="dew-order-stat" data-order-filter="Unfulfilled"><span>Unfulfilled</span><b>${ordersList.filter(o=>!isFulfilled(o)&&fulfillment(o)!=='Cancelled').length}</b></button>
        <button class="dew-order-stat" data-order-filter="Unpaid"><span>Unpaid</span><b>${ordersList.filter(o=>payment(o)!=='Paid').length}</b></button>
      </div>
      <div class="dew-orders-toolbar">
        <div class="dew-orders-search"><span>⌕</span><input id="dewOrderSearch" type="search" placeholder="Search orders or customers"></div>
        <div class="dew-orders-filters">
          <button class="active" data-order-filter="All">All</button>
          <button data-order-filter="Unfulfilled">Unfulfilled</button>
          <button data-order-filter="Paid">Paid</button>
          <button data-order-filter="COD">Cash on delivery</button>
        </div>
      </div>
      <div class="dew-orders-list" id="dewOrdersList">
        ${ordersList.length ? '' : '<div class="dew-orders-empty"><b>No orders yet</b><span>New orders from your storefront will appear here.</span></div>'}
      </div>
    </section>`;

  let activeFilter = 'All';
  const list = $('#dewOrdersList');
  function drawOrderCards(){
    const term = ($('#dewOrderSearch')?.value || '').trim().toLowerCase();
    const filtered = ordersList.map((o,idx)=>({o,idx})).filter(({o})=>{
      const text = [o.number,customerName(o),o.customer?.phone].join(' ').toLowerCase();
      if(term && !text.includes(term)) return false;
      if(activeFilter==='Unfulfilled') return !isFulfilled(o)&&fulfillment(o)!=='Cancelled';
      if(activeFilter==='Paid') return payment(o)==='Paid';
      if(activeFilter==='COD') return o.paymentMethod!=='instapay';
      return true;
    });
    if(!filtered.length){
      list.innerHTML='<div class="dew-orders-empty"><b>No matching orders</b><span>Try another search or filter.</span></div>';
      return;
    }
    list.innerHTML=filtered.map(({o,idx})=>`
      <article class="dew-order-card" data-open-order="${idx}">
        <div class="dew-order-cell dew-order-number-cell"><span class="dew-order-cell-label">Order</span><b class="dew-order-number">${esc(o.number || 'Order')}</b></div>
        <div class="dew-order-cell dew-order-date-cell"><span class="dew-order-cell-label">Date</span><b class="dew-order-date">${dateText(o.date)}</b><small class="dew-order-time">${timeText(o.date)}</small></div>
        <div class="dew-order-customer"><span class="dew-order-avatar">${esc((customerName(o).trim()[0]||'G').toUpperCase())}</span><div><span class="dew-order-cell-label">Customer</span><b>${esc(customerName(o))}</b><small>${esc(o.customer?.phone || 'No phone number')}</small></div></div>
        <div class="dew-order-cell dew-order-total-cell"><span class="dew-order-cell-label">Total</span><b class="dew-order-total">${money(o.total)}</b></div>
        <div class="dew-order-cell dew-order-status-cell"><span class="dew-order-cell-label">Status</span><div class="dew-order-badges">${badge(payment(o),payment(o)==='Paid'?'paid':'unpaid')}${badge(fulfillment(o),isFulfilled(o)?'fulfilled':fulfillment(o)==='Cancelled'?'cancelled':'pending')}</div></div>
        <div class="dew-order-open">View <span>›</span></div>
      </article>`).join('');
    list.querySelectorAll('[data-open-order]').forEach(card=>card.onclick=()=>openOrder(Number(card.dataset.openOrder)));
  }
  drawOrderCards();
  $('#dewOrderSearch').oninput=drawOrderCards;
  document.querySelectorAll('[data-order-filter]').forEach(btn=>btn.onclick=()=>{
    activeFilter=btn.dataset.orderFilter;
    document.querySelectorAll('[data-order-filter]').forEach(b=>b.classList.toggle('active',b.dataset.orderFilter===activeFilter));
    drawOrderCards();
  });

  function openOrder(idx){
    const o=ordersList[idx]; if(!o) return;
    const c=o.customer||{};
    const lines=Array.isArray(o.lines)?o.lines:[];
    const itemsHtml=lines.length?lines.map(l=>`
      <div class="dew-order-line"><div class="dew-order-product-thumb">${esc((l.name||'P').trim()[0]||'P')}</div><div class="dew-order-line-info"><b>${esc(l.name||'Product')}</b><small>Qty ${Number(l.qty||0)} · ${money(l.unit)} each</small></div><b>${money(l.total)}</b></div>`).join(''):'<p class="note">No item details available.</p>';
    modal(`
      <div class="dew-order-detail">
        <div class="dew-order-detail-head"><div><p class="dew-orders-eyebrow">ORDER DETAILS</p><h2>${esc(o.number)}</h2><p class="note">${dateText(o.date)} at ${timeText(o.date)}</p></div><button class="btn ghost" id="mCloseBtn">Close</button></div>
        <div class="dew-order-detail-badges">${badge(payment(o),payment(o)==='Paid'?'paid':'unpaid')}${badge(fulfillment(o),isFulfilled(o)?'fulfilled':fulfillment(o)==='Cancelled'?'cancelled':'pending')}</div>
        <section class="dew-order-detail-section"><h3>Items</h3>${itemsHtml}<div class="dew-order-totals"><div><span>Subtotal</span><b>${money(o.itemsTotal)}</b></div><div><span>Shipping</span><b>${money(o.delivery)}</b></div>${o.discount?'<div><span>Discount '+esc(o.promoCode||'')+'</span><b>−'+money(o.discount)+'</b></div>':''}<div class="grand"><span>Total</span><b>${money(o.total)}</b></div></div></section>
        <section class="dew-order-detail-section"><h3>Customer</h3><b>${esc(customerName(o))}</b><p>${esc(c.phone||'—')} ${c.whatsapp?' · WhatsApp '+esc(c.whatsapp):''}</p><p>${esc(c.address||'No address supplied')}</p><p>${o.area==='alex'?'Alexandria':'Cairo & Giza'}</p></section>
        <section class="dew-order-detail-section"><h3>Payment & fulfilment</h3><label class="dew-order-field">Payment status<select id="dewOrderPayment"><option ${payment(o)==='Unpaid (COD)'?'selected':''}>Unpaid (COD)</option><option ${payment(o)==='Awaiting InstaPay payment'?'selected':''}>Awaiting InstaPay payment</option><option ${payment(o)==='Paid'?'selected':''}>Paid</option></select></label><label class="dew-order-field">Fulfilment status<select id="dewOrderFulfillment"><option ${fulfillment(o)==='Pending'?'selected':''}>Pending</option><option ${fulfillment(o)==='Processing'?'selected':''}>Processing</option><option ${fulfillment(o)==='Shipped'?'selected':''}>Shipped</option><option ${fulfillment(o)==='Delivered'?'selected':''}>Delivered</option><option ${fulfillment(o)==='Cancelled'?'selected':''}>Cancelled</option></select></label><label class="dew-order-field">Tracking number<input id="dewOrderTracking" value="${esc(o.trackingNumber||'')}" placeholder="Add tracking number"></label><button class="btn" id="dewSaveOrderStatus">Save order updates</button></section>
        <section class="dew-order-detail-section"><h3>Order notes</h3><p class="note">Private notes for your team. Customers cannot see these.</p><textarea id="orderNote" rows="3" placeholder="Add a note about this order...">${esc(o.note||'')}</textarea><button class="btn ghost" id="saveOrderNote">Save note</button></section>
        <button class="btn ghost dew-order-delete" id="dewDeleteOrder">Delete order</button>
      </div>`);
    $('#saveOrderNote').onclick=()=>{o.note=$('#orderNote').value.trim();saveOrders('Save note for '+o.number).then(()=>{closeModal();toast('Order note saved.');});};
    $('#dewSaveOrderStatus').onclick=()=>{o.paymentStatus=$('#dewOrderPayment').value;o.fulfillmentStatus=$('#dewOrderFulfillment').value;o.trackingNumber=$('#dewOrderTracking').value.trim();saveOrders('Update '+o.number).then(()=>{closeModal();orders();toast('Order updated.');});};
    $('#mCloseBtn').onclick=closeModal;
    $('#dewDeleteOrder').onclick=()=>{
      if(!confirm('Delete this order record?')) return;
      fetch(ADMIN_API+'/api/orders/'+encodeURIComponent(o.number),{method:'DELETE',headers:{Authorization:'Bearer '+adminToken()}})
       .then(async response=>{const result=await response.json().catch(()=>({}));if(!response.ok||!result.ok)throw Error(result.error||'Could not delete order');ordersList.splice(idx,1);closeModal();orders();toast('Order deleted.');})
       .catch(err=>toast(err.message,true));
    };
  }
}

/* ---------- discounts ---------- */
function discounts() {
  if(!D.discounts)D.discounts=[];
  const native=isNativeApp;
  const active=D.discounts.filter(d=>d.active).length;
  const amount=d=>d.type==='percentage'?d.value+'% off':d.type==='fixed'?egp(d.value)+' off':'Free shipping';
  $('#view').innerHTML=`<div class="shopify-page-head"><div><span class="admin-eyebrow">PROMOTIONS</span><h2>Discounts</h2><p>Create and manage offers for your customers.</p></div><button class="admin-primary" id="newDisc">＋ Create discount</button></div>
    <div class="shopify-metrics"><div><span>All discounts</span><b>${D.discounts.length}</b></div><div><span>Active</span><b>${active}</b></div><div><span>Inactive</span><b>${D.discounts.length-active}</b></div></div>
    ${native?`<div class="dew-discount-list">${D.discounts.map(d=>`<article class="dew-discount-card"><div class="dew-discount-icon">％</div><div class="dew-discount-info"><b>${esc(d.code)}</b><strong>${amount(d)}</strong><small>${d.minSpend?'Minimum spend '+egp(d.minSpend):'No minimum spend'}</small><span class="dew-product-status ${d.active?'active':'draft'}">${d.active?'Active':'Inactive'}</span></div><div class="dew-discount-actions"><button data-editdisc="${d.id}">Edit</button><button data-toggledisc="${d.id}">${d.active?'Deactivate':'Activate'}</button><button class="danger" data-deldisc="${d.id}">Delete</button></div></article>`).join('')||'<div class="dew-mobile-empty">No discounts yet. Create your first promo code.</div>'}</div>`:`<p class="note">Create Shopify-style promo codes for percentage discounts, fixed amounts, or free shipping.</p><div class="admin-panel table-panel"><div class="admin-table-wrap"><table class="discounts-mobile-table"><tr><th>Code</th><th>Type</th><th>Value</th><th>Min Spend</th><th>Status</th><th></th></tr>${D.discounts.map(d=>`<tr><td><b>${esc(d.code)}</b></td><td>${d.type==='percentage'?'Percentage (%)':d.type==='fixed'?'Fixed amount (EGP)':'Free Shipping'}</td><td>${amount(d)}</td><td>${d.minSpend?egp(d.minSpend):'None'}</td><td><button class="pill ${d.active?'g':''}" data-toggledisc="${d.id}">${d.active?'Active':'Inactive'}</button></td><td><button class="btn small" data-editdisc="${d.id}">Edit</button> <button class="btn small ghost" data-deldisc="${d.id}">Delete</button></td></tr>`).join('')||'<tr><td colspan="6">No promo codes created yet.</td></tr>'}</table></div></div>`}`;
  $('#newDisc').onclick=()=>discForm();
  document.querySelectorAll('[data-editdisc]').forEach(b=>b.onclick=()=>discForm(b.dataset.editdisc));
  document.querySelectorAll('[data-toggledisc]').forEach(b=>b.onclick=()=>{const d=D.discounts.find(x=>x.id===b.dataset.toggledisc);d.active=!d.active;render();save('Toggle discount '+d.code);});
  document.querySelectorAll('[data-deldisc]').forEach(b=>b.onclick=()=>{const d=D.discounts.find(x=>x.id===b.dataset.deldisc);if(confirm('Delete promo code "'+d.code+'"?')){D.discounts=D.discounts.filter(x=>x!==d);render();save('Delete discount '+d.code);}});
}
function discForm(id) {
  const d = id ? D.discounts.find(x => x.id === id) : { id: uid(), code: '', type: 'percentage', value: 10, minSpend: 0, active: true };
  modal(`<h2>${id ? 'Edit' : 'New'} promo code</h2><div class="form-grid">    <div class="full"><label>Promo code</label><input id="dc" value="${esc(d.code)}" placeholder="e.g. SAVE20"></div>
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
  if (s.instapayEnabled === undefined) s.instapayEnabled = true;
  if (s.codEnabled === undefined) s.codEnabled = true;
  if (s.instapayNumber === undefined) s.instapayNumber = '';
  if (s.instapayName === undefined) s.instapayName = '';
  if (s.instapayInstructions === undefined) s.instapayInstructions = '';
  if (!Array.isArray(s.deliveryAreas)) s.deliveryAreas = [
    {id:'cairo-giza',name:'Cairo & Giza',fee:Number(s.deliveryCairo ?? 85),enabled:true},
    {id:'alexandria',name:'Alexandria',fee:Number(s.deliveryAlex ?? 90),enabled:true}
  ];
  if (s.instagramUrl === undefined) s.instagramUrl = '';
  if (s.facebookUrl === undefined) s.facebookUrl = '';
  const f = (k, label, type = 'text') => `<div><label>${label}</label><input id="s_${k}" type="${type}" value="${esc(s[k])}"></div>`;
  $('#view').innerHTML = `<h2>Store settings</h2><div class="box"><div class="form-grid">
    ${f('storeName', 'Store name')}${f('tagline', 'Tagline')}
    ${f('heroTitle', 'Hero headline')}${f('heroText', 'Hero paragraph')}
    ${f('welcomeLine', 'Welcome screen headline')}${f('welcomeNote', 'Welcome screen note')}
    ${f('whatsapp', 'WhatsApp number (with country code)')}${f('phone', 'Phone')}
    ${f('email', 'Email')}${f('instagramUrl', 'Instagram profile URL')}${f('facebookUrl', 'Facebook page URL')}
    ${f('minOrder', 'Minimum order (EGP)', 'number')}${f('deliveryNote', 'Delivery note')}
    <div class="full"><h3>Delivery areas and fees</h3><p class="muted">Add each governorate or area and its delivery fee. Disabled areas won't appear at checkout.</p>
      <div id="deliveryAreaEditor">${s.deliveryAreas.map(x=>`<div class="delivery-area-row" data-area-row data-id="${esc(x.id||'')}"><input class="da-name" aria-label="Governorate name" placeholder="Governorate name" value="${esc(x.name||'')}"><input class="da-fee" aria-label="Delivery fee" type="number" min="0" value="${Math.max(0,Number(x.fee)||0)}"><label class="da-enabled"><input type="checkbox" class="da-active" ${x.enabled!==false?'checked':''}> Active</label><button type="button" class="btn small da-remove">Remove</button></div>`).join('')}</div>
      <button type="button" class="btn small" id="addDeliveryArea">+ Add governorate</button>
    </div>
    <div class="full"><h3>Checkout payment methods</h3></div>
    <div class="full"><label><input type="checkbox" id="s_instapayEnabled" ${s.instapayEnabled ? 'checked' : ''} style="width:auto"> Enable InstaPay</label></div>
    ${f('instapayNumber', 'InstaPay number / payment address')}
    ${f('instapayName', 'InstaPay account name')}
    <div class="full"><label>Instructions shown to customers after choosing InstaPay</label><textarea id="s_instapayInstructions" rows="3">${esc(s.instapayInstructions||'')}</textarea></div>
    <div class="full"><label><input type="checkbox" id="s_codEnabled" ${s.codEnabled ? 'checked' : ''} style="width:auto"> Enable Cash on Delivery (COD)</label></div>
    <div class="full">${f('telegramProxyUrl', 'Telegram proxy URL (legacy notification endpoint)')}</div>
    <div class="full"><label><input type="checkbox" id="s_telegramEnabled" ${s.telegramEnabled ? 'checked' : ''} style="width:auto"> Enable legacy Telegram order notifications</label></div>
    <div class="full"><label>Orders API URL (Cloudflare Worker)</label><input id="s_ordersApiUrl" value="${esc(s.ordersApiUrl||'')}" placeholder="https://dew-orders-api.your-account.workers.dev"></div>
    <div class="full"><label>Orders API</label><input value="Secure Dew admin service" disabled></div>
    </div><button class="btn red" id="ss" style="margin-top:10px">Save settings</button></div>`;
  const addAreaRow = (id='',name='',fee=0,enabled=true) => {
    $('#deliveryAreaEditor').insertAdjacentHTML('beforeend', `<div class="delivery-area-row" data-area-row data-id="${esc(id)}"><input class="da-name" aria-label="Governorate name" placeholder="Governorate name" value="${esc(name)}"><input class="da-fee" aria-label="Delivery fee" type="number" min="0" value="${Math.max(0,Number(fee)||0)}"><label class="da-enabled"><input type="checkbox" class="da-active" ${enabled?'checked':''}> Active</label><button type="button" class="btn small da-remove">Remove</button></div>`);
  };
  $('#addDeliveryArea').onclick=()=>addAreaRow();
  $('#deliveryAreaEditor').onclick=e=>{if(e.target.closest('.da-remove'))e.target.closest('[data-area-row]').remove();};
  $('#ss').onclick = () => {
    for (const k of Object.keys(s)) {
      const el=$('#s_'+k);
      if(el) { if(el.type==='checkbox') s[k]=el.checked; else s[k]=el.type==='number'?Math.max(0,Number(el.value)||0):el.value.trim(); }
    }
    s.deliveryAreas=[...document.querySelectorAll('[data-area-row]')].map((row,i)=>{
      const name=row.querySelector('.da-name').value.trim();
      const fee=Math.max(0,Number(row.querySelector('.da-fee').value)||0);
      const id=row.dataset.id||name.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'area-'+(i+1);
      return {id,name,fee,enabled:row.querySelector('.da-active').checked};
    }).filter(x=>x.name);
    s.ordersApiUrl=$('#s_ordersApiUrl').value.trim().replace(/\/$/,'');
    save('Update store settings').then(()=>{ toast('Store settings saved.'); });
  };
}

/* ---------- mobile app menu ---------- */
function more() {
  const items = [
    ['homepage','Theme & appearance','Edit homepage sections, banners, colours, logo and product-page layout','◈'],
    ['pages','Pages','Create and edit store pages','▧'],
    ['catalogs','Collections','Organize products into collections','◇'],
    ['media','Media library','Manage uploaded store images','▣'],
    ['customers','Customers','View customer details and order history','♙'],
    ['inventory','Inventory','Update stock quantities','▤'],
    ['discounts','Discounts','Create and manage promo codes','%'],
    ['store','Store settings','Payments, delivery areas, contact details and notifications','⚙'],
    ['help','Help & information','How your Dew store works','?']
  ];
  $('#view').innerHTML = `<div class="app-menu-intro"><span class="admin-eyebrow">DEW STORE MANAGEMENT</span><h2>Everything in one place</h2><p>Manage your storefront and business from your phone.</p></div>
    <div class="app-menu-grid">${items.map(([key,title,desc,icon])=>`<button class="app-menu-item" data-t="${key}"><span class="app-menu-icon">${icon}</span><span class="app-menu-copy"><b>${title}</b><small>${desc}</small></span><span class="app-menu-arrow">›</span></button>`).join('')}</div>
    <a class="app-storefront-link" href="https://dewskincaree.com/" target="_blank" rel="noopener noreferrer">View customer storefront ↗</a>
    <button class="app-signout-link" id="appOut">Sign out of Dew Admin</button>`;
  document.querySelectorAll('.app-menu-item[data-t]').forEach(b => b.onclick = () => { tab=b.dataset.t; q=''; render(); });
  $('#appOut').onclick=$('#out').onclick;
}

/* ---------- help ---------- */
function help() {
  $('#view').innerHTML = `<h2>How this works</h2><div class="box">
    <p>The storefront is hosted on GitHub Pages. Customer orders are saved to the private Cloudflare D1 database after the Orders API is connected in Store Settings. Telegram notifications can be sent through your existing proxy URL or directly through your bot credentials stored as Cloudflare secrets.</p>
    <p><b>Orders</b> appear here after checkout receives confirmation that the backend saved them. You can update payment status, fulfillment status, and tracking numbers from this page.</p>
    <p><b>Promo Codes</b> can be created in the Discounts tab and applied by customers at checkout.</p></div>`;
}

start();