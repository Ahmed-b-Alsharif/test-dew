const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'EGP '+Number(n||0).toLocaleString('en-US');
const price=p=>p.salePrice>0&&p.salePrice<p.price?p.salePrice:p.price;
(async()=>{
 const root=$('#productApp');
 try{
  const S=await(await fetch('products.json?v='+Date.now())).json();
  const id=new URLSearchParams(location.search).get('id');
  const p=(S.products||[]).find(x=>x.id===id&&x.visible);
  if(!p){root.innerHTML='<main class="product-page"><a class="product-back" href="./">← Back to shop</a><h2>Product not found</h2></main>';return;}
  document.title=p.name+' | '+(S.settings.storeName||'Dew Skincare');
  const images=(p.images||[]).filter(Boolean);
  const mainImage=images[0]?'<img src="'+esc(images[0])+'" alt="'+esc(p.name)+'">':'<span>DEW</span>';
  root.innerHTML='<header class="dew-header"><nav><a href="./#shop">Shop</a><a href="./#about">Our Story</a><a href="./#contact">Contact</a></nav><a class="dew-logo" href="./">'+esc(S.settings.storeName||'Dew')+'<small>SKINCARE</small></a><button class="dew-cart" id="openCart" aria-label="Open shopping cart"><svg class="dew-cart-icon" viewBox="0 0 24 24"><path d="M3 4h2l2.1 10.1a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 1.9-1.4L22 8H6"/><circle cx="10" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/></svg><b id="cartCount">'+Cart.count()+'</b></button></header><main class="product-page"><a class="product-back" href="./#shop">← Back to shop</a><div class="product-detail-grid"><div><div class="product-gallery-main" id="mainImage">'+mainImage+'</div><div class="product-gallery-thumbs">'+images.map((u,i)=>'<button type="button" data-image="'+i+'" aria-label="View product photo '+(i+1)+'"><img src="'+esc(u)+'" alt="'+esc(p.name)+' photo '+(i+1)+'"></button>').join('')+'</div></div><section class="product-detail-info"><span class="dew-kicker">'+esc((S.catalogs||[]).find(c=>c.id===p.catalog)?.name||'DEW SKINCARE')+'</span><h1>'+esc(p.name)+'</h1><div class="product-detail-price">'+(p.salePrice>0&&p.salePrice<p.price?'<del>'+money(p.price)+'</del> ':'')+money(price(p))+'</div><p class="product-detail-description">'+esc(p.description||'Details coming soon.')+'</p>'+(p.howToUse?'<div class="product-detail-meta"><b>How to use</b><br>'+esc(p.howToUse)+'</div>':'')+(p.tags?'<div class="product-detail-meta"><b>Product details</b><br>'+esc(p.tags)+'</div>':'')+'<button class="dew-add" id="addProduct" '+(p.stock<1?'disabled':'')+'>Add to cart</button><p class="product-detail-meta">'+(p.stock>0?'In stock':'Currently unavailable')+' · Delivery across Egypt</p></section></div></main><div class="dew-cart-toast" id="cartToast">Added to cart</div><div class="dew-scrim" id="scrim"></div><aside class="dew-drawer" id="drawer"><header><b>Your cart</b><button id="closeCart">×</button></header><div id="cartItems"></div><footer><div class="dew-total"><span>Subtotal</span><b id="cartSub">EGP 0</b></div><a class="dew-btn" href="checkout.html">Continue to checkout ↗</a></footer></aside>';
  document.querySelectorAll('[data-image]').forEach(b=>b.onclick=()=>{$('#mainImage').innerHTML='<img src="'+esc(images[+b.dataset.image])+'" alt="'+esc(p.name)+'">';});
  function renderCart(){const c=Cart.get(),ids=Object.keys(c);let total=0;$('#cartItems').innerHTML=ids.map(id=>{const x=S.products.find(y=>y.id===id);if(!x)return '';total+=price(x)*c[id];return '<div class="dew-line"><b>'+esc(x.name)+'</b><span>'+money(price(x))+' × '+c[id]+'</span></div>';}).join('')||'<p class="dew-empty">Your cart is empty.</p>';$('#cartSub').textContent=money(total);}
  $('#addProduct').onclick=()=>{Cart.add(p.id,1,p.stock);$('#cartCount').textContent=Cart.count();$('#cartToast').textContent=p.name+' added to cart';$('#cartToast').classList.add('show');renderCart();};
  const open=()=>{$('#drawer').classList.add('open');$('#scrim').classList.add('open');};
  const close=()=>{$('#drawer').classList.remove('open');$('#scrim').classList.remove('open');};
  $('#openCart').onclick=open;$('#closeCart').onclick=close;$('#scrim').onclick=close;renderCart();
 }catch(e){root.textContent='Could not load this product. Please refresh.';}
})();