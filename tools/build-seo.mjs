// ─────────────────────────────────────────────────────────────
// build-seo.mjs — AI-discoverability build step
//
// Reads the enriched products.json feed and generates the
// machine-readable layer AI agents and search crawlers rely on:
//
//   • robots.txt          — allows AI crawlers + points to sitemap
//   • sitemap.xml         — every (static) product URL
//   • llms.txt            — plain-text site map for LLMs
//   • product-<id>.html   — STATIC, pre-rendered product pages so
//                           agents read each product with NO JavaScript
//   • JSON-LD             — schema.org data on the home page + each
//                           product page (brand, variants, offers…)
//   • SEO meta            — description / canonical / OpenGraph / Twitter
//
// Run:  node tools/build-seo.mjs   (run tools/enrich.mjs first)
// ─────────────────────────────────────────────────────────────
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://dailmyshop.netlify.app';
const STORE_NAME = 'ScalexStore';

const products = JSON.parse(await readFile(join(ROOT, 'products.json'), 'utf8'));

// Static, crawlable URL for each product (no query string).
const productUrl = (p) => `${SITE}/product-${p.id}.html`;
const productFile = (p) => `product-${p.id}.html`;
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const avail = (s) => (s === 'in_stock' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock');

// ── 1. robots.txt ────────────────────────────────────────────
const AI_BOTS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', // OpenAI
  'Google-Extended', 'Googlebot',            // Google / Gemini / Shopping
  'PerplexityBot',                            // Perplexity
  'ClaudeBot', 'anthropic-ai',                // Anthropic
  'Applebot-Extended', 'Amazonbot',           // Apple / Amazon
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
    (p) => `  <url><loc>${productUrl(p)}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`
  ),
  '</urlset>',
  '',
].join('\n');
await writeFile(join(ROOT, 'sitemap.xml'), sitemap);

// ── 3. llms.txt ──────────────────────────────────────────────
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
      `- [${p.title}](${productUrl(p)}): ${p.brand}, ${p.category}, $${p.price.toFixed(
        2
      )}, ${p.color}, ${p.availability} — ${p.description.split('. ')[0]}.`
  ),
  '',
  '## Data',
  '',
  `- [Product feed (JSON)](${SITE}/products.json): complete catalog, all fields + variants.`,
  `- [Sitemap](${SITE}/sitemap.xml)`,
  '',
].join('\n');
await writeFile(join(ROOT, 'llms.txt'), llms);

// ── 4. JSON-LD product node (shared by index + product pages) ─
const productNode = (p) => ({
  '@type': 'Product',
  '@id': productUrl(p),
  name: p.title,
  description: p.description,
  image: p.images || [p.image],
  category: p.category,
  sku: `SKU-${p.id}`,
  mpn: p.mpn,
  gtin13: p.gtin,
  brand: { '@type': 'Brand', name: p.brand },
  color: p.color,
  material: p.material,
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: p.rating.rate,
    reviewCount: p.rating.count,
  },
  additionalProperty: (p.sizes || []).map((s) => ({
    '@type': 'PropertyValue',
    name: 'size',
    value: s,
  })),
  offers: {
    '@type': 'Offer',
    price: p.price.toFixed(2),
    priceCurrency: 'USD',
    availability: avail(p.availability),
    itemCondition: 'https://schema.org/NewCondition',
    url: productUrl(p),
  },
});

const graph = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/`, name: STORE_NAME },
    { '@type': 'Organization', '@id': `${SITE}/#org`, name: STORE_NAME, url: `${SITE}/` },
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

// ── 5. Inject meta + JSON-LD into index.html <head> ──────────
const indexMeta = [
  `  <meta name="description" content="${STORE_NAME} — shop ${products.length} footwear styles: sneakers, running shoes, boots and sandals from ${[...new Set(products.map((p) => p.brand))].slice(0, 6).join(', ')} and more." />`,
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
// Agents like ChatGPT read the rendered body text and ignore <head>
// JSON-LD, so the catalog must exist as real HTML links + text.
const catalogHtml = products
  .map(
    (p) => `      <article class="product-card" data-id="${p.id}">
        <a href="${productFile(p)}" class="card-link">
          <div class="card-img-wrap">
            <img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy" />
            <span class="category-badge">${esc(p.category)}</span>
          </div>
          <div class="card-body">
            <p class="card-title">${esc(p.title)}</p>
            <p class="card-desc">${esc(p.brand)} · ${esc(p.color)} · ${esc(p.description.split('. ')[0])}.</p>
            <div class="card-rating"><span>★ ${p.rating.rate} (${p.rating.count})</span></div>
          </div>
          <div class="card-footer">
            <span class="card-price">$${p.price.toFixed(2)}</span>
          </div>
        </a>
      </article>`
  )
  .join('\n');
await injectBetween(join(ROOT, 'index.html'), '<!-- SEO:CATALOG:START', '<!-- SEO:CATALOG:END -->', catalogHtml);

// ── 6. Generate STATIC per-product pages ─────────────────────
for (const p of products) {
  await writeFile(join(ROOT, productFile(p)), renderProductPage(p));
}

console.log('✓ robots.txt');
console.log(`✓ sitemap.xml      (${products.length} product URLs)`);
console.log('✓ llms.txt');
console.log(`✓ index.html       JSON-LD + static catalog (${products.length} products) injected`);
console.log(`✓ product-*.html   ${products.length} static, pre-rendered product pages generated`);
console.log('\nSEO layer built. Next: node tools/score.mjs');

// ─────────────────────────────────────────────────────────────
// Static product page template — fully pre-rendered, no JS needed
// for the content. Includes per-product JSON-LD + a small inline
// cart script so "Add to cart" still works.
// ─────────────────────────────────────────────────────────────
function renderProductPage(p) {
  const ld = JSON.stringify(
    { '@context': 'https://schema.org', ...productNode(p) },
    null,
    2
  );
  const stars = '★'.repeat(Math.round(p.rating.rate)) + '☆'.repeat(5 - Math.round(p.rating.rate));
  const sizeBtns = (p.sizes || [])
    .map((s, i) => `<button type="button" class="size-btn${i === 0 ? ' active' : ''}" data-size="${esc(s)}">${esc(s)}</button>`)
    .join('');
  const specs = [
    ['Brand', p.brand], ['Category', p.category], ['Color', p.color], ['Material', p.material],
    ['Condition', p.condition], ['Availability', p.availability], ['In stock', `${p.inventory_quantity} units`],
    ['GTIN', p.gtin], ['MPN', p.mpn], ['Google category', p.google_product_category],
  ]
    .map(([k, v]) => `      <div class="meta-row"><span class="meta-key">${esc(k)}</span><span class="meta-val">${esc(v)}</span></div>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(p.title)} — ${STORE_NAME}</title>
  <meta name="description" content="${esc(p.description.slice(0, 155))}" />
  <link rel="canonical" href="${productUrl(p)}" />
  <meta property="og:type" content="product" />
  <meta property="og:title" content="${esc(p.title)}" />
  <meta property="og:description" content="${esc(p.description.slice(0, 155))}" />
  <meta property="og:image" content="${esc(p.image)}" />
  <meta property="og:url" content="${productUrl(p)}" />
  <meta property="product:price:amount" content="${p.price.toFixed(2)}" />
  <meta property="product:price:currency" content="USD" />
  <meta property="product:brand" content="${esc(p.brand)}" />
  <meta property="product:availability" content="${esc(p.availability)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="stylesheet" href="styles.css" />
  <link rel="stylesheet" href="product.css" />
  <script type="application/ld+json">
${ld}
  </script>
</head>
<body>
  <header class="header">
    <div class="header-inner">
      <a href="index.html" class="logo">Scalex<span>Store</span></a>
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="index.html">Home</a>
        <span class="bc-sep">›</span>
        <span>${esc(p.category)}</span>
        <span class="bc-sep">›</span>
        <span>${esc(p.title)}</span>
      </nav>
      <button class="cart-toggle" id="cartToggle">Cart <span class="cart-count" id="cartCount">0</span></button>
    </div>
  </header>

  <main class="pd-container">
    <a href="index.html" class="back-btn">← Back to store</a>
    <div class="pd-layout">
      <div class="pd-image-col">
        <div class="pd-img-wrap"><img src="${esc(p.image)}" alt="${esc(p.title)}" /></div>
      </div>
      <div class="pd-info-col">
        <div class="pd-top-row">
          <span class="pd-category-badge">${esc(p.category)}</span>
          <span class="pd-id-badge">#${p.id}</span>
        </div>
        <h1 class="pd-title">${esc(p.title)}</h1>
        <p class="pd-brand">by <strong>${esc(p.brand)}</strong></p>
        <div class="pd-rating-row">
          <span class="stars">${stars}</span>
          <span class="pd-rating-text">${p.rating.rate} out of 5</span>
          <span class="pd-rating-sep">·</span>
          <span class="pd-rating-text">${p.rating.count} reviews</span>
        </div>
        <p class="pd-description">${esc(p.description)}</p>
        <p class="pd-price">$${p.price.toFixed(2)}</p>
        <p class="pd-stock">${p.availability === 'in_stock' ? '✓ In stock' : '✗ Out of stock'} · ${esc(p.color)} · ${esc(p.material)}</p>
        <div class="pd-sizes" id="pdSizes">${sizeBtns}</div>
        <button class="pd-add-btn" id="pdAddBtn">Add to Cart</button>

        <section class="pd-meta-section">
          <h2 class="pd-meta-heading">Product Specifications</h2>
          <div class="pd-meta-grid">
${specs}
          </div>
        </section>
      </div>
    </div>
  </main>

  <aside class="cart-sidebar" id="cartSidebar">
    <div class="cart-header"><h2>Your Cart</h2><button class="close-cart" id="closeCart">&times;</button></div>
    <div class="cart-items" id="cartItems"><p class="empty-cart">Your cart is empty.</p></div>
    <div class="cart-footer" id="cartFooter" hidden>
      <div class="cart-total">Total: <strong id="cartTotal">$0.00</strong></div>
      <button class="checkout-btn">Checkout</button>
    </div>
  </aside>
  <div class="overlay" id="overlay"></div>

  <footer class="footer"><p>&copy; 2026 ${STORE_NAME}</p></footer>

  <script>
    // Minimal cart for static product pages (shares localStorage with the store).
    const PRODUCT = ${JSON.stringify({ id: p.id, title: p.title, price: p.price, image: p.image })};
    let cart = JSON.parse(localStorage.getItem('scalex_cart') || '[]');
    let size = ${JSON.stringify((p.sizes && p.sizes[0]) || null)};
    const $ = (id) => document.getElementById(id);
    const save = () => localStorage.setItem('scalex_cart', JSON.stringify(cart));
    const count = () => cart.reduce((s, i) => s + i.qty, 0);
    document.querySelectorAll('.size-btn').forEach((b) =>
      b.addEventListener('click', () => {
        document.querySelectorAll('.size-btn').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        size = b.dataset.size;
      })
    );
    function render() {
      $('cartCount').textContent = count();
      const items = $('cartItems'), footer = $('cartFooter');
      if (!cart.length) { items.innerHTML = '<p class="empty-cart">Your cart is empty.</p>'; footer.hidden = true; return; }
      footer.hidden = false;
      items.innerHTML = cart.map((i) =>
        '<div class="cart-item"><div class="cart-item-info"><p class="cart-item-title">' + i.title +
        (i.size ? ' (' + i.size + ')' : '') + '</p><p class="cart-item-price">$' + (i.price * i.qty).toFixed(2) +
        '</p><div class="cart-item-qty"><button class="qty-btn" data-d="-1" data-id="' + i.id + '" data-s="' + (i.size||'') + '">−</button><span class="qty-num">' +
        i.qty + '</span><button class="qty-btn" data-d="1" data-id="' + i.id + '" data-s="' + (i.size||'') + '">+</button></div></div></div>'
      ).join('');
      $('cartTotal').textContent = '$' + cart.reduce((s, i) => s + i.price * i.qty, 0).toFixed(2);
      items.querySelectorAll('.qty-btn').forEach((b) => b.addEventListener('click', () => {
        const it = cart.find((i) => i.id == b.dataset.id && (i.size||'') == b.dataset.s);
        if (!it) return; it.qty += Number(b.dataset.d);
        if (it.qty <= 0) cart = cart.filter((i) => i !== it);
        save(); render();
      }));
    }
    $('pdAddBtn').addEventListener('click', () => {
      const ex = cart.find((i) => i.id === PRODUCT.id && (i.size||null) === size);
      if (ex) ex.qty++; else cart.push({ ...PRODUCT, size, qty: 1 });
      save(); render(); open();
    });
    const open = () => { $('cartSidebar').classList.add('open'); $('overlay').classList.add('show'); };
    const close = () => { $('cartSidebar').classList.remove('open'); $('overlay').classList.remove('show'); };
    $('cartToggle').addEventListener('click', open);
    $('closeCart').addEventListener('click', close);
    $('overlay').addEventListener('click', close);
    render();
  </script>
</body>
</html>
`;
}

// ── helpers ──────────────────────────────────────────────────
async function injectSeo(file, block) {
  await injectBetween(file, '<!-- SEO:START', '<!-- SEO:END -->', block);
}

// Match the START marker by prefix (up to its "-->"), so the
// human-readable description after it can change without breaking.
async function injectBetween(file, startPrefix, end, block) {
  const html = await readFile(file, 'utf8');
  const i = html.indexOf(startPrefix);
  if (i === -1) throw new Error(`Start marker not found in ${file}: ${startPrefix}`);
  const startClose = html.indexOf('-->', i) + 3;
  const j = html.indexOf(end, startClose);
  if (j === -1) throw new Error(`End marker not found in ${file}: ${end}`);
  const next = html.slice(0, startClose) + '\n' + block + '\n  ' + html.slice(j);
  await writeFile(file, next);
}
