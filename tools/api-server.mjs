// ─────────────────────────────────────────────────────────────
// api-server.mjs — Agent-readable commerce API (deliverable C)
//
// A runnable REST API an AI agent / shopping assistant can consume to
// complete a purchase end-to-end. Thin HTTP layer over commerce-core.js
// (the same logic the scorer's Layer-3 test exercises).
//
//   node tools/api-server.mjs            (listens on http://localhost:8787)
//
// Endpoints
//   GET  /api/health
//   GET  /api/openapi.json                  machine-readable contract
//   GET  /api/products                      full catalog
//   GET  /api/products/:id                  product detail
//   GET  /api/products/:id/inventory        all variants' availability
//   GET  /api/search?q=&color=&category=&max_price=&size=
//   POST /api/cart                          create a cart
//   POST /api/cart/:id/items   {product_id,size,qty}
//   GET  /api/cart/:id
//   POST /api/checkout         {cart_id}
// ─────────────────────────────────────────────────────────────
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Commerce = require('../src/shared/commerce-core.js');
const Discover = require('../src/shared/discover-engine.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT || 8787;
const products = JSON.parse(await readFile(join(ROOT, 'public', 'products.json'), 'utf8'));
const carts = new Map(); // in-memory cart store (demo)

const send = (res, code, body) => {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(body, null, 2));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
  });

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const seg = path.split('/').filter(Boolean); // ['api','products','10']

  try {
    if (path === '/' || path === '/api' || path === '/api/health')
      return send(res, 200, { status: 'ok', service: 'ScalexStore agent commerce API', products: products.length, endpoints: '/api/openapi.json' });

    if (path === '/api/openapi.json') return send(res, 200, openapi(PORT));

    // GET /api/products
    if (req.method === 'GET' && path === '/api/products')
      return send(res, 200, { count: products.length, products });

    // GET /api/search
    if (req.method === 'GET' && path === '/api/search') {
      const q = url.searchParams.get('q') || '';
      // Allow structured params to be folded into the NL query.
      const extra = ['color', 'category', 'brand', 'size'].map((k) => url.searchParams.get(k)).filter(Boolean).join(' ');
      const mp = url.searchParams.get('max_price');
      const query = [q, extra, mp ? `under $${mp}` : ''].filter(Boolean).join(' ').trim();
      const { intent, total, results } = Discover.discover(products, query || 'shoes', { limit: 12 });
      return send(res, 200, {
        query, interpreted_as: intent, total,
        results: results.map((r) => ({ id: r.product.id, title: r.product.title, brand: r.product.brand, price: r.product.price, color: r.product.color, category: r.product.category, score: r.score, why: r.reasons.map((x) => x.label) })),
      });
    }

    // GET /api/products/:id  and  /api/products/:id/inventory
    if (req.method === 'GET' && seg[0] === 'api' && seg[1] === 'products' && seg[2]) {
      const p = Commerce.getProduct(products, seg[2]);
      if (!p) return send(res, 404, { error: 'product_not_found' });
      if (seg[3] === 'inventory') return send(res, 200, Commerce.checkInventory(products, seg[2]));
      return send(res, 200, p);
    }

    // POST /api/cart  → create
    if (req.method === 'POST' && path === '/api/cart') {
      const cart = Commerce.createCart();
      carts.set(cart.id, cart);
      return send(res, 201, { ...cart, totals: Commerce.cartTotals(cart) });
    }

    // GET /api/cart/:id
    if (req.method === 'GET' && seg[1] === 'cart' && seg[2]) {
      const cart = carts.get(seg[2]);
      if (!cart) return send(res, 404, { error: 'cart_not_found' });
      return send(res, 200, { ...cart, totals: Commerce.cartTotals(cart) });
    }

    // POST /api/cart/:id/items  → add item
    if (req.method === 'POST' && seg[1] === 'cart' && seg[2] && seg[3] === 'items') {
      const cart = carts.get(seg[2]);
      if (!cart) return send(res, 404, { error: 'cart_not_found' });
      const { product_id, size, qty } = await readBody(req);
      const r = Commerce.addItem(cart, products, product_id, size, qty || 1);
      return send(res, r.ok ? 200 : 422, r);
    }

    // POST /api/checkout  {cart_id}
    if (req.method === 'POST' && path === '/api/checkout') {
      const { cart_id } = await readBody(req);
      const cart = carts.get(cart_id);
      if (!cart) return send(res, 404, { error: 'cart_not_found' });
      const r = Commerce.checkout(cart);
      return send(res, r.ok ? 201 : 422, r);
    }

    return send(res, 404, { error: 'not_found', path });
  } catch (e) {
    return send(res, 500, { error: 'server_error', message: String(e && e.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`ScalexStore agent commerce API → http://localhost:${PORT}`);
  console.log(`Contract: http://localhost:${PORT}/api/openapi.json`);
});

function openapi(port) {
  return {
    openapi: '3.0.3',
    info: { title: 'ScalexStore Agent Commerce API', version: '1.0.0', description: 'Agent-readable commerce endpoints: search, detail, inventory, cart, checkout.' },
    servers: [{ url: `http://localhost:${port}` }, { url: 'https://dailmyshop.netlify.app' }],
    paths: {
      '/api/search': { get: { summary: 'Natural-language + structured product search', parameters: [
        { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Natural-language query' },
        { name: 'color', in: 'query', schema: { type: 'string' } },
        { name: 'category', in: 'query', schema: { type: 'string', enum: ['sneakers', 'running', 'boots', 'sandals'] } },
        { name: 'max_price', in: 'query', schema: { type: 'number' } },
        { name: 'size', in: 'query', schema: { type: 'string', example: 'US 10' } },
      ] } },
      '/api/products': { get: { summary: 'List the full catalog' } },
      '/api/products/{id}': { get: { summary: 'Product detail', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }] } },
      '/api/products/{id}/inventory': { get: { summary: 'Per-variant availability', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }] } },
      '/api/cart': { post: { summary: 'Create a cart' } },
      '/api/cart/{id}': { get: { summary: 'Get a cart' } },
      '/api/cart/{id}/items': { post: { summary: 'Add an item', requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['product_id', 'size'], properties: { product_id: { type: 'integer' }, size: { type: 'string', example: 'US 10' }, qty: { type: 'integer', default: 1 } } } } } } } },
      '/api/checkout': { post: { summary: 'Initiate checkout', requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['cart_id'], properties: { cart_id: { type: 'string' } } } } } } } },
    },
  };
}
