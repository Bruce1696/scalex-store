// ─────────────────────────────────────────────────────────────
// netlify/functions/commerce.mjs — Live agent commerce API (serverless)
//
// The WRITE side of the agent commerce API (search + cart + checkout),
// running as a Netlify Function so a *static* site can still expose
// dynamic, agent-drivable endpoints with no server to host.
//
// Same logic the scorer's Layer-3 test and tools/api-server.mjs use:
// it imports commerce-core.js directly (esbuild bundles it + the feed).
//
// Serverless is stateless, so the cart is CLIENT-HELD: each call returns
// the full cart object and the agent passes it back on the next call.
// This mirrors how real agent runtimes carry conversation state.
//
//   POST /api/search        { q }                         → ranked products + why
//   POST /api/cart          {}                            → new empty cart
//   POST /api/cart/items    { cart, product_id, size, qty } → updated cart
//   POST /api/checkout      { cart }                       → ACP order intent
//   GET  /api/health
//
// Routing is configured in netlify.toml ([[redirects]] → this function).
// ─────────────────────────────────────────────────────────────
import { createRequire } from 'node:module';
import products from '../../products.json' with { type: 'json' };

const require = createRequire(import.meta.url);
const Commerce = require('../../commerce-core.js');
const Discover = require('../../discover-engine.js');

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  },
  body: JSON.stringify(body, null, 2),
});

// Rehydrate a client-held cart (or make a fresh one) so commerce-core can
// operate on it. We trust only the items array the client sends back.
const rehydrate = (cart) => {
  const c = Commerce.createCart(cart?.id);
  if (Array.isArray(cart?.items)) c.items = cart.items;
  return c;
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});

  // Route tail, robust to either invocation form Netlify may use:
  //   /api/cart/items                              (rewrite keeps original path)
  //   /.netlify/functions/commerce/cart/items      (splat-forwarded path)
  const path = (event.path || '').replace(/\/+$/, '');
  const tail = path
    .replace(/^\/\.netlify\/functions\/commerce\/?/, '')
    .replace(/^\/?api\/?/, '');
  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch { /* ignore */ }

  try {
    if (tail === 'health' || tail === '')
      return json(200, { status: 'ok', service: 'ScalexStore live agent commerce', products: products.length, stateless_cart: true });

    // POST /api/search  { q }  (live NL search; static mirror lives at /api/search-index.json)
    if (tail === 'search') {
      const q = body.q || (event.queryStringParameters?.q) || 'shoes';
      const { intent, total, results } = Discover.discover(products, q, { limit: 12 });
      return json(200, {
        query: q, interpreted_as: intent, total,
        results: results.map((r) => ({
          id: r.product.id, title: r.product.title, brand: r.product.brand,
          price: r.product.price, color: r.product.color, category: r.product.category,
          score: r.score, why: r.reasons.map((x) => x.label),
        })),
      });
    }

    // POST /api/cart  → create an empty client-held cart
    if (tail === 'cart' && event.httpMethod === 'POST') {
      const cart = Commerce.createCart();
      return json(201, { ...cart, totals: Commerce.cartTotals(cart) });
    }

    // POST /api/cart/items  { cart, product_id, size, qty }
    if (tail === 'cart/items') {
      const cart = rehydrate(body.cart);
      const r = Commerce.addItem(cart, products, body.product_id, body.size, body.qty || 1);
      return json(r.ok ? 200 : 422, r);
    }

    // POST /api/checkout  { cart }
    if (tail === 'checkout') {
      const cart = rehydrate(body.cart);
      const r = Commerce.checkout(cart);
      return json(r.ok ? 201 : 422, r);
    }

    return json(404, { error: 'not_found', path, tail });
  } catch (e) {
    return json(500, { error: 'server_error', message: String((e && e.message) || e) });
  }
};
