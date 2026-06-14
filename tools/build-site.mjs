// ─────────────────────────────────────────────────────────────
// build-site.mjs — Assemble the publish dir from sources
//
// Copies the hand-written website sources (src/store) and the browser-
// loaded shared logic (src/shared) into the Netlify publish directory
// (public/). The generated layers (products.json, data.js, feeds, JSON-LD
// pages, robots/sitemap/llms, static API) are written into public/ by the
// other build steps that run AFTER this one.
//
// Runs FIRST in the build pipeline:
//   node tools/build-site.mjs && node tools/ingest.mjs && node tools/enrich.mjs && …
// ─────────────────────────────────────────────────────────────
import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

// Start clean so deleted sources don't linger in the publish dir.
await rm(PUBLIC, { recursive: true, force: true });
await mkdir(PUBLIC, { recursive: true });

// 1. Website sources (HTML, CSS, browser JS).
await cp(join(ROOT, 'src', 'store'), PUBLIC, { recursive: true });

// 2. Shared UMD logic the browser loads (discover.html → discover-engine.js).
//    commerce-core.js is Node-only, but copying it is harmless and keeps the
//    served logic self-contained.
await cp(join(ROOT, 'src', 'shared'), PUBLIC, { recursive: true });

console.log('✓ public/ assembled from src/store + src/shared');
console.log('  Next: ingest → enrich → build-feed → build-seo → build-api');
