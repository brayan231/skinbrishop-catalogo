// ═══════════════════════════════════════════════════════════════
//  SKINBRI SHOP — v3 COMPLETA (SIN FIREBASE AUTH)
//  Carrito con localStorage · Stock real · Checkout
// ═══════════════════════════════════════════════════════════════

import { db } from './firebase-config.js';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  getDocs, getDoc, query, orderBy, onSnapshot, where,
  serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ═══════════════════════════════════════════════════════════════
//  CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════

const WA_NUMBER = '51999999999'; // CAMBIA A TU NÚMERO REAL
const CURRENCY  = 'S/';
const PAGE_SIZE = 12;

const CAT_EMOJI = {
  cleanser: '🫧', toner: '💧', serum: '✨',
  moisturizer: '🌿', mask: '🎭', sunscreen: '☀️',
  eyecream: '👁', essence: '🌸', other: '🌺'
};

const CAT_NAME = {
  cleanser: 'Limpiador', toner: 'Tónico', serum: 'Sérum',
  moisturizer: 'Hidratante', mask: 'Mascarilla', sunscreen: 'Protector Solar',
  eyecream: 'Contorno de Ojos', essence: 'Esencia', other: 'Otro'
};

// ═══════════════════════════════════════════════════════════════
//  ESTADO GLOBAL
// ═══════════════════════════════════════════════════════════════

let allProducts = [];
let filteredProducts = [];
let displayCount = PAGE_SIZE;
let cart = [];
let activeCoupon = null;
let coupons = {};

// Filtros
let fCat = 'all';
let fSkin = '';
let fBrand = '';
let fPriceMin = null;
let fPriceMax = null;
let fSort = 'default';

// Slider
let sliderIndex = 0;
let sliderTimer = null;
let banners = [];

// ═══════════════════════════════════════════════════════════════
//  DOM HELPERS
// ═══════════════════════════════════════════════════════════════

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ═══════════════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════════════

let toastTimer;
function toast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
}

// ═══════════════════════════════════════════════════════════════
//  LOADER
// ═══════════════════════════════════════════════════════════════

window.addEventListener('load', () => {
  setTimeout(() => {
    const loader = $('loader');
    if (loader) loader.classList.add('out');
  }, 800);
});

// ═══════════════════════════════════════════════════════════════
//  CARRITO - LOCALSTORAGE
// ═══════════════════════════════════════════════════════════════

function loadCartFromLocalStorage() {
  try {
    const saved = localStorage.getItem('skinbri_cart');
    if (saved) {
      cart = JSON.parse(saved);
    }
    const savedCoupon = localStorage.getItem('skinbri_coupon');
    if (savedCoupon) {
      activeCoupon = JSON.parse(savedCoupon);
    }
    updateCartUI();
  } catch (e) {
    console.warn('Error loading cart:', e);
  }
}

function saveCartToLocalStorage() {
  try {
    localStorage.setItem('skinbri_cart', JSON.stringify(cart));
    if (activeCoupon) {
      localStorage.setItem('skinbri_coupon', JSON.stringify(activeCoupon));
    } else {
      localStorage.removeItem('skinbri_coupon');
    }
  } catch (e) {
    console.warn('Error saving cart:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
//  CARRITO - OPERACIONES CON VALIDACIÓN DE STOCK
// ═══════════════════════════════════════════════════════════════

async function addToCart(p, qty = 1) {
  if (!p || !p.id) return;
  
  try {
    const productRef = doc(db, 'products', p.id);
    const productSnap = await getDoc(productRef);
    const currentStock = productSnap.exists() ? productSnap.data().stock : null;
    
    const existingItem = cart.find(i => i.id === p.id);
    const newQty = (existingItem?.qty || 0) + qty;
    
    if (currentStock !== null && currentStock !== undefined && newQty > currentStock) {
      toast(`❌ Solo hay ${currentStock} unidades disponibles de ${p.name}`);
      return false;
    }
    
    if (existingItem) {
      existingItem.qty = newQty;
    } else {
      cart.push({ 
        id: p.id, 
        name: p.name, 
        brand: p.brand, 
        price: +p.price, 
        qty: qty,
        imageUrl: p.imageUrl,
        category: p.category
      });
    }
    
    saveCartToLocalStorage();
    updateCartUI();
    toast(`✅ ${p.name} agregado al carrito`);
    animateBadge();
    return true;
  } catch (e) {
    console.error('Error al agregar al carrito:', e);
    toast('❌ Error al agregar producto');
    return false;
  }
}

function updateCartItemQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  
  const newQty = item.qty + delta;
  if (newQty <= 0) {
    cart = cart.filter(i => i.id !== id);
  } else {
    item.qty = newQty;
  }
  
  saveCartToLocalStorage();
  updateCartUI();
}

function removeCartItem(id) {
  cart = cart.filter(i => i.id !== id);
  saveCartToLocalStorage();
  updateCartUI();
  toast('🗑️ Producto eliminado del carrito');
}

function clearCart() {
  cart = [];
  activeCoupon = null;
  saveCartToLocalStorage();
  updateCartUI();
}

function animateBadge() {
  const badge = $('cartBadge');
  if (badge) {
    badge.classList.add('pop');
    setTimeout(() => badge.classList.remove('pop'), 300);
  }
}

// ═══════════════════════════════════════════════════════════════
//  CHECKOUT - GUARDAR PEDIDO
// ═══════════════════════════════════════════════════════════════

async function checkout() {
  if (!cart.length) {
    toast('🛒 El carrito está vacío');
    return;
  }
  
  const batch = writeBatch(db);
  const stockErrors = [];
  const orderItems = [];
  let subtotal = 0;
  
  for (const item of cart) {
    const productRef = doc(db, 'products', item.id);
    const productSnap = await getDoc(productRef);
    const currentStock = productSnap.exists() ? productSnap.data().stock : null;
    const productPrice = productSnap.exists() ? productSnap.data().price : item.price;
    
    subtotal += productPrice * item.qty;
    orderItems.push({
      id: item.id,
      name: item.name,
      brand: item.brand,
      price: productPrice,
      qty: item.qty,
      imageUrl: item.imageUrl
    });
    
    if (currentStock !== null && currentStock !== undefined && item.qty > currentStock) {
      stockErrors.push(`${item.name}: solo quedan ${currentStock}`);
    } else if (currentStock !== null && currentStock !== undefined) {
      batch.update(productRef, { stock: currentStock - item.qty });
    }
  }
  
  if (stockErrors.length) {
    toast(`❌ Error de stock:\n${stockErrors.join('\n')}`);
    return;
  }
  
  let discount = 0;
  if (activeCoupon) {
    if (activeCoupon.type === 'percent') discount = subtotal * (activeCoupon.value / 100);
    if (activeCoupon.type === 'fixed') discount = Math.min(activeCoupon.value, subtotal);
  }
  const total = Math.max(subtotal - discount, 0);
  
  const orderData = {
    items: orderItems,
    subtotal: subtotal,
    discount: discount,
    couponCode: activeCoupon?.code || null,
    total: total,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    clientName: 'Cliente Web',
    phone: null,
    address: null,
    notes: null,
    source: 'web'
  };
  
  try {
    const orderRef = await addDoc(collection(db, 'orders'), orderData);
    await batch.commit();
    
    cart = [];
    activeCoupon = null;
    saveCartToLocalStorage();
    updateCartUI();
    
    toast(`✅ ¡Pedido #${orderRef.id.slice(-6)} creado!`);
    
    sendWhatsAppOrder(orderData, orderRef.id);
    closeCart();
    
  } catch (e) {
    console.error('Error en checkout:', e);
    toast('❌ Error al procesar el pedido: ' + e.message);
  }
}

function sendWhatsAppOrder(order, orderId) {
  const lines = order.items.map(i => `• ${i.name} x${i.qty} = S/ ${(i.price * i.qty).toFixed(2)}`);
  let msg = `🌸 *NUEVO PEDIDO SKINBRI* 🌸\n\n`;
  msg += `*Pedido #:* ${orderId.slice(-6)}\n`;
  msg += `*Fecha:* ${new Date().toLocaleString('es-PE')}\n\n`;
  msg += `*Productos:*\n${lines.join('\n')}\n\n`;
  msg += `*Subtotal:* S/ ${order.subtotal.toFixed(2)}\n`;
  if (order.discount > 0) msg += `*Descuento:* -S/ ${order.discount.toFixed(2)}\n`;
  msg += `*TOTAL:* S/ ${order.total.toFixed(2)}\n\n`;
  msg += `¡Gracias por tu compra! 💕`;
  
  window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ═══════════════════════════════════════════════════════════════
//  UPDATE CART UI
// ═══════════════════════════════════════════════════════════════

function updateCartUI() {
  const total = cart.reduce((s, i) => s + i.qty, 0);
  const badge = $('cartBadge');
  if (badge) {
    badge.textContent = total;
    badge.style.display = total > 0 ? 'flex' : 'none';
  }
  const csCount = $('csCount');
  if (csCount) csCount.textContent = total > 0 ? `(${total})` : '';
  
  const csEmpty = $('csEmpty');
  const csItems = $('csItems');
  const csFooter = $('csFooter');
  
  if (!cart.length) {
    if (csEmpty) csEmpty.style.display = 'flex';
    if (csItems) csItems.innerHTML = '';
    if (csFooter) csFooter.style.display = 'none';
    return;
  }
  
  if (csEmpty) csEmpty.style.display = 'none';
  if (csFooter) csFooter.style.display = 'block';
  
  if (csItems) {
    csItems.innerHTML = cart.map(item => `
      <div class="cs-item" data-id="${item.id}">
        <div class="csi-img">${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.name}">` : (CAT_EMOJI[item.category] || '🌺')}</div>
        <div class="csi-info">
          <div class="csi-name">${escapeHtml(item.name)}</div>
          <div class="csi-brand">${escapeHtml(item.brand || '')}</div>
          <div class="csi-price">${CURRENCY} ${(item.price * item.qty).toFixed(2)}</div>
        </div>
        <div class="csi-controls">
          <div class="csi-qty">
            <button class="qty-btn" data-action="dec" data-id="${item.id}">−</button>
            <span class="qty-num">${item.qty}</span>
            <button class="qty-btn" data-action="inc" data-id="${item.id}">+</button>
          </div>
          <button class="csi-rm" data-id="${item.id}">Quitar</button>
        </div>
      </div>
    `).join('');
    
    csItems.querySelectorAll('.qty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (btn.dataset.action === 'inc') updateCartItemQty(id, 1);
        else updateCartItemQty(id, -1);
      });
    });
    csItems.querySelectorAll('.csi-rm').forEach(btn => {
      btn.addEventListener('click', () => removeCartItem(btn.dataset.id));
    });
  }
  
  updateCartTotals();
}

function updateCartTotals() {
  const sub = cart.reduce((s, i) => s + (i.price * i.qty), 0);
  let disc = 0;
  if (activeCoupon) {
    if (activeCoupon.type === 'percent') disc = sub * (activeCoupon.value / 100);
    if (activeCoupon.type === 'fixed') disc = Math.min(activeCoupon.value, sub);
  }
  const total = Math.max(sub - disc, 0);
  
  const csSubtotal = $('csSubtotal');
  const csTotal = $('csTotal');
  const discountRow = $('discountRow');
  const csDiscount = $('csDiscount');
  
  if (csSubtotal) csSubtotal.textContent = `${CURRENCY} ${sub.toFixed(2)}`;
  if (csTotal) csTotal.textContent = `${CURRENCY} ${total.toFixed(2)}`;
  if (discountRow) discountRow.style.display = disc > 0 ? 'flex' : 'none';
  if (csDiscount) csDiscount.textContent = `-${CURRENCY} ${disc.toFixed(2)}`;
}

function closeCart() {
  const cartSidebar = $('cartSidebar');
  const cartOverlay = $('cartOverlay');
  if (cartSidebar) cartSidebar.classList.remove('on');
  if (cartOverlay) cartOverlay.classList.remove('on');
  document.body.style.overflow = '';
}

// ═══════════════════════════════════════════════════════════════
//  RENDER PRODUCTOS
// ═══════════════════════════════════════════════════════════════

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

function renderStars(rating) {
  const r = Math.round(rating * 2) / 2;
  let s = '';
  for (let i = 1; i <= 5; i++) {
    if (i <= r) s += '<span class="star">★</span>';
    else if (i - 0.5 === r) s += '<span class="star">½</span>';
    else s += '<span class="star" style="opacity:.25">★</span>';
  }
  return s;
}

function buildCard(p, i = 0) {
  const hasDsc = p.originalPrice && +p.originalPrice > +p.price;
  const outStock = p.stock !== undefined && +p.stock === 0;
  const lowStock = p.stock !== undefined && +p.stock > 0 && +p.stock <= 5;
  const discPct = hasDsc ? Math.round((1 - (+p.price / +p.originalPrice)) * 100) : 0;
  const delay = (i % PAGE_SIZE) * 0.05;
  const stars = renderStars(p.rating || 0);
  
  return `
    <article class="product-card reveal" data-id="${p.id}" style="animation-delay:${delay}s">
      <div class="pc-badges">
        ${p.isNew ? '<span class="pcb pcb-new">NEW</span>' : ''}
        ${hasDsc ? `<span class="pcb pcb-sale">-${discPct}%</span>` : ''}
        ${p.isHot ? '<span class="pcb pcb-hot">🔥 HOT</span>' : ''}
        ${outStock ? '<span class="pcb pcb-stock">Agotado</span>' : ''}
        ${lowStock ? `<span class="pcb pcb-stock">¡Solo ${p.stock}!</span>` : ''}
      </div>
      <div class="pc-img-wrap">
        <div class="pc-img">
          ${p.imageUrl
            ? `<img src="${p.imageUrl}" alt="${escapeHtml(p.name)}" loading="lazy">`
            : `<div class="pc-img-placeholder">${CAT_EMOJI[p.category] || '🌺'}</div>`}
        </div>
        <div class="pc-actions">
          <button class="pc-btn pc-btn-view" data-id="${p.id}">Ver detalles</button>
          <button class="pc-btn pc-btn-cart" data-id="${p.id}" ${outStock ? 'disabled' : ''}>
            ${outStock ? 'Agotado' : '+ Agregar'}
          </button>
        </div>
      </div>
      <div class="pc-body">
        <div class="pc-brand">${escapeHtml(p.brand || 'K-Beauty')}</div>
        <div class="pc-name">${escapeHtml(p.name)}</div>
        ${p.shortDescription ? `<div class="pc-desc">${escapeHtml(p.shortDescription)}</div>` : ''}
        ${p.rating ? `<div class="pc-stars">${stars}<span class="rc">(${p.reviewCount || 0})</span></div>` : ''}
        <div class="pc-footer">
          <div>
            <div class="pc-price">${CURRENCY} ${(+p.price || 0).toFixed(2)}</div>
            ${hasDsc ? `<div class="pc-orig">${CURRENCY} ${(+p.originalPrice).toFixed(2)}</div>` : ''}
          </div>
          ${hasDsc ? `<span class="pc-discount">-${discPct}%</span>` : ''}
        </div>
      </div>
    </article>
  `;
}

function attachCardEvents(root) {
  if (!root) return;
  
  root.querySelectorAll('.pc-btn-view').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = allProducts.find(p => p.id === btn.dataset.id);
      if (p) openModal(p);
    });
  });
  
  root.querySelectorAll('.pc-btn-cart').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = allProducts.find(p => p.id === btn.dataset.id);
      if (p && !btn.disabled) addToCart(p, 1);
    });
  });
  
  root.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => {
      const p = allProducts.find(p => p.id === card.dataset.id);
      if (p) openModal(p);
    });
  });
}

function renderProducts() {
  const grid = $('productsGrid');
  const pgLoading = $('pgLoading');
  const emptyState = $('emptyState');
  const loadMoreRow = $('loadMoreRow');
  
  if (!grid) return;
  if (pgLoading) pgLoading.style.display = 'none';
  
  if (!filteredProducts.length) {
    grid.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    if (loadMoreRow) loadMoreRow.style.display = 'none';
    return;
  }
  
  if (emptyState) emptyState.style.display = 'none';
  
  const slice = filteredProducts.slice(0, displayCount);
  grid.innerHTML = slice.map((p, i) => buildCard(p, i)).join('');
  attachCardEvents(grid);
  
  if (loadMoreRow) {
    loadMoreRow.style.display = filteredProducts.length > displayCount ? 'block' : 'none';
  }
  
  setTimeout(() => {
    grid.querySelectorAll('.product-card').forEach(c => c.classList.add('in'));
  }, 50);
}

function renderFeatured(type) {
  const grid = $('featuredGrid');
  if (!grid) return;
  
  let list = [...allProducts];
  if (type === 'hot') list = list.filter(p => p.isHot);
  if (type === 'new') list = list.filter(p => p.isNew);
  if (type === 'sale') list = list.filter(p => p.originalPrice && +p.originalPrice > +p.price);
  list = list.filter(p => p.active !== false).slice(0, 8);
  
  if (!list.length) {
    grid.innerHTML = `<div class="fg-loading"><div class="spin"></div><p style="margin-top:1rem">No hay productos en esta sección</p></div>`;
    return;
  }
  
  grid.innerHTML = list.map((p, i) => buildCard(p, i)).join('');
  attachCardEvents(grid);
}

// ═══════════════════════════════════════════════════════════════
//  FILTROS
// ═══════════════════════════════════════════════════════════════

function applyFilters() {
  let list = [...allProducts];
  
  if (fCat && fCat !== 'all') {
    list = list.filter(p => p.category === fCat);
  }
  if (fSkin) {
    list = list.filter(p => (p.skin_type || '').toLowerCase().includes(fSkin.toLowerCase()));
  }
  if (fBrand) {
    list = list.filter(p => p.brand === fBrand);
  }
  if (fPriceMin !== null) {
    list = list.filter(p => +p.price >= fPriceMin);
  }
  if (fPriceMax !== null) {
    list = list.filter(p => +p.price <= fPriceMax);
  }
  
  switch (fSort) {
    case 'price-asc': list.sort((a, b) => +a.price - +b.price); break;
    case 'price-desc': list.sort((a, b) => +b.price - +a.price); break;
    case 'name-asc': list.sort((a, b) => (a.name || '').localeCompare(b.name || '')); break;
    case 'rating-desc': list.sort((a, b) => (+b.rating || 0) - (+a.rating || 0)); break;
    case 'newest': list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); break;
  }
  
  filteredProducts = list;
  
  const resultsCount = $('resultsCount');
  if (resultsCount) {
    resultsCount.textContent = `${list.length} producto${list.length !== 1 ? 's' : ''}`;
  }
  
  renderProducts();
}

function resetFilters() {
  fCat = 'all';
  fSkin = '';
  fBrand = '';
  fPriceMin = null;
  fPriceMax = null;
  fSort = 'default';
  
  const priceMin = $('priceMin');
  const priceMax = $('priceMax');
  const brandFilter = $('brandFilter');
  const sortFilter = $('sortFilter');
  
  if (priceMin) priceMin.value = '';
  if (priceMax) priceMax.value = '';
  if (brandFilter) brandFilter.value = '';
  if (sortFilter) sortFilter.value = 'default';
  
  $$('#catChips .chip').forEach(c => {
    c.classList.toggle('active', c.dataset.cat === 'all');
  });
  $$('#skinChips .chip').forEach(c => {
    c.classList.toggle('active', c.dataset.skin === '');
  });
  
  displayCount = PAGE_SIZE;
  applyFilters();
}

function buildBrandFilter() {
  const brands = [...new Set(allProducts.map(p => p.brand).filter(Boolean))].sort();
  const select = $('brandFilter');
  if (select) {
    select.innerHTML = `<option value="">Todas las marcas</option>` + 
      brands.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
  }
}

function setCategory(cat) {
  fCat = cat;
  displayCount = PAGE_SIZE;
  $$('#catChips .chip').forEach(c => {
    c.classList.toggle('active', c.dataset.cat === cat);
  });
  applyFilters();
}

// ═══════════════════════════════════════════════════════════════
//  MODAL DE PRODUCTO
// ═══════════════════════════════════════════════════════════════

async function openModal(p) {
  if (!p) return;
  
  try {
    const productRef = doc(db, 'products', p.id);
    const productSnap = await getDoc(productRef);
    if (productSnap.exists()) {
      p = { ...p, ...productSnap.data() };
    }
  } catch (e) {
    console.warn('Error refreshing product stock:', e);
  }
  
  const outStock = p.stock !== undefined && +p.stock === 0;
  const lowStock = p.stock !== undefined && +p.stock > 0 && +p.stock <= 5;
  const hasDsc = p.originalPrice && +p.originalPrice > +p.price;
  const discPct = hasDsc ? Math.round((1 - (+p.price / +p.originalPrice)) * 100) : 0;
  const stars = renderStars(p.rating || 0);
  
  const modalBody = $('modalBody');
  if (!modalBody) return;
  
  modalBody.innerHTML = `
    <div class="ml-layout">
      <div class="ml-gallery">
        <div class="mlg-main">
          ${p.imageUrl 
            ? `<img src="${p.imageUrl}" alt="${escapeHtml(p.name)}">`
            : `<div class="no-img-lg">${CAT_EMOJI[p.category] || '🌺'}</div>`}
        </div>
      </div>
      <div class="ml-info">
        <div class="ml-brand">${escapeHtml(p.brand || 'K-Beauty')}</div>
        <h2 class="ml-name">${escapeHtml(p.name)}</h2>
        <div class="ml-rating-row">
          <span class="ml-stars">${stars}</span>
          <span class="ml-rc">${(+p.rating || 0).toFixed(1)} · ${p.reviewCount || 0} reseñas</span>
        </div>
        <div class="ml-price-row">
          <span class="ml-price">${CURRENCY} ${(+p.price || 0).toFixed(2)}</span>
          ${hasDsc ? `<span class="ml-orig">${CURRENCY} ${(+p.originalPrice).toFixed(2)}</span><span class="ml-disc-badge">-${discPct}%</span>` : ''}
        </div>
        ${p.description ? `<p class="ml-desc">${escapeHtml(p.description)}</p>` : ''}
        <div class="ml-details">
          ${p.category ? `<div class="ml-det-row"><span class="ml-det-label">Categoría</span><span class="ml-det-val">${CAT_NAME[p.category] || p.category}</span></div>` : ''}
          ${p.size ? `<div class="ml-det-row"><span class="ml-det-label">Presentación</span><span class="ml-det-val">${escapeHtml(p.size)}</span></div>` : ''}
          ${p.skin_type ? `<div class="ml-det-row"><span class="ml-det-label">Tipo de piel</span><span class="ml-det-val">${escapeHtml(p.skin_type)}</span></div>` : ''}
          <div class="ml-det-row"><span class="ml-det-label">Stock</span><span class="ml-det-val">${outStock ? '❌ Agotado' : (lowStock ? `⚠️ Solo ${p.stock} disponibles` : '✅ Disponible')}</span></div>
        </div>
        <div class="ml-actions">
          <button class="btn-modal-cart" id="mlCartBtn" ${outStock ? 'disabled' : ''}>
            ${outStock ? 'Producto agotado' : '🛍 Agregar al carrito'}
          </button>
        </div>
      </div>
    </div>
  `;
  
  const cartBtn = $('mlCartBtn');
  if (cartBtn) {
    cartBtn.addEventListener('click', () => {
      addToCart(p, 1);
      closeModal();
    });
  }
  
  const modal = $('productModal');
  if (modal) {
    modal.classList.add('on');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal() {
  const modal = $('productModal');
  if (modal) modal.classList.remove('on');
  document.body.style.overflow = '';
}

// ═══════════════════════════════════════════════════════════════
//  BANNERS SLIDER
// ═══════════════════════════════════════════════════════════════

async function loadBanners() {
  try {
    const bSnap = await getDocs(query(collection(db, 'banners'), orderBy('order', 'asc')));
    if (!bSnap.empty) {
      banners = bSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
      banners = [
        { title: 'K-Beauty Auténtico', titleEm: 'de Corea', sub: 'Descubre la magia del skincare coreano.', badge: '✦ Nuevo Catálogo 2025 ✦', bg: 'linear-gradient(135deg,#5c2d3c 0%,#c04060 100%)', cta: 'Ver Catálogo', cta2: 'Más Vendidos', catLink: 'all', cat2Link: 'featured' },
        { title: 'Rutina Perfecta', titleEm: 'en 5 pasos', sub: 'Construye tu rutina ideal.', badge: '✦ Guía Gratuita ✦', bg: 'linear-gradient(135deg,#2d3c5c 0%,#406080 100%)', cta: 'Ver Rutinas', cta2: 'Explorar Sérums', catLink: 'routines', cat2Link: 'serum' }
      ];
    }
    buildSlider();
  } catch (e) {
    console.warn('Error loading banners:', e);
  }
}

function buildSlider() {
  const container = $('heroSlider');
  const dotsEl = $('sliderDots');
  if (!container) return;
  
  container.innerHTML = banners.map((b, i) => `
    <div class="hero-slide${i === 0 ? ' active' : ''}" data-i="${i}">
      <div class="hs-bg" style="background:${b.bg || '#5c2d3c'}${b.imgUrl ? `;background-image:url(${b.imgUrl});background-size:cover;background-position:center` : ''};"></div>
      <div class="hs-overlay"></div>
      <div class="hs-content">
        <div class="hs-badge">${b.badge || '✦ SkinBri ✦'}</div>
        <h1 class="hs-title">${b.title || 'Bienvenida'} <em>${b.titleEm || 'a SkinBri'}</em></h1>
        <p class="hs-sub">${b.sub || 'Descubre los mejores productos de K-Beauty'}</p>
        <div class="hs-actions">
          <button class="btn-rose" data-slide-link="${b.catLink || 'all'}">${b.cta || 'Ver Catálogo'}</button>
          <button class="btn-outline" style="background:transparent;color:#fff;border-color:rgba(255,255,255,.4)" data-slide-link="${b.cat2Link || 'featured'}">${b.cta2 || 'Destacados'}</button>
        </div>
      </div>
    </div>
  `).join('');
  
  if (dotsEl) {
    dotsEl.innerHTML = banners.map((_, i) => `<div class="sd${i === 0 ? ' active' : ''}" data-i="${i}"></div>`).join('');
    dotsEl.querySelectorAll('.sd').forEach(dot => {
      dot.addEventListener('click', () => goSlide(+dot.dataset.i));
    });
  }
  
  container.querySelectorAll('[data-slide-link]').forEach(btn => {
    btn.addEventListener('click', () => {
      const link = btn.dataset.slideLink;
      if (link === 'routines') {
        $('routines')?.scrollIntoView({ behavior: 'smooth' });
      } else if (link === 'featured') {
        $('featured')?.scrollIntoView({ behavior: 'smooth' });
      } else if (link === 'sale') {
        setCategory('all');
        fSort = 'price-asc';
        applyFilters();
        $('catalog')?.scrollIntoView({ behavior: 'smooth' });
      } else {
        setCategory(link);
        $('catalog')?.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
  
  const prevBtn = $('sliderPrev');
  const nextBtn = $('sliderNext');
  if (prevBtn) prevBtn.addEventListener('click', () => goSlide((sliderIndex - 1 + banners.length) % banners.length));
  if (nextBtn) nextBtn.addEventListener('click', () => goSlide((sliderIndex + 1) % banners.length));
  
  startSliderAuto();
}

function goSlide(i) {
  $$('.hero-slide').forEach(s => s.classList.remove('active'));
  $$('.sd').forEach(d => d.classList.remove('active'));
  sliderIndex = i;
  const activeSlide = document.querySelector(`.hero-slide[data-i="${i}"]`);
  const activeDot = document.querySelector(`.sd[data-i="${i}"]`);
  if (activeSlide) activeSlide.classList.add('active');
  if (activeDot) activeDot.classList.add('active');
}

function startSliderAuto() {
  if (sliderTimer) clearInterval(sliderTimer);
  sliderTimer = setInterval(() => goSlide((sliderIndex + 1) % banners.length), 5000);
}

// ═══════════════════════════════════════════════════════════════
//  CUPONES
// ═══════════════════════════════════════════════════════════════

async function loadCoupons() {
  try {
    const cSnap = await getDocs(collection(db, 'coupons'));
    cSnap.forEach(doc => {
      const data = doc.data();
      if (data.code) {
        coupons[data.code.toUpperCase()] = data;
      }
    });
    console.log('✅ Cupones cargados:', Object.keys(coupons).length);
  } catch (e) {
    console.warn('Error loading coupons:', e);
  }
}

function setupCouponButton() {
  const applyBtn = $('couponApply');
  const input = $('couponInput');
  if (!applyBtn || !input) return;
  
  applyBtn.addEventListener('click', () => {
    const code = input.value.trim().toUpperCase();
    const msg = $('couponMsg');
    
    if (!code) {
      if (msg) { msg.textContent = 'Ingresa un código'; msg.className = 'cs-coupon-msg err'; }
      return;
    }
    
    const coup = coupons[code];
    if (!coup || coup.active === false) {
      if (msg) { msg.textContent = '❌ Código inválido o expirado'; msg.className = 'cs-coupon-msg err'; }
      return;
    }
    
    activeCoupon = { ...coup, code };
    if (msg) {
      msg.textContent = `✅ Cupón aplicado: ${coup.type === 'percent' ? coup.value + '% de descuento' : 'S/ ' + coup.value + ' de descuento'}`;
      msg.className = 'cs-coupon-msg ok';
    }
    updateCartTotals();
    saveCartToLocalStorage();
    toast(`🏷 Cupón ${code} aplicado!`);
    input.value = '';
  });
}

// ═══════════════════════════════════════════════════════════════
//  NEWSLETTER
// ═══════════════════════════════════════════════════════════════

function setupNewsletter() {
  const submitBtn = $('nlSubmit');
  const emailInput = $('nlEmail');
  const feedback = $('nlFeedback');
  
  if (!submitBtn || !emailInput) return;
  
  submitBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    if (!email || !email.includes('@')) {
      if (feedback) feedback.textContent = '⚠️ Ingresa un correo válido';
      return;
    }
    
    try {
      await addDoc(collection(db, 'subscribers'), {
        email: email,
        createdAt: serverTimestamp()
      });
      if (feedback) feedback.textContent = '✅ ¡Suscrita! Te avisaremos de todo 💕';
      emailInput.value = '';
    } catch (e) {
      if (feedback) feedback.textContent = '✅ ¡Gracias por suscribirte! 💕';
      emailInput.value = '';
    }
  });
}

// ═══════════════════════════════════════════════════════════════
//  RUTINAS
// ═══════════════════════════════════════════════════════════════

const ROUTINES = {
  morning: [
    { step: 'Paso 1', icon: '🫧', name: 'Limpiador', desc: 'Limpia suavemente sin resecar.', cat: 'cleanser' },
    { step: 'Paso 2', icon: '💧', name: 'Tónico', desc: 'Equilibra el pH y prepara la piel.', cat: 'toner' },
    { step: 'Paso 3', icon: '✨', name: 'Esencia', desc: 'Hidratación extra ligera.', cat: 'essence' },
    { step: 'Paso 4', icon: '💫', name: 'Sérum', desc: 'Tratamiento enfocado.', cat: 'serum' },
    { step: 'Paso 5', icon: '🌿', name: 'Hidratante', desc: 'Sella toda la hidratación.', cat: 'moisturizer' },
    { step: 'Paso 6', icon: '☀️', name: 'Protector Solar', desc: '¡Nunca salgas sin él!', cat: 'sunscreen' }
  ],
  night: [
    { step: 'Paso 1', icon: '🧴', name: 'Limpiador aceite', desc: 'Disuelve maquillaje y contaminación.', cat: 'cleanser' },
    { step: 'Paso 2', icon: '🫧', name: 'Limpiador suave', desc: 'Segunda limpieza.', cat: 'cleanser' },
    { step: 'Paso 3', icon: '💧', name: 'Tónico', desc: 'Reequilibra e hidrata.', cat: 'toner' },
    { step: 'Paso 4', icon: '✨', name: 'Sérum noche', desc: 'Regeneración nocturna.', cat: 'serum' },
    { step: 'Paso 5', icon: '👁', name: 'Contorno de ojos', desc: 'Hidrata y reduce líneas.', cat: 'eyecream' },
    { step: 'Paso 6', icon: '🌿', name: 'Crema de noche', desc: 'Recuperación mientras duermes.', cat: 'moisturizer' }
  ],
  weekly: [
    { step: '1–2x semana', icon: '🎭', name: 'Mascarilla arcilla', desc: 'Purifica poros.', cat: 'mask' },
    { step: '1–2x semana', icon: '💧', name: 'Mascarilla hidratante', desc: 'Boost de hidratación.', cat: 'mask' },
    { step: '1x semana', icon: '✨', name: 'Exfoliante químico', desc: 'Renueva la piel.', cat: 'serum' },
    { step: 'Noche', icon: '🌸', name: 'Sheet mask', desc: 'Tratamiento concentrado.', cat: 'mask' }
  ]
};

function renderRoutine(type) {
  const steps = ROUTINES[type] || [];
  const container = $('routinesContent');
  if (!container) return;
  
  container.innerHTML = `
    <div class="routine-steps">
      ${steps.map(s => {
        const prods = allProducts.filter(p => p.category === s.cat).slice(0, 2);
        return `
          <div class="routine-step">
            <div class="rs-num">${steps.indexOf(s) + 1}</div>
            <div class="rs-icon">${s.icon}</div>
            <div class="rs-step">${s.step}</div>
            <div class="rs-name">${s.name}</div>
            <p class="rs-desc">${s.desc}</p>
            ${prods.length ? `<div class="rs-products">${prods.map(p => `<div class="rs-prod-link" data-id="${p.id}">${escapeHtml(p.name.slice(0, 22))}…</div>`).join('')}</div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
  
  container.querySelectorAll('.rs-prod-link').forEach(el => {
    el.addEventListener('click', () => {
      const p = allProducts.find(p => p.id === el.dataset.id);
      if (p) openModal(p);
    });
  });
}

function setupRoutines() {
  $$('.rt').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.rt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderRoutine(btn.dataset.rt);
    });
  });
  renderRoutine('morning');
}

// ═══════════════════════════════════════════════════════════════
//  LOAD PRODUCTOS (FIRESTORE)
// ═══════════════════════════════════════════════════════════════

function loadProducts() {
  const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
  
  onSnapshot(q, (snapshot) => {
    allProducts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })).filter(p => p.active !== false);
    
    console.log('✅ Productos cargados:', allProducts.length);
    
    buildBrandFilter();
    applyFilters();
    renderFeatured('hot');
    
    const acTotal = $('acTotal');
    if (acTotal) acTotal.textContent = allProducts.length;
    
  }, (error) => {
    console.error('❌ Error loading products:', error);
    const grid = $('productsGrid');
    if (grid) {
      grid.innerHTML = '<div class="empty-state"><div class="es-icon">❌</div><h3>Error cargando productos</h3><p>Verifica tu conexión a Firebase</p></div>';
    }
    const loading = $('pgLoading');
    if (loading) loading.style.display = 'none';
  });
}

// ═══════════════════════════════════════════════════════════════
//  EVENTOS INICIALES
// ═══════════════════════════════════════════════════════════════

function setupEvents() {
  // Announce bar close
  const abClose = $('abClose');
  const announceBar = $('announceBar');
  if (abClose && announceBar) {
    abClose.addEventListener('click', () => {
      announceBar.style.display = 'none';
      const navbar = $('navbar');
      if (navbar) navbar.style.top = '0';
    });
  }
  
  // Navbar scroll effect
  window.addEventListener('scroll', () => {
    const navbar = $('navbar');
    const backTop = $('backTop');
    if (navbar) navbar.classList.toggle('scrolled', window.scrollY > 50);
    if (backTop) backTop.classList.toggle('on', window.scrollY > 400);
  });
  
  // Back to top
  const backTop = $('backTop');
  if (backTop) {
    backTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  
  // Drawer
  const hamburger = $('hamburger');
  const drawer = $('drawer');
  const drawerOverlay = $('drawerOverlay');
  const drawerClose = $('drawerClose');
  
  if (hamburger && drawer && drawerOverlay) {
    hamburger.addEventListener('click', () => {
      drawer.classList.add('on');
      drawerOverlay.classList.add('on');
    });
    
    const closeDrawer = () => {
      drawer.classList.remove('on');
      drawerOverlay.classList.remove('on');
    };
    
    if (drawerClose) drawerClose.addEventListener('click', closeDrawer);
    drawerOverlay.addEventListener('click', closeDrawer);
  }
  
  // Drawer category buttons
  $$('.drawer-cats button, .cat-card, .footer-cat-link').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const cat = btn.dataset.cat;
      if (cat) setCategory(cat);
      if (drawer) drawer.classList.remove('on');
      if (drawerOverlay) drawerOverlay.classList.remove('on');
      $('catalog')?.scrollIntoView({ behavior: 'smooth' });
    });
  });
  
  // Search
  const searchBtn = $('searchBtn');
  const searchOverlay = $('searchOverlay');
  const soClose = $('soClose');
  const searchInput = $('searchInput');
  
  if (searchBtn && searchOverlay) {
    searchBtn.addEventListener('click', () => {
      searchOverlay.classList.add('on');
      setTimeout(() => searchInput?.focus(), 250);
    });
    
    if (soClose) {
      soClose.addEventListener('click', () => searchOverlay.classList.remove('on'));
    }
    
    searchOverlay.addEventListener('click', (e) => {
      if (e.target === searchOverlay) searchOverlay.classList.remove('on');
    });
  }
  
  if (searchInput) {
    searchInput.addEventListener('input', debounce(() => {
      const q = searchInput.value.trim().toLowerCase();
      const results = $('soResults');
      if (!results) return;
      
      if (!q) {
        results.innerHTML = '';
        return;
      }
      
      const hits = allProducts.filter(p => 
        (p.name || '').toLowerCase().includes(q) || 
        (p.brand || '').toLowerCase().includes(q)
      ).slice(0, 7);
      
      if (!hits.length) {
        results.innerHTML = `<div class="so-empty">No se encontraron productos para "${escapeHtml(q)}"</div>`;
        return;
      }
      
      results.innerHTML = hits.map(p => `
        <div class="so-item" data-id="${p.id}">
          <div class="so-thumb">${p.imageUrl ? `<img src="${p.imageUrl}" alt="${escapeHtml(p.name)}">` : (CAT_EMOJI[p.category] || '🌺')}</div>
          <div class="so-info">
            <div class="so-name">${escapeHtml(p.name)}</div>
            <div class="so-brand">${escapeHtml(p.brand || '')} · ${CAT_NAME[p.category] || ''}</div>
          </div>
          <div class="so-price">${CURRENCY} ${(+p.price || 0).toFixed(2)}</div>
        </div>
      `).join('');
      
      results.querySelectorAll('.so-item').forEach(el => {
        el.addEventListener('click', () => {
          const p = allProducts.find(p => p.id === el.dataset.id);
          if (p) openModal(p);
          if (searchOverlay) searchOverlay.classList.remove('on');
        });
      });
    }, 280));
  }
  
  // Category chips
  $$('#catChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $$('#catChips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      fCat = chip.dataset.cat;
      displayCount = PAGE_SIZE;
      applyFilters();
    });
  });
  
  // Skin chips
  $$('#skinChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $$('#skinChips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      fSkin = chip.dataset.skin;
      applyFilters();
    });
  });
  
  // Brand filter
  const brandFilter = $('brandFilter');
  if (brandFilter) {
    brandFilter.addEventListener('change', () => {
      fBrand = brandFilter.value;
      applyFilters();
    });
  }
  
  // Sort filter
  const sortFilter = $('sortFilter');
  if (sortFilter) {
    sortFilter.addEventListener('change', () => {
      fSort = sortFilter.value;
      applyFilters();
    });
  }
  
  // Price filter
  const applyPrice = $('applyPrice');
  if (applyPrice) {
    applyPrice.addEventListener('click', () => {
      const priceMin = $('priceMin');
      const priceMax = $('priceMax');
      fPriceMin = priceMin?.value ? +priceMin.value : null;
      fPriceMax = priceMax?.value ? +priceMax.value : null;
      applyFilters();
    });
  }
  
  // Clear filters
  const clearFilters = $('clearFilters');
  if (clearFilters) clearFilters.addEventListener('click', resetFilters);
  
  const esReset = $('esReset');
  if (esReset) esReset.addEventListener('click', resetFilters);
  
  // Load more
  const loadMoreBtn = $('loadMoreBtn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      displayCount += PAGE_SIZE;
      renderProducts();
    });
  }
  
  // View toggle
  const vtGrid = $('vtGrid');
  const vtList = $('vtList');
  const productsGrid = $('productsGrid');
  if (vtGrid && vtList && productsGrid) {
    vtGrid.addEventListener('click', () => {
      productsGrid.classList.remove('list');
      vtGrid.classList.add('active');
      vtList.classList.remove('active');
    });
    vtList.addEventListener('click', () => {
      productsGrid.classList.add('list');
      vtList.classList.add('active');
      vtGrid.classList.remove('active');
    });
  }
  
  // Featured tabs
  $$('.ft').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.ft').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderFeatured(tab.dataset.ft);
    });
  });
  
  // Cart
  const cartBtn = $('cartBtn');
  const cartSidebar = $('cartSidebar');
  const cartOverlay = $('cartOverlay');
  const cartClose = $('cartClose');
  
  if (cartBtn && cartSidebar && cartOverlay) {
    cartBtn.addEventListener('click', () => {
      cartSidebar.classList.add('on');
      cartOverlay.classList.add('on');
      document.body.style.overflow = 'hidden';
    });
    
    if (cartClose) {
      cartClose.addEventListener('click', () => {
        cartSidebar.classList.remove('on');
        cartOverlay.classList.remove('on');
        document.body.style.overflow = '';
      });
    }
    
    cartOverlay.addEventListener('click', () => {
      cartSidebar.classList.remove('on');
      cartOverlay.classList.remove('on');
      document.body.style.overflow = '';
    });
  }
  
  // Checkout button
  const waCartBtn = $('waCartBtn');
  if (waCartBtn) waCartBtn.addEventListener('click', checkout);
  
  // Modal close
  const modalClose = $('modalClose');
  const productModal = $('productModal');
  if (modalClose) modalClose.addEventListener('click', closeModal);
  if (productModal) {
    productModal.addEventListener('click', (e) => {
      if (e.target === productModal) closeModal();
    });
  }
  
  // Footer WhatsApp
  const footerWa = $('footerWa');
  if (footerWa) {
    footerWa.addEventListener('click', () => {
      window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hola SkinBri Shop! Me gustaría recibir asesoría sobre mi rutina de skincare 🌸')}`, '_blank');
    });
  }
  
  // Scroll reveal
  const revObs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('in');
    });
  }, { threshold: 0.1 });
  
  document.querySelectorAll('.cats-section, .featured-section, .about-section, .routines-section, .nl-section, .perks-bar').forEach(el => {
    el.classList.add('reveal');
    revObs.observe(el);
  });
}

// ═══════════════════════════════════════════════════════════════
//  DEBOUNCE
// ═══════════════════════════════════════════════════════════════

function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ═══════════════════════════════════════════════════════════════
//  INICIALIZACIÓN
// ═══════════════════════════════════════════════════════════════

async function init() {
  console.log('🚀 Iniciando SkinBri Shop...');
  
  loadCartFromLocalStorage();
  await loadCoupons();
  await loadBanners();
  
  setupEvents();
  setupNewsletter();
  setupCouponButton();
  setupRoutines();
  
  loadProducts();
  
  console.log('✅ SkinBri Shop v3.0 Listo');
}

init();