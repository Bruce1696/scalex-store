// ─────────────────────────────────────────────────────────────
// catalog-adapter.mjs — Swappable catalog source (the "accelerator")
//
// The AI-readiness layer must run on ANY traditional ecommerce backend.
// This adapter is the single seam that makes that possible: every other
// tool asks `loadCatalog()` for the CANONICAL product model and never
// cares where the data came from.
//
//   today:  products.json   (simulated traditional catalog)
//   later:  Medusa          (set CATALOG_SOURCE=medusa MEDUSA_URL=...)
//   client: Shopify/Saleor  (add a mapper below — AI layer is untouched)
//
// Canonical model (what every downstream tool expects):
//   { id, title, description, price, currency, category, image, images[],
//     brand, gtin, mpn, condition, color, material,
//     availability, inventory_quantity, google_product_category,
//     item_group_id, sizes[], variants[], enable_search, enable_checkout }
//
//   import { loadCatalog } from './catalog-adapter.mjs'
//   const products = await loadCatalog()                 // env-driven
//   const products = await loadCatalog({ source: 'json' })
// ─────────────────────────────────────────────────────────────
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── Source 1: static JSON (the simulated traditional catalog) ──
// products.json is already in canonical shape (enrich.mjs produced it),
// so this adapter is a pass-through — but it's still the seam that lets
// us swap the source without touching any downstream tool.
async function fromJson() {
  const raw = await readFile(join(ROOT, 'products.json'), 'utf8');
  return JSON.parse(raw);
}

// ── Source 2: Medusa (a REAL traditional ecommerce backend) ────
// Reads the Medusa Store API and maps its product/variant model onto
// the canonical model. Proves the accelerator plugs into a live
// platform with zero changes to the AI-readiness layer.
//   CATALOG_SOURCE=medusa MEDUSA_URL=http://localhost:9000 node tools/build-feed.mjs
async function fromMedusa() {
  const base = process.env.MEDUSA_URL || 'http://localhost:9000';
  const res = await fetch(`${base}/store/products?limit=100`, {
    headers: process.env.MEDUSA_PUBLISHABLE_KEY
      ? { 'x-publishable-api-key': process.env.MEDUSA_PUBLISHABLE_KEY }
      : {},
  });
  if (!res.ok) throw new Error(`Medusa fetch failed: ${res.status} ${res.statusText}`);
  const { products = [] } = await res.json();
  return products.map(medusaToCanonical);
}

// Map one Medusa product → canonical. Adjust the field reads here for a
// different platform (Shopify/Saleor); nothing downstream changes.
function medusaToCanonical(m) {
  const variants = (m.variants || []).map((v) => {
    const opt = (v.options || []).find((o) => /size/i.test(o?.option?.title || '')) || {};
    const price = (v.prices || []).find((p) => p.currency_code === 'usd');
    return {
      size: opt.value || v.title,
      color: m.material || null,
      sku: v.sku || `${m.id}-${v.id}`,
      gtin: v.barcode || v.ean || null,
      availability: (v.inventory_quantity ?? 0) > 0 ? 'in_stock' : 'out_of_stock',
      inventory_quantity: v.inventory_quantity ?? 0,
      price: price ? price.amount / 100 : undefined,
    };
  });
  const totalInv = variants.reduce((s, v) => s + (v.inventory_quantity || 0), 0);
  const usd = (m.variants?.[0]?.prices || []).find((p) => p.currency_code === 'usd');
  return {
    id: m.id,
    title: m.title,
    description: m.description || '',
    price: usd ? usd.amount / 100 : 0,
    currency: 'USD',
    category: (m.categories?.[0]?.name || m.type?.value || 'uncategorized').toLowerCase(),
    image: m.thumbnail || (m.images?.[0]?.url ?? null),
    images: (m.images || []).map((i) => i.url),
    brand: m.brand || (m.collection?.title ?? 'Generic'),
    gtin: variants[0]?.gtin || null,
    mpn: m.handle || m.id,
    condition: 'new',
    color: m.material || null,
    material: m.material || null,
    availability: totalInv > 0 ? 'in_stock' : 'out_of_stock',
    inventory_quantity: totalInv,
    google_product_category: m.metadata?.google_product_category || '187',
    item_group_id: m.id,
    sizes: variants.map((v) => v.size).filter(Boolean),
    variants,
    enable_search: totalInv > 0,
    enable_checkout: totalInv > 0,
  };
}

const SOURCES = { json: fromJson, medusa: fromMedusa };

export async function loadCatalog({ source } = {}) {
  const key = (source || process.env.CATALOG_SOURCE || 'json').toLowerCase();
  const loader = SOURCES[key];
  if (!loader) throw new Error(`Unknown CATALOG_SOURCE "${key}". Known: ${Object.keys(SOURCES).join(', ')}`);
  const products = await loader();
  if (!Array.isArray(products) || !products.length)
    throw new Error(`Catalog source "${key}" returned no products.`);
  return products;
}

export const CANONICAL_SOURCES = Object.keys(SOURCES);
