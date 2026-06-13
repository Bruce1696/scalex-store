// ─────────────────────────────────────────────────────────────
// discover-engine.js — Natural-language product discovery engine
//
// The "shopping agent" brain. Turns a plain-English query like
//   "black sneakers under $100 in size 10"
// into structured intent, then filters + ranks the catalog and
// explains WHY each product was selected (transparency is a core
// requirement of the brief).
//
// Pure, dependency-free. Runs in the browser (global `Discover`)
// and in Node (module.exports), so the CLI, the browser demo and
// the scorer all share one engine.
// ─────────────────────────────────────────────────────────────
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Discover = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Category words → canonical category in the catalog.
  const CATEGORY_SYNS = {
    sneakers: ['sneaker', 'sneakers', 'trainer', 'trainers', 'kicks'],
    running: ['running', 'run', 'jog', 'jogging', 'runner'],
    boots: ['boot', 'boots'],
    sandals: ['sandal', 'sandals', 'slides', 'flip flop', 'flip-flop'],
  };

  // Soft intent words → extra terms to look for in product text.
  const SYNONYMS = {
    lightweight: ['lightweight', 'light'],
    waterproof: ['waterproof', 'water'],
    formal: ['formal', 'business', 'dress', 'office'],
    casual: ['casual', 'everyday', 'street'],
    comfortable: ['comfort', 'cushion', 'plush', 'soft'],
    durable: ['durable', 'rugged', 'tough', 'last'],
    gym: ['gym', 'training', 'workout', 'performance', 'train'],
    breathable: ['breathable', 'mesh', 'ventilation'],
    vegan: ['vegan', 'recycled', 'synthetic'],
    iconic: ['iconic', 'classic', 'timeless', 'heritage'],
    grip: ['grip', 'traction', 'outsole'],
  };

  const STOP = new Set([
    'find', 'show', 'me', 'a', 'an', 'the', 'for', 'in', 'on', 'with', 'and', 'or', 'of', 'to',
    'under', 'below', 'over', 'above', 'less', 'more', 'than', 'between', 'up', 'max', 'min',
    'size', 'us', 'shoes', 'shoe', 'pair', 'looking', 'want', 'need', 'get', 'that', 'are', 'is',
    'recommend', 'suggest', 'some', 'any', 'good', 'best', 'cheap', 'cheaper', 'price', 'around',
    'please', 'i', 'my', 'something', 'available', 'shopping', 'buy', 'color', 'colour',
  ]);

  function buildVocab(products) {
    const colors = new Set();
    const brands = [];
    const seenBrand = new Set();
    for (const p of products) {
      String(p.color || '').toLowerCase().split(/\s+/).forEach((w) => w && colors.add(w));
      if (p.color) colors.add(String(p.color).toLowerCase());
      const b = String(p.brand || '').toLowerCase();
      if (b && !seenBrand.has(b)) { seenBrand.add(b); brands.push({ name: p.brand, lc: b }); }
    }
    colors.add('grey'); colors.add('gray');
    // Longer brand names first so "new balance" matches before "balance".
    brands.sort((a, b) => b.lc.length - a.lc.length);
    return { colors: [...colors], brands };
  }

  function parseQuery(query, vocab) {
    const s = ' ' + String(query).toLowerCase().replace(/[^a-z0-9$.\s-]/g, ' ').replace(/\s+/g, ' ') + ' ';
    const intent = { raw: query, colors: [], category: null, brand: null, size: null, maxPrice: null, minPrice: null, keywords: [] };
    let m;

    // Price
    if ((m = s.match(/(?:under|below|less than|up to|max|cheaper than|<)\s*\$?\s*(\d+(?:\.\d+)?)/))) intent.maxPrice = +m[1];
    if ((m = s.match(/(?:over|above|more than|min|at least|>)\s*\$?\s*(\d+(?:\.\d+)?)/))) intent.minPrice = +m[1];
    if ((m = s.match(/between\s*\$?(\d+)\s*(?:and|to|-)\s*\$?(\d+)/))) { intent.minPrice = +m[1]; intent.maxPrice = +m[2]; }

    // Size  ("size 10", "size us 10", "in a 10")
    if ((m = s.match(/\bsize\s*(?:us\s*)?(\d{1,2})\b/)) || (m = s.match(/\bus\s*(\d{1,2})\b/))) intent.size = 'US ' + m[1];

    // Category
    for (const [cat, syns] of Object.entries(CATEGORY_SYNS)) {
      if (syns.some((w) => s.includes(' ' + w + ' ') || s.includes(' ' + w))) { intent.category = cat; break; }
    }

    // Colors (any number)
    for (const c of vocab.colors) if (c.length > 2 && s.includes(' ' + c)) intent.colors.push(c);
    if (s.includes(' gray') && !intent.colors.includes('grey')) intent.colors.push('grey');
    intent.colors = [...new Set(intent.colors)];

    // Brand
    for (const b of vocab.brands) if (s.includes(' ' + b.lc)) { intent.brand = b.name; break; }

    // Soft keywords: leftover meaningful tokens
    const known = new Set([
      ...vocab.colors,
      ...vocab.brands.flatMap((b) => b.lc.split(/\s+/)),
      ...Object.values(CATEGORY_SYNS).flat(),
    ]);
    for (const tok of s.trim().split(' ')) {
      if (tok.length < 3 || STOP.has(tok) || known.has(tok) || /^\$?\d/.test(tok)) continue;
      intent.keywords.push(tok);
    }
    intent.keywords = [...new Set(intent.keywords)];
    return intent;
  }

  function scoreProduct(p, intent) {
    const reasons = [];
    let score = 0;
    const text = [p.title, p.description, p.material, p.category, p.brand].join(' ').toLowerCase();

    // ── Hard filters: a stated constraint must be satisfied ──
    if (intent.category) {
      if (p.category !== intent.category) return null;
      score += 30; reasons.push({ kind: 'filter', label: `${p.category}` });
    }
    if (intent.colors.length) {
      const pc = String(p.color).toLowerCase();
      const hit = intent.colors.find((c) => pc.includes(c) || c.includes(pc));
      if (!hit) return null;
      score += 20; reasons.push({ kind: 'filter', label: `${p.color}` });
    }
    if (intent.maxPrice != null) {
      if (p.price > intent.maxPrice) return null;
      score += 15; reasons.push({ kind: 'filter', label: `$${p.price.toFixed(2)} ≤ $${intent.maxPrice}` });
    }
    if (intent.minPrice != null) {
      if (p.price < intent.minPrice) return null;
      score += 10; reasons.push({ kind: 'filter', label: `$${p.price.toFixed(2)} ≥ $${intent.minPrice}` });
    }
    if (intent.size) {
      const v = (p.variants || []).find((x) => x.size === intent.size);
      if (!v || v.availability !== 'in_stock' || v.inventory_quantity <= 0) return null;
      score += 15; reasons.push({ kind: 'filter', label: `${intent.size} in stock (${v.inventory_quantity} left)` });
    }
    if (intent.brand) {
      if (p.brand !== intent.brand) return null;
      score += 20; reasons.push({ kind: 'filter', label: `${p.brand}` });
    }

    // ── Soft signals: rank within the eligible set ──
    for (const k of intent.keywords) {
      const terms = SYNONYMS[k] || [k];
      if (terms.some((t) => text.includes(t))) { score += 6; reasons.push({ kind: 'match', label: `“${k}”` }); }
    }
    score += p.rating.rate; // quality tiebreak
    if (p.availability === 'in_stock') score += 2;

    return { score: Math.round(score * 10) / 10, reasons };
  }

  function discover(products, query, opts) {
    const limit = (opts && opts.limit) || 6;
    const vocab = buildVocab(products);
    const intent = parseQuery(query, vocab);
    const results = products
      .map((p) => {
        const r = scoreProduct(p, intent);
        return r ? { product: p, score: r.score, reasons: r.reasons } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    return { intent, total: results.length, results: results.slice(0, limit) };
  }

  return { discover, parseQuery, buildVocab, scoreProduct };
});
