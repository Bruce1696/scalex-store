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
  const html = await readFile(file, 'utf8');
  const start = '<!-- SEO:START — generated by tools/build-seo.mjs, do not edit by hand -->';
  const end = '<!-- SEO:END -->';
  const i = html.indexOf(start);
  const j = html.indexOf(end);
  if (i === -1 || j === -1) {
    throw new Error(`SEO markers not found in ${file}`);
  }
  const next = html.slice(0, i + start.length) + '\n' + block + '\n  ' + html.slice(j);
  await writeFile(file, next);
}
