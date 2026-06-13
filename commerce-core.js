// ─────────────────────────────────────────────────────────────
// commerce-core.js — Agent-readable commerce logic (shared core)
//
// The single source of truth for the commerce operations an AI agent
// needs to drive a purchase: search → product detail → inventory check
// → variant selection → cart → checkout initiation.
//
// Pure logic, no I/O. The live API server (tools/api-server.mjs) wraps
// it over HTTP; the scorer (tools/audit.mjs) runs the same functions
// in-process to test "Agent Workflow Readiness" (test-engine Layer 3).
// UMD: works in Node (require) and the browser (global `Commerce`).
// ─────────────────────────────────────────────────────────────
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./discover-engine.js'));
  else root.Commerce = factory(root.Discover);
})(typeof self !== 'undefined' ? self : this, function (Discover) {
  let cartSeq = 1000;
  let orderSeq = 5000;

  const getProduct = (products, id) => products.find((p) => String(p.id) === String(id)) || null;

  const normSize = (s) => {
    if (s == null || s === '') return null;
    const str = String(s).trim();
    return /^us\s/i.test(str) ? 'US ' + str.replace(/^us\s*/i, '') : 'US ' + str;
  };

  // search(products, "black sneakers under $100") → ranked + explained
  function search(products, query, opts) {
    return Discover.discover(products, query, opts || { limit: 8 });
  }

  // checkInventory(products, id[, size]) → variant-level availability
  function checkInventory(products, id, size) {
    const p = getProduct(products, id);
    if (!p) return { error: 'product_not_found' };
    const variants = p.variants || [];
    if (size) {
      const sz = normSize(size);
      const v = variants.find((x) => x.size === sz);
      if (!v) return { product_id: p.id, size: sz, available: false, reason: 'no_such_variant' };
      return {
        product_id: p.id, size: v.size,
        available: v.availability === 'in_stock' && v.inventory_quantity > 0,
        inventory_quantity: v.inventory_quantity,
      };
    }
    return {
      product_id: p.id,
      variants: variants.map((v) => ({
        size: v.size, sku: v.sku,
        available: v.availability === 'in_stock' && v.inventory_quantity > 0,
        inventory_quantity: v.inventory_quantity,
      })),
    };
  }

  function createCart(id) {
    return { id: id || 'cart_' + ++cartSeq, items: [] };
  }

  // addItem — validates product, variant, stock and quantity.
  function addItem(cart, products, id, size, qty) {
    qty = qty || 1;
    const p = getProduct(products, id);
    if (!p) return { ok: false, error: 'product_not_found' };

    let chosen = null;
    if (p.variants && p.variants.length) {
      const sz = normSize(size);
      if (!sz) return { ok: false, error: 'variant_required', available_sizes: p.variants.map((v) => v.size) };
      chosen = p.variants.find((v) => v.size === sz);
      if (!chosen) return { ok: false, error: 'no_such_variant', available_sizes: p.variants.map((v) => v.size) };
      if (chosen.availability !== 'in_stock' || chosen.inventory_quantity <= 0) return { ok: false, error: 'out_of_stock' };
    }

    const key = p.id + '|' + (chosen ? chosen.size : '');
    const existing = cart.items.find((i) => i.key === key);
    const have = existing ? existing.qty : 0;
    if (chosen && have + qty > chosen.inventory_quantity)
      return { ok: false, error: 'insufficient_inventory', max_available: chosen.inventory_quantity };

    if (existing) existing.qty += qty;
    else cart.items.push({
      key, product_id: p.id, sku: chosen ? chosen.sku : 'SKU-' + p.id,
      title: p.title, size: chosen ? chosen.size : null, price: p.price, qty,
    });
    return { ok: true, cart, totals: cartTotals(cart) };
  }

  function removeItem(cart, id, size) {
    const key = id + '|' + (normSize(size) || '');
    cart.items = cart.items.filter((i) => i.key !== key);
    return { ok: true, cart, totals: cartTotals(cart) };
  }

  function cartTotals(cart) {
    const count = cart.items.reduce((s, i) => s + i.qty, 0);
    const subtotal = Math.round(cart.items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;
    return { item_count: count, subtotal, currency: 'USD' };
  }

  // checkout — ACP-aligned order intent (no payment captured).
  function checkout(cart) {
    if (!cart.items.length) return { ok: false, error: 'empty_cart' };
    const t = cartTotals(cart);
    return {
      ok: true,
      order: {
        order_id: 'ord_' + ++orderSeq,
        status: 'pending_payment',
        currency: 'USD',
        line_items: cart.items.map((i) => ({
          sku: i.sku, title: i.title, size: i.size,
          unit_price: i.price, quantity: i.qty,
          line_total: Math.round(i.price * i.qty * 100) / 100,
        })),
        subtotal: t.subtotal,
        item_count: t.item_count,
        fulfillment: { method: 'standard_shipping', eta_days: 5, price: 0.0 },
        return_policy: { window_days: 30, free_returns: true },
        payment: { accepted_methods: ['card', 'apple_pay', 'google_pay'], status: 'awaiting' },
      },
    };
  }

  return { getProduct, search, checkInventory, createCart, addItem, removeItem, cartTotals, checkout, normSize };
});
