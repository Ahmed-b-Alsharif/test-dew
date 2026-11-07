const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
(async()=>{
 const root=$('#pageApp');
 try{
  const S=await(await fetch('products.json?v='+Date.now())).json(),slug=new URLSearchParams(location.search).get('slug');
  const p=(S.pages||[]).find(x=>x.slug===slug&&x.published);
  if(!p){root.innerHTML='<main class="content-page"><h1>Page not found</h1><p>This page is unavailable.</p><a href="./">Return to Dew Skincare</a></main>';return;}
  const H=S.settings?.homepage||{},header=H.header||{},footer=H.footer||{},settings=S.settings||{};
  document.title=(p.seoTitle||p.title)+' | '+(settings.storeName||'Dew Skincare');
  const nav=[...(header.links||[]),...(S.pages||[]).filter(x=>x.published&&x.showInHeader).map(x=>({label:x.title,url:'page.html?slug='+encodeURIComponent(x.slug)}))];
  const foot=[...(footer.links||[]),...(S.pages||[]).filter(x=>x.published&&x.showInFooter).map(x=>({label:x.title,url:'page.html?slug='+encodeURIComponent(x.slug)}))];
  root.innerHTML=(H.announcement?.show?'<div class="dew-ann"><a href="'+esc(H.announcement.link||'./#shop')+'">'+esc(H.announcement.text||'')+'</a></div>':'')+
  '<header class="dew-header header-logo-'+esc(header.logoPosition||'center')+' header-nav-'+esc(header.navPosition||'left')+'"><nav>'+nav.map(x=>'<a href="'+esc(x.url)+'">'+esc(x.label)+'</a>').join('')+'</nav><a class="dew-logo" href="./">'+(header.logoImage?'<img class="dew-logo-image" src="'+esc(header.logoImage)+'" alt="'+esc(header.logo||'Dew')+'">':esc(header.logo||settings.storeName||'Dew')+'<small>SKINCARE</small>')+'</a><div class="dew-header-actions"><a class="dew-cart" href="./#shop" aria-label="Shop">Shop</a></div></header>'+
  '<main class="content-page"><div class="content-page-breadcrumb"><a href="./">Home</a><span>/</span>'+esc(p.title)+'</div>'+(p.image?'<div class="content-page-image"><img src="'+esc(p.image)+'" alt="'+esc(p.title)+'"></div>':'')+
  '<article><span class="dew-kicker">DEW SKINCARE</span><h1>'+esc(p.title)+'</h1>'+(p.intro?'<p class="content-page-intro">'+esc(p.intro)+'</p>':'')+'<div class="content-page-body">'+String(p.content||'').split(/\n\s*\n/).map(t=>'<p>'+esc(t).replace(/\n/g,'<br>')+'</p>').join('')+'</div></article></main>'+
  '<footer class="dew-footer"><div><a class="dew-logo" href="./">'+esc(header.logo||settings.storeName||'Dew')+'</a><p>'+esc(footer.about||'Natural skincare, made with love in Egypt.')+'</p></div><nav>'+foot.map(x=>'<a href="'+esc(x.url)+'">'+esc(x.label)+'</a>').join('')+'</nav><small>© '+new Date().getFullYear()+' '+esc(settings.storeName||'Dew Skincare')+'. '+esc(footer.copyright||'All rights reserved.')+'</small></footer>';
  if(p.seoDescription){let m=document.querySelector('meta[name="description"]');if(!m){m=document.createElement('meta');m.name='description';document.head.appendChild(m)}m.content=p.seoDescription;}
 }catch(e){console.error(e);root.innerHTML='<main class="content-page"><h1>Could not load this page</h1><a href="./">Return to store</a></main>';}
})();