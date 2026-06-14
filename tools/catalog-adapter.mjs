// ─────────────────────────────────────────────────────────────
// catalog-adapter.mjs — STORE PORT (the one and only seam to the store)
//
// This is the entire coupling surface between the AI discoverability layer
// and the existing ecommerce backend. Everything the layer needs from the
// store goes through here — and NOTHING here writes to the store's database:
//
//   getCatalog()           READ-ONLY  → pull the product list (for ingestion)
//   getInventory(id,size)  READ-ONLY  → live stock (delegates to the store)
//   createCheckout(cart)   DELEGATED  → forwards to the store's OWN checkout
//                                       API; the store writes its own DB, not us
//
// Swap the source and nothing downstream changes — that is the accelerator:
//   today:  store.catalog.json  (simulated existing DB export)
//   client: CATALOG_SOURCE=medusa MEDUSA_URL=... (or Shopify/Saleor — add a mapper)
//
// Canonical model returned by getCatalog():
//   { id, title, description, price, currency, category, image, images[],
//     brand?, gtin?, condition?, color?, material?, availability?,
//     inventory_quantity?, variants?[] }   ← only what the STORE actually has.
//   The AI layer's enrich step fills the rest (tools/enrich.mjs).
// ─────────────────────────────────────────────────────────────
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const sourceKey = (source) => (source || process.env.CATALOG_SOURCE || 'json').toLowerCase();

// ── Source 1: static JSON (the simulated existing store DB export) ──
async function jsonCatalog() {
  return JSON.parse(await readFile(join(ROOT, 'src', 'data', 'store.catalog.json'), 'utf8'));
}

// ── Source 2: Medusa (a REAL store) — read-only Store API ──────
async function medusaCatalog() {
  const base = process.env.MEDUSA_URL || 'http://localhost:9000';
  const res = await fetch(`${base}/store/products?limit=100`, {
    headers: process.env.MEDUSA_PUBLISHABLE_KEY ? { 'x-publishable-api-key': process.env.MEDUSA_PUBLISHABLE_KEY } : {},
  });
  if (!res.ok) throw new Error(`Medusa fetch failed: ${res.status} ${res.statusText}`);
  const { products = [] } = await res.json();
  return products.map(medusaToCanonical);
}

function medusaToCanonical(m) {
  const variants = (m.variants || []).map((v) => {
    const opt = (v.options || []).find((o) => /size/i.test(o?.option?.title || '')) || {};
    const price = (v.prices || []).find((p) => p.currency_code === 'usd');
    return {
      size: opt.value || v.title,
      sku: v.sku || `${m.id}-${v.id}`,
      gtin: v.barcode || v.ean || null,
      availability: (v.inventory_quantity ?? 0) > 0 ? 'in_stock' : 'out_of_stock',
      inventory_quantity: v.inventory_quantity ?? 0,
      price: price ? price.amount / 100 : undefined,
    };
  });
  const usd = (m.variants?.[0]?.prices || []).find((p) => p.currency_code === 'usd');
  return {
    id: m.id, title: m.title, description: m.description || '',
    price: usd ? usd.amount / 100 : 0, currency: 'USD',
    category: (m.categories?.[0]?.name || m.type?.value || 'uncategorized').toLowerCase(),
    image: m.thumbnail || (m.images?.[0]?.url ?? null),
    images: (m.images || []).map((i) => i.url),
    brand: m.brand || (m.collection?.title ?? null),
    rating: m.metadata?.rating || { rate: 0, count: 0 },
    variants,
  };
}

const CATALOG_BY_SOURCE = { json: jsonCatalog, medusa: medusaCatalog };

// ── READ: pull the catalog (used by ingestion only) ───────────
export async function getCatalog({ source } = {}) {
  const key = sourceKey(source);
  const loader = CATALOG_BY_SOURCE[key];
  if (!loader) throw new Error(`Unknown CATALOG_SOURCE "${key}". Known: ${Object.keys(CATALOG_BY_SOURCE).join(', ')}`);
  const products = await loader();
  if (!Array.isArray(products) || !products.length) throw new Error(`Store source "${key}" returned no products.`);
  return products;
}

// ── READ: live inventory (delegates to the store) ─────────────
// In demo (json) mode the thin export carries no variant stock, so this is a
// documented stub; against a real store it queries live availability.
export async function getInventory(id, size, { source } = {}) {
  const key = sourceKey(source);
  if (key === 'medusa') {
    const base = process.env.MEDUSA_URL || 'http://localhost:9000';
    const res = await fetch(`${base}/store/products/${id}`);
    if (!res.ok) return { product_id: id, available: null, error: `store_${res.status}` };
    const { product } = await res.json();
    const v = (product?.variants || []).find((x) => !size || new RegExp(`${size}$`, 'i').test(x.title));
    return { product_id: id, size, available: (v?.inventory_quantity ?? 0) > 0, inventory_quantity: v?.inventory_quantity ?? 0 };
  }
  return { product_id: id, size, available: null, note: 'demo store exposes no variant inventory; agent reads the AI snapshot instead' };
}

// ── WRITE (DELEGATED): hand the cart to the store's own checkout ─
// The AI layer NEVER writes the store DB. It forwards the cart and the store
// creates the order with its own code. In demo (json) mode the store side is
// simulated by commerce-core (which represents the store's order logic).
export async function createCheckout(cart, { source, products } = {}) {
  const key = sourceKey(source);
  if (key === 'medusa') {
    const url = process.env.STORE_CHECKOUT_URL || `${process.env.MEDUSA_URL || 'http://localhost:9000'}/store/carts/${cart?.store_cart_id || ''}/complete`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cart }) });
    if (!res.ok) return { ok: false, error: `store_checkout_failed_${res.status}` };
    return { ok: true, delegated_to: 'store', order: await res.json() };
  }
  // Demo: the store's checkout is simulated by the shared commerce core.
  const Commerce = require('../src/shared/commerce-core.js');
  const result = Commerce.checkout(cart);
  return result.ok ? { ...result, delegated_to: 'store(simulated)' } : result;
}

// Back-compat alias (older imports) — same read-only catalog pull.
export const loadCatalog = getCatalog;
export const CANONICAL_SOURCES = Object.keys(CATALOG_BY_SOURCE);
