// ─────────────────────────────────────────────────────────────
// report.mjs — Platform Readiness Report (deliverable F)
//
// Renders the audit (tools/audit.mjs) into a single, shareable,
// self-contained HTML file: overall score, per-agent + per-layer
// breakdown, every check with pass/fail + fix, the live agent
// purchase-journey trace, and the feed summary.
//
//   node tools/report.mjs          → readiness-report.html (local audit)
//   node tools/report.mjs <url>    → audit a deployed URL
// ─────────────────────────────────────────────────────────────
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { audit } from './audit.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const r = await audit(process.argv[2] || null);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const col = (p) => (p >= 80 ? '#16a34a' : p >= 50 ? '#d97706' : '#dc2626');

const ring = (pct) => {
  const c = 2 * Math.PI * 52;
  return `<svg width="140" height="140" viewBox="0 0 120 120">
    <circle cx="60" cy="60" r="52" fill="none" stroke="#e5e7eb" stroke-width="12"/>
    <circle cx="60" cy="60" r="52" fill="none" stroke="${col(pct)}" stroke-width="12" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}" transform="rotate(-90 60 60)"/>
    <text x="60" y="56" text-anchor="middle" font-size="30" font-weight="800" fill="#111">${pct}</text>
    <text x="60" y="76" text-anchor="middle" font-size="12" fill="#666">/ 100 · ${r.grade}</text>
  </svg>`;
};
const barRow = (label, pct, extra = '') =>
  `<div class="row"><span class="rl">${esc(label)}</span>
    <span class="rt"><span class="rf" style="width:${pct}%;background:${col(pct)}"></span></span>
    <span class="rv">${pct}${extra}</span></div>`;

// Agent journey trace (Layer 3)
const f = r.flow || {};
const journey = f.product
  ? `<ol class="journey">
      <li><b>Search</b> <code>"${esc(f.query)}"</code> → <b>${esc(f.product.title)}</b> (#${f.product.id})</li>
      <li><b>Inventory</b> ${esc(f.size)} → ${f.inventory?.available ? `✅ in stock (${f.inventory.inventory_quantity})` : '❌ unavailable'}</li>
      <li><b>Add to cart</b> → ${f.added?.ok ? '✅ added' : '❌ ' + esc(f.added?.error || 'failed')}</li>
      <li><b>Guardrail</b> add without size → ${f.rejected && !f.rejected.ok ? `✅ correctly rejected (<code>${esc(f.rejected.error)}</code>)` : '❌ not rejected'}</li>
      <li><b>Checkout</b> → ${f.order?.ok ? `✅ <code>${esc(f.order.order.order_id)}</code>, subtotal $${f.order.order.subtotal} (${f.order.order.item_count} item)` : '❌ failed'}</li>
    </ol>`
  : '<p class="muted">No feed available to run the agent journey.</p>';

const groupRows = r.groups.map((g) => barRow(g.name, g.pct, ` <span class="muted">(${g.passed}/${g.total})</span>`)).join('');
const agentRows = r.agents.map((a) => barRow(`${a.name} · ${a.grade}`, a.pct)).join('');

const checkTable = r.groups
  .map((g) => {
    const rows = r.checks
      .filter((c) => c.group === g.name)
      .map((c) => `<tr class="${c.pass ? 'ok' : 'bad'}">
        <td>${c.pass ? '✅' : '❌'}</td>
        <td>${esc(c.label)}</td>
        <td class="muted">${c.agents.join(', ')}</td>
        <td class="muted">${c.pass ? '' : esc(c.fix)}</td></tr>`)
      .join('');
    return `<tr class="ghead"><td colspan="4">${esc(g.name)} — ${g.passed}/${g.total}</td></tr>${rows}`;
  })
  .join('');

const date = new Date().toISOString().slice(0, 10);
const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>AI Commerce Readiness Report — ScalexStore</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; margin: 0; background: #f8fafc; color: #1e293b; }
  .wrap { max-width: 920px; margin: 0 auto; padding: 32px 20px 64px; }
  .top { display: flex; gap: 28px; align-items: center; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px; }
  h1 { font-size: 1.5rem; margin: 0 0 4px; }
  h2 { font-size: 1.05rem; margin: 32px 0 12px; }
  .sub { color: #64748b; font-size: .9rem; margin: 0; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px; }
  .row { display: flex; align-items: center; gap: 10px; margin: 9px 0; font-size: .9rem; }
  .rl { width: 230px; flex: none; }
  .rt { flex: 1; background: #eef2f7; height: 10px; border-radius: 6px; overflow: hidden; }
  .rf { display: block; height: 100%; border-radius: 6px; }
  .rv { width: 64px; text-align: right; font-variant-numeric: tabular-nums; color: #475569; }
  .muted { color: #94a3b8; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; font-size: .88rem; }
  td { padding: 8px 12px; border-top: 1px solid #f1f5f9; vertical-align: top; }
  tr.ghead td { background: #f1f5f9; font-weight: 700; }
  tr.bad td:nth-child(2) { font-weight: 600; }
  code { background: #f1f5f9; padding: 1px 6px; border-radius: 5px; font-size: .85em; }
  .journey { line-height: 1.9; padding-left: 20px; }
  .pill { display: inline-block; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; padding: 2px 10px; border-radius: 999px; font-size: .8rem; }
  .pill.warn { background: #fffbeb; color: #b45309; border-color: #fcd34d; }
  footer { text-align: center; color: #94a3b8; font-size: .8rem; margin-top: 40px; }
</style></head>
<body><div class="wrap">

  <div class="top">
    <div>${ring(r.overall)}</div>
    <div>
      <h1>AI Commerce Readiness Report</h1>
      <p class="sub">ScalexStore · ${esc(r.source)} · ${date}</p>
      <p class="sub" style="margin-top:8px">${r.passedCount}/${r.total} checks passed · ${r.feed.count} products · ${r.feed.variants} variants · ${r.feed.fields} fields each</p>
      <p style="margin-top:10px">
        ${r.overall >= 80 ? '<span class="pill">Ready for AI-driven discovery & agentic commerce</span>' : '<span class="pill warn">Partial — see failed checks below</span>'}
      </p>
    </div>
  </div>

  <div class="grid" style="margin-top:24px">
    <div class="card"><h2 style="margin-top:0">Per-agent readiness</h2>${agentRows}</div>
    <div class="card"><h2 style="margin-top:0">By layer / category</h2>${groupRows}</div>
  </div>

  <h2>Agent workflow trace (Layer 3)</h2>
  <div class="card">${journey}</div>

  <h2>Platform readiness</h2>
  <div class="card">
    ${barRow('ChatGPT-style product discovery', r.agents.find(a=>a.name==='ChatGPT').pct)}
    ${barRow('Google Shopping-style feed', r.agents.find(a=>a.name==='Shopping').pct)}
    ${barRow('Agentic commerce checkout', r.groups.find(g=>g.name==='Agent Workflow')?.pct || 0)}
    ${barRow('Semantic / NL discovery', r.groups.find(g=>g.name==='Semantic Discovery')?.pct || 0)}
  </div>

  <h2>All checks</h2>
  <table><tbody>${checkTable}</tbody></table>

  <footer>Generated by tools/report.mjs · AI Discoverability Test Engine · brands: ${esc(r.feed.brands.join(', '))}</footer>
</div></body></html>
`;

await writeFile(join(ROOT, 'readiness-report.html'), html);
console.log(`✓ readiness-report.html  (${r.overall}/100, ${r.passedCount}/${r.total} checks)`);
console.log('  Open it in a browser to view / print to PDF / share.');
