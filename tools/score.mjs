// ─────────────────────────────────────────────────────────────
// score.mjs — AI Discoverability Test Engine
//
// Audits the site and reports how ready it is to be found, read and
// understood by AI agents and search crawlers. Produces:
//   • an overall AI-readiness score (0–100)
//   • per-agent scores (ChatGPT, Gemini, Perplexity, Google Shopping)
//   • the failed checks, with a one-line fix for each
//
// Modes:
//   node tools/score.mjs            → audit local files (what we control)
//   node tools/score.mjs <url>      → fetch a live URL and audit the
//                                      RAW HTML a crawler sees (pre-JS)
// ─────────────────────────────────────────────────────────────
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Discover from '../discover-engine.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const liveUrl = process.argv[2] || null;

// ── ANSI helpers ─────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};
const bar = (pct) => {
  const n = Math.round(pct / 5);
  const col = pct >= 80 ? C.green : pct >= 50 ? C.yellow : C.red;
  return col + '█'.repeat(n) + C.dim + '░'.repeat(20 - n) + C.reset;
};
const grade = (pct) =>
  pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 65 ? 'C' : pct >= 50 ? 'D' : 'F';

// ── Load the site artifacts ──────────────────────────────────
async function readSafe(name) {
  try { return await readFile(join(ROOT, name), 'utf8'); }
  catch { return ''; }
}
async function fetchSafe(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'GPTBot/1.0' } });
    return r.ok ? await r.text() : '';
  } catch { return ''; }
}

const site = {};
if (liveUrl) {
  const base = liveUrl.replace(/\/[^/]*$/, '');
  site.index = await fetchSafe(liveUrl);
  site.product = await fetchSafe(`${base}/product-10.html`);
  site.robots = await fetchSafe(`${base}/robots.txt`);
  site.sitemap = await fetchSafe(`${base}/sitemap.xml`);
  site.llms = await fetchSafe(`${base}/llms.txt`);
  site.feed = await fetchSafe(`${base}/products.json`);
} else {
  site.index = await readSafe('index.html');
  site.product = await readSafe('product-10.html'); // a representative static product page
  site.robots = await readSafe('robots.txt');
  site.sitemap = await readSafe('sitemap.xml');
  site.llms = await readSafe('llms.txt');
  site.feed = await readSafe('products.json');
}
let feed = [];
try { feed = JSON.parse(site.feed); } catch {}

// Run a natural-language query through the shared discovery engine.
const sem = (q) => (feed.length ? Discover.discover(feed, q, { limit: 5 }) : { results: [] });

// ── Check definitions ────────────────────────────────────────
// group: report section.  agents: which agents this signal feeds.
// weight: relative importance.  test: () => boolean.
const has = (s, ...needles) => needles.every((n) => s.includes(n));
const A = { gpt: 'ChatGPT', gem: 'Gemini', plx: 'Perplexity', shop: 'Shopping' };

const checks = [
  // ── Crawlability: can an agent reach the pages at all ──────
  { group: 'Crawlability', label: 'robots.txt exists', weight: 2,
    agents: [A.gpt, A.gem, A.plx, A.shop],
    test: () => site.robots.length > 0,
    fix: 'Add a robots.txt at the site root.' },
  { group: 'Crawlability', label: 'Allows GPTBot (OpenAI)', weight: 2,
    agents: [A.gpt],
    test: () => /GPTBot/i.test(site.robots),
    fix: 'Add "User-agent: GPTBot\\nAllow: /" to robots.txt.' },
  { group: 'Crawlability', label: 'Allows Google-Extended (Gemini)', weight: 2,
    agents: [A.gem],
    test: () => /Google-Extended/i.test(site.robots),
    fix: 'Add "User-agent: Google-Extended\\nAllow: /" to robots.txt.' },
  { group: 'Crawlability', label: 'Allows PerplexityBot', weight: 1,
    agents: [A.plx],
    test: () => /PerplexityBot/i.test(site.robots),
    fix: 'Add "User-agent: PerplexityBot\\nAllow: /" to robots.txt.' },
  { group: 'Crawlability', label: 'sitemap.xml exists & linked', weight: 2,
    agents: [A.gem, A.shop],
    test: () => site.sitemap.includes('<urlset') && /Sitemap:/i.test(site.robots),
    fix: 'Generate sitemap.xml and reference it in robots.txt.' },
  { group: 'Crawlability', label: 'llms.txt exists', weight: 1,
    agents: [A.gpt, A.plx],
    test: () => site.llms.length > 0,
    fix: 'Add an llms.txt summarising the catalog for LLMs.' },
  { group: 'Crawlability', label: 'JSON product feed exists', weight: 2,
    agents: [A.gpt, A.shop],
    test: () => Array.isArray(feed) && feed.length > 0,
    fix: 'Expose the catalog as a static products.json feed.' },

  // ── Structured data: can an agent understand the content ───
  { group: 'Structured Data', label: 'JSON-LD on home page', weight: 2,
    agents: [A.gpt, A.gem, A.plx],
    test: () => has(site.index, 'application/ld+json'),
    fix: 'Inject schema.org JSON-LD into index.html.' },
  { group: 'Structured Data', label: 'ItemList catalog schema', weight: 1,
    agents: [A.gem, A.shop],
    test: () => has(site.index, '"ItemList"'),
    fix: 'Add an ItemList JSON-LD node listing all products.' },
  { group: 'Structured Data', label: 'Product schema with Offer', weight: 2,
    agents: [A.gpt, A.gem, A.shop],
    test: () => has(site.index, '"Product"') && has(site.index, '"Offer"'),
    fix: 'Embed Product nodes with price/availability Offers.' },
  { group: 'Structured Data', label: 'Organization / WebSite schema', weight: 1,
    agents: [A.gem],
    test: () => has(site.index, '"Organization"') || has(site.index, '"WebSite"'),
    fix: 'Add an Organization or WebSite JSON-LD node.' },
  { group: 'Structured Data', label: 'Product page JSON-LD with brand', weight: 2,
    agents: [A.gpt, A.gem, A.shop],
    test: () => has(site.product, 'application/ld+json') && has(site.product, '"Brand"'),
    fix: 'Embed per-product JSON-LD (with brand) on each product page.' },

  // ── SEO basics ─────────────────────────────────────────────
  { group: 'SEO Basics', label: 'Meta description', weight: 1,
    agents: [A.gpt, A.gem, A.plx],
    test: () => /<meta\s+name="description"/i.test(site.index),
    fix: 'Add a <meta name="description"> to index.html.' },
  { group: 'SEO Basics', label: 'Canonical URL', weight: 1,
    agents: [A.gem],
    test: () => /rel="canonical"/i.test(site.index),
    fix: 'Add a <link rel="canonical"> tag.' },
  { group: 'SEO Basics', label: 'OpenGraph tags', weight: 1,
    agents: [A.gpt, A.plx],
    test: () => has(site.index, 'og:title') && has(site.index, 'og:image'),
    fix: 'Add og:title / og:description / og:image meta tags.' },
  { group: 'SEO Basics', label: 'Twitter card', weight: 1,
    agents: [A.plx],
    test: () => has(site.index, 'twitter:card'),
    fix: 'Add a twitter:card meta tag.' },

  // ── Content rendering: is the content in the raw HTML? ─────
  { group: 'Content Rendering', label: 'Catalog readable without JS (home)', weight: 3,
    agents: [A.gpt, A.gem, A.plx, A.shop],
    test: () => feed.length > 0 && feed.slice(0, 3).every((p) => site.index.includes(p.title)),
    fix: 'Embed product names in static HTML/JSON-LD (not JS-only render).' },
  { group: 'Content Rendering', label: 'Product detail readable without JS', weight: 3,
    agents: [A.gpt, A.gem, A.plx, A.shop],
    test: () => feed.length > 0 && site.product.includes(feed.find((p) => p.id === 10)?.title || '###'),
    fix: 'Pre-render product pages or generate static product-N.html files.' },
  { group: 'Content Rendering', label: 'Variants/sizes visible on product page', weight: 2,
    agents: [A.gpt, A.shop],
    test: () => /US 1[012]|US [789]/.test(site.product),
    fix: 'Render available sizes as text/buttons in the static product page.' },

  // ── Feed quality (Google Shopping / ACP fields) ────────────
  { group: 'Feed Quality', label: 'Products have brand', weight: 1,
    agents: [A.shop],
    test: () => feed.length > 0 && feed.every((p) => p.brand),
    fix: 'Add a "brand" field to every product.' },
  { group: 'Feed Quality', label: 'Products have GTIN/MPN', weight: 1,
    agents: [A.shop],
    test: () => feed.length > 0 && feed.every((p) => p.gtin || p.mpn),
    fix: 'Add GTIN or MPN identifiers to every product.' },
  { group: 'Feed Quality', label: 'Products have availability', weight: 2,
    agents: [A.shop, A.gpt],
    test: () => feed.length > 0 && feed.every((p) => p.availability),
    fix: 'Add an "availability" field (in_stock / out_of_stock).' },
  { group: 'Feed Quality', label: 'Products have variants (size/color)', weight: 2,
    agents: [A.shop, A.gpt],
    test: () => feed.length > 0 && feed.every((p) => Array.isArray(p.variants) && p.variants.length),
    fix: 'Add a "variants" array with size/color options.' },
  { group: 'Feed Quality', label: 'Google product category mapped', weight: 1,
    agents: [A.shop],
    test: () => feed.length > 0 && feed.every((p) => p.google_product_category),
    fix: 'Map each product to a Google product taxonomy id.' },

  // ── Layer 2: Semantic Discoverability ──────────────────────
  // Does a natural-language query actually retrieve the right products?
  { group: 'Semantic Discovery', label: 'Colour+category+price query filters correctly', weight: 2,
    agents: [A.gpt, A.gem, A.plx],
    test: () => {
      const { results } = sem('black sneakers under $100');
      return results.length > 0 && results.every((r) =>
        r.product.category === 'sneakers' &&
        String(r.product.color).toLowerCase().includes('black') &&
        r.product.price <= 100);
    },
    fix: 'Build a query parser that applies category/colour/price as hard filters.' },
  { group: 'Semantic Discovery', label: 'Attribute query returns the right product', weight: 2,
    agents: [A.gpt, A.plx, A.shop],
    test: () => {
      const { results } = sem('brown boots under $200');
      return results[0] && results[0].product.category === 'boots' &&
        String(results[0].product.color).toLowerCase().includes('brown');
    },
    fix: 'Match colour/material attributes from the enriched feed.' },
  { group: 'Semantic Discovery', label: 'Keyword intent ranks the right product first', weight: 1,
    agents: [A.gpt, A.gem],
    test: () => {
      const { results } = sem('waterproof boots');
      return results[0] && /Timberland/i.test(results[0].product.title);
    },
    fix: 'Score description keyword matches so intent ("waterproof") ranks results.' },
  { group: 'Semantic Discovery', label: 'Size query respects per-variant inventory', weight: 2,
    agents: [A.gpt, A.shop],
    test: () => {
      const { results } = sem('sandals in size 9');
      return results.length > 0 && results.every((r) =>
        (r.product.variants || []).some((v) => v.size === 'US 9' && v.availability === 'in_stock' && v.inventory_quantity > 0));
    },
    fix: 'Resolve size requests against variant-level availability/inventory.' },
];

// ── Run checks ───────────────────────────────────────────────
for (const c of checks) c.pass = !!c.test();

// ── Aggregate ────────────────────────────────────────────────
const pctOf = (subset) => {
  const tot = subset.reduce((s, c) => s + c.weight, 0);
  const got = subset.reduce((s, c) => s + (c.pass ? c.weight : 0), 0);
  return tot ? Math.round((got / tot) * 100) : 0;
};

const overall = pctOf(checks);
const groups = [...new Set(checks.map((c) => c.group))];
const agents = Object.values(A);

// ── Report ───────────────────────────────────────────────────
const title = liveUrl ? `LIVE: ${liveUrl}` : 'LOCAL FILES';
console.log(`\n${C.bold}╔══════════════════════════════════════════════════════╗${C.reset}`);
console.log(`${C.bold}║   AI DISCOVERABILITY TEST ENGINE                     ║${C.reset}`);
console.log(`${C.bold}╚══════════════════════════════════════════════════════╝${C.reset}`);
console.log(`${C.dim}Source: ${title}${C.reset}\n`);

console.log(`${C.bold}OVERALL AI-READINESS${C.reset}`);
console.log(`  ${bar(overall)}  ${C.bold}${overall}/100  (grade ${grade(overall)})${C.reset}\n`);

console.log(`${C.bold}PER-AGENT READINESS${C.reset}`);
for (const a of agents) {
  const sub = checks.filter((c) => c.agents.includes(a));
  const pct = pctOf(sub);
  console.log(`  ${a.padEnd(11)} ${bar(pct)}  ${String(pct).padStart(3)}/100  ${grade(pct)}`);
}

console.log(`\n${C.bold}BY CATEGORY${C.reset}`);
for (const g of groups) {
  const sub = checks.filter((c) => c.group === g);
  const pct = pctOf(sub);
  const passed = sub.filter((c) => c.pass).length;
  console.log(`  ${g.padEnd(20)} ${bar(pct)}  ${passed}/${sub.length}`);
}

const failed = checks.filter((c) => !c.pass);
if (failed.length) {
  console.log(`\n${C.bold}${C.red}FAILED CHECKS — FIX THESE TO RAISE THE SCORE${C.reset}`);
  for (const c of failed) {
    console.log(`  ${C.red}✗${C.reset} ${c.label} ${C.dim}[${c.group}]${C.reset}`);
    console.log(`    ${C.cyan}→ ${c.fix}${C.reset}`);
  }
} else {
  console.log(`\n${C.green}All checks passed. Catalog is fully AI-discoverable.${C.reset}`);
}

const passed = checks.filter((c) => c.pass);
console.log(`\n${C.dim}Passed ${passed.length}/${checks.length} checks.${C.reset}`);
console.log(`${C.dim}Tip: run "node tools/score.mjs ${SITE_HINT()}" to audit the deployed site.${C.reset}\n`);

function SITE_HINT() { return 'https://dailmyshop.netlify.app/index.html'; }
