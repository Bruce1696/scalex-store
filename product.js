const API_BASE = 'https://fakestoreapi.com';

// ── Cart state (shared via localStorage) ──────────────
let cart = JSON.parse(localStorage.getItem('scalex_cart') || '[]');

// ── DOM refs ───────────────────────────────────────────
const pdError      = document.getElementById('pdError');
const pdContainer  = document.getElementById('pdContainer');
const pdImage      = document.getElementById('pdImage');
const pdEndpoint   = document.getElementById('pdEndpoint');
const bcCategory   = document.getElementById('bcCategory');
const bcTitle      = document.getElementById('bcTitle');
const pdCategory   = document.getElementById('pdCategory');
const pdIdBadge    = document.getElementById('pdIdBadge');
const pdTitle      = document.getElementById('pdTitle');
const pdRatingRow  = document.getElementById('pdRatingRow');
const pdDescription= document.getElementById('pdDescription');
const pdPrice      = document.getElementById('pdPrice');
const pdAddBtn     = document.getElementById('pdAddBtn');
const pdMetaGrid   = document.getElementById('pdMetaGrid');
const jsonToggle   = document.getElementById('jsonToggle');
const jsonBlock    = document.getElementById('jsonBlock');
const cartToggle   = document.getElementById('cartToggle');
const closeCart    = document.getElementById('closeCart');
const cartSidebar  = document.getElementById('cartSidebar');
const cartItems    = document.getElementById('cartItems');
const cartFooter   = document.getElementById('cartFooter');
const cartCountEl  = document.getElementById('cartCount');
const cartTotalEl  = document.getElementById('cartTotal');
const overlay      = document.getElementById('overlay');

// ── Read ?id= from URL ─────────────────────────────────
const productId = new URLSearchParams(window.location.search).get('id');

// ── Fetch & Render ─────────────────────────────────────
async function loadProduct() {
  if (!productId || isNaN(Number(productId))) {
    showError();
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/products/${productId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const p = await res.json();
    render(p);
  } catch (err) {
    console.error('Failed to load product:', err);
    showError();
  }
}

function showError() {
  pdError.hidden = false;
}

function render(p) {
  // Update page title
  document.title = `${p.title} — ScalexStore`;

  // Breadcrumb
  bcCategory.textContent = p.category;
  bcTitle.textContent = p.title.length > 40 ? p.title.slice(0, 40) + '…' : p.title;

  // Image
  pdImage.src  = p.image;
  pdImage.alt  = p.title;

  // Endpoint badge
  pdEndpoint.textContent = `GET /products/${p.id}`;

  // Badges
  pdCategory.textContent = p.category;
  pdIdBadge.textContent  = `#${p.id}`;

  // Title & description
  pdTitle.textContent       = p.title;
  pdDescription.textContent = p.description;

  // Rating
  const stars = renderStars(p.rating.rate);
  pdRatingRow.innerHTML = `
    <span class="stars">${stars}</span>
    <span class="pd-rating-text">${p.rating.rate} out of 5</span>
    <span class="pd-rating-sep">·</span>
    <span class="pd-rating-text">${p.rating.count} reviews</span>`;

  // Price
  pdPrice.textContent = `$${p.price.toFixed(2)}`;

  // Add to cart button state
  syncAddBtn(p.id);
  pdAddBtn.addEventListener('click', () => {
    addToCart(p);
    syncAddBtn(p.id);
    openCartSidebar();
  });

  // Metadata grid — every field from the API
  const meta = [
    { label: 'Product ID',   value: `#${p.id}`,                  mono: false },
    { label: 'Title',        value: p.title,                      mono: false },
    { label: 'Price',        value: `$${p.price.toFixed(2)}`,     mono: false },
    { label: 'Category',     value: p.category,                   mono: false },
    { label: 'Rating',       value: `${p.rating.rate} / 5.0`,     mono: false },
    { label: 'Review Count', value: p.rating.count.toString(),     mono: false },
    { label: 'Image URL',    value: p.image,                      mono: true  },
    { label: 'API Endpoint', value: `/products/${p.id}`,          mono: true  },
  ];

  pdMetaGrid.innerHTML = meta.map(m => `
    <div class="meta-row">
      <span class="meta-key">${escHtml(m.label)}</span>
      <span class="meta-val ${m.mono ? 'meta-mono' : ''}">${escHtml(m.value)}</span>
    </div>`).join('');

  // Raw JSON block
  jsonBlock.textContent = JSON.stringify(p, null, 2);

  // Show page
  pdContainer.hidden = false;

  // Cart init
  updateCartUI();
}

// ── Stars ──────────────────────────────────────────────
function renderStars(rate) {
  const full = Math.round(rate);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

// ── Add to cart ────────────────────────────────────────
function addToCart(p) {
  const existing = cart.find(i => i.id === p.id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ id: p.id, title: p.title, price: p.price, image: p.image, qty: 1 });
  }
  localStorage.setItem('scalex_cart', JSON.stringify(cart));
  updateCartUI();
}

function syncAddBtn(id) {
  const inCart = cart.some(i => i.id === id);
  pdAddBtn.textContent = inCart ? '✓ In Cart — Add More' : 'Add to Cart';
  pdAddBtn.classList.toggle('in-cart', inCart);
}

function removeFromCart(id) {
  cart = cart.filter(i => i.id !== id);
  localStorage.setItem('scalex_cart', JSON.stringify(cart));
  updateCartUI();
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) return removeFromCart(id);
  localStorage.setItem('scalex_cart', JSON.stringify(cart));
  updateCartUI();
}

// ── Cart UI ────────────────────────────────────────────
function updateCartUI() {
  const total = cart.reduce((s, i) => s + i.qty, 0);
  cartCountEl.textContent = total;

  if (!cart.length) {
    cartItems.innerHTML = '<p class="empty-cart">Your cart is empty.</p>';
    cartFooter.hidden = true;
    return;
  }

  cartFooter.hidden = false;
  cartItems.innerHTML = cart.map(item => `
    <div class="cart-item" data-id="${item.id}">
      <img src="${escHtml(item.image)}" alt="${escHtml(item.title)}" />
      <div class="cart-item-info">
        <p class="cart-item-title">${escHtml(item.title)}</p>
        <p class="cart-item-price">$${(item.price * item.qty).toFixed(2)}</p>
        <div class="cart-item-qty">
          <button class="qty-btn" data-action="dec" data-id="${item.id}">−</button>
          <span class="qty-num">${item.qty}</span>
          <button class="qty-btn" data-action="inc" data-id="${item.id}">+</button>
        </div>
      </div>
      <button class="remove-item" data-id="${item.id}" aria-label="Remove item">✕</button>
    </div>`).join('');

  const grand = cart.reduce((s, i) => s + i.price * i.qty, 0);
  cartTotalEl.textContent = `$${grand.toFixed(2)}`;

  cartItems.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => changeQty(Number(btn.dataset.id), btn.dataset.action === 'inc' ? 1 : -1));
  });
  cartItems.querySelectorAll('.remove-item').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(Number(btn.dataset.id)));
  });
}

// ── Cart sidebar ───────────────────────────────────────
function openCartSidebar() {
  cartSidebar.classList.add('open');
  overlay.classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeCartSidebar() {
  cartSidebar.classList.remove('open');
  overlay.classList.remove('show');
  document.body.style.overflow = '';
}

cartToggle.addEventListener('click', openCartSidebar);
closeCart.addEventListener('click', closeCartSidebar);
overlay.addEventListener('click', closeCartSidebar);

// ── JSON toggle ────────────────────────────────────────
jsonToggle.addEventListener('click', () => {
  const expanded = jsonToggle.getAttribute('aria-expanded') === 'true';
  jsonToggle.setAttribute('aria-expanded', String(!expanded));
  jsonBlock.hidden = expanded;
  jsonToggle.querySelector('span').textContent = expanded ? 'View raw API response' : 'Hide raw API response';
  jsonToggle.querySelector('.json-chevron').style.transform = expanded ? '' : 'rotate(180deg)';
});

// ── Utility ────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Init ───────────────────────────────────────────────
loadProduct();
