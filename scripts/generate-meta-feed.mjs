import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = 'https://dewskincaree.com/';
const INVENTORY_URL = 'https://dew-orders-api.aalshari.workers.dev/api/inventory';
const sourcePath = fileURLToPath(new URL('../products.json', import.meta.url));
const outputPath = fileURLToPath(new URL('../meta-product-feed.xml', import.meta.url));

const xmlEscape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
}[ch]));

const cleanText = value => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const absoluteUrl = value => {
  try {
    const url = new URL(String(value || ''), ROOT);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
};

const money = value => `${Number(value).toFixed(2)} EGP`;

const store = JSON.parse(await readFile(sourcePath, 'utf8'));
const products = Array.isArray(store.products) ? store.products : [];

if (!products.length) throw new Error('products.json contains no products.');

let liveInventory = null;
try {
  const response = await fetch(INVENTORY_URL, { signal: AbortSignal.timeout(8000) });
  if (response.ok) {
    const payload = await response.json();
    if (payload?.ok && Array.isArray(payload.items)) {
      liveInventory = new Map(payload.items.map(item => [
        `${String(item.productId)}::${String(item.variantId || '')}`,
        Math.max(0, Number(item.stock) || 0)
      ]));
    }
  }
} catch (error) {
  console.warn('Live inventory unavailable; using stock saved in products.json:', error.message);
}

const entries = [];
for (const product of products) {
  if (product.visible === false || !product.id || !cleanText(product.name)) continue;

  const basePrice = Number(product.price);
  if (!Number.isFinite(basePrice) || basePrice <= 0) continue;

  const images = (Array.isArray(product.images) ? product.images : [])
    .map(absoluteUrl).filter(Boolean);
  if (!images.length) continue;

  let stock = Math.max(0, Number(product.stock) || 0);
  if (Array.isArray(product.variants) && product.variants.length) {
    stock = product.variants.reduce((total, variant) => {
      const key = `${String(product.id)}::${String(variant.id || '')}`;
      const variantStock = liveInventory?.has(key)
        ? liveInventory.get(key)
        : Math.max(0, Number(variant.stock) || 0);
      return total + variantStock;
    }, 0);
  } else if (liveInventory?.has(`${String(product.id)}::`)) {
    stock = liveInventory.get(`${String(product.id)}::`);
  }

  const salePrice = Number(product.salePrice);
  const hasSale = Number.isFinite(salePrice) && salePrice > 0 && salePrice < basePrice;
  const productUrl = new URL(`product.html?id=${encodeURIComponent(product.id)}`, ROOT).href;
  const description = (cleanText(product.description) ||
    `Discover ${cleanText(product.name)} from Dew Skincare, made in Egypt.`).slice(0, 5000);
  const barcode = String(
    product.barcode ||
    product.variants?.find(variant => variant.barcode)?.barcode ||
    ''
  ).trim();

  const fields = [
    ['id', product.id],
    ['title', cleanText(product.name).slice(0, 150)],
    ['description', description],
    ['link', productUrl],
    ['image_link', images[0]],
    ['availability', stock > 0 ? 'in stock' : 'out of stock'],
    ['condition', 'new'],
    ['price', money(basePrice)],
    ...(hasSale ? [['sale_price', money(salePrice)]] : []),
    ['brand', 'DEW'],
    ['identifier_exists', barcode ? 'yes' : 'no'],
    ...(barcode ? [['gtin', barcode]] : []),
    ...(cleanText(product.tags) ? [['custom_label_0', cleanText(product.tags).slice(0, 100)]] : [])
  ];

  const itemXml = fields.map(([key, value]) =>
    `    <g:${key}>${xmlEscape(value)}</g:${key}>`
  );
  for (const image of images.slice(1, 11)) {
    itemXml.push(`    <g:additional_image_link>${xmlEscape(image)}</g:additional_image_link>`);
  }
  entries.push(`  <item>\n${itemXml.join('\n')}\n  </item>`);
}

if (!entries.length) throw new Error('No eligible visible products with prices and images were found.');

const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
<channel>
  <title>DEW Skincare Product Catalog</title>
  <link>${ROOT}</link>
  <description>Products from the official DEW Skincare Egypt online store.</description>
${entries.join('\n')}
</channel>
</rss>
`;

await writeFile(outputPath, feed, 'utf8');
console.log(`Generated Meta product feed with ${entries.length} visible products. Live inventory: ${liveInventory ? 'yes' : 'fallback to products.json'}.`);
