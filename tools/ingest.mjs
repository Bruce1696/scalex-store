// ─────────────────────────────────────────────────────────────
// ingest.mjs — Read-only pull from the store into the AI layer's snapshot
//
// The decoupling boundary in one step: pull the catalog from the store
// (through the read-only port) and write it to the AI layer's OWN snapshot.
// The store's database is never written; the layer works off this copy so it
// never queries the live store in the request hot path.
//
//   node tools/ingest.mjs
//   CATALOG_SOURCE=medusa MEDUSA_URL=http://localhost:9000 node tools/ingest.mjs
//
// Output: ai-snapshot/catalog.json  (input to tools/enrich.mjs)
// ─────────────────────────────────────────────────────────────
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getCatalog } from './catalog-adapter.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = process.env.CATALOG_SOURCE || 'json';

const catalog = await getCatalog();

const snapshot = {
  source,
  pulled_fields: Object.keys(catalog[0] || {}),
  count: catalog.length,
  products: catalog,
};

await mkdir(join(ROOT, 'ai-snapshot'), { recursive: true });
await writeFile(join(ROOT, 'ai-snapshot', 'catalog.json'), JSON.stringify(snapshot, null, 2) + '\n');

console.log(`✓ ai-snapshot/catalog.json  ←  ${catalog.length} products pulled (read-only) from source "${source}"`);
console.log(`  store fields: ${snapshot.pulled_fields.join(', ')}`);
console.log('  store DB untouched. Next: node tools/enrich.mjs');
