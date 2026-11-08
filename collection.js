const root=document.getElementById('collectionApp');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'EGP '+Number(n||0).toLocaleString('en-US');
const price=p=>p.salePrice>0&&p.salePrice<p.price?p.salePrice:p.price;
const stock=p=>p?.variants?.length?p.variants.reduce((n,v)=>n+Math.max(0,Number(v.stock||0)),0):Math.max(0,Number(p?.stock||0));
function pic(src,name){return src?'<img src="'+esc(src)+'" alt="'+esc(name)+'" loading="lazy">':'<div class="dew-placeholder"><b>DEW</b></div>'}
async function boot(){
 try{
  const S=await(await fetch('products.json?v='+Date.now(),{cache:'no-store'})).json();
  const id=new URLSearchParams(location.search).get('id');
  const c=(S.catalogs||[]).find(x=>String(x.id)===String(id));
  if(!c){root.innerHTML='<main class="dew-main"><p><a href="./">← Back to store</a></p><h1>Collection not found</h1><p>This collection may have been removed.</p></main>';return;}
  const ids=Array.isArray(c.productIds)?c.productIds:(S.products||[]).filter(p=>p.catalog===c.id).map(p=>p.id);
  const products=(S.products||[]).filter(p=>p.visible&&ids.includes(p.id));
  const H=S.settings?.homepage||{},header=H.header||{};
  document.title=c.name+' | '+(S.settings.storeName||'Dew Skincare');
  root.innerHTML='<header class="dew-header"><a class="dew-logo" href="./">'+(header.logoImage?'<img class="dew-logo-image" src="'+esc(header.logoImage)+'" alt="'+esc(header.logo||'Dew')+'">':esc(header.logo||'Dew')+'<small>SKINCARE</small>')+'</a><nav><a href="./">Home</a><a href="./#shop">Shop</a></nav></header><main class="dew-main dew-collection-page"><div class="dew-collection-intro"><a class="dew-collection-back" href="./">← Back to store</a>'+(c.image?'<div class="dew-collection-banner">'+pic(c.image,c.name)+'</div>':'')+'<span class="dew-kicker">EXPLORE DEW</span><h1>'+esc(c.name)+'</h1>'+(c.description?'<p>'+esc(c.description)+'</p>':'')+'<small>'+products.length+' '+(products.length===1?'product':'products')+'</small></div><div class="dew-products">'+products.map(p=>'<article class="dew-product"><a class="dew-product-link" href="product.html?id='+encodeURIComponent(p.id)+'"><div class="dew-product-photo">'+pic(p.images?.[0],p.name)+(stock(p)<1?'<span class="dew-sold-out-badge">SOLD OUT</span>':'')+'</div><div class="dew-product-info"><h3>'+esc(p.name)+'</h3></div></a><div class="dew-product-info"><div class="dew-product-prices">'+(p.salePrice>0&&p.salePrice<p.price?'<del>'+money(p.price)+'</del><strong class="is-sale">'+money(p.salePrice)+'</strong>':'<strong>'+money(price(p))+'</strong>')+'</div><div class="dew-product-actions"><a class="dew-add" href="product.html?id='+encodeURIComponent(p.id)+'">'+(p.options?.length?'Choose options':'View product')+'</a></div></div></article>').join('')+'</div>'+(products.length?'':'<p class="dew-empty">No products have been added to this collection yet.</p>')+'</main><footer class="dew-footer"><a class="dew-logo" href="./">'+esc(header.logo||'Dew')+'</a><small>© '+new Date().getFullYear()+' '+esc(S.settings.storeName||'Dew Skincare')+'</small></footer>';
 }catch(e){root.innerHTML='<main class="dew-main"><h1>Could not load this collection</h1><p>Please refresh the page.</p></main>'}
}
boot();