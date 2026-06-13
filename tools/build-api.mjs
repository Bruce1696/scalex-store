// ─────────────────────────────────────────────────────────────
// build-api.mjs — Static, agent-readable API mirror (deliverable C)
//
// Netlify serves only static files, so this pre-renders the READ side
// of the commerce API as static JSON an agent can GET directly:
//
//   /api/products.json              full catalog
//   /api/products/<id>.json         product detail
//   /api/products/<id>/inventory.json   per-variant availability
//   /api/search-index.json          lightweight index for client search
//   /api/openapi.json               machine-readable contract
//   /_redirects                     clean URLs (/api/products/10 → .json)
//
// The write side (cart, checkout) is served by tools/api-server.mjs.
// Run:  node tools/build-api.mjs
// ─────────────────────────────────────────────────────────────
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://dailmyshop.netlify.app';
const products = JSON.parse(await readFile(join(ROOT, 'products.json'), 'utf8'));

const write = async (rel, obj) => {
  const full = join(ROOT, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, JSON.stringify(obj, null, 2) + '\n');
};

// Catalog + per-product + per-product inventory
await write('api/products.json', { count: products.length, products });
for (const p of products) {
  await write(`api/products/${p.id}.json`, p);
  await write(`api/products/${p.id}/inventory.json`, {
    product_id: p.id,
    variants: (p.variants || []).map((v) => ({
      size: v.size, sku: v.sku,
      available: v.availability === 'in_stock' && v.inventory_quantity > 0,
      inventory_quantity: v.inventory_quantity,
    })),
  });
}

// Lightweight search index
await write('api/search-index.json', {
  count: products.length,
  items: products.map((p) => ({
    id: p.id, title: p.title, brand: p.brand, color: p.color,
    category: p.category, price: p.price, sizes: p.sizes,
    availability: p.availability,
  })),
});

// OpenAPI contract (read endpoints are static; write endpoints need the server)
await write('api/openapi.json', {
  openapi: '3.0.3',
  info: { title: 'ScalexStore Agent Commerce API', version: '1.0.0', description: 'Agent-readable commerce endpoints. Read endpoints are static JSON on the CDN; cart/checkout require the commerce server.' },
  servers: [{ url: SITE }],
  paths: {
    '/api/products.json': { get: { summary: 'Full catalog (static)' } },
    '/api/products/{id}.json': { get: { summary: 'Product detail (static)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }] } },
    '/api/products/{id}/inventory.json': { get: { summary: 'Per-variant availability (static)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }] } },
    '/api/search-index.json': { get: { summary: 'Lightweight search index (static)' } },
    '/api/feed.acp.json': { get: { summary: 'ACP / Agentic Commerce Protocol product feed (static; .gz available)' } },
    '/api/feed.google.json': { get: { summary: 'Google Merchant Center style product feed (static; .gz available)' } },
    // Dynamic (Netlify Function) — stateless, client-held cart.
    '/api/search': { post: { summary: 'Live NL product search (dynamic)', requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { q: { type: 'string' } } } } } } } },
    '/api/cart': { post: { summary: 'Create an empty cart (dynamic)' } },
    '/api/cart/items': { post: { summary: 'Add an item — pass the cart back in (dynamic, stateless)', requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['cart', 'product_id', 'size'], properties: { cart: { type: 'object' }, product_id: { type: 'integer' }, size: { type: 'string', example: 'US 10' }, qty: { type: 'integer', default: 1 } } } } } } } },
    '/api/checkout': { post: { summary: 'Initiate checkout (dynamic)', requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['cart'], properties: { cart: { type: 'object' } } } } } } } },
  },
});

// Clean URLs on Netlify (so /api/products/10 works without .json)
await writeFile(
  join(ROOT, '_redirects'),
  [
    '# Clean URLs for the static agent API',
    '/api/products/:id/inventory   /api/products/:id/inventory.json   200',
    '/api/products/:id             /api/products/:id.json             200',
    '/api/products                 /api/products.json                 200',
    '/api/search-index             /api/search-index.json             200',
    '/api/openapi                  /api/openapi.json                  200',
    '',
  ].join('\n')
);

console.log(`✓ api/products.json + ${products.length} product files + inventory`);
console.log('✓ api/search-index.json');
console.log('✓ api/openapi.json');
console.log('✓ _redirects (clean API URLs)');
console.log('\nStatic read-API generated. Dynamic cart/checkout: node tools/api-server.mjs');
