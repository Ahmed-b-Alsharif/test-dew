const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
};
const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers:{...cors,"Content-Type":"application/json"}});
const clean = v => String(v ?? "").trim();
const money = n => "EGP " + Number(n || 0).toLocaleString("en-US");
function authorized(request, env) {
  const h = request.headers.get("Authorization") || "";
  return !!env.ADMIN_TOKEN && h === "Bearer " + env.ADMIN_TOKEN;
}
async function getProducts(env) {
  const url = env.STORE_PRODUCTS_URL || "https://ahmed-b-alsharif.github.io/test-dew/products.json";
  const r = await fetch(url, {headers:{"Cache-Control":"no-cache"}});
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
    "Area: " + (order.area === "alex" ? "Alexandria" : "Cairo & Giza"),
    "Address: " + order.customer.address,
    "",
    lines,
    "",
    "Items: " + money(order.itemsTotal),
    "Delivery: " + money(order.delivery),
    "Discount: " + money(order.discount),
    "TOTAL: " + money(order.total),
    "Payment: Cash on delivery"
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
  if (!["cairo","alex"].includes(body.area)) return json({ok:false,error:"Choose a valid delivery area."},400);
  if (!Array.isArray(body.lines) || !body.lines.length) return json({ok:false,error:"Your cart is empty."},400);
  const catalogue=await getProducts(env);
  const products=(catalogue.products||[]).filter(p=>p.visible);
  const lines=[];
  for (const item of body.lines) {
    const p=products.find(x=>String(x.id)===String(item.id));
    const qty=Math.floor(Number(item.qty));
    if (!p || !Number.isFinite(qty) || qty<1 || qty>Number(p.stock||0)) return json({ok:false,error:"One of the products is unavailable or has insufficient stock. Please refresh your cart."},409);
    const unit=Number(p.salePrice)>0 && Number(p.salePrice)<Number(p.price) ? Number(p.salePrice) : Number(p.price);
    lines.push({id:p.id,name:p.name,qty,unit,total:unit*qty});
  }
  const itemsTotal=lines.reduce((n,l)=>n+l.total,0);
  const settings=catalogue.settings||{};
  if (itemsTotal < Number(settings.minOrder||0)) return json({ok:false,error:"Minimum order is " + money(settings.minOrder) + "."},400);
  let delivery=body.area==="alex"?Number(settings.deliveryAlex||0):Number(settings.deliveryCairo||0);
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
    number,date:now.toISOString(),status:"Pending",paymentStatus:"Unpaid (COD)",fulfillmentStatus:"Pending",trackingNumber:"",
    lines,itemsTotal,delivery,discount,promoCode,total,area:body.area,
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
      if (path==="/api/orders" && request.method==="POST") return await createOrder(request,env);
      if (path==="/api/orders" && request.method==="GET") {
        if (!authorized(request,env)) return json({ok:false,error:"Unauthorized"},401);
        const result=await env.DB.prepare("SELECT order_json FROM orders ORDER BY created_at DESC").all();
        return json({ok:true,orders:(result.results||[]).map(r=>JSON.parse(r.order_json))});
      }
      if (path==="/api/orders" && request.method==="PUT") {
        if (!authorized(request,env)) return json({ok:false,error:"Unauthorized"},401);
        const body=await request.json(), orders=Array.isArray(body.orders)?body.orders:[];
        for (const o of orders) {
          if (!o.number) continue;
          const result=await env.DB.prepare("SELECT order_json FROM orders WHERE order_number=?").bind(o.number).first();
          if (!result) continue;
          const previous=JSON.parse(result.order_json);
          const updated={...previous,paymentStatus:o.paymentStatus||previous.paymentStatus,fulfillmentStatus:o.fulfillmentStatus||previous.fulfillmentStatus,trackingNumber:o.trackingNumber??previous.trackingNumber};
          await env.DB.prepare("UPDATE orders SET order_json=? WHERE order_number=?").bind(JSON.stringify(updated),o.number).run();
        }
        return json({ok:true});
      }
      if (path.startsWith("/api/orders/") && request.method==="DELETE") {
        if (!authorized(request,env)) return json({ok:false,error:"Unauthorized"},401);
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
