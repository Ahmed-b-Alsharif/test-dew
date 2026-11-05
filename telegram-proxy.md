# Telegram Notification Proxy Setup

To send instant order notifications to your phone via Telegram safely, you need a "proxy". 

## What is a Telegram Proxy and why do you need it?
Your store runs on **GitHub Pages**, which is a static website. Anything on a static website can be viewed by anyone using "View Page Source" in their browser. 

If you put your Telegram Bot Token directly inside your website's code, **anyone could steal your token** and control your Telegram bot.

A **Proxy** is a tiny, free serverless function that sits between your store and Telegram:
1. When a customer places an order, your storefront sends the order details to the proxy URL.
2. The proxy attaches your secret Telegram Token (which is safely hidden inside the proxy's private settings).
3. The proxy forwards the message to your Telegram app on your phone.

---

## Step 1: Create your Telegram Bot & Chat ID

1. Open Telegram and search for **@BotFather**.
2. Send `/newbot`, follow the prompts, and choose a name for your bot.
3. BotFather will give you an **API Token** (looks like `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`). Save this!
4. Search for **@userinfobot** on Telegram, send a message, and it will give you your **Id** (a number like `123456789`). Save this!
5. Start a chat with your new bot on Telegram and press **Start**.

---

## Step 2: Deploy the Free Proxy on Vercel (Takes 2 minutes)

1. Go to [vercel.com](https://vercel.com) and sign up for a free account.
2. Create a folder on your computer named `dew-telegram-proxy`.
3. Inside `dew-telegram-proxy`, create a folder named `api`.
4. Inside `api`, create a file named `telegram.js` and paste the following code:

```javascript
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const order = req.body;
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!BOT_TOKEN || !CHAT_ID) {
      return res.status(500).json({ error: 'Missing environment variables on proxy' });
    }

    const c = order.customer || {};
    const lines = (order.lines || []).map(l => `• ${l.qty}x ${l.name} - EGP ${l.total}`).join('\n');
    
    const msg = `🛍️ *New Order!* (${order.number})\n\n` +
      `*Items:*\n${lines}\n\n` +
      `*Items Total:* EGP ${order.itemsTotal}\n` +
      `*Delivery:* EGP ${order.delivery}\n` +
      `*Total:* EGP ${order.total} (COD)\n\n` +
      `*Customer Details:*\n` +
      `👤 *Name:* ${c.first || ''} ${c.last || ''}\n` +
      `📞 *Phone:* ${c.phone || ''}\n` +
      `💬 *WhatsApp:* ${c.whatsapp || ''}\n` +
      `📍 *Area:* ${order.area === 'alex' ? 'Alexandria' : 'Cairo & Giza'}\n` +
      `🏠 *Address:* ${c.address || ''}`;

    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: msg, parse_mode: 'Markdown' })
    });

    const data = await tgRes.json();
    if (!tgRes.ok) return res.status(500).json({ error: data.description });

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
```

5. Deploy it to Vercel:
   - Import the project into Vercel.
   - Go to **Project Settings > Environment Variables**.
   - Add `TELEGRAM_BOT_TOKEN` with your bot token from @BotFather.
   - Add `TELEGRAM_CHAT_ID` with your ID from @userinfobot.
   - Copy your deployed URL (e.g. `https://dew-telegram-proxy.vercel.app/api/telegram`).

---

## Step 3: Link Proxy to Your Store Admin

1. Open your shop's **Admin Panel**.
2. Click **Store settings**.
3. Under **Telegram Notifications**:
   - Check **Enable Telegram order notifications**.
   - Paste your Vercel URL (e.g., `https://dew-telegram-proxy.vercel.app/api/telegram`).
4. Click **Save settings**.

Now, whenever a customer places an order, you will instantly receive a full order notification on your Telegram app!
