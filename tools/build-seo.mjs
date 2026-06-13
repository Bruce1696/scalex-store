// ─────────────────────────────────────────────────────────────
// build-seo.mjs — AI-discoverability build step
//
// Reads products.json (the static feed) and generates / injects the
// machine-readable layer that AI agents and search crawlers rely on:
//
//   • robots.txt   — explicitly allows AI crawlers + points to sitemap
//   • sitemap.xml  — every product URL, so crawlers can find them
//   • llms.txt     — emerging standard: a plain-text site map for LLMs
//   • JSON-LD      — schema.org structured data injected into index.html
//   • SEO meta     — description / canonical / OpenGraph / Twitter cards
//
// Run:  node tools/build-seo.mjs
// ─────────────────────────────────────────────────────────────
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://dailmyshop.netlify.app';
const STORE_NAME = 'ScalexStore';

const products = JSON.parse(await readFile(join(ROOT, 'products.json'), 'utf8'));
const productUrl = (p) => `${SITE}/product.html?id=${p.id}`;

// ── 1. robots.txt ────────────────────────────────────────────
// Allow everyone, and name the AI crawlers explicitly so it is
// unambiguous that this catalog opts in to AI discovery.
const AI_BOTS = [
  'GPTBot',          // OpenAI — training / ChatGPT
  'OAI-SearchBot',   // OpenAI — ChatGPT search surfacing
  'ChatGPT-User',    // OpenAI — live browsing on user request
  'Google-Extended', // Google — Gemini / AI Overviews
  'Googlebot',       // Google — classic + Shopping
  'PerplexityBot',   // Perplexity
  'ClaudeBot',       // Anthropic — Claude
  'anthropic-ai',    // Anthropic — legacy token
  'Applebot-Extended', // Apple Intelligence
  'Amazonbot',       // Amazon / Alexa
];
const robots = [
  '# Allow all standard crawlers',
  'User-agent: *',
  'Allow: /',
  '',
  '# Explicitly opt in to AI / agent crawlers',
  ...AI_BOTS.flatMap((b) => [`User-agent: ${b}`, 'Allow: /', '']),
  `Sitemap: ${SITE}/sitemap.xml`,
  '',
].join('\n');
await writeFile(join(ROOT, 'robots.txt'), robots);

// ── 2. sitemap.xml ───────────────────────────────────────────
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  `  <url><loc>${SITE}/index.html</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
  ...products.map(
    (p) =>
      `  <url><loc>${productUrl(p)}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`
  ),
  '</urlset>',
  '',
].join('\n');
await writeFile(join(ROOT, 'sitemap.xml'), sitemap);

// ── 3. llms.txt ──────────────────────────────────────────────
// Plain-text catalogue summary aimed at LLMs (llmstxt.org convention).
const llms = [
  `# ${STORE_NAME}`,
  '',
  '> Online footwear store. Sneakers, running shoes, boots, and sandals.',
  '> Full machine-readable catalog available as JSON at /products.json',
  '',
  '## Products',
  '',
  ...products.map(
    (p) =>
      `- [${p.title}](${productUrl(p)}): ${p.category}, $${p.price.toFixed(
        2
      )} — ${p.description.split('. ')[0]}.`
  ),
  '',
  '## Data',
  '',
  `- [Product feed (JSON)](${SITE}/products.json): complete catalog, all fields.`,
  `- [Sitemap](${SITE}/sitemap.xml)`,
  '',
].join('\n');
await writeFile(join(ROOT, 'llms.txt'), llms);

// ── 4. JSON-LD structured data ───────────────────────────────
// schema.org Product objects let crawlers/agents read the catalog
// directly from the HTML, with NO JavaScript execution required.
const offerFor = (p) => ({
  '@type': 'Offer',
  price: p.price.toFixed(2),
  priceCurrency: 'USD',
  availability: 'https://schema.org/InStock',
  url: productUrl(p),
});

const productNode = (p) => ({
  '@type': 'Product',
  '@id': productUrl(p),
  name: p.title,
  description: p.description,
  image: p.image,
  category: p.category,
  sku: `SKU-${p.id}`,
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: p.rating.rate,
    reviewCount: p.rating.count,
  },
  offers: offerFor(p),
});

const graph = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      url: `${SITE}/`,
      name: STORE_NAME,
    },
    {
      '@type': 'Organization',
      '@id': `${SITE}/#org`,
      name: STORE_NAME,
      url: `${SITE}/`,
    },
    {
      '@type': 'ItemList',
      name: `${STORE_NAME} Catalog`,
      numberOfItems: products.length,
      itemListElement: products.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: productNode(p),
      })),
    },
  ],
};

// ── 5. Inject meta + JSON-LD into index.html ─────────────────
const indexMeta = [
  `  <meta name="description" content="${STORE_NAME} — shop sneakers, running shoes, boots and sandals. ${products.length} products with fast delivery." />`,
  `  <link rel="canonical" href="${SITE}/" />`,
  `  <meta property="og:type" content="website" />`,
  `  <meta property="og:title" content="${STORE_NAME}" />`,
  `  <meta property="og:description" content="Shop sneakers, running shoes, boots and sandals." />`,
  `  <meta property="og:url" content="${SITE}/" />`,
  `  <meta property="og:image" content="${products[0].image}" />`,
  `  <meta name="twitter:card" content="summary_large_image" />`,
  `  <meta name="twitter:title" content="${STORE_NAME}" />`,
  `  <script type="application/ld+json">\n${JSON.stringify(graph, null, 2)}\n  </script>`,
].join('\n');

await injectSeo(join(ROOT, 'index.html'), indexMeta);

// ── 5b. Inject a STATIC, VISIBLE catalog into index.html body ─
// Critical for agents like ChatGPT whose browser reads the rendered
// body text and ignores <head> JSON-LD. These cards are real <a>
// links with product text, so any reader sees the catalog with no JS.
// The interactive app.js overwrites this grid for real browsers.
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const catalogHtml = products
  .map(
    (p) => `      <article class="product-card" data-id="${p.id}">
        <a href="product.html?id=${p.id}" class="card-link">
          <div class="card-img-wrap">
            <img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy" />
            <span class="category-badge">${esc(p.category)}</span>
          </div>
          <div class="card-body">
            <p class="card-title">${esc(p.title)}</p>
            <p class="card-desc">${esc(p.description.split('. ')[0])}.</p>
            <div class="card-rating"><span>★ ${p.rating.rate} (${p.rating.count})</span></div>
          </div>
          <div class="card-footer">
            <span class="card-price">$${p.price.toFixed(2)}</span>
          </div>
        </a>
      </article>`
  )
  .join('\n');

await injectBetween(
  join(ROOT, 'index.html'),
  '<!-- SEO:CATALOG:START',
  '<!-- SEO:CATALOG:END -->',
  catalogHtml
);

// ── 6. Inject baseline meta into product.html ────────────────
// Per-product JSON-LD is added at runtime by product.js (dynamic page),
// but a static baseline still helps crawlers that don't run JS.
const productMeta = [
  `  <meta name="description" content="Product detail at ${STORE_NAME}. Full specs, price, rating and structured data." />`,
  `  <meta property="og:type" content="product" />`,
  `  <meta property="og:site_name" content="${STORE_NAME}" />`,
  `  <meta name="twitter:card" content="summary_large_image" />`,
].join('\n');

await injectSeo(join(ROOT, 'product.html'), productMeta);

console.log('✓ robots.txt');
console.log('✓ sitemap.xml      (' + products.length + ' product URLs)');
console.log('✓ llms.txt');
console.log('✓ index.html       JSON-LD ItemList + ' + products.length + ' Products injected');
console.log('✓ product.html     baseline meta injected');
console.log('\nSEO layer built. Next: node tools/score.mjs');

// ── helper: replace content between SEO markers ──────────────
async function injectSeo(file, block) {
  await injectBetween(file, '<!-- SEO:START', '<!-- SEO:END -->', block);
}

// ── helper: replace whatever sits between two marker comments ─
// Matches the START marker by PREFIX (everything up to its closing
// "-->"), so the human-readable description after the prefix can change
// without breaking injection. The END marker is matched in full.
async function injectBetween(file, startPrefix, end, block) {
  const html = await readFile(file, 'utf8');
  const i = html.indexOf(startPrefix);
  if (i === -1) throw new Error(`Start marker not found in ${file}: ${startPrefix}`);
  const startClose = html.indexOf('-->', i) + 3; // end of the START comment
  const j = html.indexOf(end, startClose);
  if (j === -1) throw new Error(`End marker not found in ${file}: ${end}`);
  const next = html.slice(0, startClose) + '\n' + block + '\n  ' + html.slice(j);
  await writeFile(file, next);
}
