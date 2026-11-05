# Dew Skincare on GitHub Pages

A shop that runs entirely from your GitHub repository. No server, no hosting fees.

- **Storefront** (`index.html`): customers enter name and phone, browse catalogs, add to cart.
- **Checkout** (`checkout.html`): address, delivery area (Cairo & Giza EGP 85, Alexandria EGP 90), EGP 250 minimum, then the order opens in WhatsApp addressed to you.
- **Admin** (`admin.html`): add and edit products, prices, stock, photos, catalogs and store text. Changes are saved straight into your repo.

Your products live in one file, `products.json`.

## Hidden admin button

No visible admin link. On the shop, click the small dot after the copyright line in the footer, or click the **Dew.** logo 5 times quickly. Both open `admin.html`, which needs your GitHub token.

## Step 1: Create the repository

1. Sign in at github.com and click **New repository**. Name it `dew-skincare`.
2. Choose **Public**. (GitHub Pages on a free account needs a public repo. Nothing private is stored here: there is no customer data, only your product catalog.)
3. Click **uploading an existing file**, drag in everything from this folder (`index.html`, `checkout.html`, `admin.html`, `styles.css`, `cart.js`, `app.js`, `checkout.js`, `admin.js`, `products.json`, `README.md`), and click **Commit changes**.

## Step 2: Turn on the website

1. In the repo go to **Settings > Pages**.
2. Under **Build and deployment**, set Source to **Deploy from a branch**, Branch **main**, folder **/ (root)**, and Save.
3. After a minute or two your shop is live at `https://YOUR-USERNAME.github.io/dew-skincare/`.

## Step 3: Make your admin token

The token is your admin password. It only works for this one repo.

1. GitHub: your profile picture > **Settings** > **Developer settings** > **Personal access tokens** > **Fine-grained tokens** > **Generate new token**.
2. Name it `dew admin`, pick an expiry, and under **Repository access** choose **Only select repositories** > `dew-skincare`.
3. Under **Repository permissions** set **Contents** to **Read and write**. Generate and copy the token (starts with `github_pat_`). You can only see it once.
4. Open your shop, use the hidden button, enter `YOUR-USERNAME/dew-skincare` and the token. Tick **Remember on this device** only on your own phone or computer.

## Step 4: First setup (in the admin)

1. **Store**: set your real WhatsApp number (orders go there), phone, email, Instagram.
2. **Products**: replace the four samples with your real products, photos, prices and stock.
3. Place a test order on the shop and check the WhatsApp message.

Every save goes live in about a minute. If you don't see a change, refresh the page.

## What this version can't do

GitHub Pages only serves files, so compared with the full Node version:

- **No order list or customer list.** Each order arrives as a WhatsApp message. That chat is your record. Order references look like `DEW-1103-4821`, not sequential numbers.
- **Stock does not drop by itself.** After an order, change the Stock number in the admin.
- **An order is only placed when the customer sends the WhatsApp message.**
- Anyone could read `products.json` (it's your public catalog anyway). Prices and the EGP 250 minimum are checked in the customer's browser, so confirm each order when it reaches you.

If you later want automatic stock, an order list and a customer list, the full Node version (`dew-skincare.zip`) needs a Node host.

## If you lose the token

Delete it in GitHub (Settings > Developer settings > Personal access tokens) and make a new one. Never share it or put it in the repo.
