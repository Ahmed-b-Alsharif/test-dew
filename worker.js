const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
};
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
};
const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers:{...cors,...SECURITY_HEADERS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean = v => String(v ?? "").trim();
const money = n => "EGP " + Number(n || 0).toLocaleString("en-US");
const ADMIN_ORIGINS=new Set(["https://ahmed-b-alsharif.github.io","https://dewskincaree.com","https://www.dewskincaree.com","capacitor://localhost"]);
const adminCors=request=>{const origin=request.headers.get("Origin")||"";return {...cors,...SECURITY_HEADERS,"Access-Control-Allow-Origin":ADMIN_ORIGINS.has(origin)?origin:"https://ahmed-b-alsharif.github.io","Access-Control-Allow-Headers":"Content-Type,Authorization","Vary":"Origin"}};
const adminJson=(request,data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...adminCors(request),"Content-Type":"application/json","Cache-Control":"no-store"}});
const ADMIN_SESSION_MS=12*60*60*1000, ADMIN_REPO="Ahmed-b-alsharif/test-dew";
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
async function digest(value){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))))}
async function consumeRateLimit(request,env,scope,limit,windowMs){
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS api_rate_limits (scope TEXT NOT NULL, ip_hash TEXT NOT NULL, window_start INTEGER NOT NULL, hits INTEGER NOT NULL, PRIMARY KEY(scope,ip_hash,window_start))").run();
 await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window ON api_rate_limits(window_start)").run();
 const ip=request.headers.get("CF-Connecting-IP")||"unknown",ipHash=await digest(ip),now=Date.now(),windowStart=Math.floor(now/windowMs)*windowMs;
 const row=await env.DB.prepare("INSERT INTO api_rate_limits (scope,ip_hash,window_start,hits) VALUES (?,?,?,1) ON CONFLICT(scope,ip_hash,window_start) DO UPDATE SET hits=hits+1 WHERE hits < ? RETURNING hits").bind(scope,ipHash,windowStart,limit).first();
 await env.DB.prepare("DELETE FROM api_rate_limits WHERE window_start < ?").bind(now-86400000).run();
 return !!row;
}
function randomToken(){const b=new Uint8Array(32);crypto.getRandomValues(b);return hex(b)}
function bearer(request){const h=request.headers.get("Authorization")||"";return h.startsWith("Bearer ")?h.slice(7):""}
async function ensureAdminTables(env){
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)").run();
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS admin_login_attempts (ip TEXT NOT NULL, attempted_at INTEGER NOT NULL)").run();
}
async function validAdminSession(request,env){
 const token=bearer(request);if(!token)return false;await ensureAdminTables(env);
 const row=await env.DB.prepare("SELECT token_hash FROM admin_sessions WHERE token_hash=? AND expires_at>?").bind(await digest(token),Date.now()).first();return !!row;
}
async function authorized(request,env){
 return await validAdminSession(request,env);
}
async function adminLogin(request,env){
 if(!env.ADMIN_USERNAME||!env.ADMIN_PASSWORD)return adminJson(request,{ok:false,error:"Admin login is not configured yet."},503);
 await ensureAdminTables(env);const ip=request.headers.get("CF-Connecting-IP")||"unknown",now=Date.now(),start=now-900000;
 await env.DB.prepare("DELETE FROM admin_login_attempts WHERE attempted_at<?").bind(start).run();
 const attempts=await env.DB.prepare("SELECT COUNT(*) AS count FROM admin_login_attempts WHERE ip=? AND attempted_at>?").bind(ip,start).first();
 if(Number(attempts?.count||0)>=8)return adminJson(request,{ok:false,error:"Too many sign-in attempts. Wait 15 minutes and try again."},429);
 const rawBody=await request.text();if(rawBody.length>4096)return adminJson(request,{ok:false,error:"Invalid sign-in request."},413);
 /** @type {Record<string, any>} */ let body={};try{body=JSON.parse(rawBody)}catch{}
 if(!body||typeof body!=="object"||Array.isArray(body)||String(body.username||"")!==env.ADMIN_USERNAME||String(body.password||"")!==env.ADMIN_PASSWORD){
  await env.DB.prepare("INSERT INTO admin_login_attempts (ip,attempted_at) VALUES (?,?)").bind(ip,now).run();
  return adminJson(request,{ok:false,error:"Incorrect username or password."},401);
 }
 await env.DB.prepare("DELETE FROM admin_login_attempts WHERE ip=?").bind(ip).run();
 const token=randomToken(),expires=now+ADMIN_SESSION_MS;
 await env.DB.prepare("INSERT INTO admin_sessions (token_hash,expires_at) VALUES (?,?)").bind(await digest(token),expires).run();
 return adminJson(request,{ok:true,token,expiresAt:expires});
}
async function adminLogout(request,env){
 const token=bearer(request);if(token){await ensureAdminTables(env);await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash=?").bind(await digest(token)).run()}
 return adminJson(request,{ok:true});
}
async function adminGithub(request,env){
 if(!await validAdminSession(request,env))return adminJson(request,{ok:false,error:"Unauthorized"},401);
 if(!env.GITHUB_TOKEN)return adminJson(request,{message:"GitHub access is not configured on the secure admin service."},503);
 const url=new URL(request.url),path=(url.searchParams.get("path")||"").split("?")[0];
 const imageFolder=path==="contents/images",imageFile=/^contents\/images\/[A-Za-z0-9._-]+$/.test(path),allowedPath=path==="contents/products.json"||path==="contents/sitemap.xml"||imageFolder||imageFile||/^contents\/[a-z0-9][a-z0-9-]{0,100}\/index\.html$/.test(path);if(!allowedPath||!(["GET","PUT"].includes(request.method)||(request.method==="DELETE"&&imageFile)))return adminJson(request,{message:"This admin operation is not allowed."},403);
 const headers={Authorization:"Bearer "+env.GITHUB_TOKEN,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"DewSkincareAdmin/1.0"};
 const apiUrl="https://api.github.com/repos/"+ADMIN_REPO+"/"+path;
 let response;
 if(imageFolder&&request.method==="GET"){
  response=await fetch(apiUrl,{headers:{...headers,"Cache-Control":"no-cache, no-store","Pragma":"no-cache"}});
  if(response.ok){const items=await response.json();const photos=Array.isArray(items)?items.filter(x=>x.type==="file"&&/\.(webp|png|jpe?g|gif|avif)$/i.test(x.name||"")).map(x=>({name:x.name,path:x.path,type:x.type,sha:x.sha})):[];return adminJson(request,photos);}
 }
 if(request.method==="PUT"&&(path==="contents/sitemap.xml"||/^contents\/[a-z0-9][a-z0-9-]{0,100}\/index\.html$/.test(path))){
  let payload;
  try{payload=JSON.parse(await request.text())}catch{return adminJson(request,{message:"Invalid sitemap update payload."},400)}
  for(let attempt=0;attempt<6;attempt++){
   const latest=await fetch(apiUrl,{headers:{...headers,"Cache-Control":"no-cache, no-store","Pragma":"no-cache"}});
   let latestData={};
   if(latest.ok)latestData=await latest.json();
   else if(latest.status!==404)return new Response(await latest.text(),{status:latest.status,headers:{...adminCors(request),"Content-Type":"application/json","Cache-Control":"no-store"}});
   const putBody={...payload};
   if(latestData.sha)putBody.sha=latestData.sha;else delete putBody.sha;
   response=await fetch(apiUrl,{method:"PUT",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify(putBody)});
   if(response.ok)return new Response(await response.text(),{status:response.status,headers:{...adminCors(request),"Content-Type":"application/json","Cache-Control":"no-store"}});
   if(![409,422].includes(response.status)||attempt===5)break;
   await new Promise(resolve=>setTimeout(resolve,200*(attempt+1)));
  }
 }else{
  const init = {method:request.method,headers,body:undefined};
  if(request.method==="GET"){headers["Cache-Control"]="no-cache, no-store";headers["Pragma"]="no-cache"}
  if(request.method==="PUT"){headers["Content-Type"]="application/json";init.body=await request.text()}
  if(request.method==="DELETE"){let payload;try{payload=await request.json()}catch{return adminJson(request,{message:"Image deletion requires its current file SHA."},400)}if(!payload.sha)return adminJson(request,{message:"Image deletion requires its current file SHA."},400);headers["Content-Type"]="application/json";init.body=JSON.stringify(payload)}
  response=await fetch(apiUrl,init);
 }
 return new Response(await response.text(),{status:response.status,headers:{...adminCors(request),"Content-Type":"application/json","Cache-Control":"no-store"}});
}
async function getProducts(env) {
  const url = new URL(env.STORE_PRODUCTS_URL || "https://ahmed-b-alsharif.github.io/test-dew/products.json");
  url.searchParams.set("_dew_refresh", String(Date.now()));
  const r = await fetch(url.toString(), {headers:{"Cache-Control":"no-cache, no-store","Pragma":"no-cache"}});
  if (!r.ok) throw new Error("Could not load the store catalogue");
  return r.json();
}
async function notifyTelegram(order, env, settings) {
  if (settings?.telegramEnabled && settings?.telegramProxyUrl) {
    if(!env.TELEGRAM_PROXY_SECRET)throw new Error("Telegram proxy secret is not configured");
    const response=await fetch(settings.telegramProxyUrl,{method:"POST",headers:{"Content-Type":"application/json","X-Dew-Proxy-Secret":env.TELEGRAM_PROXY_SECRET},body:JSON.stringify(order)});
    if(!response.ok) throw new Error("Telegram proxy returned an error");
    return;
  }
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const lines = order.lines.map(x => "• " + x.name + " × " + x.qty + " — " + money(x.total)).join("\n");
  const text = [
    "🛍️ New Dew Skincare order",
    "Order: " + order.number,
    "Customer: " + order.customer.first + " " + order.customer.last,
    "Phone: " + order.customer.phone,
    "Area: " + (order.area || order.areaName || order.areaId || "Not specified"),
    "Address: " + order.customer.address,
    ...(order.customer.note ? ["Customer note: " + order.customer.note] : []),
    "",
    lines,
    "",
    "Items: " + money(order.itemsTotal),
    "Delivery: " + money(order.delivery),
    "Discount: " + money(Number(order.discount||0)+Number(order.shippingDiscount||0)),
    "TOTAL: " + money(order.total),
    "Payment: " + (String(order.paymentMethod||"cod").toLowerCase()==="instapay" ? "InstaPay (awaiting payment)" : "Cash on delivery")
  ].join("\n");
  await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text})
  });
}
function cairoNowParts(date=new Date()){
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(date);
 return Object.fromEntries(parts.filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
}
function discountDateState(d,now=new Date()){
 const p=cairoNowParts(now),current=p.year+"-"+p.month+"-"+p.day+"T"+p.hour+":"+p.minute;
 const start=d.startsAt?d.startsAt+"T"+(d.startTime||"00:00"):"";
 const end=d.endsAt?d.endsAt+"T"+(d.endTime||"23:59"):"";
 return (!start||current>=start)&&(!end||current<=end);
}
function discountProductEligible(d,line,catalogue){
 const ids=Array.isArray(d.productIds)?d.productIds.map(String):[];
 const cids=Array.isArray(d.collectionIds)?d.collectionIds.map(String):[];
 if(d.scope!=="products"||(!ids.length&&!cids.length))return true;
 const product=(catalogue.products||[]).find(p=>String(p.id)===String(line.id));
 if(!product)return false;
 const productMatch=ids.includes(String(line.id));
 const collectionMatch=cids.some(cid=>String(product.catalog)===cid||(catalogue.catalogs||[]).some(c=>String(c.id)===cid&&(c.productIds||[]).map(String).includes(String(line.id))));
 return productMatch||collectionMatch;
}
function calculateDiscount(d,lines,itemsTotal,delivery,catalogue,customer,priorOrders,discountUses,customerDiscountUses){
 const fail=message=>({ok:false,error:message});
 if(!d||d.active===false)return fail("This discount is not active.");
 if(!discountDateState(d))return fail("This discount is not currently active.");
 if(d.method==="automatic"&&d.code)return fail("Invalid automatic discount configuration.");
 if(d.method!=="automatic"&&!clean(d.code))return fail("This discount code is not valid.");
 if(Number(d.minSpend||0)>itemsTotal)return fail("Minimum spend for this discount is "+money(d.minSpend)+".");
 if(Number(d.minQuantity||0)>lines.reduce((n,l)=>n+l.qty,0))return fail("Add more items to use this discount.");
 if(d.eligibility==="first_time"&&priorOrders>0)return fail("This offer is available to first-time customers only.");
 if(Number(d.usageLimit||0)>0&&discountUses>=Number(d.usageLimit))return fail("This discount has reached its usage limit.");
 if(d.onePerCustomer&&customerDiscountUses>0)return fail("This discount can only be used once per customer.");
 let amount=0,shipping=0,discountedLines=[];
 if(d.discountKind==="free_shipping"||d.type==="free_shipping"){
  if(Number(d.shippingLimit||0)>0&&delivery>Number(d.shippingLimit))return fail("This discount does not apply to this shipping rate.");
  shipping=delivery;
 } else if(d.discountKind==="buy_x_get_y"){
  const buyRule={...d,scope:(d.buyProductIds?.length||d.buyCollectionIds?.length)?"products":"all",productIds:d.buyProductIds||[],collectionIds:d.buyCollectionIds||[]};
  const getIds=Array.isArray(d.getProductIds)?d.getProductIds.map(String):[],getQty=Math.max(1,Number(d.getQuantity||1));
  const isBuyEligible=line=>discountProductEligible(buyRule,line,catalogue);
  const buys=lines.map((line,index)=>({line,index})).filter(x=>isBuyEligible(x.line)).sort((a,b)=>Number(getIds.includes(String(a.line.id)))-Number(getIds.includes(String(b.line.id))));
  const buyQty=buys.reduce((n,x)=>n+x.line.qty,0),buyAmount=buys.reduce((n,x)=>n+x.line.total,0),buyMode=d.buyMode||"quantity",requiredQty=Math.max(1,Number(d.buyQuantity||1)),requiredAmount=Number(d.buyAmount||0);
  const rewardBuyQty=buys.reduce((n,x)=>n+(!getIds.length||getIds.includes(String(x.line.id))?x.line.qty:0),0);
  const rewardOutsideBuyQty=lines.reduce((n,line)=>n+((!getIds.length||getIds.includes(String(line.id)))&&!isBuyEligible(line)?line.qty:0),0);
  const rewardQty=rewardBuyQty+rewardOutsideBuyQty,overlap=rewardBuyQty>0,groupPool=overlap?buyQty+rewardOutsideBuyQty:buyQty;
  const groups=buyMode==="amount"?Math.min(Math.floor(buyAmount/Math.max(1,requiredAmount)),Math.floor(rewardQty/getQty)):Math.min(Math.floor(groupPool/(requiredQty+getQty)),Math.floor(rewardQty/getQty));
  if(groups<1)return fail("Your cart does not meet the Buy X requirements or has no eligible reward product.");
  const buyUnitsToConsume=buyMode==="amount"?null:groups*requiredQty,buyAmountToConsume=buyMode==="amount"?groups*requiredAmount:0;
  const consumed=new Map();let qtySlots=buyUnitsToConsume,amountCounted=0;
  for(const item of buys){let take=0;for(let i=0;i<item.line.qty;i++){if(buyMode==="amount"?amountCounted>=buyAmountToConsume:qtySlots<=0)break;take++;amountCounted+=Number(item.line.unit||item.line.total/Math.max(1,item.line.qty));if(buyMode!=="amount")qtySlots--;}if(take)consumed.set(item.index,take);if(buyMode==="amount"?amountCounted>=buyAmountToConsume:qtySlots<=0)break;}
  const rewards=lines.flatMap((line,index)=>{const qty=Math.max(0,line.qty-(consumed.get(index)||0));return (!getIds.length||getIds.includes(String(line.id)))?Array.from({length:qty},(_,i)=>({id:line.id,unit:line.unit,key:line.id+":"+String(line.variantId||"")+":"+i})):[];}).sort((a,b)=>a.unit-b.unit);
  const maxUses=Number(d.maxUsesPerOrder||0),targetRewards=groups*getQty;
  let remaining=maxUses>0?Math.min(targetRewards,maxUses):targetRewards,rewardCount=0;
  for(const item of rewards){if(remaining<=0)break;const cut=d.getValue==="free"?item.unit:d.getValue==="percentage"?item.unit*Math.min(100,Number(d.getAmount||0))/100:Math.min(item.unit,Number(d.getAmount||0));amount+=cut;discountedLines.push(item.key);remaining--;rewardCount++;}
  if(!rewardCount)return fail("Add an eligible reward product to your cart.");
 } else {
  const eligible=d.discountKind==="amount_off_products"?lines.filter(l=>discountProductEligible(d,l,catalogue)):lines;
  const base=eligible.reduce((n,l)=>n+l.total,0);
  if(d.discountKind==="amount_off_products"&&d.scope==="products"&&!base)return fail("Your cart does not contain products eligible for this discount.");
  const kind=d.valueType||((d.type==="fixed")?"fixed":"percentage"),value=Math.max(0,Number(d.value||0));
  amount=kind==="fixed"?Math.min(base,value):Math.round(base*Math.min(100,value)/100);
 }
 return {ok:true,amount:Math.min(itemsTotal,Math.round(amount*100)/100),shipping:Math.min(delivery,shipping),discountedLines,kind:d.discountKind||d.type,title:d.title||d.code||"Discount"};
}


function inventoryCatalogItems(catalogue){
 const items=[];
 for(const p of catalogue.products||[]){
  if(Array.isArray(p.variants)&&p.variants.length){for(const v of p.variants)items.push({productId:String(p.id),variantId:String(v.id),stock:Math.max(0,Math.floor(Number(v.stock)||0))});}
  else items.push({productId:String(p.id),variantId:"",stock:Math.max(0,Math.floor(Number(p.stock)||0))});
 }
 return items;
}
async function ensureInventory(env,catalogue){
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS inventory (product_id TEXT NOT NULL, variant_id TEXT NOT NULL DEFAULT '', stock INTEGER NOT NULL CHECK(stock>=0), updated_at TEXT NOT NULL, PRIMARY KEY(product_id,variant_id))").run();
 const items=inventoryCatalogItems(catalogue);
 for(let i=0;i<items.length;i+=80){const batch=items.slice(i,i+80);await env.DB.batch(batch.map(x=>env.DB.prepare("INSERT OR IGNORE INTO inventory (product_id,variant_id,stock,updated_at) VALUES (?,?,?,?)").bind(x.productId,x.variantId,x.stock,new Date().toISOString())));}
}
async function readInventory(env,catalogue){
 await ensureInventory(env,catalogue);
 const result=await env.DB.prepare("SELECT product_id,variant_id,stock FROM inventory").all();
 return (result.results||[]).map(x=>({productId:x.product_id,variantId:x.variant_id,stock:Number(x.stock)}));
}
async function adminInventory(request,env){
 if(!await validAdminSession(request,env))return adminJson(request,{ok:false,error:"Unauthorized"},401);
 const catalogue=await getProducts(env);await ensureInventory(env,catalogue);
 if(request.method==="GET")return adminJson(request,{ok:true,items:await readInventory(env,catalogue)});
 const raw=await request.text();if(raw.length>32768)return adminJson(request,{ok:false,error:"Inventory update is too large."},413);
 let body={};try{body=JSON.parse(raw)}catch{return adminJson(request,{ok:false,error:"Invalid inventory update."},400)}
 if(!Array.isArray(body.items)||body.items.length>500)return adminJson(request,{ok:false,error:"Invalid inventory items."},400);
 const seen=new Set(),statements=[];
 for(const item of body.items){
  const productId=clean(item?.productId),variantId=clean(item?.variantId),stock=Number(item?.stock),key=productId+"::"+variantId;
  if(!productId||productId.length>128||variantId.length>128||seen.has(key)||!Number.isSafeInteger(stock)||stock<0||stock>1000000)return adminJson(request,{ok:false,error:"One or more inventory values are invalid. Refresh the admin page and try again."},400);
  seen.add(key);statements.push(env.DB.prepare("INSERT INTO inventory (product_id,variant_id,stock,updated_at) VALUES (?,?,?,?) ON CONFLICT(product_id,variant_id) DO UPDATE SET stock=excluded.stock,updated_at=excluded.updated_at").bind(productId,variantId,stock,new Date().toISOString()));
 }
 for(let i=0;i<statements.length;i+=80)await env.DB.batch(statements.slice(i,i+80));
 return adminJson(request,{ok:true,items:await readInventory(env,catalogue)});
}
async function publicInventory(env){
 const catalogue=await getProducts(env);return json({ok:true,items:await readInventory(env,catalogue)});
}

async function createOrder(request, env) {
  const rawBody=await request.text();
  if(rawBody.length>32768)return json({ok:false,error:"Your order is too large. Please remove some items and try again."},413);
  /** @type {Record<string, any>} */ let body={};try{body=JSON.parse(rawBody)}catch{return json({ok:false,error:"Invalid order request. Please refresh and try again."},400)}

  if(!body||typeof body!=="object"||Array.isArray(body))return json({ok:false,error:"Invalid order request. Please refresh and try again."},400);
  const customer = body.customer || {};
  const first=clean(customer.first), last=clean(customer.last), phone=clean(customer.phone), address=clean(customer.address), note=clean(customer.note).slice(0,500);
  if (!first || !last || phone.replace(/\D/g,"").length < 8 || address.length < 6) return json({ok:false,error:"Please check your delivery details."},400);
  const catalogue=await getProducts(env);
  await ensureInventory(env,catalogue);
  const settings=catalogue.settings||{};
  const deliveryAreas=Array.isArray(settings.deliveryAreas)?settings.deliveryAreas:[
    {id:"cairo",name:"Cairo & Giza",fee:Number(settings.deliveryCairo||0),enabled:true},
    {id:"alex",name:"Alexandria",fee:Number(settings.deliveryAlex||0),enabled:true}
  ];
  const requestedAreaId=clean(body.area);
  const requestedAreaName=clean(body.areaName).toLocaleLowerCase();
  const selectedArea=deliveryAreas.find(x=>x.enabled!==false&&String(x.id??"").trim()===requestedAreaId)
    || deliveryAreas.find(x=>x.enabled!==false&&requestedAreaName&&clean(x.name).toLocaleLowerCase()===requestedAreaName);
  if (!selectedArea) return json({ok:false,error:"Choose a valid delivery area."},400);
  const paymentMethod=String(body.paymentMethod||"cod").toLowerCase();
  const paymentSettings=settings;
  if (!["cod","instapay"].includes(paymentMethod)) return json({ok:false,error:"Choose a valid payment method."},400);
  if (paymentMethod==="cod" && paymentSettings.codEnabled===false) return json({ok:false,error:"Cash on Delivery is currently unavailable."},400);
  if (paymentMethod==="instapay" && (paymentSettings.instapayEnabled===false || !clean(paymentSettings.instapayNumber))) return json({ok:false,error:"InstaPay is currently unavailable."},400);
  if (!Array.isArray(body.lines) || !body.lines.length) return json({ok:false,error:"Your cart is empty."},400);
  if (body.lines.length>40) return json({ok:false,error:"Your cart has too many separate items. Please review it and try again."},400);
  const products=(catalogue.products||[]).filter(p=>p.visible);
  const aggregatedItems=new Map();
  for(const item of body.lines){
    if(!item||typeof item!=="object")return json({ok:false,error:"One of the products is invalid. Please refresh your cart."},409);
    const id=clean(item.id),variantId=clean(item.variantId),qty=Number(item.qty);
    if(!id||!Number.isSafeInteger(qty)||qty<1||qty>99)return json({ok:false,error:"One of the product quantities is invalid. Please update your cart."},409);
    const key=JSON.stringify([id,variantId]);
    const existing=aggregatedItems.get(key)||{id,variantId,qty:0};
    existing.qty+=qty;
    if(existing.qty>99)return json({ok:false,error:"The quantity for one product is too high. Please update your cart."},409);
    aggregatedItems.set(key,existing);
  }
  const lines=[];
  for(const item of aggregatedItems.values()){
    const p=products.find(x=>String(x.id)===item.id);
    const variant=p?.variants?.find(v=>String(v.id)===item.variantId);
    const hasVariants=Array.isArray(p?.variants)&&p.variants.length>0;
    const qty=item.qty;
    if(!p||(hasVariants&&!variant)||(!hasVariants&&item.variantId))return json({ok:false,error:"One of the products or selected options is unavailable. Please refresh your cart."},409);
    const stockRow=await env.DB.prepare("SELECT stock FROM inventory WHERE product_id=? AND variant_id=?").bind(String(p.id),variant?String(variant.id):"").first();
    const stock=Number(stockRow?.stock);
    if(!Number.isSafeInteger(stock)||qty>stock)return json({ok:false,error:"The selected option does not have enough stock. Please update your cart."},409);
    const basePrice=variant?Number(variant.price||0):Number(p.price||0);
    const salePrice=variant?Number(variant.salePrice||0):Number(p.salePrice||0);
    const unit=salePrice>0&&salePrice<basePrice?salePrice:basePrice;
    const variantLabel=variant?" · "+Object.values(variant.options||{}).join(" / "):"";
    lines.push({id:p.id,variantId:variant?.id||null,options:variant?.options||{},name:p.name+variantLabel,qty,unit,total:unit*qty});
  }
  const itemsTotal=lines.reduce((n,l)=>n+l.total,0);
  if (itemsTotal < Number(settings.minOrder||0)) return json({ok:false,error:"Minimum order is " + money(settings.minOrder) + "."},400);
  let delivery=Math.max(0,Number(selectedArea.fee)||0);
  const code=clean(body.promoCode).toUpperCase();
  const customerPhone=phone.replace(/\D/g,"");
  const priorRows=await env.DB.prepare("SELECT order_json FROM orders").all();
  const priorOrderList=(priorRows.results||[]).map(row=>{try{return JSON.parse(row.order_json)}catch{return null}}).filter(Boolean);
  const priorOrders=priorOrderList.filter(o=>String(o.customer?.phone||"").replace(/\D/g,"")===customerPhone).length;
  const discounts=Array.isArray(catalogue.discounts)?catalogue.discounts:[];
  let promo=code?discounts.find(d=>d.active&&d.method!=="automatic"&&String(d.code||"").toUpperCase()===code):null;
  if(code&&!promo)return json({ok:false,error:"That discount code is invalid or inactive."},400);
  if(!promo){const offer=settings.offer||{};const cairoDay=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());const offerLive=offer.show!==false&&offer.active!==false&&(!offer.startDate||cairoDay>=offer.startDate)&&(!offer.endDate||cairoDay<=offer.endDate);const selected=offerLive&&offer.type==="automatic"?discounts.find(d=>String(d.id)===String(offer.automaticDiscountId)&&d.active&&d.method==="automatic"&&discountDateState(d)):null;promo=selected||discounts.find(d=>d.active&&d.method==="automatic"&&discountDateState(d));}
  let discount=0,shippingDiscount=0,promoCode=null,discountInfo=null;
  if(promo){
    const usedThisDiscount=o=>(!!promo.id&&String(o.discountInfo?.id||"")===String(promo.id))||(!!promo.code&&String(o.promoCode||"").toUpperCase()===String(promo.code).toUpperCase());
    const discountUses=priorOrderList.filter(usedThisDiscount).length;
    const customerDiscountUses=priorOrderList.filter(o=>String(o.customer?.phone||"").replace(/\D/g,"")===customerPhone&&usedThisDiscount(o)).length;
    const result=calculateDiscount(promo,lines,itemsTotal,delivery,catalogue,{first,last,phone},priorOrders,discountUses,customerDiscountUses);
    if(!result.ok){
      if(promo.method==="automatic")promo=null;
      else return json({ok:false,error:result.error},400);
    }else{
      discount=result.amount;
      shippingDiscount=result.shipping;
      delivery=Math.max(0,delivery-shippingDiscount);
      promoCode=promo.method==="automatic"?"":promo.code;
      discountInfo={id:promo.id||"",title:result.title,kind:result.kind,method:promo.method||"code",discountedLines:result.discountedLines||[]};
    }
  }
  const total=Math.max(0,Math.round((itemsTotal+delivery-discount)*100)/100);
  const now=new Date();
  // Stock deduction, order numbering and order creation are one atomic D1 batch.
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS order_counter (id INTEGER PRIMARY KEY CHECK (id = 1), last_number INTEGER NOT NULL)").run();
  await env.DB.prepare("INSERT OR IGNORE INTO order_counter (id, last_number) VALUES (1, 999)").run();
  // A CHECK constraint deliberately aborts the whole D1 batch if any stock update fails.
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS inventory_abort (id INTEGER PRIMARY KEY CHECK (id = 0))").run();
  const order={
    number:"__DEW_ORDER_NUMBER__",date:now.toISOString(),status:"Pending",paymentMethod,paymentStatus:paymentMethod==="instapay"?"Awaiting InstaPay payment":"Unpaid (COD)",fulfillmentStatus:"Pending",trackingNumber:"",
    lines,itemsTotal,delivery,discount,shippingDiscount,promoCode,discountInfo,total,area:selectedArea.name,areaId:selectedArea.id,
    customer:{first,last,phone,address,note}
  };
  const statements=[];
  for(const line of lines){
    statements.push(env.DB.prepare("UPDATE inventory SET stock=stock-?,updated_at=? WHERE product_id=? AND variant_id=? AND stock>=?")
      .bind(line.qty,now.toISOString(),String(line.id),String(line.variantId||""),line.qty));
    statements.push(env.DB.prepare("INSERT INTO inventory_abort (id) SELECT 1 WHERE changes()=0"));
  }
  statements.push(env.DB.prepare("UPDATE order_counter SET last_number=last_number+1 WHERE id=1"));
  statements.push(env.DB.prepare("INSERT INTO orders (order_number,created_at,total,order_json) SELECT 'DEW#'||last_number,?,?,json_set(?, '$.number', 'DEW#'||last_number) FROM order_counter WHERE id=1 RETURNING order_number,order_json")
    .bind(order.date,total,JSON.stringify(order)));
  let transactionResults;try{transactionResults=await env.DB.batch(statements);}catch(e){
    console.error("Atomic stock/order transaction failed",e);
    return json({ok:false,error:"One or more items were just purchased or no longer have enough stock. Please refresh your cart and try again."},409);
  }
  const inserted=transactionResults?.[transactionResults.length-1]?.results?.[0];
  if(!inserted?.order_number)return json({ok:false,error:"The order could not be confirmed. Please contact Dew before placing it again."},500);
  const number=inserted.order_number;order.number=number;
  try { await notifyTelegram(order,env,settings); } catch(e) { console.error("Telegram notification failed",e); }
  return json({ok:true,order},201);
}


async function createWelcomeLead(request,env){
 const origin=request.headers.get("Origin")||"";if(origin&&!ADMIN_ORIGINS.has(origin))return json({ok:false,error:"Origin not allowed."},403);
 const rawBody=await request.text();if(rawBody.length>4096)return json({ok:false,error:"Please enter your name and phone number."},413);
 /** @type {Record<string, any>} */ let body={};try{body=JSON.parse(rawBody)}catch{return json({ok:false,error:"Please enter your name and phone number."},400)}
 if(!body||typeof body!=="object"||Array.isArray(body))return json({ok:false,error:"Please enter your name and phone number."},400);
 const name=clean(body.name).slice(0,80);let digits=clean(body.phone).replace(/\D/g,"");
 if(digits.startsWith("0020"))digits="0"+digits.slice(4);else if(digits.startsWith("20")&&digits.length===12)digits="0"+digits.slice(2);
 if(!name||!/^01[0125]\d{8}$/.test(digits))return json({ok:false,error:"Please enter a valid Egyptian mobile number."},400);
 const now=new Date().toISOString();
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS welcome_leads (phone TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, offer_title TEXT NOT NULL DEFAULT '', offer_type TEXT NOT NULL DEFAULT 'promo_code')").run();
 await env.DB.prepare("INSERT INTO welcome_leads (phone,name,created_at,updated_at,offer_title,offer_type) VALUES (?,?,?,?,?,?) ON CONFLICT(phone) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at,offer_title=excluded.offer_title,offer_type=excluded.offer_type").bind(digits,name,now,now,clean(body.offerTitle).slice(0,120),body.offerType==="automatic"?"automatic":"promo_code").run();
 return json({ok:true});
}
async function getWelcomeLeads(request,env){
 if(!await validAdminSession(request,env))return adminJson(request,{ok:false,error:"Unauthorized"},401);
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS welcome_leads (phone TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, offer_title TEXT NOT NULL DEFAULT '', offer_type TEXT NOT NULL DEFAULT 'promo_code')").run();
 const result=await env.DB.prepare("SELECT phone,name,created_at,updated_at,offer_title,offer_type FROM welcome_leads ORDER BY updated_at DESC").all();
 return adminJson(request,{ok:true,leads:result.results||[]});
}
async function getInstagramRecent(request, env) {
  const token = clean(env.INSTAGRAM_ACCESS_TOKEN);
  if (!token) return json({ok:false,error:"Instagram access is not configured on the Worker."},503);
  const accountId = "17841447682116140";
  const endpoint = new URL("https://graph.facebook.com/v27.0/" + accountId + "/media");
  endpoint.searchParams.set("fields","id,caption,media_type,media_product_type,media_url,permalink,thumbnail_url,timestamp");
  const requestedLimit = Number(new URLSearchParams(new URL(request.url).search).get("limit")) || 3;
  const postLimit = Math.max(1,Math.min(25,Math.floor(requestedLimit)));
  endpoint.searchParams.set("limit",String(postLimit));
  const response = await fetch(endpoint.toString(), {
    method:"GET",
    headers:{Authorization:"Bearer " + token,"Accept":"application/json"}
  });
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok || payload.error) {
    const error = payload.error || {};
    console.error("Instagram Graph API request failed", {status:response.status,code:error.code,subcode:error.error_subcode});
    return json({
      ok:false,
      error:"Instagram could not return posts. Check the Worker token and Instagram account permissions.",
      metaCode:error.code ?? null,
      metaSubcode:error.error_subcode ?? null
    },502);
  }
  const posts = Array.isArray(payload.data) ? payload.data.slice(0,postLimit).map(post => ({
    id:post.id || "",
    caption:post.caption || "",
    mediaType:post.media_type || "",
    mediaProductType:post.media_product_type || "",
    mediaUrl:post.media_url || "",
    thumbnailUrl:post.thumbnail_url || "",
    permalink:post.permalink || "",
    timestamp:post.timestamp || ""
  })) : [];
  return json({ok:true,username:"dew_skincaree",posts});
}

export default {
  async fetch(request,env) {
    if (request.method==="OPTIONS") return new Response(null,{status:204,headers:{...cors,...SECURITY_HEADERS}});
    const url=new URL(request.url), path=url.pathname.replace(/\/$/,"");
    try {
      if (path==="/api/health" && request.method==="GET") return json({ok:true,service:"Dew Orders API"});
      if (path==="/api/inventory" && request.method==="GET") return await publicInventory(env);
      if (path==="/api/admin/inventory" && ["GET","PUT"].includes(request.method)) {
        const origin=request.headers.get("Origin")||"";
        if(origin&&!ADMIN_ORIGINS.has(origin))return adminJson(request,{ok:false,error:"Origin not allowed."},403);
        return await adminInventory(request,env);
      }
      if (path==="/api/welcome-leads" && request.method==="POST") {
        if(!await consumeRateLimit(request,env,"welcome-leads",20,60*60*1000))return json({ok:false,error:"Too many attempts. Please try again later."},429);
        return await createWelcomeLead(request,env);
      }
      if (path==="/api/admin/welcome-leads" && request.method==="GET") return await getWelcomeLeads(request,env);
      if (path==="/api/instagram/recent" && request.method==="GET") return await getInstagramRecent(request, env);
      if(path==="/api/admin/login"&&request.method==="POST"){const origin=request.headers.get("Origin")||"";if(origin&&!ADMIN_ORIGINS.has(origin))return adminJson(request,{ok:false,error:"Origin not allowed."},403);return await adminLogin(request,env)}
      if(path==="/api/admin/session"&&request.method==="GET")return adminJson(request,{ok:await validAdminSession(request,env)});
      if(path==="/api/admin/logout"&&request.method==="POST")return await adminLogout(request,env);
      if(path==="/api/admin/github"&&["GET","PUT","DELETE"].includes(request.method)){const origin=request.headers.get("Origin")||"";if(origin&&!ADMIN_ORIGINS.has(origin))return adminJson(request,{ok:false,error:"Origin not allowed."},403);return await adminGithub(request,env)}
      if (path==="/api/orders" && request.method==="POST") {
        const origin=request.headers.get("Origin")||"";
        if(origin&&!ADMIN_ORIGINS.has(origin))return json({ok:false,error:"Origin not allowed."},403);
        if(!await consumeRateLimit(request,env,"orders",20,15*60*1000))return json({ok:false,error:"Too many order attempts. Please wait a little and try again."},429);
        return await createOrder(request,env);
      }
      if (path==="/api/orders" && request.method==="GET") {
        if (!await authorized(request,env)) return json({ok:false,error:"Unauthorized"},401);
        const result=await env.DB.prepare("SELECT order_json FROM orders ORDER BY created_at DESC").all();
        return json({ok:true,orders:(result.results||[]).map(r=>JSON.parse(r.order_json))});
      }
      if (path==="/api/orders" && request.method==="PUT") {
        if (!await authorized(request,env)) return json({ok:false,error:"Unauthorized"},401);
        const body=await request.json(), orders=Array.isArray(body.orders)?body.orders:[];
        for (const o of orders) {
          if (!o.number) continue;
          const result=await env.DB.prepare("SELECT order_json FROM orders WHERE order_number=?").bind(o.number).first();
          if (!result) continue;
          const previous=JSON.parse(result.order_json);
          const updated={...previous,paymentStatus:o.paymentStatus||previous.paymentStatus,fulfillmentStatus:o.fulfillmentStatus||previous.fulfillmentStatus,trackingNumber:o.trackingNumber??previous.trackingNumber,note:o.note??previous.note??""};
          await env.DB.prepare("UPDATE orders SET order_json=? WHERE order_number=?").bind(JSON.stringify(updated),o.number).run();
        }
        return json({ok:true});
      }
      if (path.startsWith("/api/orders/") && request.method==="DELETE") {
        if (!await authorized(request,env)) return json({ok:false,error:"Unauthorized"},401);
        const number=decodeURIComponent(path.slice("/api/orders/".length));
        await env.DB.prepare("DELETE FROM orders WHERE order_number=?").bind(number).run();
        return json({ok:true});
      }
      return json({ok:false,error:"Not found"},404);
    } catch(e) {
      console.error(e);
      return json({ok:false,error:"Order service error. Please try again or contact the store."},500);
    }
  }
};
