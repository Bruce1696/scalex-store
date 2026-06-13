// ─────────────────────────────────────────────────────────────
// score.mjs — terminal view of the AI Discoverability Test Engine
//
//   node tools/score.mjs            → audit local files
//   node tools/score.mjs <url>      → audit a deployed URL (raw, pre-JS)
//
// All check logic lives in tools/audit.mjs (shared with report.mjs).
// ─────────────────────────────────────────────────────────────
import { audit } from './audit.mjs';

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};
const bar = (pct) => {
  const n = Math.round(pct / 5);
  const col = pct >= 80 ? C.green : pct >= 50 ? C.yellow : C.red;
  return col + '█'.repeat(n) + C.dim + '░'.repeat(20 - n) + C.reset;
};

const r = await audit(process.argv[2] || null);

console.log(`\n${C.bold}╔══════════════════════════════════════════════════════╗${C.reset}`);
console.log(`${C.bold}║   AI DISCOVERABILITY TEST ENGINE                     ║${C.reset}`);
console.log(`${C.bold}╚══════════════════════════════════════════════════════╝${C.reset}`);
console.log(`${C.dim}Source: ${r.source}${C.reset}\n`);

console.log(`${C.bold}OVERALL AI-READINESS${C.reset}`);
console.log(`  ${bar(r.overall)}  ${C.bold}${r.overall}/100  (grade ${r.grade})${C.reset}\n`);

console.log(`${C.bold}READINESS BY LAYER (AI Discoverability Test Engine)${C.reset}`);
for (const l of r.layers)
  console.log(`  ${('Layer ' + l.id + ' · ' + l.name).padEnd(38)} ${bar(l.pct)}  ${String(l.pct).padStart(3)}/100  ${l.grade}  ${C.dim}(${l.passed}/${l.total})${C.reset}`);

console.log(`\n${C.bold}PER-AGENT READINESS${C.reset}`);
for (const a of r.agents)
  console.log(`  ${a.name.padEnd(11)} ${bar(a.pct)}  ${String(a.pct).padStart(3)}/100  ${a.grade}`);

console.log(`\n${C.bold}BY LAYER / CATEGORY${C.reset}`);
for (const g of r.groups)
  console.log(`  ${g.name.padEnd(20)} ${bar(g.pct)}  ${g.passed}/${g.total}`);

const failed = r.checks.filter((c) => !c.pass);
if (failed.length) {
  console.log(`\n${C.bold}${C.red}FAILED CHECKS — FIX THESE TO RAISE THE SCORE${C.reset}`);
  for (const c of failed) {
    console.log(`  ${C.red}✗${C.reset} ${c.label} ${C.dim}[${c.group}]${C.reset}`);
    console.log(`    ${C.cyan}→ ${c.fix}${C.reset}`);
  }
} else {
  console.log(`\n${C.green}All checks passed — catalog is AI-discoverable & agent-operable.${C.reset}`);
}

console.log(`\n${C.dim}Passed ${r.passedCount}/${r.total} checks · ${r.feed.count} products · ${r.feed.variants} variants.${C.reset}`);
console.log(`${C.dim}HTML report:  node tools/report.mjs${C.reset}`);
console.log(`${C.dim}Audit live:   node tools/score.mjs https://dailmyshop.netlify.app/index.html${C.reset}\n`);
