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
function optimizedImage(src,width=1000){try{const u=new URL(src,location.href);if(u.hostname.endsWith('cdn.shopify.com')){u.searchParams.set('width',String(width));u.searchParams.set('format','webp');return u.href}}catch{}return src}
function picture(src,name,width=1000){return src?'<img src="'+esc(optimizedImage(src,width))+'" alt="'+esc(name)+'" loading="lazy" decoding="async">':'<div class="dew-placeholder"><b>DEW</b></div>'}
function productCard(p){
 const sold=stock(p)<1,choice=hasChoices(p),url='product.html?id='+encodeURIComponent(p.id);
 const actions=sold?'<button class="dew-collection-disabled" disabled>Sold out</button>':choice?'<a class="dew-collection-choose" href="'+url+'">Choose option</a>':'<button class="dew-collection-add" type="button" data-collection-add="'+esc(p.id)+'">Add to cart</button><button class="dew-collection-buy" type="button" data-collection-buy="'+esc(p.id)+'">Buy now</button>';
 return '<article class="dew-collection-card"><a class="dew-collection-product-link" href="'+url+'"><div class="dew-collection-product-photo">'+picture(p.images?.[0],p.name,800)+(sold?'<span class="dew-sold-out-badge">SOLD OUT</span>':'')+'<span class="dew-collection-photo-tag">DEW SKINCARE</span></div><div class="dew-collection-product-copy"><h3>'+esc(p.name)+'</h3><div class="dew-product-prices">'+(variants(p).length===0&&p.salePrice>0&&p.salePrice<p.price?'<del>'+money(p.price)+'</del>':'')+'<strong'+((Number(p.salePrice)>0&&Number(p.salePrice)<Number(p.price))||variants(p).some(v=>Number(v.salePrice)>0&&Number(v.salePrice)<Number(v.price))?' class="is-sale"':'')+'>'+productPrice(p)+'</strong></div></div></a><div class="dew-collection-actions '+(choice?'has-choice':'')+'">'+actions+'</div></article>';
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
  const logo=header.logoImage?'<img class="dew-logo-image" src="'+esc(optimizedImage(header.logoImage,360))+'" alt="'+esc(header.logo||'Dew')+'">':esc(header.logo||store.storeName||'Dew')+'<small>SKINCARE</small>';
  const navLinks=[...(header.links||[{label:'Shop',url:'./#shop'},{label:'Our Story',url:'./#about'},{label:'Contact',url:'./#contact'}]),...(S.pages||[]).filter(pg=>pg.published&&pg.showInHeader).map(pg=>({label:pg.title,url:'page.html?slug='+encodeURIComponent(pg.slug)}))];
  const social=(store.instagramUrl&&/^https?:\/\//i.test(store.instagramUrl)?'<a class="dew-social-icon" href="'+esc(store.instagramUrl)+'" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg></a>':'')+(store.facebookUrl&&/^https?:\/\//i.test(store.facebookUrl)?'<a class="dew-social-icon" href="'+esc(store.facebookUrl)+'" target="_blank" rel="noopener noreferrer" aria-label="Facebook"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 21v-8h3l.5-4H14V7c0-1.2.4-2 2-2h1.7V1.4C17 1.2 15.8 1 14.4 1 11.4 1 9.5 2.8 9.5 6.1V9H6v4h3.5v8z"/></svg></a>':'');
  document.title=c.name+' | '+(store.storeName||'Dew Skincare');
  root.innerHTML='<header class="dew-header dew-collection-header header-logo-'+esc(header.logoPosition||'center')+' header-nav-'+esc(header.navPosition||'left')+'"><nav class="dew-collection-nav">'+navLinks.map(x=>'<a href="'+esc(x.url)+'">'+esc(x.label)+'</a>').join('')+'</nav><a class="dew-logo" href="./">'+logo+'</a><div class="dew-header-actions">'+social+'<button class="dew-cart dew-collection-cart" id="openCollectionCart" type="button" aria-label="Open shopping cart" title="Shopping cart"><svg class="dew-cart-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.1 10.1a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 1.9-1.4L22 8H6"/><circle cx="10" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/></svg><b id="collectionCartCount">'+(window.Cart?.count?.()||0)+'</b></button></div></header><main class="dew-main dew-collection-page"><section class="dew-collection-hero"><div class="dew-collection-hero-art">'+(c.image?picture(c.image,c.name,1400):'<div class="dew-collection-art-fallback"><span>THE DEW EDIT</span><b>'+esc(c.name)+'</b></div>')+'</div><div class="dew-collection-hero-copy"><a class="dew-collection-back" href="./">← Back to all collections</a><span class="dew-kicker">CURATED FOR YOUR ROUTINE</span><h1>'+esc(c.name)+'</h1>'+(c.description?'<p>'+esc(c.description)+'</p>':'<p>Thoughtfully selected essentials to make every day feel a little more beautiful.</p>')+'<div class="dew-collection-meta"><span></span>'+products.length+' '+(products.length===1?'care essential':'care essentials')+'</div></div></section><div class="dew-collection-section-heading"><div><span class="dew-kicker">SHOP THE COLLECTION</span><h2>Find your favourites</h2></div><span class="dew-collection-count">'+products.length+' ITEMS</span></div><div class="dew-collection-grid">'+products.map(productCard).join('')+'</div>'+(products.length?'':'<div class="dew-empty dew-collection-empty"><h3>Something lovely is on its way</h3><p>No products have been added to this collection yet.</p></div>')+'</main><footer class="dew-footer"><a class="dew-logo" href="./">'+logo+'</a><small>© '+new Date().getFullYear()+' '+esc(store.storeName||'Dew Skincare')+'. Made with care in Egypt.</small></footer><div class="dew-collection-toast" id="collectionToast" role="status" aria-live="polite">Added to cart</div><div class="dew-scrim" id="collectionCartScrim"></div><aside class="dew-drawer" id="collectionCartDrawer" aria-label="Shopping cart"><header><b>Your cart</b><button id="closeCollectionCart" type="button" aria-label="Close cart">×</button></header><div id="collectionCartItems"></div><footer><div class="dew-total"><span>Subtotal</span><b id="collectionCartSubtotal">EGP 0</b></div><p id="collectionCartNote"></p><a class="dew-btn" id="collectionCheckout" href="checkout.html">Continue to checkout ↗</a></footer></aside>';
  const $=s=>document.querySelector(s);
  function cartProduct(key){
   const bits=String(key).split('::'),p=(S.products||[]).find(x=>String(x.id)===bits[0]),v=bits[1]?variants(p||{}).find(x=>String(x.id)===bits[1]):null;
   if(!p||(bits[1]&&!v))return null;
   return {p,v,key,name:p.name+(v?' · '+Object.values(v.options||{}).join(' / '):''),unit:v?effectivePrice(v):effectivePrice(p),max:v?Number(v.stock||0):Number(p.stock||0),image:v?.image||p.images?.[0]};
  }
  function renderCollectionCart(){
   if(!window.Cart)return;
   const c=Cart.get(),ids=Object.keys(c),valid=ids.filter(key=>!!cartProduct(key));ids.filter(key=>!valid.includes(key)).forEach(key=>delete c[key]);if(valid.length!==ids.length)Cart.set(c);
   let total=0;$('#collectionCartCount').textContent=valid.reduce((n,key)=>n+Math.max(0,Number(c[key])||0),0);
   $('#collectionCartItems').innerHTML=valid.map(key=>{const x=cartProduct(key);if(!x)return '';const qty=Math.max(0,Number(c[key])||0);total+=x.unit*qty;return '<div class="dew-line">'+(x.image?'<img src="'+esc(optimizedImage(x.image,240))+'" alt="'+esc(x.p.name)+'">':'<div class="dew-line-placeholder">DEW</div>')+'<div class="dew-line-info"><b>'+esc(x.name)+'</b><span>'+money(x.unit)+'</span><div class="dew-qty"><button type="button" data-cart-minus="'+esc(key)+'" aria-label="Decrease quantity">−</button><span>'+qty+'</span><button type="button" data-cart-plus="'+esc(key)+'" aria-label="Increase quantity" '+(qty>=x.max?'disabled':'')+'>+</button></div></div><button class="dew-remove" type="button" data-cart-remove="'+esc(key)+'">Remove</button></div>'}).join('')||'<p class="dew-empty">Your cart is empty. Find something lovely for your routine.</p>';
   $('#collectionCartSubtotal').textContent=money(total);
   const minimum=Number(store.minOrder||0),canCheckout=total>=minimum&&valid.length>0;
   $('#collectionCartNote').textContent=canCheckout?'Delivery calculated at checkout':'Minimum order: '+money(minimum);
   $('#collectionCheckout').style.opacity=canCheckout?'1':'.5';$('#collectionCheckout').style.pointerEvents=canCheckout?'auto':'none';
   document.querySelectorAll('[data-cart-minus]').forEach(b=>b.onclick=()=>{Cart.setQty(b.dataset.cartMinus,(Number(Cart.get()[b.dataset.cartMinus])||1)-1);renderCollectionCart()});
   document.querySelectorAll('[data-cart-plus]').forEach(b=>b.onclick=()=>{const x=cartProduct(b.dataset.cartPlus);if(x)Cart.add(x.key,1,x.max);renderCollectionCart()});
   document.querySelectorAll('[data-cart-remove]').forEach(b=>b.onclick=()=>{Cart.setQty(b.dataset.cartRemove,0);renderCollectionCart()});
  }
  function openCollectionCart(){renderCollectionCart();$('#collectionCartDrawer').classList.add('open');$('#collectionCartScrim').classList.add('open')}
  function closeCollectionCart(){$('#collectionCartDrawer').classList.remove('open');$('#collectionCartScrim').classList.remove('open')}
  function addProduct(id,checkout){
   const p=products.find(x=>String(x.id)===String(id));if(!p||stock(p)<1)return;
   const availableVariant=variants(p).find(v=>Number(v.stock||0)>0),cartKey=availableVariant?p.id+'::'+availableVariant.id:p.id,max=availableVariant?Number(availableVariant.stock||0):Number(p.stock||0);
   if(window.Cart)Cart.add(cartKey,1,max);
   renderCollectionCart();
   if(checkout){location.href='checkout.html';return;}
   const toast=$('#collectionToast');toast.textContent=p.name+' added to cart';toast.classList.add('show');clearTimeout(window.dewCollectionToastTimer);window.dewCollectionToastTimer=setTimeout(()=>toast.classList.remove('show'),2300);
  }
  $('#openCollectionCart').onclick=openCollectionCart;$('#closeCollectionCart').onclick=closeCollectionCart;$('#collectionCartScrim').onclick=closeCollectionCart;
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeCollectionCart()});
  document.querySelectorAll('[data-collection-add]').forEach(b=>b.onclick=()=>addProduct(b.dataset.collectionAdd,false));
  document.querySelectorAll('[data-collection-buy]').forEach(b=>b.onclick=()=>addProduct(b.dataset.collectionBuy,true));
  renderCollectionCart();
 }catch(e){console.error(e);root.innerHTML='<main class="dew-main"><h1>Could not load this collection</h1><p>Please refresh the page.</p></main>'}
}
boot();