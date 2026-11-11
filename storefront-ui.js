/* Dew storefront shared mobile menu and site-wide product search */
(()=>{
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=(v,s={})=>String(s.currencyPrefix??'EGP ')+Number(v||0).toLocaleString('en-US')+String(s.currencySuffix||'');
 let dataPromise;
 const data=()=>dataPromise||(dataPromise=fetch('products.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Products unavailable');return r.json()}).then(x=>({products:(x.products||[]).filter(p=>p.visible!==false),settings:x.settings||{}})));
 const icon='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"></circle><path d="m16 16 5 5"></path></svg>';
 function addSearch(header,actions){
  if(header.querySelector('#toggleDewSearch'))return;
  const btn=document.createElement('button');btn.type='button';btn.id='toggleDewSearch';btn.className='dew-search-toggle';btn.setAttribute('aria-label','Search products');btn.setAttribute('aria-expanded','false');btn.title='Search';btn.innerHTML=icon;actions.insertBefore(btn,actions.firstChild);
  const panel=document.createElement('div');panel.id='dewHeaderSearch';panel.className='dew-header-search';panel.hidden=true;panel.innerHTML='<div class="dew-search-box"><span aria-hidden="true">⌕</span><input id="dewSearch" type="search" placeholder="Search products" autocomplete="off" aria-label="Search products"><button id="clearDewSearch" type="button" aria-label="Clear search" hidden>×</button><button id="closeDewSearch" type="button" aria-label="Close search">×</button></div><div class="dew-search-suggestions" id="dewSearchSuggestions" hidden></div>';header.append(panel);
  const input=panel.querySelector('#dewSearch'),suggest=panel.querySelector('#dewSearchSuggestions'),clear=panel.querySelector('#clearDewSearch'),close=()=>{panel.hidden=true;btn.setAttribute('aria-expanded','false')};
  btn.onclick=()=>{panel.hidden=!panel.hidden;btn.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)input.focus()};
  panel.querySelector('#closeDewSearch').onclick=close;clear.onclick=()=>{input.value='';input.dispatchEvent(new Event('input'));input.focus()};
  input.oninput=async()=>{const term=input.value.trim().toLowerCase();clear.hidden=!term;if(!term){suggest.hidden=true;suggest.innerHTML='';return}suggest.hidden=false;suggest.innerHTML='<p class="dew-search-loading">Searching…</p>';try{const d=await data(),matches=d.products.filter(p=>(String(p.name||'')+' '+String(p.tags||'')).toLowerCase().includes(term)).slice(0,7);suggest.innerHTML=matches.map(p=>{const h=p.shopifyHandle||String(p.name||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),price=Number(p.salePrice)>0&&Number(p.salePrice)<Number(p.price)?p.salePrice:p.price;return '<a href="./'+encodeURIComponent(h)+'">'+(p.images?.[0]?'<img src="'+esc(p.images[0])+'" alt="" loading="lazy">':'<span class="dew-suggest-placeholder">D</span>')+'<span><b>'+esc(p.name)+'</b><small>'+esc(money(price,d.settings))+'</small></span><i>↗</i></a>'}).join('')||'<p class="dew-search-no-results">No products found.</p>'}catch{suggest.innerHTML='<p class="dew-search-no-results">Search is temporarily unavailable.</p>'}};
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
 }
 function addMenu(header,nav){
  let btn=header.querySelector('#dewMobileMenuToggle');
  if(!btn){btn=document.createElement('button');btn.type='button';btn.id='dewMobileMenuToggle';btn.className='dew-mobile-menu-toggle';btn.setAttribute('aria-label','Open menu');btn.setAttribute('aria-expanded','false');btn.setAttribute('aria-controls','dewMobileMenu');btn.innerHTML='<span></span><span></span><span></span>';header.insertBefore(btn,header.firstChild);}
  if(document.getElementById('dewMobileMenu'))return;
  const drawer=document.createElement('dialog');drawer.id='dewMobileMenu';drawer.className='dew-mobile-menu';drawer.setAttribute('aria-label','Mobile navigation');drawer.setAttribute('aria-hidden','true');drawer.innerHTML='<div class="dew-mobile-menu-head"><span>MENU</span><button type="button" id="dewMobileMenuClose" aria-label="Close menu">×</button></div><nav></nav>';
  const menuNav=drawer.querySelector('nav');[...(nav?.querySelectorAll('a')||[])].forEach(link=>{const a=document.createElement('a');a.href=link.href;a.append(document.createTextNode(link.textContent.trim()));const arrow=document.createElement('span');arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');a.append(arrow);menuNav.append(a)});document.body.append(drawer);
  const close=()=>{if(drawer.open)drawer.close();drawer.classList.remove('is-open');drawer.setAttribute('aria-hidden','true');btn.setAttribute('aria-expanded','false');btn.setAttribute('aria-label','Open menu');document.body.classList.remove('dew-menu-open')};
  const open=()=>{if(!drawer.open)drawer.showModal();drawer.classList.add('is-open');drawer.setAttribute('aria-hidden','false');btn.setAttribute('aria-expanded','true');btn.setAttribute('aria-label','Close menu');document.body.classList.add('dew-menu-open');drawer.querySelector('#dewMobileMenuClose')?.focus()};
  btn.onclick=()=>drawer.open?close():open();drawer.querySelector('#dewMobileMenuClose').onclick=close;drawer.addEventListener('click',e=>{if(e.target===drawer)close()});menuNav.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));drawer.addEventListener('close',()=>{drawer.classList.remove('is-open');drawer.setAttribute('aria-hidden','true');btn.setAttribute('aria-expanded','false');btn.setAttribute('aria-label','Open menu');document.body.classList.remove('dew-menu-open')});
 }
 function init(){
  const header=document.querySelector('.dew-header');
  if(header){const nav=header.querySelector(':scope > nav')||header.querySelector('.dew-collection-nav');let actions=header.querySelector('.dew-header-actions');if(!actions){actions=document.createElement('div');actions.className='dew-header-actions';header.append(actions)}addMenu(header,nav);addSearch(header,actions);return}
  const wrap=document.querySelector('.top .wrap');
  if(wrap&&!document.querySelector('#dewCheckoutSearchToggle')){
   const btn=document.createElement('button');btn.type='button';btn.id='dewCheckoutSearchToggle';btn.className='dew-checkout-search-toggle';btn.setAttribute('aria-label','Search products');btn.innerHTML=icon;wrap.insertBefore(btn,wrap.lastElementChild||null);
   const panel=document.createElement('div');panel.id='dewCheckoutSearchPanel';panel.className='dew-checkout-search-panel';panel.hidden=true;panel.innerHTML='<div class="dew-search-box"><span aria-hidden="true">⌕</span><input id="dewCheckoutSearch" type="search" placeholder="Search products" autocomplete="off"><button type="button" id="dewCheckoutSearchClose" aria-label="Close search">×</button></div><div class="dew-search-suggestions" id="dewCheckoutSuggestions" hidden></div>';document.body.append(panel);
   const input=panel.querySelector('input'),suggest=panel.querySelector('.dew-search-suggestions'),close=()=>panel.hidden=true;btn.onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden)input.focus()};panel.querySelector('#dewCheckoutSearchClose').onclick=close;
   input.oninput=async()=>{const term=input.value.trim().toLowerCase();if(!term){suggest.hidden=true;suggest.innerHTML='';return}suggest.hidden=false;suggest.innerHTML='<p class="dew-search-loading">Searching…</p>';try{const d=await data(),matches=d.products.filter(p=>(String(p.name||'')+' '+String(p.tags||'')).toLowerCase().includes(term)).slice(0,7);suggest.innerHTML=matches.map(p=>{const h=p.shopifyHandle||String(p.name||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),price=Number(p.salePrice)>0&&Number(p.salePrice)<Number(p.price)?p.salePrice:p.price;return '<a href="./'+encodeURIComponent(h)+'">'+(p.images?.[0]?'<img src="'+esc(p.images[0])+'" alt="" loading="lazy">':'<span class="dew-suggest-placeholder">D</span>')+'<span><b>'+esc(p.name)+'</b><small>'+esc(money(price,d.settings))+'</small></span><i>↗</i></a>'}).join('')||'<p class="dew-search-no-results">No products found.</p>'}catch{suggest.innerHTML='<p class="dew-search-no-results">Search is temporarily unavailable.</p>'}};
   document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  }
 }
 if(!document.querySelector('link[rel="stylesheet"][href*="styles.css"]')){const css=document.createElement('link');css.rel='stylesheet';css.href='styles.css?v=20261110-9';css.dataset.dewStorefrontStyles='true';document.head.append(css);}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
 function setupStickyAnnouncementBar(){
  const sync=()=>{
   const bar=document.querySelector('.dew-ann');
   const height=bar&&getComputedStyle(bar).display!=='none'?Math.ceil(bar.getBoundingClientRect().height):0;
   document.documentElement.style.setProperty('--dew-ann-height',height+'px');
  };
  sync();
  if('ResizeObserver' in window){
   const resize=new ResizeObserver(sync);
   const watch=()=>{const bar=document.querySelector('.dew-ann');if(bar){resize.disconnect();resize.observe(bar);}sync();};
   watch();
   new MutationObserver(watch).observe(document.body,{childList:true,subtree:true});
  }else{
   new MutationObserver(sync).observe(document.body,{childList:true,subtree:true});
   window.addEventListener('resize',sync,{passive:true});
  }
  window.addEventListener('load',sync,{once:true});
 }
 function ensureAnnouncementBar(){
  if(document.querySelector('.dew-ann')||document.getElementById('app')||document.getElementById('productApp'))return;
  data().then(({settings})=>{
   if(document.querySelector('.dew-ann')||document.getElementById('app')||document.getElementById('productApp'))return;
   const h=settings.homepage||{},a=h.announcement||{};
   if(a.show===false)return;
   const messages=(Array.isArray(a.messages)?a.messages:[a.text||'']).filter(Boolean);
   if(!messages.length)return;
   const mode=a.mode||'static',speed=a.speed||'normal';
   const group='<div class="dew-ann-group">'+messages.map(m=>'<span>'+esc(m)+'</span>').join('<i aria-hidden="true">•</i>')+'</div>';
   const bar=document.createElement('div');bar.className='dew-ann '+(mode==='scroll'?'is-scroll':mode==='marquee'?'is-marquee':'is-static')+' speed-'+esc(speed);
   const link=document.createElement('a');link.href=a.link||'./#shop';
   link.innerHTML=mode==='static'?messages.map(m=>'<span>'+esc(m)+'</span>').join(' · '):'<div class="dew-ann-track">'+group+group+'</div>';
   bar.append(link);document.body.insertBefore(bar,document.body.firstChild);
  }).catch(()=>{});
 }
 setupStickyAnnouncementBar();
 ensureAnnouncementBar();

/* Apply the same editable, continuously repeating announcement bar to every storefront page. */
(()=>{
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let settingsPromise;
 const loadSettings=()=>settingsPromise||(settingsPromise=fetch('products.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Store settings unavailable');return r.json()}).then(x=>x.settings||{}));
 const apply=async()=>{
  try{
   const settings=await loadSettings(),a=settings.homepage?.announcement||{};
   let bar=document.querySelector('.dew-ann');
   if(a.show===false){bar?.remove();return;}
   const messages=(Array.isArray(a.messages)?a.messages:[a.text||'']).map(x=>String(x||'').trim()).filter(Boolean);
   if(!messages.length){bar?.remove();return;}
   const repeated=Array.from({length:32},()=>messages.map(m=>'<span>'+esc(m)+'</span>').join('<i aria-hidden="true">•</i>')).join('<i aria-hidden="true">✦</i>');
   const group='<div class="dew-ann-group">'+repeated+'</div>';
   const speed=['slow','fast'].includes(a.speed)?a.speed:'normal';
   const html='<div class="dew-ann-group">'+repeated+'</div>';
   const content='<div class="dew-ann-track">'+html+html+'</div>';
   if(!bar){
    bar=document.createElement('div');
    const anchor=document.querySelector('.dew-header,.top');
    const parent=anchor?.parentNode||document.body;
    if(anchor)parent.insertBefore(bar,anchor);else parent.insertBefore(bar,parent.firstChild);
   }
   bar.className='dew-ann is-marquee speed-'+speed;
   bar.innerHTML='<a href="'+esc(a.link||'./#shop')+'">'+content+'</a>';
   bar.dataset.dewGlobalTicker='true';
  }catch(e){/* Keep the page usable if store settings cannot be loaded. */}
 };
 let queued=false;
 const schedule=()=>{if(queued)return;queued=true;Promise.resolve().then(()=>{queued=false;apply()})};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
 new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
})();
