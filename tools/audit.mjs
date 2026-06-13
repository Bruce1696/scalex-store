// ─────────────────────────────────────────────────────────────
// audit.mjs — AI Discoverability Test Engine (shared audit core)
//
// Runs every readiness check across the three layers required by the
// brief and returns a STRUCTURED result. Consumed by:
//   • tools/score.mjs   → terminal report
//   • tools/report.mjs  → shareable HTML readiness report
//
//   Layer 1  Structural Readiness   (crawlability, schema, feed fields)
//   Layer 2  Semantic Discoverability (NL query → right products)
//   Layer 3  Agent Workflow Readiness (search → cart → checkout)
// ─────────────────────────────────────────────────────────────
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Discover from '../discover-engine.js';
import Commerce from '../commerce-core.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const AGENTS = { gpt: 'ChatGPT', gem: 'Gemini', plx: 'Perplexity', shop: 'Shopping' };
export const grade = (pct) => (pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 65 ? 'C' : pct >= 50 ? 'D' : 'F');

// ── The three readiness layers required by the brief ───────────
// Every check belongs to exactly one layer (via its group). Layer
// scores are surfaced alongside the per-agent and per-group views.
export const LAYERS = {
  1: 'Structural Readiness',     // can a crawler reach, render & parse it?
  2: 'Semantic Discoverability', // does NL search return the right products?
  3: 'Agent Workflow Readiness', // can an agent search → cart → checkout?
};
const GROUP_LAYER = {
  'Crawlability': 1, 'Structured Data': 1, 'SEO Basics': 1, 'Content Rendering': 1, 'Feed Quality': 1,
  'Semantic Discovery': 2,
  'Agent Workflow': 3,
};

async function readSafe(name) {
  try { return await readFile(join(ROOT, name), 'utf8'); } catch { return ''; }
}
async function fetchSafe(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'GPTBot/1.0' } });
    return r.ok ? await r.text() : '';
  } catch { return ''; }
}

export async function audit(liveUrl) {
  const A = AGENTS;
  const site = {};
  if (liveUrl) {
    const base = liveUrl.replace(/\/[^/]*$/, '');
    site.index = await fetchSafe(liveUrl);
    site.product = await fetchSafe(`${base}/product-10.html`);
    site.robots = await fetchSafe(`${base}/robots.txt`);
    site.sitemap = await fetchSafe(`${base}/sitemap.xml`);
    site.llms = await fetchSafe(`${base}/llms.txt`);
    site.feed = await fetchSafe(`${base}/products.json`);
    site.acp = await fetchSafe(`${base}/api/feed.acp.json`);
  } else {
    site.index = await readSafe('index.html');
    site.product = await readSafe('product-10.html');
    site.robots = await readSafe('robots.txt');
    site.sitemap = await readSafe('sitemap.xml');
    site.llms = await readSafe('llms.txt');
    site.feed = await readSafe('products.json');
    site.acp = await readSafe('api/feed.acp.json');
  }
  let feed = [];
  try { feed = JSON.parse(site.feed); } catch {}
  let acp = {};
  try { acp = JSON.parse(site.acp); } catch {}

  const has = (s, ...n) => n.every((x) => s.includes(x));
  const sem = (q) => (feed.length ? Discover.discover(feed, q, { limit: 5 }) : { results: [] });

  // ── Pre-run a full agent purchase journey for Layer 3 ──────
  const flow = runAgentJourney(feed);

  const checks = [
    // ── Layer 1: Crawlability ──────────────────────────────
    { group: 'Crawlability', label: 'robots.txt exists', weight: 2, agents: [A.gpt, A.gem, A.plx, A.shop],
      test: () => site.robots.length > 0, fix: 'Add a robots.txt at the site root.' },
    { group: 'Crawlability', label: 'Allows GPTBot (OpenAI)', weight: 2, agents: [A.gpt],
      test: () => /GPTBot/i.test(site.robots), fix: 'Add "User-agent: GPTBot / Allow: /" to robots.txt.' },
    { group: 'Crawlability', label: 'Allows Google-Extended (Gemini)', weight: 2, agents: [A.gem],
      test: () => /Google-Extended/i.test(site.robots), fix: 'Add "User-agent: Google-Extended / Allow: /".' },
    { group: 'Crawlability', label: 'Allows PerplexityBot', weight: 1, agents: [A.plx],
      test: () => /PerplexityBot/i.test(site.robots), fix: 'Add "User-agent: PerplexityBot / Allow: /".' },
    { group: 'Crawlability', label: 'sitemap.xml exists & linked', weight: 2, agents: [A.gem, A.shop],
      test: () => site.sitemap.includes('<urlset') && /Sitemap:/i.test(site.robots), fix: 'Generate sitemap.xml and link it in robots.txt.' },
    { group: 'Crawlability', label: 'llms.txt exists', weight: 1, agents: [A.gpt, A.plx],
      test: () => site.llms.length > 0, fix: 'Add an llms.txt summarising the catalog.' },
    { group: 'Crawlability', label: 'JSON product feed exists', weight: 2, agents: [A.gpt, A.shop],
      test: () => Array.isArray(feed) && feed.length > 0, fix: 'Expose the catalog as products.json.' },

    // ── Layer 1: Structured Data ───────────────────────────
    { group: 'Structured Data', label: 'JSON-LD on home page', weight: 2, agents: [A.gpt, A.gem, A.plx],
      test: () => has(site.index, 'application/ld+json'), fix: 'Inject schema.org JSON-LD into index.html.' },
    { group: 'Structured Data', label: 'ItemList catalog schema', weight: 1, agents: [A.gem, A.shop],
      test: () => has(site.index, '"ItemList"'), fix: 'Add an ItemList JSON-LD node.' },
    { group: 'Structured Data', label: 'Product schema with Offer', weight: 2, agents: [A.gpt, A.gem, A.shop],
      test: () => has(site.index, '"Product"') && has(site.index, '"Offer"'), fix: 'Embed Product nodes with Offers.' },
    { group: 'Structured Data', label: 'Organization / WebSite schema', weight: 1, agents: [A.gem],
      test: () => has(site.index, '"Organization"') || has(site.index, '"WebSite"'), fix: 'Add Organization/WebSite JSON-LD.' },
    { group: 'Structured Data', label: 'Product page JSON-LD with brand', weight: 2, agents: [A.gpt, A.gem, A.shop],
      test: () => has(site.product, 'application/ld+json') && has(site.product, '"Brand"'), fix: 'Embed per-product JSON-LD with brand.' },

    // ── Layer 1: SEO Basics ────────────────────────────────
    { group: 'SEO Basics', label: 'Meta description', weight: 1, agents: [A.gpt, A.gem, A.plx],
      test: () => /<meta\s+name="description"/i.test(site.index), fix: 'Add a meta description.' },
    { group: 'SEO Basics', label: 'Canonical URL', weight: 1, agents: [A.gem],
      test: () => /rel="canonical"/i.test(site.index), fix: 'Add a canonical link.' },
    { group: 'SEO Basics', label: 'OpenGraph tags', weight: 1, agents: [A.gpt, A.plx],
      test: () => has(site.index, 'og:title') && has(site.index, 'og:image'), fix: 'Add OpenGraph meta tags.' },
    { group: 'SEO Basics', label: 'Twitter card', weight: 1, agents: [A.plx],
      test: () => has(site.index, 'twitter:card'), fix: 'Add a twitter:card meta tag.' },

    // ── Layer 1: Content Rendering ─────────────────────────
    { group: 'Content Rendering', label: 'Catalog readable without JS (home)', weight: 3, agents: [A.gpt, A.gem, A.plx, A.shop],
      test: () => feed.length > 0 && feed.slice(0, 3).every((p) => site.index.includes(p.title)), fix: 'Embed product names in static HTML.' },
    { group: 'Content Rendering', label: 'Product detail readable without JS', weight: 3, agents: [A.gpt, A.gem, A.plx, A.shop],
      test: () => feed.length > 0 && site.product.includes(feed.find((p) => p.id === 10)?.title || '###'), fix: 'Generate static product-N.html pages.' },
    { group: 'Content Rendering', label: 'Variants/sizes visible on product page', weight: 2, agents: [A.gpt, A.shop],
      test: () => /US 1[012]|US [789]/.test(site.product), fix: 'Render available sizes in the static page.' },

    // ── Layer 1: Feed Quality (ACP / Google Merchant) ──────
    { group: 'Feed Quality', label: 'Products have brand', weight: 1, agents: [A.shop],
      test: () => feed.length > 0 && feed.every((p) => p.brand), fix: 'Add a brand to every product.' },
    { group: 'Feed Quality', label: 'Products have GTIN/MPN', weight: 1, agents: [A.shop],
      test: () => feed.length > 0 && feed.every((p) => p.gtin || p.mpn), fix: 'Add GTIN/MPN identifiers.' },
    { group: 'Feed Quality', label: 'Products have availability', weight: 2, agents: [A.shop, A.gpt],
      test: () => feed.length > 0 && feed.every((p) => p.availability), fix: 'Add an availability field.' },
    { group: 'Feed Quality', label: 'Products have variants (size/color)', weight: 2, agents: [A.shop, A.gpt],
      test: () => feed.length > 0 && feed.every((p) => Array.isArray(p.variants) && p.variants.length), fix: 'Add a variants array.' },
    { group: 'Feed Quality', label: 'Google product category mapped', weight: 1, agents: [A.shop],
      test: () => feed.length > 0 && feed.every((p) => p.google_product_category), fix: 'Map a Google product category.' },
    { group: 'Feed Quality', label: 'ACP eligibility flags on products', weight: 2, agents: [A.gpt, A.shop],
      test: () => feed.length > 0 && feed.every((p) => typeof p.enable_search === 'boolean' && typeof p.enable_checkout === 'boolean'),
      fix: 'Add enable_search/enable_checkout flags (node tools/enrich.mjs).' },
    { group: 'Feed Quality', label: 'ACP product feed generated (price + availability + checkout)', weight: 2, agents: [A.gpt, A.shop],
      test: () => Array.isArray(acp.products) && acp.products.length > 0 && acp.products.every((i) => /\d\s+[A-Z]{3}$/.test(String(i.price || '')) && i.availability && typeof i.enable_checkout === 'boolean'),
      fix: 'Generate the ACP feed: node tools/build-feed.mjs.' },

    // ── Layer 2: Semantic Discoverability ──────────────────
    { group: 'Semantic Discovery', label: 'Colour+category+price query filters correctly', weight: 2, agents: [A.gpt, A.gem, A.plx],
      test: () => { const { results } = sem('black sneakers under $100'); return results.length > 0 && results.every((r) => r.product.category === 'sneakers' && String(r.product.color).toLowerCase().includes('black') && r.product.price <= 100); },
      fix: 'Apply category/colour/price as hard filters in the query parser.' },
    { group: 'Semantic Discovery', label: 'Attribute query returns the right product', weight: 2, agents: [A.gpt, A.plx, A.shop],
      test: () => { const { results } = sem('brown boots under $200'); return results[0] && results[0].product.category === 'boots' && String(results[0].product.color).toLowerCase().includes('brown'); },
      fix: 'Match colour/material attributes from the feed.' },
    { group: 'Semantic Discovery', label: 'Keyword intent ranks the right product first', weight: 1, agents: [A.gpt, A.gem],
      test: () => { const { results } = sem('waterproof boots'); return results[0] && /Timberland/i.test(results[0].product.title); },
      fix: 'Score description keyword matches for intent ranking.' },
    { group: 'Semantic Discovery', label: 'Size query respects per-variant inventory', weight: 2, agents: [A.gpt, A.shop],
      test: () => { const { results } = sem('sandals in size 9'); return results.length > 0 && results.every((r) => (r.product.variants || []).some((v) => v.size === 'US 9' && v.availability === 'in_stock' && v.inventory_quantity > 0)); },
      fix: 'Resolve size requests against variant inventory.' },

    // ── Layer 3: Agent Workflow Readiness ──────────────────
    { group: 'Agent Workflow', label: 'Search resolves to a concrete product', weight: 2, agents: [A.gpt, A.shop],
      test: () => flow.product != null, fix: 'Expose a search endpoint that returns product ids.' },
    { group: 'Agent Workflow', label: 'Inventory check returns variant availability', weight: 2, agents: [A.gpt, A.shop],
      test: () => flow.inventory && flow.inventory.available === true, fix: 'Expose per-variant inventory lookup.' },
    { group: 'Agent Workflow', label: 'Add-to-cart succeeds with a valid variant', weight: 2, agents: [A.gpt, A.shop],
      test: () => flow.added && flow.added.ok === true, fix: 'Support cart creation + add item with variant.' },
    { group: 'Agent Workflow', label: 'Cart rejects missing/invalid variant (no ambiguity)', weight: 1, agents: [A.gpt, A.shop],
      test: () => flow.rejected && flow.rejected.ok === false && !!flow.rejected.error, fix: 'Validate variant/stock and return clear errors.' },
    { group: 'Agent Workflow', label: 'Checkout initiates with order total', weight: 2, agents: [A.gpt, A.shop],
      test: () => flow.order && flow.order.ok === true && flow.order.order.subtotal > 0, fix: 'Expose a checkout endpoint returning an order intent.' },
  ];

  for (const c of checks) {
    c.layer = GROUP_LAYER[c.group];
    try { c.pass = !!c.test(); } catch { c.pass = false; }
    delete c.test;
  }

  const pctOf = (sub) => {
    const tot = sub.reduce((s, c) => s + c.weight, 0);
    const got = sub.reduce((s, c) => s + (c.pass ? c.weight : 0), 0);
    return tot ? Math.round((got / tot) * 100) : 0;
  };

  const overall = pctOf(checks);
  const groupNames = [...new Set(checks.map((c) => c.group))];

  // The brief's three layers, scored by weight.
  const layers = Object.entries(LAYERS).map(([id, name]) => {
    const sub = checks.filter((c) => c.layer === Number(id));
    return { id: Number(id), name, pct: pctOf(sub), passed: sub.filter((c) => c.pass).length, total: sub.length, grade: grade(pctOf(sub)) };
  });

  return {
    source: liveUrl ? `LIVE: ${liveUrl}` : 'LOCAL FILES',
    overall,
    grade: grade(overall),
    layers,
    agents: Object.values(A).map((name) => {
      const sub = checks.filter((c) => c.agents.includes(name));
      const pct = pctOf(sub);
      return { name, pct, grade: grade(pct) };
    }),
    groups: groupNames.map((name) => {
      const sub = checks.filter((c) => c.group === name);
      return { name, pct: pctOf(sub), passed: sub.filter((c) => c.pass).length, total: sub.length };
    }),
    checks,
    passedCount: checks.filter((c) => c.pass).length,
    total: checks.length,
    feed: feed.length
      ? { count: feed.length, brands: [...new Set(feed.map((p) => p.brand))], fields: Object.keys(feed[0]).length, variants: feed.reduce((s, p) => s + (p.variants || []).length, 0) }
      : { count: 0, brands: [], fields: 0, variants: 0 },
    flow,
  };
}

// Scripted agent purchase journey used by the Layer-3 checks + report.
function runAgentJourney(feed) {
  if (!feed.length) return {};
  const found = Commerce.search(feed, 'black sneakers under $100', { limit: 3 });
  const product = found.results[0] ? found.results[0].product : null;
  if (!product) return { found };
  const size = (product.variants && product.variants.find((v) => v.availability === 'in_stock')?.size) || 'US 10';
  const inventory = Commerce.checkInventory(feed, product.id, size);
  const cart = Commerce.createCart();
  const added = Commerce.addItem(cart, feed, product.id, size, 1);
  const rejected = Commerce.addItem(cart, feed, product.id, null, 1); // no size → must be rejected
  const order = Commerce.checkout(cart);
  return { query: 'black sneakers under $100', product, size, inventory, added, rejected, order };
}
