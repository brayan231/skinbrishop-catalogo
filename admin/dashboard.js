// ═══════════════════════════════════════════════════════════════
//  SKINBRI SHOP — Admin Dashboard v3 COMPLETO
//  CON SUBIDA DE IMÁGENES PARA BANNERS (desde PC)
// ═══════════════════════════════════════════════════════════════

import { db, storage } from '../firebase-config.js';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  getDocs, onSnapshot, query, orderBy, serverTimestamp, 
  setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  ref, uploadBytesResumable, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ═══════════════════════════════════════════════════════════════
//  VERIFICAR SESIÓN
// ═══════════════════════════════════════════════════════════════

const isLoggedIn = sessionStorage.getItem('admin_logged_in');
if (!isLoggedIn || isLoggedIn !== 'true') {
  window.location.href = 'login.html';
}

const adminUser = sessionStorage.getItem('admin_user');
if (adminUser && document.getElementById('tbEmail')) {
  document.getElementById('tbEmail').textContent = adminUser;
}
if (document.getElementById('tbAvatar')) {
  document.getElementById('tbAvatar').textContent = (adminUser?.[0] || 'A').toUpperCase();
}

// ═══════════════════════════════════════════════════════════════
//  CONSTANTES
// ═══════════════════════════════════════════════════════════════

const CAT_NAME = {
  cleanser: 'Limpiador', toner: 'Tónico', serum: 'Sérum',
  moisturizer: 'Hidratante', mask: 'Mascarilla', sunscreen: 'Protector Solar',
  eyecream: 'Contorno de Ojos', essence: 'Esencia', other: 'Otro'
};

const CAT_EMOJI = {
  cleanser: '🫧', toner: '💧', serum: '✨', moisturizer: '🌿',
  mask: '🎭', sunscreen: '☀️', eyecream: '👁', essence: '🌸', other: '🌺'
};

const MAX_IMGS = 5;
const STATUS_LABELS = {
  pending: '⏳ Pendiente', confirmed: '✅ Confirmado',
  shipped: '📦 Enviado', delivered: '🏠 Entregado', cancelled: '❌ Cancelado'
};

// ═══════════════════════════════════════════════════════════════
//  STATE GLOBAL
// ═══════════════════════════════════════════════════════════════

let allProducts = [];
let editingProdId = null;
let imgSlots = [null, null, null, null, null];
let confirmCb = null;
let unsubProducts = null;

// ═══════════════════════════════════════════════════════════════
//  DOM HELPERS
// ═══════════════════════════════════════════════════════════════

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ═══════════════════════════════════════════════════════════════
//  TOAST Y FEEDBACK
// ═══════════════════════════════════════════════════════════════

let toastTimer;
function toast(msg) {
  const t = $('adminToast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 3200);
}

function showFeedback(id, msg, type) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `form-feedback ${type}`;
  setTimeout(() => {
    if (el.className.includes('form-feedback')) el.className = 'form-feedback';
  }, 5000);
}

function hideFeedback(id) {
  const el = $(id);
  if (el) el.className = 'form-feedback';
}

// ═══════════════════════════════════════════════════════════════
//  CONFIRMACIÓN MODAL
// ═══════════════════════════════════════════════════════════════

function setupConfirm() {
  const overlay = $('confirmOverlay');
  if (!overlay) return;
  
  $('confirmCancel')?.addEventListener('click', () => {
    overlay.classList.remove('on');
    confirmCb = null;
  });
  
  $('confirmOk')?.addEventListener('click', () => {
    if (confirmCb) confirmCb();
    overlay.classList.remove('on');
    confirmCb = null;
  });
  
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      overlay.classList.remove('on');
      confirmCb = null;
    }
  });
}

function confirmAction(title, msg, cb) {
  $('confirmTitle').textContent = title;
  $('confirmMsg').textContent = msg || 'Esta acción no se puede deshacer.';
  confirmCb = cb;
  $('confirmOverlay')?.classList.add('on');
}

// ═══════════════════════════════════════════════════════════════
//  LOGOUT
// ═══════════════════════════════════════════════════════════════

function setupLogout() {
  const logoutBtn = $('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('admin_logged_in');
      sessionStorage.removeItem('admin_user');
      window.location.href = 'login.html';
    });
  }
}

// ═══════════════════════════════════════════════════════════════
//  NAVEGACIÓN
// ═══════════════════════════════════════════════════════════════

function setupNav() {
  $$('.sbl, [data-view]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const view = el.dataset.view;
      if (view) switchView(view);
    });
  });
  
  $('sbToggle')?.addEventListener('click', () => {
    $('sidebar')?.classList.toggle('open');
  });
}

function switchView(viewName) {
  $$('.view').forEach(v => v.classList.remove('active'));
  const targetView = $(`view-${viewName}`);
  if (targetView) targetView.classList.add('active');
  
  $$('.sbl').forEach(link => {
    link.classList.toggle('active', link.dataset.view === viewName);
  });
  
  const titles = {
    dashboard: 'Dashboard', products: 'Productos',
    add: editingProdId ? 'Editar Producto' : 'Nuevo Producto',
    banners: 'Banners / Slider', coupons: 'Cupones',
    subscribers: 'Suscriptoras', orders: 'Pedidos', about: 'Sobre Nosotras'
  };
  $('tbTitle').textContent = titles[viewName] || viewName;
  
  if (viewName === 'dashboard') loadDashboardStats();
  if (viewName === 'banners') loadBanners();
  if (viewName === 'coupons') loadCoupons();
  if (viewName === 'subscribers') loadSubscribers();
  if (viewName === 'orders') loadOrders();
  if (viewName === 'about') loadAbout();
}

// ═══════════════════════════════════════════════════════════════
//  DASHBOARD - ESTADÍSTICAS
// ═══════════════════════════════════════════════════════════════

async function loadDashboardStats() {
  try {
    const [subSnap, couSnap] = await Promise.all([
      getDocs(collection(db, 'subscribers')),
      getDocs(collection(db, 'coupons'))
    ]);
    const subsEl = $('kpi-subs');
    const couponsEl = $('kpi-coupons');
    if (subsEl) subsEl.textContent = subSnap.size;
    if (couponsEl) couponsEl.textContent = couSnap.size;
  } catch (e) {
    console.warn('Error cargando KPIs:', e);
  }
  
  if (allProducts.length) renderDashboardStats(allProducts);
}

function renderDashboardStats(products) {
  const totalEl = $('kpi-total');
  const activeEl = $('kpi-active');
  const lowEl = $('kpi-low');
  const outEl = $('kpi-out');
  
  if (totalEl) totalEl.textContent = products.length;
  if (activeEl) activeEl.textContent = products.filter(p => p.active !== false).length;
  if (lowEl) lowEl.textContent = products.filter(p => p.stock !== undefined && +p.stock > 0 && +p.stock <= 5).length;
  if (outEl) outEl.textContent = products.filter(p => p.stock !== undefined && +p.stock === 0).length;
  
  const byCat = {};
  products.forEach(p => {
    const cat = p.category || 'other';
    byCat[cat] = (byCat[cat] || 0) + 1;
  });
  const maxC = Math.max(...Object.values(byCat), 1);
  
  const catBarsEl = $('catBars');
  if (catBarsEl) {
    catBarsEl.innerHTML = Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => `
        <div class="cat-bar-row">
          <span class="cbr-label">${CAT_EMOJI[cat] || '📦'} ${CAT_NAME[cat] || cat}</span>
          <div class="cbr-bar"><div class="cbr-fill" style="width: ${(count / maxC * 100).toFixed(0)}%"></div></div>
          <span class="cbr-count">${count}</span>
        </div>
      `).join('');
  }
  
  const outStock = products.filter(p => p.stock !== undefined && +p.stock === 0);
  const lowStock = products.filter(p => p.stock !== undefined && +p.stock > 0 && +p.stock <= 5);
  const alertsEl = $('stockAlerts');
  
  if (alertsEl) {
    if (!outStock.length && !lowStock.length) {
      alertsEl.innerHTML = '<div class="sa-none">✅ Sin alertas de stock</div>';
    } else {
      alertsEl.innerHTML = [
        ...outStock.map(p => `<div class="sa-item sa-out">❌ ${escapeHtml(p.name)} — AGOTADO</div>`),
        ...lowStock.map(p => `<div class="sa-item sa-low">⚠️ ${escapeHtml(p.name)} — Solo ${p.stock} unidades</div>`)
      ].join('');
    }
  }
  
  const prices = products.map(p => +(p.price || 0)).filter(Boolean);
  const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
  const priceStatsEl = $('priceStats');
  if (priceStatsEl) {
    priceStatsEl.innerHTML = `
      <div class="ps-row"><span class="ps-label">Productos totales</span><span class="ps-val">${products.length}</span></div>
      <div class="ps-row"><span class="ps-label">Precio promedio</span><span class="ps-val">S/ ${avg.toFixed(2)}</span></div>
      <div class="ps-row"><span class="ps-label">Precio más bajo</span><span class="ps-val">S/ ${prices.length ? Math.min(...prices).toFixed(2) : '0.00'}</span></div>
      <div class="ps-row"><span class="ps-label">Precio más alto</span><span class="ps-val">S/ ${prices.length ? Math.max(...prices).toFixed(2) : '0.00'}</span></div>
    `;
  }
  
  $$('.qa-btn[data-view]').forEach(btn => {
    btn.removeEventListener('click', () => {});
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
}

// ═══════════════════════════════════════════════════════════════
//  MÓDULO: PRODUCTOS (CRUD)
// ═══════════════════════════════════════════════════════════════

function setupProductsModule() {
  const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
  unsubProducts = onSnapshot(q, snap => {
    allProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    filterProductsTable();
    renderDashboardStats(allProducts);
  }, err => {
    console.error('Error loading products:', err);
    const tbody = $('prodTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="loading-row">❌ Error cargando productos: ${err.message}</td></tr>`;
  });
  
  const searchInput = $('tableSearch');
  const catSelect = $('tableCat');
  const statusSelect = $('tableStatus');
  const addBtn = $('addProductBtn');
  const productForm = $('productForm');
  const cancelBtn = $('cancelForm');
  const shortDesc = $('pShortDesc');
  
  if (searchInput) searchInput.addEventListener('input', () => filterProductsTable());
  if (catSelect) catSelect.addEventListener('change', () => filterProductsTable());
  if (statusSelect) statusSelect.addEventListener('change', () => filterProductsTable());
  if (addBtn) addBtn.addEventListener('click', () => { resetProductForm(); switchView('add'); });
  if (productForm) productForm.addEventListener('submit', saveProduct);
  if (cancelBtn) cancelBtn.addEventListener('click', () => { resetProductForm(); switchView('products'); });
  if (shortDesc) {
    shortDesc.addEventListener('input', () => {
      const count = shortDesc.value.length;
      const countEl = $('shortDescCount');
      if (countEl) countEl.textContent = `${count}/80`;
    });
  }
  
  buildImageSlots();
}

function filterProductsTable() {
  const searchTerm = $('tableSearch')?.value.toLowerCase() || '';
  const category = $('tableCat')?.value || '';
  const status = $('tableStatus')?.value || '';
  
  let filtered = [...allProducts];
  
  if (searchTerm) {
    filtered = filtered.filter(p =>
      (p.name || '').toLowerCase().includes(searchTerm) ||
      (p.brand || '').toLowerCase().includes(searchTerm)
    );
  }
  if (category) filtered = filtered.filter(p => p.category === category);
  if (status === 'active') filtered = filtered.filter(p => p.active !== false);
  if (status === 'inactive') filtered = filtered.filter(p => p.active === false);
  if (status === 'low') filtered = filtered.filter(p => p.stock !== undefined && +p.stock > 0 && +p.stock <= 5);
  if (status === 'out') filtered = filtered.filter(p => p.stock !== undefined && +p.stock === 0);
  
  renderProductsTable(filtered);
}

function renderProductsTable(products) {
  const tbody = $('prodTableBody');
  const countEl = $('tableCount');
  
  if (countEl) countEl.textContent = `${products.length} producto${products.length !== 1 ? 's' : ''}`;
  
  if (!products.length) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="loading-row">🌸 No hay productos</td></tr>`;
    return;
  }
  
  if (tbody) {
    tbody.innerHTML = products.map(p => {
      const stock = p.stock !== undefined ? +p.stock : null;
      let stockHtml = '—';
      if (stock === null) stockHtml = '—';
      else if (stock === 0) stockHtml = '<span class="t-stock-out">❌ Agotado</span>';
      else if (stock <= 5) stockHtml = `<span class="t-stock-low">⚠️ ${stock}</span>`;
      else stockHtml = `<span class="t-stock-ok">✅ ${stock}</span>`;
      
      const isActive = p.active !== false;
      const hasDiscount = p.originalPrice && +p.originalPrice > +p.price;
      const thumbHtml = p.imageUrl
        ? `<img src="${p.imageUrl}" alt="${p.name}">`
        : (CAT_EMOJI[p.category] || '🌺');
      
      return `
        <tr data-id="${p.id}">
          <td><div class="t-thumb">${thumbHtml}</div></td>
          <td>
            <div class="t-name">${escapeHtml(p.name || '—')}</div>
            <div class="t-brand">${escapeHtml(p.brand || '')}</div>
          </td>
          <td><span class="t-cat">${CAT_EMOJI[p.category] || ''} ${CAT_NAME[p.category] || p.category || '—'}</span></td>
          <td>
            <div class="t-price">S/ ${(+p.price || 0).toFixed(2)}</div>
            ${hasDiscount ? `<div class="t-orig">S/ ${(+p.originalPrice).toFixed(2)}</div>` : ''}
          </td>
          <td>${stockHtml}</td>
          <td>
            <div class="t-status ${isActive ? 't-active' : 't-inactive'}">
              <span class="t-dot"></span>${isActive ? 'Activo' : 'Oculto'}
            </div>
          </td>
          <td>
            <div class="t-actions">
              <button class="btn-icon" title="Editar" data-act="edit" data-id="${p.id}">✏️</button>
              <button class="btn-icon" title="${isActive ? 'Ocultar' : 'Activar'}" data-act="toggle" data-id="${p.id}" data-active="${isActive}">${isActive ? '👁' : '🙈'}</button>
              <button class="btn-icon danger" title="Eliminar" data-act="delete" data-id="${p.id}" data-name="${escapeHtml(p.name)}" data-img="${p.imageUrl || ''}">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    
    tbody.querySelectorAll('[data-act="edit"]').forEach(btn => {
      btn.addEventListener('click', () => openEditProduct(btn.dataset.id));
    });
    tbody.querySelectorAll('[data-act="toggle"]').forEach(btn => {
      btn.addEventListener('click', () => toggleProductStatus(btn.dataset.id, btn.dataset.active === 'true'));
    });
    tbody.querySelectorAll('[data-act="delete"]').forEach(btn => {
      btn.addEventListener('click', () => {
        confirmAction(`¿Eliminar "${btn.dataset.name}"?`, 'Se eliminará permanentemente.', 
          () => deleteProduct(btn.dataset.id, btn.dataset.img));
      });
    });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

async function toggleProductStatus(id, isActive) {
  try {
    await updateDoc(doc(db, 'products', id), { active: !isActive });
    toast(isActive ? '👁 Producto ocultado' : '✅ Producto activado');
  } catch (e) {
    toast('❌ Error: ' + e.message);
  }
}

async function deleteProduct(id, imgUrl) {
  try {
    if (imgUrl && imgUrl.includes('firebasestorage')) {
      try {
        await deleteObject(ref(storage, imgUrl));
      } catch (e) { console.warn('Error deleting image:', e); }
    }
    await deleteDoc(doc(db, 'products', id));
    toast('🗑️ Producto eliminado');
  } catch (e) {
    toast('❌ Error: ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
//  IMÁGENES MÚLTIPLES PARA PRODUCTOS
// ═══════════════════════════════════════════════════════════════

function buildImageSlots() {
  const grid = $('multiImgGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = 0; i < MAX_IMGS; i++) {
    const slot = document.createElement('div');
    slot.className = 'img-slot';
    slot.dataset.slot = i;
    slot.innerHTML = `
      <div class="slot-placeholder">
        <span>${i === 0 ? '📷' : '➕'}</span>
        <small>${i === 0 ? 'Principal' : `Img ${i + 1}`}</small>
      </div>`;
    slot.addEventListener('click', () => triggerSlotUpload(i));
    grid.appendChild(slot);
  }
}

function triggerSlotUpload(index) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp';
  input.addEventListener('change', () => {
    if (input.files[0]) handleSlotFile(index, input.files[0]);
  });
  input.click();
}

function handleSlotFile(index, file) {
  if (file.size > 5 * 1024 * 1024) {
    toast('⚠️ La imagen no puede superar los 5MB');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = e => updateSlotUI(index, e.target.result, null, true);
  reader.readAsDataURL(file);
  
  uploadSlotFile(index, file);
}

function updateSlotUI(index, url, path, isPreview = false) {
  imgSlots[index] = { url, path: path || null, preview: isPreview };
  const slot = document.querySelector(`.img-slot[data-slot="${index}"]`);
  if (!slot) return;
  
  slot.innerHTML = `
    <img src="${url}" alt="Imagen ${index + 1}">
    ${index === 0 ? '<span class="slot-main-badge">Principal</span>' : ''}
    <button class="slot-rm" data-slot="${index}" type="button">✕</button>
  `;
  
  const rmBtn = slot.querySelector('.slot-rm');
  if (rmBtn) {
    rmBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearSlot(index);
    });
  }
}

async function uploadSlotFile(index, file) {
  const ext = file.name.split('.').pop();
  const fileName = `products/${Date.now()}_${index}.${ext}`;
  const storageRef = ref(storage, fileName);
  const uploadTask = uploadBytesResumable(storageRef, file);
  
  const progressDiv = $('uploadProgress');
  const fillDiv = $('upFill');
  const textSpan = $('upText');
  
  if (progressDiv) progressDiv.style.display = 'flex';
  
  uploadTask.on('state_changed',
    (snapshot) => {
      const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      if (fillDiv) fillDiv.style.width = `${percent}%`;
      if (textSpan) textSpan.textContent = `Subiendo imagen ${index + 1}... ${percent}%`;
    },
    (error) => {
      console.error('Upload error:', error);
      if (progressDiv) progressDiv.style.display = 'none';
      toast('❌ Error al subir la imagen');
    },
    async () => {
      const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
      imgSlots[index] = { url: downloadUrl, path: fileName, preview: false };
      updateSlotUI(index, downloadUrl, fileName, false);
      if (progressDiv) progressDiv.style.display = 'none';
      toast(`✅ Imagen ${index + 1} subida correctamente`);
    }
  );
}

function clearSlot(index) {
  if (imgSlots[index] && imgSlots[index].path && !imgSlots[index].preview) {
    const storageRef = ref(storage, imgSlots[index].path);
    deleteObject(storageRef).catch(e => console.warn('Error deleting file:', e));
  }
  
  imgSlots[index] = null;
  const slot = document.querySelector(`.img-slot[data-slot="${index}"]`);
  if (slot) {
    slot.innerHTML = `
      <div class="slot-placeholder">
        <span>${index === 0 ? '📷' : '➕'}</span>
        <small>${index === 0 ? 'Principal' : `Img ${index + 1}`}</small>
      </div>`;
  }
}

function getSavedImages() {
  return imgSlots.filter(s => s && s.url && !s.preview).map(s => s.url);
}

function getFirstImage() {
  const first = imgSlots.find(s => s && s.url && !s.preview);
  return first ? first.url : null;
}

// ═══════════════════════════════════════════════════════════════
//  PRODUCTO: ABRIR EDITAR
// ═══════════════════════════════════════════════════════════════

function openEditProduct(id) {
  const product = allProducts.find(p => p.id === id);
  if (!product) return;
  
  editingProdId = id;
  $('editId').value = id;
  
  $('pName').value = product.name || '';
  $('pBrand').value = product.brand || '';
  $('pCategory').value = product.category || '';
  $('pSize').value = product.size || '';
  $('pShortDesc').value = product.shortDescription || '';
  const shortDescCount = $('shortDescCount');
  if (shortDescCount) shortDescCount.textContent = `${(product.shortDescription || '').length}/80`;
  $('pDesc').value = product.description || '';
  $('pPrice').value = product.price || '';
  $('pOrigPrice').value = product.originalPrice || '';
  $('pStock').value = product.stock !== undefined ? product.stock : '';
  $('pSkinType').value = product.skin_type || '';
  $('pRating').value = product.rating || '';
  $('pReviews').value = product.reviewCount || '';
  $('pIsNew').checked = product.isNew || false;
  $('pIsHot').checked = product.isHot || false;
  $('pActive').checked = product.active !== false;
  
  imgSlots = [null, null, null, null, null];
  const images = product.images?.length ? product.images : (product.imageUrl ? [product.imageUrl] : []);
  images.forEach((url, i) => {
    if (i < MAX_IMGS) {
      imgSlots[i] = { url, path: null, preview: false };
      updateSlotUI(i, url, null, false);
    }
  });
  
  $('formTitle').textContent = 'Editar Producto';
  $('formSub').textContent = `Editando: ${product.name}`;
  $('saveText').innerHTML = '💾 Guardar Cambios';
  switchView('add');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetProductForm() {
  editingProdId = null;
  $('editId').value = '';
  $('productForm')?.reset();
  const shortDescCount = $('shortDescCount');
  if (shortDescCount) shortDescCount.textContent = '0/80';
  imgSlots = [null, null, null, null, null];
  buildImageSlots();
  $('formTitle').textContent = 'Nuevo Producto';
  $('formSub').textContent = 'Completa todos los campos del producto';
  $('saveText').innerHTML = '💾 Guardar Producto';
  hideFeedback('formFeedback');
}

// ═══════════════════════════════════════════════════════════════
//  PRODUCTO: GUARDAR
// ═══════════════════════════════════════════════════════════════

async function saveProduct(e) {
  e.preventDefault();
  
  const name = $('pName').value.trim();
  const brand = $('pBrand').value.trim();
  const category = $('pCategory').value;
  const price = parseFloat($('pPrice').value);
  
  if (!name || !brand || !category || isNaN(price)) {
    showFeedback('formFeedback', '⚠️ Completa los campos obligatorios (*)', 'err');
    return;
  }
  
  const saveBtn = $('saveBtn');
  const spinner = $('saveSpinner');
  const saveText = $('saveText');
  
  if (saveBtn) saveBtn.disabled = true;
  if (spinner) spinner.style.display = 'inline-block';
  if (saveText) saveText.innerHTML = 'Guardando...';
  
  const images = getSavedImages();
  const imageUrl = getFirstImage();
  
  const productData = {
    name,
    brand,
    category,
    size: $('pSize').value.trim() || null,
    shortDescription: $('pShortDesc').value.trim() || null,
    description: $('pDesc').value.trim() || null,
    price,
    originalPrice: $('pOrigPrice').value ? parseFloat($('pOrigPrice').value) : null,
    stock: $('pStock').value !== '' ? parseInt($('pStock').value) : null,
    skin_type: $('pSkinType').value.trim() || null,
    rating: $('pRating').value ? parseFloat($('pRating').value) : null,
    reviewCount: $('pReviews').value ? parseInt($('pReviews').value) : 0,
    isNew: $('pIsNew').checked,
    isHot: $('pIsHot').checked,
    active: $('pActive').checked,
    imageUrl: imageUrl || null,
    images: images.length ? images : null,
    updatedAt: serverTimestamp()
  };
  
  Object.keys(productData).forEach(key => {
    if (productData[key] === null || productData[key] === '') delete productData[key];
  });
  
  try {
    if (editingProdId) {
      await updateDoc(doc(db, 'products', editingProdId), productData);
      showFeedback('formFeedback', '✅ Producto actualizado correctamente', 'ok');
      toast('✅ Producto actualizado');
    } else {
      productData.createdAt = serverTimestamp();
      await addDoc(collection(db, 'products'), productData);
      showFeedback('formFeedback', '✅ Producto creado correctamente', 'ok');
      toast('✅ Producto creado');
    }
    
    setTimeout(() => {
      resetProductForm();
      switchView('products');
    }, 1500);
  } catch (err) {
    showFeedback('formFeedback', `❌ Error: ${err.message}`, 'err');
    toast('❌ Error al guardar');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
    if (spinner) spinner.style.display = 'none';
    if (saveText) saveText.innerHTML = editingProdId ? '💾 Guardar Cambios' : '💾 Guardar Producto';
  }
}

// ═══════════════════════════════════════════════════════════════
//  MÓDULO: BANNERS (CON SUBIDA DE IMÁGENES DESDE PC)
// ═══════════════════════════════════════════════════════════════

let bannerImageFile = null;
let bannerImagePreview = null;

function setupBannersModule() {
  const addBtn = $('addBannerBtn');
  const closeBtn = $('closeBannerForm');
  const saveBtn = $('saveBannerBtn');
  
  if (addBtn) addBtn.addEventListener('click', () => { resetBannerForm(); $('bannerForm').style.display = 'block'; });
  if (closeBtn) closeBtn.addEventListener('click', () => { $('bannerForm').style.display = 'none'; });
  if (saveBtn) saveBtn.addEventListener('click', saveBanner);
  
  // Agregar input de archivo para imagen del banner
  const imgUrlField = $('bImgUrl');
  if (imgUrlField) {
    // Crear input de archivo
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg,image/png,image/webp';
    fileInput.style.marginTop = '0.5rem';
    fileInput.style.padding = '0.5rem';
    fileInput.style.border = '1px solid var(--border)';
    fileInput.style.borderRadius = '8px';
    fileInput.style.width = '100%';
    fileInput.placeholder = 'O selecciona una imagen desde tu PC';
    fileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) {
        bannerImageFile = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => {
          bannerImagePreview = ev.target.result;
          // Mostrar preview
          let previewDiv = document.getElementById('bannerImagePreview');
          if (!previewDiv) {
            previewDiv = document.createElement('div');
            previewDiv.id = 'bannerImagePreview';
            previewDiv.style.marginTop = '0.5rem';
            previewDiv.style.borderRadius = '8px';
            previewDiv.style.overflow = 'hidden';
            fileInput.parentNode.appendChild(previewDiv);
          }
          previewDiv.innerHTML = `<img src="${bannerImagePreview}" style="width:100%; max-height:150px; object-fit:cover; border-radius:8px;">`;
        };
        reader.readAsDataURL(bannerImageFile);
      }
    });
    imgUrlField.parentNode.appendChild(fileInput);
    
    // Agregar texto indicativo
    const hint = document.createElement('small');
    hint.textContent = '📷 Puedes pegar una URL o seleccionar una imagen desde tu PC';
    hint.style.display = 'block';
    hint.style.marginTop = '0.3rem';
    hint.style.color = 'var(--text-3)';
    hint.style.fontSize = '0.7rem';
    imgUrlField.parentNode.appendChild(hint);
  }
}

async function loadBanners() {
  const grid = $('bannersGrid');
  if (!grid) return;
  grid.innerHTML = '<div class="loading-row"><div class="mini-spin"></div> Cargando banners...</div>';
  
  try {
    const snap = await getDocs(query(collection(db, 'banners'), orderBy('order', 'asc')));
    if (snap.empty) {
      grid.innerHTML = '<div class="loading-row">🎨 No hay banners. Crea el primero.</div>';
      return;
    }
    
    grid.innerHTML = snap.docs.map(doc => {
      const b = { id: doc.id, ...doc.data() };
      return `
        <div class="banner-card">
          <div class="bc-preview" style="background: ${b.bg || 'linear-gradient(135deg,#5c2d3c,#c04060)'}${b.imgUrl ? `; background-image: url(${b.imgUrl}); background-size: cover; background-position: center` : ''}">
            <div class="bc-preview-title">${escapeHtml(b.title || '')} <em>${escapeHtml(b.titleEm || '')}</em></div>
          </div>
          <div class="bc-body">
            <div class="bc-title">${escapeHtml(b.title || '')} ${escapeHtml(b.titleEm || '')}</div>
            <div class="bc-sub">${escapeHtml(b.sub || '')}</div>
            <div class="bc-footer">
              <span class="bc-status ${b.active !== false ? 'bc-on' : 'bc-off'}">${b.active !== false ? 'Activo' : 'Inactivo'}</span>
              <div class="bc-actions">
                <button class="btn-icon" data-act="edit-banner" data-id="${b.id}">✏️</button>
                <button class="btn-icon danger" data-act="delete-banner" data-id="${b.id}" data-name="${escapeHtml(b.title)}">🗑️</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    grid.querySelectorAll('[data-act="edit-banner"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const snap = await getDocs(query(collection(db, 'banners'), orderBy('order', 'asc')));
        const docSnap = snap.docs.find(d => d.id === btn.dataset.id);
        if (docSnap) openEditBanner(docSnap);
      });
    });
    
    grid.querySelectorAll('[data-act="delete-banner"]').forEach(btn => {
      btn.addEventListener('click', () => {
        confirmAction(`¿Eliminar banner "${btn.dataset.name}"?`, '', async () => {
          await deleteDoc(doc(db, 'banners', btn.dataset.id));
          toast('🗑️ Banner eliminado');
          loadBanners();
        });
      });
    });
  } catch (e) {
    grid.innerHTML = `<div class="loading-row">❌ Error: ${e.message}</div>`;
  }
}

function openEditBanner(docSnap) {
  const b = { id: docSnap.id, ...docSnap.data() };
  $('bannerEditId').value = b.id;
  $('bTitle').value = b.title || '';
  $('bTitleEm').value = b.titleEm || '';
  $('bSub').value = b.sub || '';
  $('bBadge').value = b.badge || '';
  $('bCta').value = b.cta || '';
  $('bCta2').value = b.cta2 || '';
  $('bLink').value = b.catLink || 'all';
  $('bLink2').value = b.cat2Link || 'featured';
  $('bBg').value = b.bg || '';
  $('bImgUrl').value = b.imgUrl || '';
  $('bOrder').value = b.order || 0;
  $('bActive').checked = b.active !== false;
  $('bannerFormTitle').textContent = 'Editar Banner';
  $('bannerForm').style.display = 'block';
  bannerImageFile = null;
  bannerImagePreview = null;
  const previewDiv = document.getElementById('bannerImagePreview');
  if (previewDiv) previewDiv.innerHTML = '';
}

function resetBannerForm() {
  $('bannerEditId').value = '';
  ['bTitle', 'bTitleEm', 'bSub', 'bBadge', 'bCta', 'bCta2', 'bBg', 'bImgUrl'].forEach(id => {
    if ($(id)) $(id).value = '';
  });
  if ($('bOrder')) $('bOrder').value = 0;
  if ($('bActive')) $('bActive').checked = true;
  $('bannerFormTitle').textContent = 'Nuevo Banner';
  hideFeedback('bannerFeedback');
  bannerImageFile = null;
  bannerImagePreview = null;
  const previewDiv = document.getElementById('bannerImagePreview');
  if (previewDiv) previewDiv.innerHTML = '';
}

async function saveBanner() {
  const title = $('bTitle').value.trim();
  if (!title) {
    showFeedback('bannerFeedback', '⚠️ El título es obligatorio', 'err');
    return;
  }
  
  let finalImageUrl = $('bImgUrl').value.trim() || null;
  
  // Si hay una imagen subida desde PC, subirla a Storage
  if (bannerImageFile) {
    const ext = bannerImageFile.name.split('.').pop();
    const fileName = `banners/${Date.now()}.${ext}`;
    const storageRef = ref(storage, fileName);
    const uploadTask = uploadBytesResumable(storageRef, bannerImageFile);
    
    showFeedback('bannerFeedback', '📤 Subiendo imagen...', 'ok');
    
    try {
      const uploadResult = await new Promise((resolve, reject) => {
        uploadTask.on('state_changed', null,
          (error) => reject(error),
          async () => {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(url);
          }
        );
      });
      finalImageUrl = uploadResult;
    } catch (error) {
      showFeedback('bannerFeedback', '❌ Error al subir la imagen: ' + error.message, 'err');
      return;
    }
  }
  
  const bannerData = {
    title,
    titleEm: $('bTitleEm').value.trim(),
    sub: $('bSub').value.trim(),
    badge: $('bBadge').value.trim(),
    cta: $('bCta').value.trim(),
    cta2: $('bCta2').value.trim(),
    catLink: $('bLink').value,
    cat2Link: $('bLink2').value,
    bg: $('bBg').value.trim() || 'linear-gradient(135deg,#5c2d3c,#c04060)',
    imgUrl: finalImageUrl,
    order: parseInt($('bOrder').value) || 0,
    active: $('bActive').checked,
    updatedAt: serverTimestamp()
  };
  
  try {
    const editId = $('bannerEditId').value;
    if (editId) {
      await updateDoc(doc(db, 'banners', editId), bannerData);
    } else {
      bannerData.createdAt = serverTimestamp();
      await addDoc(collection(db, 'banners'), bannerData);
    }
    showFeedback('bannerFeedback', '✅ Banner guardado correctamente', 'ok');
    toast('✅ Banner guardado');
    setTimeout(() => {
      $('bannerForm').style.display = 'none';
      resetBannerForm();
      loadBanners();
    }, 1200);
  } catch (e) {
    showFeedback('bannerFeedback', `❌ Error: ${e.message}`, 'err');
  }
}

// ═══════════════════════════════════════════════════════════════
//  MÓDULO: CUPONES (RESUMIDO - IGUAL QUE ANTES)
// ═══════════════════════════════════════════════════════════════

function setupCouponsModule() {
  const addBtn = $('addCouponBtn');
  const closeBtn = $('closeCouponForm');
  const saveBtn = $('saveCouponBtn');
  const codeInput = $('cCode');
  
  if (addBtn) addBtn.addEventListener('click', () => { resetCouponForm(); $('couponForm').style.display = 'block'; });
  if (closeBtn) closeBtn.addEventListener('click', () => { $('couponForm').style.display = 'none'; });
  if (saveBtn) saveBtn.addEventListener('click', saveCoupon);
  if (codeInput) {
    codeInput.addEventListener('input', () => {
      codeInput.value = codeInput.value.toUpperCase();
    });
  }
}

async function loadCoupons() {
  const grid = $('couponsGrid');
  if (!grid) return;
  grid.innerHTML = '<div class="loading-row"><div class="mini-spin"></div> Cargando cupones...</div>';
  
  try {
    const snap = await getDocs(query(collection(db, 'coupons'), orderBy('createdAt', 'desc')));
    if (snap.empty) {
      grid.innerHTML = '<div class="loading-row">🏷️ No hay cupones. Crea el primero.</div>';
      return;
    }
    
    grid.innerHTML = snap.docs.map(doc => {
      const c = { id: doc.id, ...doc.data() };
      const discountLabel = c.type === 'percent' ? `${c.value}% de descuento` : `S/ ${(+c.value).toFixed(2)} de descuento`;
      return `
        <div class="coupon-card">
          <div class="cc-code">${escapeHtml(c.code || '')}</div>
          <div class="cc-discount">🎫 ${discountLabel}</div>
          <div class="cc-meta">
            ${c.minOrder ? `💰 Mínimo: S/ ${(+c.minOrder).toFixed(2)}<br>` : ''}
            ${c.maxUses ? `🔢 Usos máx: ${c.maxUses}<br>` : ''}
            ${c.expiry ? `📅 Vence: ${c.expiry}<br>` : ''}
            ${c.description ? `📝 ${escapeHtml(c.description)}` : ''}
          </div>
          <div class="cc-footer">
            <span class="bc-status ${c.active !== false ? 'bc-on' : 'bc-off'}">${c.active !== false ? 'Activo' : 'Inactivo'}</span>
            <div class="bc-actions">
              <button class="btn-icon" data-act="edit-coupon" data-id="${c.id}">✏️</button>
              <button class="btn-icon danger" data-act="delete-coupon" data-id="${c.id}" data-name="${c.code}">🗑️</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    grid.querySelectorAll('[data-act="edit-coupon"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const snap = await getDocs(query(collection(db, 'coupons'), orderBy('createdAt', 'desc')));
        const docSnap = snap.docs.find(d => d.id === btn.dataset.id);
        if (docSnap) openEditCoupon(docSnap);
      });
    });
    
    grid.querySelectorAll('[data-act="delete-coupon"]').forEach(btn => {
      btn.addEventListener('click', () => {
        confirmAction(`¿Eliminar cupón "${btn.dataset.name}"?`, '', async () => {
          await deleteDoc(doc(db, 'coupons', btn.dataset.id));
          toast('🗑️ Cupón eliminado');
          loadCoupons();
        });
      });
    });
  } catch (e) {
    grid.innerHTML = `<div class="loading-row">❌ Error: ${e.message}</div>`;
  }
}

function openEditCoupon(docSnap) {
  const c = { id: docSnap.id, ...docSnap.data() };
  $('couponEditId').value = c.id;
  $('cCode').value = c.code || '';
  $('cType').value = c.type || 'percent';
  $('cValue').value = c.value || '';
  $('cMinOrder').value = c.minOrder || '';
  $('cMaxUses').value = c.maxUses || '';
  $('cExpiry').value = c.expiry || '';
  $('cDesc').value = c.description || '';
  $('cActive').checked = c.active !== false;
  $('couponFormTitle').textContent = 'Editar Cupón';
  $('couponForm').style.display = 'block';
}

function resetCouponForm() {
  $('couponEditId').value = '';
  ['cCode', 'cValue', 'cMinOrder', 'cMaxUses', 'cExpiry', 'cDesc'].forEach(id => {
    if ($(id)) $(id).value = '';
  });
  if ($('cType')) $('cType').value = 'percent';
  if ($('cActive')) $('cActive').checked = true;
  $('couponFormTitle').textContent = 'Nuevo Cupón';
  hideFeedback('couponFeedback');
}

async function saveCoupon() {
  const code = $('cCode').value.trim().toUpperCase();
  const value = parseFloat($('cValue').value);
  
  if (!code || isNaN(value)) {
    showFeedback('couponFeedback', '⚠️ Código y valor son obligatorios', 'err');
    return;
  }
  
  const couponData = {
    code,
    type: $('cType').value,
    value,
    minOrder: $('cMinOrder').value ? parseFloat($('cMinOrder').value) : 0,
    maxUses: $('cMaxUses').value ? parseInt($('cMaxUses').value) : 0,
    expiry: $('cExpiry').value || null,
    description: $('cDesc').value.trim() || null,
    active: $('cActive').checked,
    updatedAt: serverTimestamp()
  };
  
  try {
    const editId = $('couponEditId').value;
    if (editId) {
      await updateDoc(doc(db, 'coupons', editId), couponData);
    } else {
      couponData.createdAt = serverTimestamp();
      await addDoc(collection(db, 'coupons'), couponData);
    }
    showFeedback('couponFeedback', '✅ Cupón guardado correctamente', 'ok');
    toast('✅ Cupón guardado');
    setTimeout(() => {
      $('couponForm').style.display = 'none';
      resetCouponForm();
      loadCoupons();
    }, 1200);
  } catch (e) {
    showFeedback('couponFeedback', `❌ Error: ${e.message}`, 'err');
  }
}

// ═══════════════════════════════════════════════════════════════
//  MÓDULO: SUSCRIPTORAS
// ═══════════════════════════════════════════════════════════════

function setupSubscribersModule() {
  const exportBtn = $('exportSubsBtn');
  if (exportBtn) exportBtn.addEventListener('click', exportSubscribers);
}

async function loadSubscribers() {
  const tbody = $('subsTableBody');
  const statsDiv = $('subsStats');
  if (!tbody) return;
  
  tbody.innerHTML = '<tr><td colspan="4" class="loading-row"><div class="mini-spin"></div> Cargando...</td></tr>';
  
  try {
    const snap = await getDocs(query(collection(db, 'subscribers'), orderBy('createdAt', 'desc')));
    
    if (statsDiv) {
      statsDiv.innerHTML = `
        <div class="ss-card"><span class="ss-num">${snap.size}</span><span class="ss-label">Suscriptoras totales</span></div>
      `;
    }
    
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="4" class="loading-row">💌 No hay suscriptoras aún</td></tr>';
      return;
    }
    
    tbody.innerHTML = snap.docs.map((doc, i) => {
      const s = { id: doc.id, ...doc.data() };
      const date = s.createdAt?.toDate 
        ? s.createdAt.toDate().toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })
        : '—';
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(s.email || '—')}</td>
          <td>${date}</td>
          <td><button class="btn-icon danger" data-act="delete-sub" data-id="${s.id}" data-email="${escapeHtml(s.email)}">🗑️</button></td>
        </tr>
      `;
    }).join('');
    
    tbody.querySelectorAll('[data-act="delete-sub"]').forEach(btn => {
      btn.addEventListener('click', () => {
        confirmAction(`¿Eliminar a ${btn.dataset.email}?`, '', async () => {
          await deleteDoc(doc(db, 'subscribers', btn.dataset.id));
          toast('🗑️ Suscriptora eliminada');
          loadSubscribers();
        });
      });
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" class="loading-row">❌ Error: ${e.message}</td></tr>`;
  }
}

async function exportSubscribers() {
  try {
    const snap = await getDocs(collection(db, 'subscribers'));
    const rows = ['Email,Fecha'];
    snap.forEach(doc => {
      const s = doc.data();
      const date = s.createdAt?.toDate 
        ? s.createdAt.toDate().toLocaleDateString('es-PE')
        : '';
      rows.push(`${s.email || ''},${date}`);
    });
    
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `skinbri-suscriptoras-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('⬇ CSV descargado');
  } catch (e) {
    toast('❌ Error al exportar');
  }
}

// ═══════════════════════════════════════════════════════════════
//  MÓDULO: PEDIDOS
// ═══════════════════════════════════════════════════════════════

function setupOrdersModule() {
  const addBtn = $('addOrderBtn');
  const closeBtn = $('closeOrderForm');
  const saveBtn = $('saveOrderBtn');
  
  if (addBtn) addBtn.addEventListener('click', () => { resetOrderForm(); $('orderForm').style.display = 'block'; });
  if (closeBtn) closeBtn.addEventListener('click', () => { $('orderForm').style.display = 'none'; });
  if (saveBtn) saveBtn.addEventListener('click', saveOrder);
}

async function loadOrders() {
  const listEl = $('ordersList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading-row"><div class="mini-spin"></div> Cargando pedidos...</div>';
  
  try {
    const snap = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc')));
    if (snap.empty) {
      listEl.innerHTML = '<div class="loading-row">📋 No hay pedidos registrados aún</div>';
      return;
    }
    
    listEl.innerHTML = snap.docs.map(doc => {
      const o = { id: doc.id, ...doc.data() };
      const date = o.createdAt?.toDate
        ? o.createdAt.toDate().toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })
        : '—';
      
      return `
        <div class="order-card">
          <div style="flex:1; min-width:0">
            <div class="oc-id">#${o.id.slice(-6).toUpperCase()} · ${date}</div>
            <div class="oc-name">${escapeHtml(o.clientName || 'Cliente')}</div>
            <div class="oc-phone">${escapeHtml(o.phone || '')}</div>
            <div class="oc-items">${escapeHtml(o.items || '')}</div>
            ${o.address ? `<div style="font-size:0.78rem; color:var(--text-3); margin-top:0.25rem">📍 ${escapeHtml(o.address)}</div>` : ''}
            ${o.notes ? `<div style="font-size:0.78rem; color:var(--text-3); margin-top:0.15rem">📝 ${escapeHtml(o.notes)}</div>` : ''}
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:0.5rem; flex-shrink:0">
            <div class="oc-total">S/ ${(+o.total || 0).toFixed(2)}</div>
            <select class="tb-select order-status-sel" data-id="${o.id}" style="font-size:0.78rem; padding:0.3rem 0.6rem">
              ${Object.entries(STATUS_LABELS).map(([val, label]) => 
                `<option value="${val}" ${o.status === val ? 'selected' : ''}>${label}</option>`
              ).join('')}
            </select>
            <div class="oc-actions">
              ${o.phone ? `<button class="btn-icon success" title="WhatsApp" data-wa="${o.phone}" data-name="${escapeHtml(o.clientName || '')}">💬</button>` : ''}
              <button class="btn-icon danger" data-act="delete-order" data-id="${o.id}">🗑️</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    listEl.querySelectorAll('.order-status-sel').forEach(sel => {
      sel.addEventListener('change', async () => {
        await updateDoc(doc(db, 'orders', sel.dataset.id), { status: sel.value });
        toast('✅ Estado actualizado');
      });
    });
    
    listEl.querySelectorAll('[data-wa]').forEach(btn => {
      btn.addEventListener('click', () => {
        const phone = btn.dataset.wa.replace(/\D/g, '');
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(`Hola ${btn.dataset.name}! Te escribimos desde SkinBri Shop 🌸`)}`, '_blank');
      });
    });
    
    listEl.querySelectorAll('[data-act="delete-order"]').forEach(btn => {
      btn.addEventListener('click', () => {
        confirmAction('¿Eliminar este pedido?', '', async () => {
          await deleteDoc(doc(db, 'orders', btn.dataset.id));
          toast('🗑️ Pedido eliminado');
          loadOrders();
        });
      });
    });
  } catch (e) {
    listEl.innerHTML = `<div class="loading-row">❌ Error: ${e.message}</div>`;
  }
}

function resetOrderForm() {
  ['oName', 'oPhone', 'oItems', 'oTotal', 'oAddress', 'oNotes'].forEach(id => {
    if ($(id)) $(id).value = '';
  });
  if ($('oStatus')) $('oStatus').value = 'pending';
  hideFeedback('orderFeedback');
}

async function saveOrder() {
  const name = $('oName').value.trim();
  const items = $('oItems').value.trim();
  
  if (!name || !items) {
    showFeedback('orderFeedback', '⚠️ Nombre y productos son obligatorios', 'err');
    return;
  }
  
  const orderData = {
    clientName: name,
    phone: $('oPhone').value.trim(),
    items: items,
    total: parseFloat($('oTotal').value) || 0,
    status: $('oStatus').value,
    address: $('oAddress').value.trim(),
    notes: $('oNotes').value.trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  
  try {
    await addDoc(collection(db, 'orders'), orderData);
    showFeedback('orderFeedback', '✅ Pedido registrado correctamente', 'ok');
    toast('✅ Pedido registrado');
    setTimeout(() => {
      $('orderForm').style.display = 'none';
      resetOrderForm();
      loadOrders();
    }, 1200);
  } catch (e) {
    showFeedback('orderFeedback', `❌ Error: ${e.message}`, 'err');
  }
}

// ═══════════════════════════════════════════════════════════════
//  MÓDULO: SOBRE NOSOTRAS
// ═══════════════════════════════════════════════════════════════

function setupAboutModule() {
  const saveBtn = $('saveAboutBtn');
  if (saveBtn) saveBtn.addEventListener('click', saveAbout);
}

async function loadAbout() {
  try {
    const docSnap = await getDoc(doc(db, 'settings', 'about'));
    if (docSnap.exists()) {
      const d = docSnap.data();
      const titleEl = $('aboutTitle');
      const titleEmEl = $('aboutTitleEm');
      const p1El = $('aboutP1');
      const p2El = $('aboutP2');
      const pillsEl = $('aboutPills');
      const waEl = $('aboutWa');
      const igEl = $('aboutIg');
      const ttEl = $('aboutTt');
      const announceEl = $('aboutAnnounce');
      
      if (titleEl) titleEl.value = d.title || '';
      if (titleEmEl) titleEmEl.value = d.titleEm || '';
      if (p1El) p1El.value = d.p1 || '';
      if (p2El) p2El.value = d.p2 || '';
      if (pillsEl) pillsEl.value = (d.pills || []).join(', ');
      if (waEl) waEl.value = d.waNumber || '';
      if (igEl) igEl.value = d.instagram || '';
      if (ttEl) ttEl.value = d.tiktok || '';
      if (announceEl) announceEl.value = d.announceText || '';
    }
  } catch (e) {
    console.warn('Error loading about:', e);
  }
}

async function saveAbout() {
  const pillsInput = $('aboutPills');
  const pills = pillsInput ? pillsInput.value.split(',').map(p => p.trim()).filter(Boolean) : [];
  
  const aboutData = {
    title: $('aboutTitle')?.value.trim() || '',
    titleEm: $('aboutTitleEm')?.value.trim() || '',
    p1: $('aboutP1')?.value.trim() || '',
    p2: $('aboutP2')?.value.trim() || '',
    pills: pills,
    waNumber: $('aboutWa')?.value.trim() || '',
    instagram: $('aboutIg')?.value.trim() || '',
    tiktok: $('aboutTt')?.value.trim() || '',
    announceText: $('aboutAnnounce')?.value.trim() || '',
    updatedAt: serverTimestamp()
  };
  
  try {
    await setDoc(doc(db, 'settings', 'about'), aboutData, { merge: true });
    showFeedback('aboutFeedback', '✅ Configuración guardada correctamente', 'ok');
    toast('✅ Configuración guardada');
  } catch (e) {
    showFeedback('aboutFeedback', `❌ Error: ${e.message}`, 'err');
  }
}

// ═══════════════════════════════════════════════════════════════
//  INICIALIZACIÓN
// ═══════════════════════════════════════════════════════════════

function init() {
  setupNav();
  setupConfirm();
  setupLogout();
  setupProductsModule();
  setupBannersModule();
  setupCouponsModule();
  setupSubscribersModule();
  setupOrdersModule();
  setupAboutModule();
  
  console.log('%c🌸 SkinBri Admin v3 COMPLETO (con subida de imágenes)', 'color:#c04060;font-size:1.1rem;font-weight:bold');
}

init();