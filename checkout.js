const $ = s => document.querySelector(s);
let S, area = null, appliedDiscount = null, paymentMethod = 'cod', deliveryAreas = [], authClient = null, currentAuthSession = null;

(async function () {
  try { S = await (await fetch('products.json',{cache:'no-cache'})).json(); }
  catch { $('#sumBody').innerHTML = '<p class="note">Could not load the shop. Please refresh.</p>'; return; }
  S.products = S.products.filter(p => p.visible);
  if (!S.discounts) S.discounts = [];
  const s = S.settings;
  deliveryAreas = Array.isArray(s.deliveryAreas) ? s.deliveryAreas.filter(x=>x.enabled!==false&&x.name) : [
    {id:'cairo',name:'Cairo & Giza',fee:Number(s.deliveryCairo||0),enabled:true},
    {id:'alex',name:'Alexandria',fee:Number(s.deliveryAlex||0),enabled:true}
  ];
  $('#deliveryArea').innerHTML='<option value="">Choose your governorate</option>'+deliveryAreas.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+' — '+egp(x.fee)+'</option>').join('');
  const syncDeliveryArea=()=>{const value=String($('#deliveryArea').value||'').trim();area=value||null;render();};
  $('#deliveryArea').addEventListener('change',syncDeliveryArea);
  $('#deliveryArea').addEventListener('input',syncDeliveryArea);
  if (s.codEnabled === false) paymentMethod = 'instapay';
  document.querySelectorAll('input[name="paymentMethod"]').forEach(r => {
    const enabled = r.value === 'cod' ? s.codEnabled !== false : s.instapayEnabled !== false && !!String(s.instapayNumber||'').trim();
    r.closest('label').hidden = !enabled; r.disabled = !enabled;
    if (r.value === paymentMethod) r.checked = true;
    r.onchange = () => { paymentMethod = r.value; updatePaymentDetails(); };
  });
  updatePaymentDetails();
  try {
    const cfg=window.DEW_AUTH_CONFIG||{};
    if(window.supabase?.createClient&&cfg.supabaseUrl&&cfg.supabaseAnonKey){
      authClient=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{storage:window.sessionStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      const sessionResult=await authClient.auth.getSession();
      currentAuthSession=sessionResult.data?.session||null;
      if(currentAuthSession?.user?.email){$('#email').value=currentAuthSession.user.email;$('#email').readOnly=true;$('#email').autocomplete='email';}
    }
  } catch {}
  try {
    const c = JSON.parse(localStorage.getItem('dew_customer') || 'null');
    if (c) {
      const parts = c.name.split(' ');
      $('#first').value = parts[0] || ''; $('#last').value = parts.slice(1).join(' ');
      $('#phone').value = c.phone;
    }
  } catch {}
  render();
})();

function updatePaymentDetails() {
  const box = $('#paymentDetails'); if (!box || !S) return;
  if (paymentMethod !== 'instapay') { box.hidden = true; box.innerHTML = ''; return; }
  const s = S.settings || {}; box.hidden = false;
  box.innerHTML = '<b>Pay via InstaPay</b><p>'+esc(s.instapayInstructions || 'Please transfer the order total to the account below.')+'</p><p><b>Account:</b> '+esc(s.instapayNumber||'')+'</p><p><b>Name:</b> '+esc(s.instapayName||'')+'</p><small>After payment, Dew will verify your transfer and confirm your order.</small>';
}
function lines() {
  const cart = Cart.get();
  const originalKeys=Object.keys(cart);
  const result=Object.keys(cart).map(key => {
    const bits=String(key).split('::'),id=bits[0],variantId=bits[1]||'';
    const p = S.products.find(x => x.id === id),v=p?.variants?.find(x=>x.id===variantId);
    if (!p || (variantId && !v)) { delete cart[key]; return null; }
    const stock=v?Number(v.stock||0):Number(p.stock||0),qty=Math.min(cart[key],stock);
    if(stock<1||qty<1)return null;
    const unit=v?(Number(v.salePrice)>0&&Number(v.salePrice)<Number(v.price)?Number(v.salePrice):Number(v.price)):eff(p);
    return { id, variantId:variantId||null, name:p.name+(v?' · '+Object.values(v.options||{}).join(' / '):''), qty, unit, total:unit*qty };
  }).filter(Boolean).filter(line=>line.qty>0);
  if(Object.keys(cart).length!==originalKeys.length)Cart.set(cart);
  return result;
}

function cairoNowString(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const p=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute;
}
function discountIsLive(d){
  const now=cairoNowString(),start=d.startsAt?d.startsAt+'T'+(d.startTime||'00:00'):'',end=d.endsAt?d.endsAt+'T'+(d.endTime||'23:59'):'';
  return d.active!==false&&(!start||now>=start)&&(!end||now<=end);
}
function discountNeedsServerValidation(d){
  return d?.eligibility==='first_time'||Number(d?.usageLimit||0)>0||d?.onePerCustomer===true;
}
function discountProductMatch(d,line){
  if(d.scope!=='products'||(!d.productIds?.length&&!d.collectionIds?.length))return true;
  const p=S.products.find(x=>String(x.id)===String(line.id));
  if(!p)return false;
  const productMatch=(d.productIds||[]).map(String).includes(String(line.id));
  const collectionMatch=(d.collectionIds||[]).some(cid=>String(p.catalog)===String(cid)||(S.catalogs||[]).some(c=>String(c.id)===String(cid)&&(c.productIds||[]).map(String).includes(String(line.id))));
  return productMatch||collectionMatch;
}
function previewDiscount(d,ls,items,delivery){
  if(!d||!discountIsLive(d))return {ok:false,error:'This discount is not active.'};
  if(Number(d.minSpend||0)>items)return {ok:false,error:'Minimum spend is '+egp(d.minSpend)+'.'};
  if(Number(d.minQuantity||0)>ls.reduce((n,l)=>n+l.qty,0))return {ok:false,error:'Add more items to use this discount.'};
  let amount=0,shipping=0,label=d.title||d.code||'Discount';
  if(d.discountKind==='free_shipping'||d.type==='free_shipping'){
    if(Number(d.shippingLimit||0)>0&&delivery>Number(d.shippingLimit))return {ok:false,error:'This discount does not apply to this shipping rate.'};
    shipping=delivery;
  }else if(d.discountKind==='buy_x_get_y'){
    const buyRule={...d,scope:(d.buyProductIds?.length||d.buyCollectionIds?.length)?'products':'all',productIds:d.buyProductIds||[],collectionIds:d.buyCollectionIds||[]};
    const ids=(d.getProductIds||[]).map(String),getQty=Math.max(1,Number(d.getQuantity||1));
    const isBuyEligible=line=>discountProductMatch(buyRule,line);
    const buys=ls.map((line,index)=>({line,index})).filter(x=>isBuyEligible(x.line)).sort((a,b)=>Number(ids.includes(String(a.line.id)))-Number(ids.includes(String(b.line.id))));
    const buyMode=d.buyMode||'quantity',buyQty=buys.reduce((n,x)=>n+x.line.qty,0),buyAmount=buys.reduce((n,x)=>n+x.line.total,0),requiredQty=Math.max(1,Number(d.buyQuantity||1)),requiredAmount=Number(d.buyAmount||0);
    const rewardBuyQty=buys.reduce((n,x)=>n+(!ids.length||ids.includes(String(x.line.id))?x.line.qty:0),0);
    const rewardOutsideBuyQty=ls.reduce((n,line)=>n+((!ids.length||ids.includes(String(line.id)))&&!isBuyEligible(line)?line.qty:0),0);
    const rewardQty=rewardBuyQty+rewardOutsideBuyQty,overlap=rewardBuyQty>0,groupPool=overlap?buyQty+rewardOutsideBuyQty:buyQty;
    const groups=buyMode==='amount'?Math.min(Math.floor(buyAmount/Math.max(1,requiredAmount)),Math.floor(rewardQty/getQty)):Math.min(Math.floor(groupPool/(requiredQty+getQty)),Math.floor(rewardQty/getQty));
    if(groups<1)return {ok:false,error:'Your cart does not meet the Buy X requirements or has no eligible reward product.'};
    const buyUnitsToConsume=buyMode==='amount'?null:groups*requiredQty,buyAmountToConsume=buyMode==='amount'?groups*requiredAmount:0;
    const consumed=new Map();let qtySlots=buyUnitsToConsume,amountCounted=0;
    for(const item of buys){let take=0;for(let i=0;i<item.line.qty;i++){if(buyMode==='amount'?amountCounted>=buyAmountToConsume:qtySlots<=0)break;take++;amountCounted+=Number(item.line.unit||item.line.total/Math.max(1,item.line.qty));if(buyMode!=='amount')qtySlots--;}if(take)consumed.set(item.index,take);if(buyMode==='amount'?amountCounted>=buyAmountToConsume:qtySlots<=0)break;}
    const rewards=ls.flatMap((l,index)=>{const remainingQty=Math.max(0,l.qty-(consumed.get(index)||0));return (!ids.length||ids.includes(String(l.id)))?Array.from({length:remainingQty},()=>({unit:l.unit})):[];}).sort((a,b)=>a.unit-b.unit);
    const maxUses=Number(d.maxUsesPerOrder||0),targetRewards=groups*getQty;
    let remaining=maxUses>0?Math.min(targetRewards,maxUses):targetRewards,rewardCount=0;
    for(const item of rewards){if(remaining<=0)break;amount+=d.getValue==='free'?item.unit:d.getValue==='percentage'?item.unit*Math.min(100,Number(d.getAmount||0))/100:Math.min(item.unit,Number(d.getAmount||0));remaining--;rewardCount++;}
    if(!rewardCount)return {ok:false,error:'Add an eligible reward product to your cart.'};
  }else{
    const eligible=d.discountKind==='amount_off_products'?ls.filter(l=>discountProductMatch(d,l)):ls;
    const base=eligible.reduce((n,l)=>n+l.total,0);
    if(d.discountKind==='amount_off_products'&&d.scope==='products'&&!base)return {ok:false,error:'Your cart has no eligible products.'};
    const kind=d.valueType||(d.type==='fixed'?'fixed':'percentage'),value=Math.max(0,Number(d.value||0));
    amount=kind==='fixed'?Math.min(base,value):Math.round(base*Math.min(100,value)/100);
  }
  return {ok:true,amount:Math.min(items,Math.round(amount*100)/100),shipping:Math.min(delivery,shipping),label,kind:d.discountKind||d.type};
}
function automaticDiscount(){return (S.discounts||[]).find(d=>d.active!==false&&d.method==='automatic'&&!d.code&&discountIsLive(d))||null;}
function totals(){
  const ls=lines(),items=ls.reduce((a,l)=>a+l.total,0),selectedArea=deliveryAreas.find(x=>x.id===area);
  let delivery=selectedArea?Number(selectedArea.fee)||0:0;
  const chosen=appliedDiscount||automaticDiscount();let discount=0,discountShipping=0,discountLabel='',validationRequired=false;
  if(chosen){
    if(discountNeedsServerValidation(chosen))validationRequired=true;
    else {const result=previewDiscount(chosen,ls,items,delivery);if(result.ok){discount=result.amount;discountShipping=result.shipping;delivery=Math.max(0,delivery-discountShipping);discountLabel=result.label;}}
  }
  return {ls,items,delivery,discount,total:Math.max(0,Math.round((items+delivery-discount)*100)/100),discountLabel,chosen,validationRequired};
}
function render() {
  const t = totals();
  if (!t.ls.length) {
    $('#sumBody').innerHTML = '<p class="note">Your cart is empty.</p><a class="btn" href="./">Go shopping</a>';
    $('#submit').disabled = true; return;
  }

  const discHtml = t.chosen && !t.validationRequired && (t.discount>0 || (t.chosen.discountKind==='free_shipping'||t.chosen.type==='free_shipping')) ? `<div class="sum-line" style="color:var(--green)"><span>Discount (${esc(t.discountLabel)})</span><b>-${egp(t.discount)}</b></div>` : '';
  const discountNotice = t.validationRequired ? '<p class="note">Discount eligibility and usage limits will be checked when you place the order. This total does not include the discount yet.</p>' : '';

  $('#sumBody').innerHTML = t.ls.map(l => `<div class="sum-line"><span>${esc(l.name)} &times; ${l.qty}<br><span class="note">${egp(l.unit)} each</span></span><b>${egp(l.total)}</b></div>`).join('') +
    `<div class="sum-line"><span>Items</span><b>${egp(t.items)}</b></div>
     <div class="sum-line"><span>Delivery</span><b>${area ? egp(t.delivery) : 'Choose area'}</b></div>
     ${discHtml}
     ${discountNotice}
     <div class="sum-line total"><span>Total</span><span>${egp(t.total)}</span></div>` +
    `<div style="margin:14px 0 8px;display:flex;gap:8px">
       <input id="promoInput" placeholder="Promo code" style="flex:1;padding:8px 12px;border:1.5px solid #cfd3cc;border-radius:999px;font-size:.9rem" value="${appliedDiscount ? esc(appliedDiscount.code) : ''}">
       <button type="button" class="btn small" id="applyPromo">${appliedDiscount ? 'Remove' : 'Apply'}</button>
     </div>
     <div id="promoErr" class="note" style="margin-bottom:8px"></div>` +
    (t.items < S.settings.minOrder ? `<div class="warn">Minimum order is ${egp(S.settings.minOrder)} for items.</div>` : '');

  $('#applyPromo').onclick = () => {
    const codeInput = $('#promoInput').value.trim().toUpperCase();
    if (appliedDiscount) {
      appliedDiscount = null;
      render();
      return;
    }
    if (!codeInput) return;
    const disc = (S.discounts || []).find(d => d.method!=='automatic' && String(d.code||'').toUpperCase() === codeInput && d.active);
    if (!disc) {
      $('#promoErr').textContent = 'Invalid or inactive promo code.';
      $('#promoErr').style.color = 'var(--red)';
      return;
    }
    const needsServerValidation=discountNeedsServerValidation(disc);
    if(!needsServerValidation){const baseDelivery=Number(deliveryAreas.find(x=>x.id===area)?.fee||0);const check=previewDiscount(disc,t.ls,t.items,baseDelivery);
      if(!check.ok){$('#promoErr').textContent=check.error;$('#promoErr').style.color='var(--red)';return;}}
    appliedDiscount = disc;
    render();
    $('#promoErr').textContent = needsServerValidation
      ? 'Code saved. Eligibility and usage limits will be checked when you place the order; the cart total does not include it yet.'
      : 'Promo code applied successfully!';
    $('#promoErr').style.color = 'var(--green)';
  };

  $('#submit').disabled = t.items < S.settings.minOrder;
}

const ref = () => { const d = new Date(); return 'DEW-' + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + Math.floor(1000 + Math.random() * 9000); };

$('#form').onsubmit = async e => {
  e.preventDefault();
  $('#err').textContent = '';
  const t = totals();
  const first = $('#first').value.trim(), last = $('#last').value.trim(), address = $('#address').value.trim();
  const phone = $('#phone').value.trim(), email = $('#email').value.trim().toLowerCase();
  const selectedAreaId=String($('#deliveryArea').value||'').trim();
  const selectedArea=deliveryAreas.find(x=>String(x.id??'').trim()===selectedAreaId);
  if (!selectedArea) { area=null; $('#err').textContent = 'Please select a delivery area from the list.'; $('#deliveryArea').focus(); return; }
  area=String(selectedArea.id);
  if (!first || !last || address.length < 6 || phone.replace(/\D/g, '').length < 8 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    $('#err').textContent = 'Please fill in your name, address and phone number. Check the email format if you entered one.'; return;
  }
  if (!t.ls.length) { $('#err').textContent = 'Your cart is empty.'; return; }
  if (t.items < S.settings.minOrder) { $('#err').textContent = `Minimum order is ${egp(S.settings.minOrder)}.`; return; }
  const api=(S.settings.ordersApiUrl||'').trim().replace(/\/$/,'');
  if (!api) { $('#err').textContent = 'Online ordering is being set up. Please contact Dew Skincare to place your order.'; return; }
  const button=$('#submit'), oldLabel=button.textContent;
  button.disabled=true; button.textContent='Placing your order…';
  try {
    const requestHeaders={'Content-Type':'application/json'};
    if(currentAuthSession?.access_token)requestHeaders.Authorization='Bearer '+currentAuthSession.access_token;
    const response=await fetch(api+'/api/orders',{method:'POST',headers:requestHeaders,body:JSON.stringify({
      lines:t.ls.map(l=>({id:l.id,variantId:l.variantId,qty:l.qty})),area:String(selectedArea.id),areaName:selectedArea.name,paymentMethod,promoCode:appliedDiscount?.code||'',customer:{first,last,phone,email,address,note:$('#customerNote').value.trim()}
    })});
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.ok||!result.order) throw new Error(result.error||'We could not save your order. Please try again.');
    try { localStorage.setItem('dew_customer',JSON.stringify({name:first+' '+last,phone})); } catch {}
    Cart.clear(); done(result.order);
  } catch(err) {
    $('#err').textContent=err.message||'We could not save your order. Please try again.';
    button.disabled=false; button.textContent=oldLabel;
  }
};

function done(o) {
  const customer=o.customer||{}, lines=Array.isArray(o.lines)?o.lines:[];
  const subtotal=Number.isFinite(Number(o.itemsTotal))?Number(o.itemsTotal):lines.reduce((n,line)=>n+Number(line.total||0),0);
  const delivery=Math.max(0,Number(o.delivery)||0),discount=Math.max(0,Number(o.discount)||0);
  const total=Math.max(0,Number(o.total)||0),isCod=String(o.paymentMethod||paymentMethod).toLowerCase()==='cod';
  const itemsHtml=lines.map(line=>`<div class="dew-receipt-item"><div><b>${esc(line.name||'Dew product')}</b><small>${Math.max(0,Number(line.qty)||0)} × ${egp(line.unit)}</small></div><strong>${egp(line.total)}</strong></div>`).join('');
  $('#page').className='page dew-success-page';
  document.title='Order confirmed | Dew Skincare';
  $('#page').innerHTML=`<div class="dew-success-grid">
    <section class="dew-success-hero">
      <div>
        <span class="dew-success-badge"><span aria-hidden="true">✓</span> Order received</span>
        <p class="dew-success-greeting">Hi ${esc(customer.first||'there')},</p>
        <h1>Glow,<br><em>on the way.</em></h1>
        <p class="dew-success-copy">We’ve received your order. Our team will contact you to confirm your delivery details.</p>
        
      </div>
      <div class="dew-success-order">
        <span>Order number</span>
        <strong>${esc(o.number||'')}</strong>
        <button type="button" id="copyOrderNumber" class="dew-copy-order">Copy</button>
      </div>
    </section>
    <p class="dew-success-copy dew-receipt-email-status">${o.emailReceipt?.status==='sent'?'Receipt emailed to '+esc(customer.email||'your email address'):(o.emailReceipt?.status==='failed'?'We saved your order, but could not email the receipt. Please keep your order number.':(o.emailReceipt?.status==='not_requested'?'We saved your order. Add an email at checkout next time to receive an emailed receipt.':'We saved your order. Email receipts are being connected; please keep your order number.'))}</p>
    <section class="dew-success-receipt" aria-label="Order receipt">
      <p class="dew-success-eyebrow">Dew Skincare</p>
      <h2>Your order</h2>
      <div class="dew-receipt-items">${itemsHtml}</div>
      <dl class="dew-receipt-totals">
        <div><dt>Subtotal</dt><dd>${egp(subtotal)}</dd></div>
        ${discount>0?`<div class="dew-receipt-discount"><dt>Discount${o.promoCode?` · ${esc(o.promoCode)}`:''}</dt><dd>−${egp(discount)}</dd></div>`:''}
        <div><dt>Delivery</dt><dd>${delivery>0?egp(delivery):'Free'}</dd></div>
        <div class="dew-receipt-total"><dt>${isCod?'Due on delivery':'Order total'}</dt><dd>${egp(total)}</dd></div>
      </dl>
      <div class="dew-success-payment">
        <strong>${isCod?'Cash on Delivery':'InstaPay'}</strong>
        <p>${isCod?`Please pay ${egp(total)} when your order arrives.`:'We’ll contact you to confirm your InstaPay transfer.'}</p>
      </div>
      <div class="dew-success-address">
        <strong>Delivery details</strong>
        <p>${esc([customer.first,customer.last].filter(Boolean).join(' '))}<br>${esc(customer.address||'')}<br>${esc(o.area||'')}</p>
      </div>
      <div class="dew-success-actions">
        <button type="button" id="printOrderReceipt" class="btn ghost">Print receipt</button>
        <a class="btn red" href="./">Continue shopping</a>
      </div>
      <p class="dew-success-thanks">Thank you for choosing Dew.</p>
    </section>
  </div>`;
  $('#copyOrderNumber').onclick=async()=>{
    try{await navigator.clipboard.writeText(String(o.number||''));$('#copyOrderNumber').textContent='Copied';}
    catch{$('#copyOrderNumber').textContent=String(o.number||'');}
  };
  $('#printOrderReceipt').onclick=()=>window.print();
}
