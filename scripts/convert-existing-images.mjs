import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const outputDir = path.join(root, "images", "shopify");
const ignored = new Set([".git", "node_modules", ".next", "dist"]);
const textExtensions = new Set([".json", ".js", ".html", ".css", ".md", ".txt", ".yml", ".yaml"]);
const shopifyPattern = /https:\/\/cdn\.shopify\.com\/[^\s"'<>]+/gi;

async function walk(dir) {
  const files = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (textExtensions.has(path.extname(entry.name).toLowerCase())) files.push(full);
  }
  return files;
}

function cleanUrl(match) {
  return match.replace(/[),;]+$/, "");
}

function extensionFor(url, contentType) {
  const pathname = new URL(url).pathname;
  const fromPath = path.extname(pathname).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"].includes(fromPath)) return fromPath;
  const type = (contentType || "").split(";")[0].trim().toLowerCase();
  const byType = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif"
  };
  return byType[type] || ".img";
}

function isImage(bytes, contentType) {
  if ((contentType || "").toLowerCase().startsWith("image/")) return true;
  return (
    (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (bytes[0] === 0x89 && bytes.subarray(1, 4).toString() === "PNG") ||
    bytes.subarray(0, 4).toString() === "RIFF" ||
    bytes.subarray(0, 3).toString() === "GIF"
  );
}

const textFiles = await walk(root);
const originalText = new Map();
const remoteUrls = new Set();

for (const file of textFiles) {
  const body = await fs.readFile(file, "utf8");
  originalText.set(file, body);
  for (const match of body.matchAll(shopifyPattern)) remoteUrls.add(cleanUrl(match[0]));
}

if (remoteUrls.size === 0) {
  console.log("No Shopify-hosted image URLs found. Nothing to migrate.");
  process.exit(0);
}

await fs.mkdir(outputDir, { recursive: true });
const replacements = new Map();
const contentFiles = new Map();

for (const url of remoteUrls) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "DewSkincare-Image-Migration/1.0",
      "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
    }
  });

  if (!response.ok) {
    throw new Error(`Image download failed (${response.status}) for ${url}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || !isImage(bytes, contentType)) {
    throw new Error(`Downloaded file is empty or not an image: ${url} (content-type: ${contentType})`);
  }

  // Keep the original image bytes unchanged: no resizing, recompression, or format conversion.
  const extension = extensionFor(url, contentType);
  const contentHash = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 24);
  const relativePath = `images/shopify/${contentHash}${extension}`;
  const destination = path.join(root, relativePath);

  if (!contentFiles.has(relativePath)) {
    await fs.writeFile(destination, bytes, { flag: "wx" }).catch(async error => {
      if (error.code !== "EEXIST") throw error;
      const existing = await fs.readFile(destination);
      if (!existing.equals(bytes)) throw new Error(`Hash collision or mismatched existing image: ${relativePath}`);
    });
    contentFiles.set(relativePath, true);
  }

  replacements.set(url, relativePath);
}

let changedFiles = 0;
for (const [file, original] of originalText) {
  let updated = original;
  for (const [remoteUrl, localPath] of replacements) {
    updated = updated.split(remoteUrl).join(localPath);
  }
  if (updated !== original) {
    await fs.writeFile(file, updated);
    changedFiles++;
  }
}

for (const file of textFiles) {
  const body = await fs.readFile(file, "utf8");
  if (/https:\/\/cdn\.shopify\.com\//i.test(body)) {
    throw new Error(`A Shopify image URL remains in ${path.relative(root, file)}; migration stopped for review.`);
  }
}

console.log(JSON.stringify({
  uniqueShopifyImageUrls: remoteUrls.size,
  uniqueImageFilesSaved: contentFiles.size,
  imageBytesPreserved: true,
  textFilesUpdated: changedFiles,
  destination: "images/shopify/",
  remainingShopifyImageReferences: 0
}, null, 2));
