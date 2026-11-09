const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
};
const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean = v => String(v ?? "").trim();
const money = n => "EGP " + Number(n || 0).toLocaleString("en-US");
const ADMIN_ORIGINS=new Set(["https://ahmed-b-alsharif.github.io","https://dewskincaree.com","https://www.dewskincaree.com"]);
const adminCors=request=>{const origin=request.headers.get("Origin")||"";return {...cors,"Access-Control-Allow-Origin":ADMIN_ORIGINS.has(origin)?origin:"https://ahmed-b-alsharif.github.io","Access-Control-Allow-Headers":"Content-Type,Authorization","Vary":"Origin"}};
const adminJson=(request,data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...adminCors(request),"Content-Type":"application/json","Cache-Control":"no-store"}});
const ADMIN_SESSION_MS=12*60*60*1000, ADMIN_REPO="Ahmed-b-alsharif/test-dew";
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
async function digest(value){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))))}
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
 let body={};try{body=await request.json()}catch{}
 if(String(body.username||"")!==env.ADMIN_USERNAME||String(body.password||"")!==env.ADMIN_PASSWORD){
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
 if(!(path==="contents/products.json"||path==="contents/sitemap.xml"||/^contents\/images\/[A-Za-z0-9._-]+$/.test(path))||!["GET","PUT"].includes(request.method))return adminJson(request,{message:"This admin operation is not allowed."},403);
 const headers={Authorization:"Bearer "+env.GITHUB_TOKEN,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"DewSkincareAdmin/1.0"},init={method:request.method,headers};
 if(request.method==="PUT"){headers["Content-Type"]="application/json";init.body=await request.text()}
 const response=await fetch("https://api.github.com/repos/"+ADMIN_REPO+"/"+path,init);
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
    const response=await fetch(settings.telegramProxyUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(order)});
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
    "",
    lines,
    "",
    "Items: " + money(order.itemsTotal),
    "Delivery: " + money(order.delivery),
    "Discount: " + money(order.discount),
    "TOTAL: " + money(order.total),
    "Payment: " + (String(order.paymentMethod||"cod").toLowerCase()==="instapay" ? "InstaPay (awaiting payment)" : "Cash on delivery")
  ].join("\n");
  await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text})
  });
}
async function createOrder(request, env) {
  const body = await request.json();
  const customer = body.customer || {};
  const first=clean(customer.first), last=clean(customer.last), phone=clean(customer.phone), address=clean(customer.address);
  if (!first || !last || phone.replace(/\D/g,"").length < 8 || address.length < 6) return json({ok:false,error:"Please check your delivery details."},400);
  const catalogue=await getProducts(env);
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
  const products=(catalogue.products||[]).filter(p=>p.visible);
  const lines=[];
  for (const item of body.lines) {
    const p=products.find(x=>String(x.id)===String(item.id));
    const variant=p?.variants?.find(v=>String(v.id)===String(item.variantId||""));
    const hasVariants=Array.isArray(p?.variants)&&p.variants.length>0;
    const qty=Math.floor(Number(item.qty));
    if (!p || (hasVariants&&!variant) || !Number.isFinite(qty) || qty<1) return json({ok:false,error:"One of the products or selected options is unavailable. Please refresh your cart."},409);
    const stock=variant?Number(variant.stock||0):Number(p.stock||0);
    if(qty>stock)return json({ok:false,error:"The selected option does not have enough stock. Please update your cart."},409);
    const basePrice=variant?Number(variant.price||0):Number(p.price||0);
    const salePrice=variant?Number(variant.salePrice||0):Number(p.salePrice||0);
    const unit=salePrice>0&&salePrice<basePrice?salePrice:basePrice;
    const variantLabel=variant?" · "+Object.values(variant.options||{}).join(" / "):"";
    lines.push({id:p.id,variantId:variant?.id||null,options:variant?.options||{},name:p.name+variantLabel,qty,unit,total:unit*qty});
  }
  const itemsTotal=lines.reduce((n,l)=>n+l.total,0);
  if (itemsTotal < Number(settings.minOrder||0)) return json({ok:false,error:"Minimum order is " + money(settings.minOrder) + "."},400);
  let delivery=Math.max(0,Number(selectedArea.fee)||0);
  let discount=0, promoCode=null;
  const code=clean(body.promoCode).toUpperCase();
  if (code) {
    const promo=(catalogue.discounts||[]).find(d=>d.active && String(d.code).toUpperCase()===code);
    if (!promo || (Number(promo.minSpend||0)>itemsTotal)) return json({ok:false,error:"That discount code is no longer valid."},400);
    promoCode=promo.code;
    if (promo.type==="percentage") discount=Math.round(itemsTotal*Number(promo.value||0)/100);
    else if (promo.type==="fixed") discount=Math.min(itemsTotal,Number(promo.value||0));
    else if (promo.type==="free_shipping") { discount=delivery; delivery=0; }
  }
  const total=Math.max(0,itemsTotal+delivery-(promoCode && (catalogue.discounts||[]).find(d=>d.code===promoCode)?.type==="free_shipping"?0:discount));
  const now=new Date();
  // Generate short, sequential Dew order numbers: DEW#1000, DEW#1001, ...
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS order_counter (id INTEGER PRIMARY KEY CHECK (id = 1), last_number INTEGER NOT NULL)").run();
  await env.DB.prepare("INSERT OR IGNORE INTO order_counter (id, last_number) VALUES (1, 999)").run();
  const sequence = await env.DB.prepare("UPDATE order_counter SET last_number = last_number + 1 WHERE id = 1 RETURNING last_number").first();
  const number = "DEW#" + sequence.last_number;
  const order={
    number,date:now.toISOString(),status:"Pending",paymentMethod,paymentStatus:paymentMethod==="instapay"?"Awaiting InstaPay payment":"Unpaid (COD)",fulfillmentStatus:"Pending",trackingNumber:"",
    lines,itemsTotal,delivery,discount,promoCode,total,area:selectedArea.name,areaId:selectedArea.id,
    customer:{first,last,phone,address}
  };
  await env.DB.prepare("INSERT INTO orders (order_number, created_at, total, order_json) VALUES (?, ?, ?, ?)")
    .bind(number,order.date,total,JSON.stringify(order)).run();
  try { await notifyTelegram(order,env,settings); } catch(e) { console.error("Telegram notification failed",e); }
  return json({ok:true,order},201);
}
export default {
  async fetch(request,env) {
    if (request.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
    const url=new URL(request.url), path=url.pathname.replace(/\/$/,"");
    try {
      if (path==="/api/health" && request.method==="GET") return json({ok:true,service:"Dew Orders API"});
      if(path==="/api/admin/login"&&request.method==="POST"){const origin=request.headers.get("Origin")||"";if(origin&&!ADMIN_ORIGINS.has(origin))return adminJson(request,{ok:false,error:"Origin not allowed."},403);return await adminLogin(request,env)}
      if(path==="/api/admin/session"&&request.method==="GET")return adminJson(request,{ok:await validAdminSession(request,env)});
      if(path==="/api/admin/logout"&&request.method==="POST")return await adminLogout(request,env);
      if(path==="/api/admin/github"&&["GET","PUT"].includes(request.method)){const origin=request.headers.get("Origin")||"";if(origin&&!ADMIN_ORIGINS.has(origin))return adminJson(request,{ok:false,error:"Origin not allowed."},403);return await adminGithub(request,env)}
      if (path==="/api/orders" && request.method==="POST") return await createOrder(request,env);
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
