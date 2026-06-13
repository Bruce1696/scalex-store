// ─────────────────────────────────────────────────────────────
// discover.mjs — CLI for the natural-language discovery engine
//
//   node tools/discover.mjs "black sneakers under $100 in size 10"
//   node tools/discover.mjs            (runs a demo of example queries)
//
// Prints how the agent interpreted the query, the ranked results,
// and the reason each product was selected.
// ─────────────────────────────────────────────────────────────
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Discover from '../discover-engine.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const products = JSON.parse(await readFile(join(ROOT, 'products.json'), 'utf8'));

const C = { r: '\x1b[0m', dim: '\x1b[2m', b: '\x1b[1m', cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', mag: '\x1b[35m' };

function show(query) {
  const { intent, results, total } = Discover.discover(products, query, { limit: 5 });

  console.log(`\n${C.b}🔍  "${query}"${C.r}`);

  // Interpretation
  const parts = [];
  if (intent.category) parts.push(`category=${intent.category}`);
  if (intent.colors.length) parts.push(`color=${intent.colors.join('/')}`);
  if (intent.brand) parts.push(`brand=${intent.brand}`);
  if (intent.size) parts.push(`size=${intent.size}`);
  if (intent.maxPrice != null) parts.push(`≤$${intent.maxPrice}`);
  if (intent.minPrice != null) parts.push(`≥$${intent.minPrice}`);
  if (intent.keywords.length) parts.push(`wants: ${intent.keywords.join(', ')}`);
  console.log(`${C.dim}   understood as → ${parts.join('  ·  ') || '(no constraints)'}${C.r}`);

  if (!results.length) {
    console.log(`${C.yellow}   No products match those constraints.${C.r}`);
    return;
  }

  console.log(`${C.dim}   ${total} match${total !== 1 ? 'es' : ''}, top ${results.length}:${C.r}\n`);
  results.forEach((res, i) => {
    const p = res.product;
    console.log(`   ${C.b}${i + 1}. ${p.title}${C.r}  ${C.green}$${p.price.toFixed(2)}${C.r}  ${C.dim}[score ${res.score}]${C.r}`);
    console.log(`      ${C.dim}${p.brand} · ${p.color} · ${p.category}${C.r}`);
    const filt = res.reasons.filter((x) => x.kind === 'filter').map((x) => `${C.cyan}✓ ${x.label}${C.r}`);
    const match = res.reasons.filter((x) => x.kind === 'match').map((x) => `${C.mag}~ ${x.label}${C.r}`);
    const why = [...filt, ...match].join('  ');
    if (why) console.log(`      why: ${why}`);
  });
}

const arg = process.argv.slice(2).join(' ').trim();
if (arg) {
  show(arg);
} else {
  console.log(`${C.b}╔═══════════════════════════════════════════════════╗${C.r}`);
  console.log(`${C.b}║   SHOPPING AGENT — natural-language discovery     ║${C.r}`);
  console.log(`${C.b}╚═══════════════════════════════════════════════════╝${C.r}`);
  [
    'black sneakers under $100 in size 10',
    'comfortable running shoes for long distance',
    'waterproof boots',
    'brown boots under $200',
    'lightweight Nike shoes',
    'sandals in size 9',
  ].forEach(show);
  console.log(`\n${C.dim}Try your own:  node tools/discover.mjs "your query here"${C.r}\n`);
}
