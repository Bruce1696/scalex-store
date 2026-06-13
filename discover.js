// ── Browser glue for the natural-language discovery demo ──────
// Uses the shared engine (discover-engine.js) + the enriched catalog
// (PRODUCTS, from data.js). No backend required.

const dqInput = document.getElementById('dqInput');
const dqBtn = document.getElementById('dqBtn');
const dqExamples = document.getElementById('dqExamples');
const dqInterpret = document.getElementById('dqInterpret');
const dqCount = document.getElementById('dqCount');
const dqResults = document.getElementById('dqResults');

const EXAMPLES = [
  'black sneakers under $100 in size 10',
  'comfortable running shoes for long distance',
  'waterproof boots',
  'brown boots under $200',
  'lightweight Nike shoes',
  'sandals in size 9',
];

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Example chips
EXAMPLES.forEach((q) => {
  const b = document.createElement('button');
  b.className = 'dq-ex';
  b.textContent = q;
  b.addEventListener('click', () => runSearch(q));
  dqExamples.appendChild(b);
});

function runSearch(query) {
  dqInput.value = query;
  const url = new URL(window.location);
  url.searchParams.set('q', query);
  history.replaceState(null, '', url);

  const { intent, results, total } = Discover.discover(PRODUCTS, query, { limit: 12 });

  // Interpretation panel — show what the agent understood
  const tags = [];
  if (intent.category) tags.push(['category', intent.category]);
  intent.colors.forEach((c) => tags.push(['color', c]));
  if (intent.brand) tags.push(['brand', intent.brand]);
  if (intent.size) tags.push(['size', intent.size]);
  if (intent.maxPrice != null) tags.push(['max price', '$' + intent.maxPrice]);
  if (intent.minPrice != null) tags.push(['min price', '$' + intent.minPrice]);
  intent.keywords.forEach((k) => tags.push(['wants', k]));

  dqInterpret.hidden = false;
  dqInterpret.innerHTML =
    `<span class="dq-i-label">Agent understood:</span> ` +
    (tags.length
      ? tags.map(([k, v]) => `<span class="dq-tag"><b>${esc(k)}</b> ${esc(v)}</span>`).join('')
      : `<span class="dq-tag">no specific constraints — ranking by relevance</span>`);

  dqCount.textContent = total
    ? `${total} matching product${total !== 1 ? 's' : ''}${total > results.length ? ` (showing ${results.length})` : ''}`
    : '';

  if (!results.length) {
    dqResults.innerHTML = `<p class="dq-empty">No products match those constraints. Try removing a filter — e.g. a different colour, size, or a higher price.</p>`;
    return;
  }

  dqResults.innerHTML = results.map(cardHTML).join('');
  dqResults.querySelectorAll('.product-card').forEach((card) => {
    card.addEventListener('click', () => (window.location.href = `product-${card.dataset.id}.html`));
  });
}

function cardHTML(res) {
  const p = res.product;
  const why = res.reasons
    .map((r) => `<span class="why-chip ${r.kind}">${r.kind === 'filter' ? '✓' : '~'} ${esc(r.label)}</span>`)
    .join('');
  return `
    <article class="product-card dq-card" data-id="${p.id}" role="button" tabindex="0">
      <div class="card-img-wrap">
        <img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy" />
        <span class="category-badge">${esc(p.category)}</span>
        <span class="dq-score" title="relevance score">${res.score}</span>
      </div>
      <div class="card-body">
        <p class="card-title">${esc(p.title)}</p>
        <div class="card-rating"><span>★ ${p.rating.rate} (${p.rating.count})</span></div>
        <div class="card-why">${why}</div>
      </div>
      <div class="card-footer">
        <span class="card-price">$${p.price.toFixed(2)}</span>
        <span class="dq-meta">${esc(p.brand)} · ${esc(p.color)}</span>
      </div>
    </article>`;
}

// Wire input
dqBtn.addEventListener('click', () => runSearch(dqInput.value.trim()));
dqInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(dqInput.value.trim()); });

// Run from ?q= or show a default example
const initial = new URLSearchParams(window.location.search).get('q');
runSearch(initial || EXAMPLES[0]);
