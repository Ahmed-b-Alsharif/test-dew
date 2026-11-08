const root=document.getElementById('collectionApp');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'EGP '+Number(n||0).toLocaleString('en-US');
const variants=p=>(Array.isArray(p.variants)?p.variants:[]).filter(v=>v&&v.id);
const multiOptions=p=>(p.options||[]).some(o=>Array.isArray(o.values)&&new Set(o.values.map(v=>String(v).trim()).filter(Boolean)).size>1);
const hasChoices=p=>multiOptions(p);
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
 const sold=stock(p)<1,choice=hasChoices(p),url='product.html?id='+encodeURIComponent(p.id);
 const actions=sold?'<button class="dew-collection-disabled" disabled>Sold out</button>':choice?'<a class="dew-collection-choose" href="'+url+'">Choose option</a>':'<button class="dew-collection-add" type="button" data-collection-add="'+esc(p.id)+'">Add to cart</button><button class="dew-collection-buy" type="button" data-collection-buy="'+esc(p.id)+'">Buy now</button>';
 return '<article class="dew-collection-card"><a class="dew-collection-product-link" href="'+url+'"><div class="dew-collection-product-photo">'+picture(p.images?.[0],p.name)+(sold?'<span class="dew-sold-out-badge">SOLD OUT</span>':'')+'<span class="dew-collection-photo-tag">DEW SKINCARE</span></div><div class="dew-collection-product-copy"><h3>'+esc(p.name)+'</h3><div class="dew-product-prices">'+(variants(p).length===0&&p.salePrice>0&&p.salePrice<p.price?'<del>'+money(p.price)+'</del>':'')+'<strong>'+productPrice(p)+'</strong></div></div></a><div class="dew-collection-actions '+(choice?'has-choice':'')+'">'+actions+'</div></article>';
}
async function boot(){
 try{
  const S=await(await fetch('products.json?v='+Date.now(),{cache:'no-store'})).json();
  const id=new URLSearchParams(location.search).get('id');
  const c=(S.catalogs||[]).find(x=>String(x.id)===String(id));
  if(!c){root.innerHTML='<main class="dew-main"><p><a href="./">← Back to store</a></p><h1>Collection not found</h1><p>This collection may have been removed.</p></main>';return;}
  const ids=Array.isArray(c.productIds)?c.productIds:(S.products||[]).filter(p=>p.catalog===c.id).map(p=>p.id);
  const products=(S.products||[]).filter(p=>p.visible&&ids.includes(p.id));
  const store=S.settings||{},H=store.homepage||{},header=H.header||{};
  const logo=header.logoImage?'<img class="dew-logo-image" src="'+esc(header.logoImage)+'" alt="'+esc(header.logo||'Dew')+'">':esc(header.logo||store.storeName||'Dew')+'<small>SKINCARE</small>';
  document.title=c.name+' | '+(store.storeName||'Dew Skincare');
  root.innerHTML='<header class="dew-header dew-collection-header"><nav class="dew-collection-nav"><a href="./">Home</a><a href="./#shop">Shop</a></nav><a class="dew-logo" href="./">'+logo+'</a><a class="dew-collection-cart" href="checkout.html" aria-label="Go to cart and checkout">Cart <span id="collectionCartCount">'+(window.Cart?.count?.()||0)+'</span></a></header><main class="dew-main dew-collection-page"><section class="dew-collection-hero"><div class="dew-collection-hero-art">'+(c.image?picture(c.image,c.name):'<div class="dew-collection-art-fallback"><span>THE DEW EDIT</span><b>'+esc(c.name)+'</b></div>')+'</div><div class="dew-collection-hero-copy"><a class="dew-collection-back" href="./">← Back to all collections</a><span class="dew-kicker">CURATED FOR YOUR ROUTINE</span><h1>'+esc(c.name)+'</h1>'+(c.description?'<p>'+esc(c.description)+'</p>':'<p>Thoughtfully selected essentials to make every day feel a little more beautiful.</p>')+'<div class="dew-collection-meta"><span></span>'+products.length+' '+(products.length===1?'care essential':'care essentials')+'</div></div></section><div class="dew-collection-section-heading"><div><span class="dew-kicker">SHOP THE COLLECTION</span><h2>Find your favourites</h2></div><span class="dew-collection-count">'+products.length+' ITEMS</span></div><div class="dew-collection-grid">'+products.map(productCard).join('')+'</div>'+(products.length?'':'<div class="dew-empty dew-collection-empty"><h3>Something lovely is on its way</h3><p>No products have been added to this collection yet.</p></div>')+'</main><footer class="dew-footer"><a class="dew-logo" href="./">'+logo+'</a><small>© '+new Date().getFullYear()+' '+esc(store.storeName||'Dew Skincare')+'. Made with care in Egypt.</small></footer><div class="dew-collection-toast" id="collectionToast" role="status" aria-live="polite">Added to cart</div>';
  function addProduct(id,checkout){
   const p=products.find(x=>String(x.id)===String(id));if(!p||stock(p)<1)return;
   const availableVariant=variants(p).find(v=>Number(v.stock||0)>0),cartKey=availableVariant?p.id+'::'+availableVariant.id:p.id,max=availableVariant?Number(availableVariant.stock||0):Number(p.stock||0);if(window.Cart){Cart.add(cartKey,1,max);}else{const key='dew_cart';let c={};try{c=JSON.parse(localStorage.getItem(key)||'{}')}catch{}c[cartKey]=(c[cartKey]||0)+1;localStorage.setItem(key,JSON.stringify(c));}
   const count=window.Cart?.count?.()||0,el=document.getElementById('collectionCartCount');if(el)el.textContent=count;
   if(checkout){location.href='checkout.html';return;}
   const toast=document.getElementById('collectionToast');toast.textContent=p.name+' added to cart';toast.classList.add('show');clearTimeout(window.dewCollectionToastTimer);window.dewCollectionToastTimer=setTimeout(()=>toast.classList.remove('show'),2300);
  }
  document.querySelectorAll('[data-collection-add]').forEach(b=>b.onclick=()=>addProduct(b.dataset.collectionAdd,false));
  document.querySelectorAll('[data-collection-buy]').forEach(b=>b.onclick=()=>addProduct(b.dataset.collectionBuy,true));
 }catch(e){console.error(e);root.innerHTML='<main class="dew-main"><h1>Could not load this collection</h1><p>Please refresh the page.</p></main>'}
}
boot();