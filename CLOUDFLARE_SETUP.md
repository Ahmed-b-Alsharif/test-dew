# Dew Skincare backend (Cloudflare Worker + D1)

This is the current setup for the Dew store. GitHub Pages hosts the public storefront; the Cloudflare Worker handles checkout, stock, private admin access, orders, and Telegram notifications.

## Existing services

- Worker: `dew-orders-api`
- D1 database: `dew-orders`
- D1 binding name: `DB`
- Store catalogue: `products.json` in the `Ahmed-b-Alsharif/test-dew` GitHub repository

## Worker configuration

In Cloudflare Dashboard → Workers & Pages → `dew-orders-api` → Settings → Variables and Secrets, the Worker uses:

- `ADMIN_USERNAME` — private admin login username.
- `ADMIN_PASSWORD` — private admin login password. Store it as a secret.
- `GITHUB_TOKEN` — GitHub token used by the Worker to update the store catalogue and approved product/media files. Keep it as a secret and give it access only to the Dew repository with the minimum required contents permissions.
- `TELEGRAM_PROXY_SECRET` — shared secret used when the Worker sends order notifications to the Telegram proxy. It must match the secret configured in the Vercel proxy project.

Optional settings:
- `STORE_PRODUCTS_URL` — leave unset to use the default Dew GitHub Pages catalogue.
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` — only needed if using direct Telegram delivery instead of the proxy.

The Worker must have a D1 database binding named `DB` pointing to `dew-orders`.

## Stock protection

- D1's `inventory` table is the authoritative stock record.
- The first time a product or variant is seen, its starting quantity is copied from `products.json`. Existing D1 quantities are preserved; later catalogue refreshes do not overwrite stock.
- The storefront, product pages, collection pages, and checkout read live stock from `/api/inventory`.
- Checkout independently checks stock on the server. Browser-side stock values are only for display and convenience; they cannot authorize an order.
- Stock deductions, order-number allocation, and order creation are sent as one D1 batch. If any stock update cannot be completed, a deliberate database constraint failure aborts the batch so the order and all deductions roll back together.
- Admin stock changes are saved to D1 from the product editor or the quick stock fields in the Products list.

## Admin security

- Admin login is checked by the Worker using `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
- The Worker issues a random session token, stores only its SHA-256 hash in D1, and expires the session after 12 hours.
- The browser keeps the session token in `sessionStorage`, not in the public catalogue or persistent `localStorage`.
- Private orders, customer records, inventory updates, and GitHub editing require a valid session.
- Never put Worker secrets, GitHub tokens, Telegram credentials, or admin passwords in GitHub files or customer-facing pages. Never share them in chat.

## Deploying Worker changes

1. Open Cloudflare Dashboard → Workers & Pages → `dew-orders-api`.
2. Open **Edit Code**.
3. Replace the Worker code with the latest `worker.js` from the GitHub `main` branch.
4. Click **Deploy**.
5. Check `https://dew-orders-api.aalshari.workers.dev/api/health`. It should return `{"ok":true,"service":"Dew Orders API"}`.
6. Check `https://dew-orders-api.aalshari.workers.dev/api/inventory`. It should return `{"ok":true,"items":[...]}`.

GitHub Pages publishes storefront and admin-file changes automatically after commits to `main`; those changes do not require a Worker deployment.

## Important testing note

A healthy Worker and a working inventory endpoint do not, by themselves, prove that checkout stock deduction is working. Before launch, test with a product/variant whose quantity has deliberately been set to a small known number:

1. Place one test order and confirm the D1 stock decreases by exactly the ordered quantity.
2. Try to order more than the remaining quantity and confirm the order is rejected without changing stock.
3. Confirm the saved order appears in Admin → Orders and the order notification arrives.
4. If possible, test two checkouts competing for the final unit; only one should succeed.

Do not use a real customer's order as a test. Restore the intended stock quantity after testing.
