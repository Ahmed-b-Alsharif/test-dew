/* Dew storefront shared mobile menu and site-wide product search */
(()=>{
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=(v,s={})=>String(s.currencyPrefix??'EGP ')+Number(v||0).toLocaleString('en-US')+String(s.currencySuffix||'');
 let dataPromise;
 const data=()=>dataPromise||(dataPromise=fetch('products.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Products unavailable');return r.json()}).then(x=>({products:(x.products||[]).filter(p=>p.visible!==false),catalogs:x.catalogs||[],settings:x.settings||{}})));
 const icon='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"></circle><path d="m16 16 5 5"></path></svg>';
 function addSearch(header,actions){
  if(header.querySelector('#toggleDewSearch'))return;
  const btn=document.createElement('button');btn.type='button';btn.id='toggleDewSearch';btn.className='dew-search-toggle';btn.setAttribute('aria-label','Search products');btn.setAttribute('aria-expanded','false');btn.title='Search';btn.innerHTML=icon;actions.insertBefore(btn,actions.firstChild);
  const panel=document.createElement('div');panel.id='dewHeaderSearch';panel.className='dew-header-search';panel.hidden=true;panel.innerHTML='<div class="dew-search-box"><span aria-hidden="true">⌕</span><input id="dewSearch" type="search" placeholder="Search products" autocomplete="off" aria-label="Search products"><button id="clearDewSearch" type="button" aria-label="Clear search" hidden>×</button><button id="closeDewSearch" type="button" aria-label="Close search">×</button></div><div class="dew-search-suggestions" id="dewSearchSuggestions" hidden></div>';header.append(panel);
  const input=panel.querySelector('#dewSearch'),suggest=panel.querySelector('#dewSearchSuggestions'),clear=panel.querySelector('#clearDewSearch'),close=()=>{panel.hidden=true;btn.setAttribute('aria-expanded','false')};
  btn.onclick=()=>{panel.hidden=!panel.hidden;btn.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)input.focus()};
  panel.querySelector('#closeDewSearch').onclick=close;clear.onclick=()=>{input.value='';input.dispatchEvent(new Event('input'));input.focus()};
  input.oninput=async()=>{const term=input.value.trim().toLowerCase();clear.hidden=!term;if(!term){suggest.hidden=true;suggest.innerHTML='';return}suggest.hidden=false;suggest.innerHTML='<p class="dew-search-loading">Searching…</p>';try{const d=await data(),matches=d.products.filter(p=>{const c=(d.catalogs||[]).find(x=>String(x.id)===String(p.catalog));const v=(p.variants||[]).map(x=>Object.values(x.options||{}).join(' ')).join(' ');return (String(p.name||'')+' '+String(p.tags||'')+' '+String(c?.name||'')+' '+v).toLowerCase().includes(term)}).slice(0,7);suggest.innerHTML=matches.map(p=>{const h=p.shopifyHandle||String(p.name||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),price=Number(p.salePrice)>0&&Number(p.salePrice)<Number(p.price)?p.salePrice:p.price;return '<a href="./'+encodeURIComponent(h)+'">'+(p.images?.[0]?'<img src="'+esc(p.images[0])+'" alt="" loading="lazy">':'<span class="dew-suggest-placeholder">D</span>')+'<span><b>'+esc(p.name)+'</b><small>'+esc(money(price,d.settings))+'</small></span><i>↗</i></a>'}).join('')||'<p class="dew-search-no-results">No products found.</p>'}catch{suggest.innerHTML='<p class="dew-search-no-results">Search is temporarily unavailable.</p>'}};
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

/* Render the exact homepage announcement bar on every customer page except the order receipt. */
(()=>{
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let settingsPromise;
 const loadSettings=()=>settingsPromise||(settingsPromise=fetch('products.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Store settings unavailable');return r.json()}).then(x=>x.settings||{}));
 const apply=async()=>{
  const receipt=document.querySelector('.dew-success-page');
  const bars=[...document.querySelectorAll('.dew-ann')];
  let bar=bars.shift()||null;
  if(document.getElementById('app'))return;
  if(receipt){bars.forEach(x=>x.remove());bar?.remove();return;}
  bars.forEach(x=>x.remove());
  try{
   const settings=await loadSettings(),a=settings.homepage?.announcement||{};
   if(a.show===false){document.querySelectorAll('.dew-ann').forEach(x=>x.remove());return;}
   const messages=(Array.isArray(a.messages)?a.messages:[a.text||'']).filter(Boolean);
   if(!messages.length){document.querySelectorAll('.dew-ann').forEach(x=>x.remove());return;}
   const mode=a.mode||'static',speed=a.speed||'normal';
   const group='<div class="dew-ann-group">'+Array.from({length:32},()=>messages.map(m=>'<span>'+esc(m)+'</span>').join('<i aria-hidden="true">•</i>')).join('<i aria-hidden="true">✦</i>')+'</div>';
   const content=mode==='static'?messages.map(m=>'<span>'+esc(m)+'</span>').join(' · '):'<div class="dew-ann-track">'+group+group+'</div>';
   if(!bar){bar=document.createElement('div');const anchor=document.querySelector('.dew-header,.top');const parent=anchor?.parentNode||document.body;if(anchor)parent.insertBefore(bar,anchor);else parent.insertBefore(bar,parent.firstChild);}
   const desiredClass='dew-ann '+(mode==='static'?'is-static':'is-marquee')+' speed-'+esc(speed);
   const desiredHtml='<a href="'+esc(a.link||'#shop')+'">'+content+'</a>';
   if(bar.className!==desiredClass)bar.className=desiredClass;
   if(bar.innerHTML!==desiredHtml)bar.innerHTML=desiredHtml;
  }catch(e){/* Keep the page usable if store settings cannot be loaded. */}
 };
 let queued=false;
 const schedule=()=>{if(queued)return;queued=true;Promise.resolve().then(()=>{queued=false;apply()})};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
 new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
})();

/* Keep storefront footers in sync after async page templates render. Checkout and receipt are excluded. */
(()=>{
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const socialMarkup=settings=>{
  const items=[
   ['instagramUrl','Instagram','<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/>'],
   ['facebookUrl','Facebook','<path d="M14 21v-8h3l.5-4H14V7c0-1.2.4-2 2-2h1.7V1.4C17 1.2 15.8 1 14.4 1 11.4 1 9.5 2.8 9.5 6.1V9H6v4h3.5v8z"/>']
  ];
  return items.filter(([key])=>/^https?:\/\//i.test(String(settings[key]||''))).map(([key,name,svg])=>'<a class="dew-social-icon" href="'+esc(settings[key])+'" target="_blank" rel="noopener noreferrer" aria-label="'+name+'"><svg viewBox="0 0 24 24" aria-hidden="true">'+svg+'</svg><span>'+name+'</span></a>').join('');
 };
 let dataPromise;
 const loadData=()=>dataPromise||(dataPromise=fetch('products.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Store settings unavailable');return r.json()}));
 let running=false,queued=false;
 const sync=async()=>{
  if(running||document.body.classList.contains('dew-checkout-page')||document.querySelector('.dew-success-page'))return;
  const hasPendingFooter=[...document.querySelectorAll('.dew-footer')].some(el=>el.dataset.dewFooterReady!=='1');
  const initialMenu=document.querySelector('#dewMobileMenu');
  if(!hasPendingFooter&&(!initialMenu||initialMenu.dataset.dewSocialReady==='1'))return;
  running=true;
  try{
   const data=await loadData(),settings=data.settings||{},home=settings.homepage||{},footer=home.footer||{};
   const footers=[...document.querySelectorAll('.dew-footer')].filter(el=>el.dataset.dewFooterReady!=='1');
   const menu=document.querySelector('#dewMobileMenu');
   const menuNeedsSync=menu&&menu.dataset.dewSocialReady!=='1';
   const social=socialMarkup(settings);
   if(menuNeedsSync){
    let area=menu.querySelector('.dew-mobile-menu-social');
    if(!area){area=document.createElement('div');area.className='dew-mobile-menu-social';menu.append(area);}
    const html='<b>FOLLOW DEW</b><div class="dew-social-links">'+(social||'<span class="dew-social-empty">Follow Dew on social media</span>')+'</div>';
    if(area.innerHTML!==html)area.innerHTML=html;
    menu.dataset.dewSocialReady='1';
   }
   footers.forEach(el=>{
    if(footer.show===false){el.hidden=true;el.dataset.dewFooterReady='1';return;}
    el.hidden=false;
    if(!el.id)el.id='contact';
    let about=el.querySelector('.dew-footer-about');
    if(!about){about=document.createElement('div');about.className='dew-footer-about';el.prepend(about);}
    const aboutHtml='<h3>About Dew</h3><p>'+esc(footer.about||'')+'</p>';
    if(about.innerHTML!==aboutHtml)about.innerHTML=aboutHtml;
    let socials=el.querySelector('.dew-footer-social');
    if(!socials){socials=document.createElement('div');socials.className='dew-footer-social';about.after(socials);}
    if(socials.innerHTML!==social)socials.innerHTML=social;
    let nav=el.querySelector('nav');
    if(!nav){nav=document.createElement('nav');socials.after(nav);}
    const links=[...(Array.isArray(footer.links)?footer.links:[]),...(data.pages||[]).filter(p=>p.published&&p.showInFooter).map(p=>({label:p.title,url:'page.html?slug='+encodeURIComponent(p.slug)}))];
    const navHtml=links.map(x=>'<a href="'+esc(x.url)+'">'+esc(x.label)+'</a>').join('');
    if(nav.innerHTML!==navHtml)nav.innerHTML=navHtml;
    let small=el.querySelector('small');
    if(!small){small=document.createElement('small');el.append(small);}
    const copyright='© '+new Date().getFullYear()+' '+(settings.storeName||'Dew Skincare')+'. '+(footer.copyright||'All rights reserved.');
    if(small.textContent!==copyright)small.textContent=copyright;
    el.dataset.dewFooterReady='1';
   });
  }catch(e){/* Retry if settings are temporarily unavailable. */}
  finally{running=false;}
 };
 const schedule=()=>{if(queued)return;queued=true;Promise.resolve().then(()=>{queued=false;sync()})};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
 new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
})();