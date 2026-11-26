import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

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
  } catch { return ''; }
};
const money = value => `${Number(value).toFixed(2)} EGP`;
const validGtin = value => {
  const digits = String(value ?? '').trim().replace(/^'+/, '').replace(/\s+/g, '');
  if (!/^\d+$/.test(digits) || ![8, 12, 13, 14].includes(digits.length)) return '';
  let sum = 0, weight = 3;
  for (let i = digits.length - 2; i >= 0; i--) {
    sum += Number(digits[i]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1)) ? digits : '';
};

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
let variantEntries = 0;
let rejectedBarcodes = 0;

function addEntry(product, variant = null, useGroup = false) {
  const basePrice = Number(variant?.price ?? product.price);
  if (!Number.isFinite(basePrice) || basePrice <= 0) return;
  const salePrice = Number(variant?.salePrice ?? product.salePrice);
  const hasSale = Number.isFinite(salePrice) && salePrice > 0 && salePrice < basePrice;
  const images = (Array.isArray(product.images) ? product.images : []).map(absoluteUrl).filter(Boolean);
  const primaryImage = absoluteUrl(variant?.image) || images[0];
  if (!primaryImage) return;

  const variantId = variant?.id ? String(variant.id) : '';
  const key = `${String(product.id)}::${variantId}`;
  const stock = liveInventory?.has(key)
    ? liveInventory.get(key)
    : Math.max(0, Number(variant?.stock ?? product.stock) || 0);
  const optionLabel = variant?.options
    ? Object.values(variant.options).map(cleanText).filter(Boolean).join(' / ')
    : '';
  const title = cleanText(product.name) + (optionLabel ? ` - ${optionLabel}` : '');
  const productUrl = new URL(`product.html?id=${encodeURIComponent(product.id)}`, ROOT);
  if (variantId) productUrl.searchParams.set('variant', variantId);
  const description = (cleanText(product.description) ||
    `Discover ${cleanText(product.name)} from Dew Skincare, made in Egypt.`).slice(0, 5000);

  // Only accept standard GTIN lengths with a valid check digit. Never send malformed identifiers.
  const barcodeCandidate = variantId ? variant?.barcode : product.barcode;
  const barcode = validGtin(barcodeCandidate);
  if (barcodeCandidate && !barcode) rejectedBarcodes++;

  const fields = [
    ['id', variantId && useGroup ? `${product.id}_${variantId}` : product.id],
    ...(useGroup ? [['item_group_id', product.id]] : []),
    ['title', title.slice(0, 150)],
    ['description', description],
    ['link', productUrl.href],
    ['image_link', primaryImage],
    ['availability', stock > 0 ? 'in stock' : 'out of stock'],
    ['condition', 'new'],
    ['price', money(basePrice)],
    ...(hasSale ? [['sale_price', money(salePrice)]] : []),
    ['brand', 'DEW'],
    ['identifier_exists', barcode ? 'yes' : 'no'],
    ...(barcode ? [['gtin', barcode]] : []),
    ...(cleanText(product.tags) ? [['custom_label_0', cleanText(product.tags).slice(0, 100)]] : [])
  ];
  const itemXml = fields.map(([field, value]) =>
    `    <g:${field}>${xmlEscape(value)}</g:${field}>`
  );
  for (const image of images.filter(image => image !== primaryImage).slice(0, 10)) {
    itemXml.push(`    <g:additional_image_link>${xmlEscape(image)}</g:additional_image_link>`);
  }
  entries.push(`  <item>\n${itemXml.join('\n')}\n  </item>`);
}

for (const product of products) {
  if (product.visible === false || !product.id || !cleanText(product.name)) continue;
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const options = (product.options || []).filter(option =>
    option.name && Array.isArray(option.values) && option.values.length
  );
  const validVariants = variants.filter(variant =>
    options.every(option => option.values.includes(String(variant.options?.[option.name] ?? '')))
  );

  if (validVariants.length > 1) {
    for (const variant of validVariants) addEntry(product, variant, true);
    variantEntries += validVariants.length;
  } else if (validVariants.length === 1) {
    addEntry(product, validVariants[0], false);
  } else {
    addEntry(product);
  }
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
console.log(`Generated Meta product feed: ${entries.length} items, including ${variantEntries} variant listings. Live inventory: ${liveInventory ? 'yes' : 'fallback to products.json'}. Rejected invalid barcodes: ${rejectedBarcodes}.`);
