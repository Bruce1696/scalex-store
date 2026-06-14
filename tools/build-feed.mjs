// ─────────────────────────────────────────────────────────────
// build-feed.mjs — ACP + Google product feeds (deliverable A)
//
// Transforms the canonical catalog (via the swappable adapter) into the
// two feed formats that drive AI/agentic discovery, and gzips them the
// way OpenAI's product-feed endpoint expects:
//
//   /api/feed.acp.json        OpenAI / Stripe Agentic Commerce Protocol feed
//   /api/feed.acp.json.gz     gzip-compressed (push target for ACP ingestion)
//   /api/feed.google.json     Google Merchant Center style feed
//   /api/feed.google.json.gz  gzip-compressed
//
// Both feeds are VARIANT-LEVEL (one row per purchasable size), linked by
// item_group_id — the spec-correct shape for Shopping + ACP checkout.
//
//   node tools/build-feed.mjs
//   CATALOG_SOURCE=medusa MEDUSA_URL=http://localhost:9000 node tools/build-feed.mjs
// ─────────────────────────────────────────────────────────────
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const SITE = process.env.SITE_URL || 'https://dailmyshop.netlify.app';
const CURRENCY = 'USD';

const SELLER = {
  name: 'ScalexStore',
  url: SITE,
  privacy_policy: `${SITE}/privacy`,
  terms_of_service: `${SITE}/terms`,
};
const SHIPPING = { country: 'US', service: 'Standard', price: `0.00 ${CURRENCY}`, min_handling_days: 1, max_transit_days: 5 };
const RETURN_POLICY = { country: 'US', days: 30, method: 'free_returns' };

// The enriched feed is the AI layer's own artifact (tools/enrich.mjs output).
const products = JSON.parse(await readFile(join(PUBLIC, 'products.json'), 'utf8'));

// One row per in-feed variant (size). Linked back to the parent product
// with item_group_id so engines group colours/sizes of the same model.
function* variantRows(p) {
  const variants = p.variants?.length ? p.variants : [{ size: null, sku: `SKU-${p.id}`, gtin: p.gtin, availability: p.availability, inventory_quantity: p.inventory_quantity }];
  for (const v of variants) {
    yield { p, v };
  }
}

// ── ACP / OpenAI product feed item ─────────────────────────────
function toAcp({ p, v }) {
  return {
    id: v.sku || `${p.id}`,
    item_group_id: p.item_group_id || `GRP-${p.id}`,
    title: String(p.title).slice(0, 150),
    description: String(p.description || '').slice(0, 5000),
    link: `${SITE}/product-${p.id}.html`,
    image_link: p.image,
    additional_image_links: (p.images || []).filter((u) => u && u !== p.image),
    price: `${Number(p.price).toFixed(2)} ${CURRENCY}`,
    availability: (v.availability === 'in_stock' && v.inventory_quantity > 0) ? 'in_stock' : 'out_of_stock',
    inventory_quantity: v.inventory_quantity ?? 0,
    brand: p.brand,
    gtin: v.gtin || p.gtin || undefined,
    mpn: p.mpn || undefined,
    condition: p.condition || 'new',
    product_category: p.google_product_category,
    color: v.color || p.color,
    size: v.size || undefined,
    material: p.material || undefined,
    // ACP eligibility flags
    enable_search: p.enable_search !== false,
    enable_checkout: p.enable_checkout !== false,
    shipping: SHIPPING,
    return_policy: RETURN_POLICY,
    seller: SELLER,
  };
}

// ── Google Merchant Center style item ──────────────────────────
function toGoogle({ p, v }) {
  return {
    id: v.sku || `${p.id}`,
    item_group_id: p.item_group_id || `GRP-${p.id}`,
    title: p.title,
    description: p.description,
    link: `${SITE}/product-${p.id}.html`,
    image_link: p.image,
    availability: (v.availability === 'in_stock' && v.inventory_quantity > 0) ? 'in stock' : 'out of stock',
    price: `${Number(p.price).toFixed(2)} ${CURRENCY}`,
    brand: p.brand,
    gtin: v.gtin || p.gtin || '',
    mpn: p.mpn || '',
    condition: p.condition || 'new',
    google_product_category: p.google_product_category,
    color: v.color || p.color,
    size: v.size || '',
    material: p.material || '',
    identifier_exists: (v.gtin || p.gtin) ? 'yes' : 'no',
  };
}

const acpItems = [];
const googleItems = [];
for (const p of products) {
  if (p.enable_search === false) continue; // respect per-product opt-out
  for (const row of variantRows(p)) {
    acpItems.push(toAcp(row));
    googleItems.push(toGoogle(row));
  }
}

const acpFeed = {
  feed_version: '1.0',
  protocol: 'agentic-commerce-protocol',
  generated_with: 'tools/build-feed.mjs',
  seller: SELLER,
  currency: CURRENCY,
  count: acpItems.length,
  products: acpItems,
};
const googleFeed = { version: '1.0', count: googleItems.length, products: googleItems };

async function emit(rel, obj) {
  const full = join(PUBLIC, rel);
  await mkdir(dirname(full), { recursive: true });
  const json = JSON.stringify(obj, null, 2) + '\n';
  await writeFile(full, json);
  await writeFile(full + '.gz', gzipSync(json));
  return Buffer.byteLength(json);
}

const a = await emit('api/feed.acp.json', acpFeed);
const g = await emit('api/feed.google.json', googleFeed);

console.log(`✓ api/feed.acp.json     ${acpItems.length} variant rows  (${(a / 1024).toFixed(1)} KB) + .gz`);
console.log(`✓ api/feed.google.json  ${googleItems.length} variant rows  (${(g / 1024).toFixed(1)} KB) + .gz`);
console.log(`  source: ${process.env.CATALOG_SOURCE || 'json'} · ${products.length} products → ${acpItems.length} purchasable variants`);
console.log('  ACP eligibility flags, shipping, return policy & seller metadata included.');
