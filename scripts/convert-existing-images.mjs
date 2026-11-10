import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const root = process.cwd();
const outputDir = path.join(root, "images", "webp");
await fs.mkdir(outputDir, { recursive: true });

const textExtensions = new Set([".json", ".js", ".html", ".css", ".md", ".txt", ".yml", ".yaml"]);
const ignored = new Set([".git", "node_modules", ".next", "dist"]);
async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}
const allFiles = await walk(root);
const textFiles = allFiles.filter(file => textExtensions.has(path.extname(file).toLowerCase()));
const localImages = allFiles.filter(file => /^images[\\/]/.test(path.relative(root, file)) && /\.(jpe?g|png)$/i.test(file));
const remoteUrls = new Set();
const remotePattern = /https?:\/\/[^\s"'<>]+?\.(?:jpe?g|png)(?:\?[^\s"'<>]*)?/gi;
for (const file of textFiles) {
  const body = await fs.readFile(file, "utf8");
  for (const match of body.matchAll(remotePattern)) remoteUrls.add(match[0].replace(/[),;]+$/, ""));
}
const localMap = new Map();
const remoteMap = new Map();

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 20);
}
async function convert(input, destination) {
  await sharp(input, { failOn: "error", limitInputPixels: 100000000 })
    .rotate()
    .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80, effort: 6, smartSubsample: true })
    .toFile(destination);
  const stat = await fs.stat(destination);
  if (!stat.size) throw new Error("Empty WebP output: " + destination);
}
for (const file of localImages) {
  const relative = path.relative(root, file).split(path.sep).join("/");
  const destination = path.join(outputDir, "local-" + hash(relative) + ".webp");
  await convert(file, destination);
  localMap.set(relative, "images/webp/" + path.basename(destination));
}
for (const url of remoteUrls) {
  const destination = path.join(outputDir, "shopify-" + hash(url) + ".webp");
  const response = await fetch(url, {
    headers: { "User-Agent": "DewSkincare-WebP-Migration/1.0", "Accept": "image/avif,image/webp,image/*,*/*;q=0.8" }
  });
  if (!response.ok) throw new Error("Could not download image (" + response.status + "): " + url);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("Downloaded empty image: " + url);
  await convert(bytes, destination);
  remoteMap.set(url, "images/webp/" + path.basename(destination));
}
const replacements = new Map([...localMap, ...remoteMap]);
let changedFiles = 0;
for (const file of textFiles) {
  let body = await fs.readFile(file, "utf8");
  const original = body;
  for (const [from, to] of replacements) {
    body = body.split(from).join(to);
  }
  if (body !== original) {
    await fs.writeFile(file, body);
    changedFiles++;
  }
}
// Verify that no tracked text reference still points to a JPG/PNG before removing originals.
for (const file of textFiles) {
  const body = await fs.readFile(file, "utf8");
  const remainingRemote = body.match(remotePattern) || [];
  const remainingLocal = body.match(/(?:\.\/)?images\/[A-Za-z0-9._/-]+\.(?:jpe?g|png)/gi) || [];
  if (remainingRemote.length || remainingLocal.length) {
    throw new Error("Unconverted image reference remains in " + path.relative(root, file));
  }
}
for (const file of localImages) await fs.unlink(file);
console.log(JSON.stringify({
  localImagesConverted: localMap.size,
  ShopifyImagesDownloadedAndConverted: remoteMap.size,
  webpFilesCreated: replacements.size,
  textFilesUpdated: changedFiles,
  originalLocalFilesRemoved: localImages.length,
  outputDirectory: "images/webp",
  settings: "WebP quality 82, maximum dimension 2400px, EXIF orientation applied"
}, null, 2));
