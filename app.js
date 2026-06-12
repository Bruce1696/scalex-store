const API_BASE = 'https://fakestoreapi.com';

// ── State ──────────────────────────────────────────────
let allProducts = [];     // full /products response, fetched once
let baseProducts = [];    // current category slice (API or allProducts)
let filteredProducts = []; // baseProducts after search filter + sort
let cart = JSON.parse(localStorage.getItem('scalex_cart') || '[]');
let activeCategory = 'all';
let searchQuery = '';

// ── DOM refs ───────────────────────────────────────────
const productGrid   = document.getElementById('productGrid');
const navCategories = document.getElementById('navCategories');
const cartSidebar   = document.getElementById('cartSidebar');
const cartToggle    = document.getElementById('cartToggle');
const closeCart     = document.getElementById('closeCart');
const cartItems     = document.getElementById('cartItems');
const cartFooter    = document.getElementById('cartFooter');
const cartCountEl   = document.getElementById('cartCount');
const cartTotalEl   = document.getElementById('cartTotal');
const overlay       = document.getElementById('overlay');
const sortSelect    = document.getElementById('sortSelect');
const resultCount   = document.getElementById('resultCount');
const searchInput   = document.getElementById('searchInput');
const searchBtn     = document.getElementById('searchBtn');
const errorMsg      = document.getElementById('errorMsg');

// ── Fetch Products ─────────────────────────────────────
async function fetchProducts() {
  try {
    const [productsRes, categoriesRes] = await Promise.all([
      fetch(`${API_BASE}/products`),
      fetch(`${API_BASE}/products/categories`),
    ]);
    if (!productsRes.ok || !categoriesRes.ok) throw new Error('API error');

    allProducts  = await productsRes.json();
    const categories = await categoriesRes.json();

    baseProducts     = [...allProducts];
    filteredProducts = [...allProducts];

    buildCategories(categories);
    renderProducts();
    updateCartUI();
  } catch (err) {
    productGrid.innerHTML = '';
    errorMsg.hidden = false;
    console.error('Failed to fetch products:', err);
  }
}

// ── Categories ─────────────────────────────────────────
function buildCategories(categories) {
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-btn';
    btn.dataset.cat = cat;
    btn.textContent = cat;
    btn.addEventListener('click', () => setCategory(cat));
    navCategories.appendChild(btn);
  });

  navCategories.querySelector('[data-cat="all"]').addEventListener('click', () => setCategory('all'));
}

async function setCategory(cat) {
  activeCategory = cat;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));

  if (cat === 'all') {
    baseProducts = [...allProducts];
    applyFilters();
    return;
  }

  // Fetch this category's products from the API
  showGridSkeleton();
  try {
    const res = await fetch(`${API_BASE}/products/category/${encodeURIComponent(cat)}`);
    if (!res.ok) throw new Error('Category fetch failed');
    baseProducts = await res.json();
  } catch {
    baseProducts = allProducts.filter(p => p.category === cat); // fallback to local
  }
  applyFilters();
}

// ── Search ─────────────────────────────────────────────
function applySearch() {
  searchQuery = searchInput.value.trim().toLowerCase();
  applyFilters();
}
searchBtn.addEventListener('click', applySearch);
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') applySearch(); });

// ── Filters & Sort ─────────────────────────────────────
function applyFilters() {
  filteredProducts = baseProducts.filter(p => {
    return !searchQuery
      || p.title.toLowerCase().includes(searchQuery)
      || p.category.toLowerCase().includes(searchQuery)
      || p.description.toLowerCase().includes(searchQuery);
  });
  applySort();
}

function applySort() {
  const val = sortSelect.value;
  if (val === 'price-asc')  filteredProducts.sort((a, b) => a.price - b.price);
  if (val === 'price-desc') filteredProducts.sort((a, b) => b.price - a.price);
  if (val === 'rating')     filteredProducts.sort((a, b) => b.rating.rate - a.rating.rate);
  if (val === 'default')    filteredProducts.sort((a, b) => a.id - b.id);
  renderProducts();
}

sortSelect.addEventListener('change', applySort);

// ── Grid skeleton ──────────────────────────────────────
function showGridSkeleton(count = 6) {
  productGrid.innerHTML = Array(count).fill('<div class="skeleton-card"></div>').join('');
  resultCount.textContent = '';
}

// ── Render Products ────────────────────────────────────
function renderProducts() {
  resultCount.textContent = `${filteredProducts.length} product${filteredProducts.length !== 1 ? 's' : ''}`;
  if (!filteredProducts.length) {
    productGrid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);padding:40px 0;">No products found.</p>';
    return;
  }
  productGrid.innerHTML = filteredProducts.map(product => cardHTML(product)).join('');

  // Bind card events
  productGrid.querySelectorAll('.product-card').forEach(card => {
    const id = Number(card.dataset.id);
    card.addEventListener('click', e => {
      if (e.target.closest('.add-to-cart')) return;
      window.location.href = `product.html?id=${id}`;
    });
    card.querySelector('.add-to-cart').addEventListener('click', e => {
      e.stopPropagation();
      addToCart(id, e.currentTarget);
    });
  });
}

function cardHTML(p) {
  const stars = renderStars(p.rating.rate);
  const inCart = cart.some(i => i.id === p.id);
  return `
    <article class="product-card" data-id="${p.id}" role="button" tabindex="0" aria-label="${escHtml(p.title)}">
      <div class="card-img-wrap">
        <img src="${escHtml(p.image)}" alt="${escHtml(p.title)}" loading="lazy" />
        <span class="category-badge">${escHtml(p.category)}</span>
      </div>
      <div class="card-body">
        <p class="card-title">${escHtml(p.title)}</p>
        <div class="card-rating">
          <span class="stars">${stars}</span>
          <span>${p.rating.rate} (${p.rating.count})</span>
        </div>
      </div>
      <div class="card-footer">
        <span class="card-price">$${p.price.toFixed(2)}</span>
        <button class="add-to-cart${inCart ? ' added' : ''}" aria-label="Add ${escHtml(p.title)} to cart">
          ${inCart ? '✓ Added' : 'Add to Cart'}
        </button>
      </div>
    </article>`;
}

function renderStars(rate) {
  const full = Math.round(rate);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

// ── Cart Sidebar ───────────────────────────────────────
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

// ── Cart Logic ─────────────────────────────────────────
function addToCart(id, btn) {
  const product = allProducts.find(p => p.id === id);
  if (!product) return;

  const existing = cart.find(i => i.id === id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ id: product.id, title: product.title, price: product.price, image: product.image, qty: 1 });
  }

  if (btn) {
    btn.textContent = '✓ Added';
    btn.classList.add('added');
  }

  saveCart();
  updateCartUI();
}

function removeFromCart(id) {
  cart = cart.filter(i => i.id !== id);
  saveCart();
  updateCartUI();
  refreshCardButtons();
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) return removeFromCart(id);
  saveCart();
  updateCartUI();
}

function saveCart() {
  localStorage.setItem('scalex_cart', JSON.stringify(cart));
}

function updateCartUI() {
  const totalItems = cart.reduce((s, i) => s + i.qty, 0);
  cartCountEl.textContent = totalItems;

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

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  cartTotalEl.textContent = `$${total.toFixed(2)}`;

  // Bind cart item events
  cartItems.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      changeQty(id, btn.dataset.action === 'inc' ? 1 : -1);
    });
  });
  cartItems.querySelectorAll('.remove-item').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(Number(btn.dataset.id)));
  });
}

function refreshCardButtons() {
  document.querySelectorAll('.product-card').forEach(card => {
    const id = Number(card.dataset.id);
    const btn = card.querySelector('.add-to-cart');
    const inCart = cart.some(i => i.id === id);
    btn.textContent = inCart ? '✓ Added' : 'Add to Cart';
    btn.classList.toggle('added', inCart);
  });
}

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
fetchProducts();
