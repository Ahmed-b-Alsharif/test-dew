# Dew orders backend (free Cloudflare setup)

This adds persistent orders for the Shopify-style Admin > Orders page. GitHub Pages is static and cannot securely store customer orders by itself.

## Free service limits
Cloudflare Workers Free includes 100,000 requests/day. D1 Free includes 5 million rows read/day, 100,000 rows written/day, and 5 GB total storage. These are free-tier limits; exceeding them can require waiting for the daily reset or upgrading. See Cloudflare's current limits and pricing:
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/platform/pricing/

## Setup (no server/VM required)
1. Create a free Cloudflare account at https://dash.cloudflare.com/ and open **Workers & Pages**.
2. Create a D1 database named **dew-orders**. Open its Console and run the complete contents of `schema.sql`.
3. Create a Worker named **dew-orders-api**. Deploy the contents of `worker.js`.
4. In the Worker settings, add a D1 binding named **DB** and select the `dew-orders` database.
5. Add Worker secrets:
   - `ADMIN_TOKEN`: create a long random password. This protects private order/customer data.
   - `TELEGRAM_BOT_TOKEN`: your Telegram bot token (optional if notifications are already handled elsewhere).
   - `TELEGRAM_CHAT_ID`: your Telegram chat/group ID (optional).
   - Optional variable `STORE_PRODUCTS_URL`: leave unset to use the Dew GitHub Pages catalogue URL.
6. Deploy the Worker. Its URL will look like `https://dew-orders-api.<your-account>.workers.dev`.
7. In Dew Admin > Settings, enter that URL as **Orders API URL** and enter the same ADMIN_TOKEN as **Orders API key**, then save. The API key is stored only in this browser's local storage, not in the public products file.
8. Test the Worker health URL by opening `https://YOUR-WORKER-URL/api/health`. It should return `{"ok":true,"service":"Dew Orders API"}`.

Customer checkout sends an order to the Worker. The Worker recalculates product prices and delivery from the live catalogue, saves the order in D1, and then sends a Telegram message if the optional Telegram secrets are configured. Checkout only shows success after the Worker confirms the save.

**Important:** Do not paste the bot token or ADMIN_TOKEN into a public GitHub file or into a customer-facing page. Do not share them in ChatGPT.
