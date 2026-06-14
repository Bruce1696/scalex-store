# Project Structure

Source lives in `src/`, build scripts in `tools/`, and **everything served is generated into `public/`** (the Netlify publish dir). You never edit `public/` by hand — it's rebuilt from sources.

```
Scalex-Demo/
├─ src/                         ← HAND-WRITTEN SOURCES (edit these)
│  ├─ store/                    ← the ecommerce website
│  │  ├─ index.html             (home; build injects JSON-LD + static catalog)
│  │  ├─ product.html           (legacy dynamic product template)
│  │  ├─ discover.html          (NL discovery demo)
│  │  ├─ app.js  product.js  discover.js
│  │  └─ styles.css  product.css  discover.css
│  ├─ shared/                   ← UMD logic used by BOTH browser & Node
│  │  ├─ commerce-core.js       (search→inventory→cart→checkout)
│  │  └─ discover-engine.js     (NL query parsing + ranking)
│  └─ data/
│     └─ store.catalog.json     ← READ-ONLY store export (existing-DB stand-in)
│
├─ tools/                       ← BUILD + TEST SCRIPTS (the AI layer)
│  ├─ catalog-adapter.mjs       store PORT: getCatalog/getInventory/createCheckout
│  ├─ ingest.mjs                read-only pull  → ai-snapshot/catalog.json
│  ├─ enrich.mjs                snapshot        → public/products.json + data.js
│  ├─ build-site.mjs            src/store + src/shared → public/   (runs first)
│  ├─ build-feed.mjs            → public/api/feed.acp.json(.gz) + feed.google.json(.gz)
│  ├─ build-seo.mjs             → product-*.html, robots/sitemap/llms, JSON-LD
│  ├─ build-api.mjs             → public/api/* + _redirects
│  ├─ audit.mjs                 AI Discoverability Test Engine (reads public/)
│  ├─ score.mjs                 terminal report   │ report.mjs → readiness-report.html
│  ├─ api-server.mjs            local dev API     │ discover.mjs → CLI demo
│
├─ netlify/functions/
│  └─ commerce.mjs              live agent API (search/cart + delegated checkout)
│
├─ public/                      ← GENERATED publish dir (gitignored; do not edit)
│  ├─ index.html  product-*.html  *.css  *.js  data.js  products.json
│  ├─ robots.txt  sitemap.xml  llms.txt  _redirects
│  └─ api/  (products*, search-index, openapi, feed.acp*, feed.google*)
│
├─ ai-snapshot/                 ← GENERATED read-only snapshot (gitignored)
│  └─ catalog.json
│
├─ docs/                        ← architecture & research docs
├─ netlify.toml                 publish = "public"; build command
└─ STRUCTURE.md                 (this file)
```

## The two halves

- **Store (website)** — `src/store/`. A normal ecommerce front end. Knows nothing about the AI layer.
- **AI discoverability layer** — `tools/` + `netlify/functions/` + `src/shared/`. Reads the store through the one seam (`catalog-adapter.mjs`), generates AI-ready artifacts, never writes the store DB. See [docs/decoupling.md](docs/decoupling.md).

## Build pipeline (what Netlify runs)

```
build-site  →  ingest  →  enrich  →  build-feed  →  build-seo  →  build-api
   │            │           │           │              │             │
 copy src/   pull store   enrich →    ACP/Google     JSON-LD +     static
 → public/   → snapshot   products    feeds          robots/etc    read API
```

One command (also the `netlify.toml` build command):

```bash
node tools/build-site.mjs && node tools/ingest.mjs && node tools/enrich.mjs \
  && node tools/build-feed.mjs && node tools/build-seo.mjs && node tools/build-api.mjs
```

Then audit the result: `node tools/score.mjs` · share it: `node tools/report.mjs`.

## Rules of thumb

- **Edit** `src/**` and `tools/**`. **Never** edit `public/**` (regenerated every build).
- URLs are unchanged: `public/` is the web root, so `https://site/product-1.html`, `/robots.txt`, `/api/...`, `/products.json` all resolve exactly as before.
- Point at a real store with `CATALOG_SOURCE=medusa MEDUSA_URL=… node tools/ingest.mjs` — no other change.
