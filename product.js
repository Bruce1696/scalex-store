// ── Cart state (shared via localStorage) ──────────────
let cart = JSON.parse(localStorage.getItem('scalex_cart') || '[]');

// ── DOM refs ───────────────────────────────────────────
const pdError      = document.getElementById('pdError');
const pdContainer  = document.getElementById('pdContainer');
const pdImage      = document.getElementById('pdImage');
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

// ── Look up product from seeded data ──────────────────
const productId = Number(new URLSearchParams(window.location.search).get('id'));
const p = PRODUCTS.find(x => x.id === productId);

if (!p) {
  pdError.hidden = false;
} else {
  render(p);
}

function render(p) {
  document.title = `${p.title} — ScalexStore`;

  // Breadcrumb
  bcCategory.textContent = p.category;
  bcTitle.textContent = p.title.length > 40 ? p.title.slice(0, 40) + '…' : p.title;

  // Image
  pdImage.src = p.image;
  pdImage.alt = p.title;

  // Badges
  pdCategory.textContent = p.category;
  pdIdBadge.textContent  = `#${p.id}`;

  // Title & description
  pdTitle.textContent        = p.title;
  pdDescription.textContent  = p.description;

  // Rating
  pdRatingRow.innerHTML = `
    <span class="stars">${renderStars(p.rating.rate)}</span>
    <span class="pd-rating-text">${p.rating.rate} out of 5</span>
    <span class="pd-rating-sep">·</span>
    <span class="pd-rating-text">${p.rating.count} reviews</span>`;

  // Price
  pdPrice.textContent = `$${p.price.toFixed(2)}`;

  // Add to cart
  syncAddBtn();
  pdAddBtn.addEventListener('click', () => {
    addToCart(p);
    syncAddBtn();
    openCartSidebar();
  });

  // Metadata table
  const meta = [
    { label: 'Product ID',   value: `#${p.id}` },
    { label: 'Title',        value: p.title },
    { label: 'Price',        value: `$${p.price.toFixed(2)}` },
    { label: 'Category',     value: p.category },
    { label: 'Rating',       value: `${p.rating.rate} / 5.0` },
    { label: 'Review Count', value: String(p.rating.count) },
    { label: 'Image URL',    value: p.image, mono: true },
  ];

  pdMetaGrid.innerHTML = meta.map(m => `
    <div class="meta-row">
      <span class="meta-key">${escHtml(m.label)}</span>
      <span class="meta-val${m.mono ? ' meta-mono' : ''}">${escHtml(m.value)}</span>
    </div>`).join('');

  // Raw JSON
  jsonBlock.textContent = JSON.stringify(p, null, 2);

  pdContainer.hidden = false;
  updateCartUI();
}

// ── Stars ──────────────────────────────────────────────
function renderStars(rate) {
  const full = Math.round(rate);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

// ── Cart logic ─────────────────────────────────────────
function addToCart(p) {
  const existing = cart.find(i => i.id === p.id);
  if (existing) { existing.qty += 1; }
  else { cart.push({ id: p.id, title: p.title, price: p.price, image: p.image, qty: 1 }); }
  localStorage.setItem('scalex_cart', JSON.stringify(cart));
  updateCartUI();
}

function syncAddBtn() {
  const inCart = cart.some(i => i.id === p.id);
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

function updateCartUI() {
  cartCountEl.textContent = cart.reduce((s, i) => s + i.qty, 0);

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
      <button class="remove-item" data-id="${item.id}" aria-label="Remove">✕</button>
    </div>`).join('');

  cartTotalEl.textContent = `$${cart.reduce((s, i) => s + i.price * i.qty, 0).toFixed(2)}`;

  cartItems.querySelectorAll('.qty-btn').forEach(btn =>
    btn.addEventListener('click', () => changeQty(Number(btn.dataset.id), btn.dataset.action === 'inc' ? 1 : -1))
  );
  cartItems.querySelectorAll('.remove-item').forEach(btn =>
    btn.addEventListener('click', () => removeFromCart(Number(btn.dataset.id)))
  );
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
  const open = jsonToggle.getAttribute('aria-expanded') === 'true';
  jsonToggle.setAttribute('aria-expanded', String(!open));
  jsonBlock.hidden = open;
  jsonToggle.querySelector('span').textContent = open ? 'View raw product data' : 'Hide raw product data';
  jsonToggle.querySelector('.json-chevron').style.transform = open ? '' : 'rotate(180deg)';
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
