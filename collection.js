const root=document.getElementById('collectionApp');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'EGP '+Number(n||0).toLocaleString('en-US');
const variants=p=>(Array.isArray(p.variants)?p.variants:[]).filter(v=>v&&v.id);
const stock=p=>variants(p).length?variants(p).reduce((n,v)=>n+Math.max(0,Number(v.stock||0)),0):Math.max(0,Number(p.stock||0));
const effectivePrice=v=>Number(v?.salePrice)>0&&Number(v.salePrice)<Number(v.price)?Number(v.salePrice):Number(v?.price||0);
function productPrice(p){
 const vs=variants(p),prices=vs.length?vs.map(effectivePrice).filter(n=>n>0):[effectivePrice(p)];
 if(!prices.length)return money(p.price);
 const min=Math.min(...prices),max=Math.max(...prices);
 return min===max?money(min):money(min)+' – '+money(max);
}
function picture(src,name){return src?'<img src="'+esc(src)+'" alt="'+esc(name)+'" loading="lazy">':'<div class="dew-placeholder"><b>DEW</b></div>'}
function productCard(p){
 const sold=stock(p)<1,hasOptions=(p.options||[]).some(o=>(o.values||[]).length>1)||variants(p).length>1;
 const url='product.html?id='+encodeURIComponent(p.id);
 return '<article class="dew-product" data-product-search="'+esc(p.name+' '+(p.tags||''))+'"><a class="dew-product-link" href="'+url+'"><div class="dew-product-photo">'+picture(p.images?.[0],p.name)+(sold?'<span class="dew-sold-out-badge">SOLD OUT</span>':'')+'</div><div class="dew-product-info"><h3>'+esc(p.name)+'</h3></div></a><div class="dew-product-info"><div class="dew-product-prices"><strong>'+productPrice(p)+'</strong></div><div class="dew-product-actions '+(hasOptions?'has-variants':'')+'"><a class="dew-add" href="'+url+'" '+(sold?'aria-disabled="true"':'')+'>'+(sold?'Sold out':hasOptions?'Choose options':'View product')+'</a></div></div></article>';
}
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
  root.innerHTML='<header class="dew-header"><a class="dew-logo" href="./">'+(header.logoImage?'<img class="dew-logo-image" src="'+esc(header.logoImage)+'" alt="'+esc(header.logo||'Dew')+'">':esc(header.logo||'Dew')+'<small>SKINCARE</small>')+'</a><nav><a href="./">Home</a><a href="./#shop">Shop</a></nav></header><main class="dew-main dew-collection-page"><div class="dew-collection-intro"><a class="dew-collection-back" href="./">← Back to store</a>'+(c.image?'<div class="dew-collection-banner">'+picture(c.image,c.name)+'</div>':'')+'<span class="dew-kicker">EXPLORE DEW</span><h1>'+esc(c.name)+'</h1>'+(c.description?'<p>'+esc(c.description)+'</p>':'')+'<small>'+products.length+' '+(products.length===1?'product':'products')+'</small></div><div class="dew-products">'+products.map(productCard).join('')+'</div>'+(products.length?'':'<p class="dew-empty">No products have been added to this collection yet.</p>')+'</main><footer class="dew-footer"><a class="dew-logo" href="./">'+esc(header.logo||'Dew')+'</a><small>© '+new Date().getFullYear()+' '+esc(S.settings.storeName||'Dew Skincare')+'</small></footer>';
 }catch(e){root.innerHTML='<main class="dew-main"><h1>Could not load this collection</h1><p>Please refresh the page.</p></main>'}
}
boot();