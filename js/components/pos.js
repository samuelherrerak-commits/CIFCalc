import { fmtNum, fmtInt, esc } from '../utils.js';

// Punto de venta compartido por Ventas y Presupuestos (estilo LegalYa): a la
// izquierda el catálogo en tarjetas con buscador (nombre, categoría, código)
// y chips de categoría; a la derecha el carrito con −/+ y total. Cada página
// pone sus propios campos (cliente, pago, validez…) y su botón de acción.
//
// opts:
//   products()        → lista actual de productos
//   cart              → carrito inicial [{ product, qty, unitPrice }]
//   capToStock        → true en Ventas: no deja pasar de la existencia y
//                       oculta los agotados; false en Presupuestos (solo avisa)
//   title, actionLabel
//   headerFieldsHtml  → campos sobre el carrito (p. ej. Cliente)
//   footerFieldsHtml  → campos bajo el total (fecha, pago, notas…)
//   onCartChange(cart)
const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const stockOf = (p) => Number(p.stock) || 0;

export function mountPOS(root, opts) {
  const capToStock = !!opts.capToStock;
  let cart = (opts.cart || []).slice();
  let query = '';
  let category = '';
  let flashTimer = null;

  root.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div class="lg:col-span-7 xl:col-span-8 flex flex-col gap-3">
        <div class="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div class="relative flex-1">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input id="pos-search" type="text" autocomplete="off" placeholder="Buscar por nombre, categoría o código…"
              class="w-full pl-10 pr-3 py-3 rounded-xl bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none text-sm font-semibold">
          </div>
          <span id="pos-count" class="hidden sm:block text-[11px] font-semibold text-slate-400 whitespace-nowrap"></span>
        </div>
        <div id="pos-categories" class="flex gap-2 overflow-x-auto pb-1"></div>
        <div id="pos-grid" class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 auto-rows-max content-start gap-3 lg:max-h-[75vh] lg:overflow-y-auto pr-1"></div>
      </div>

      <div class="lg:col-span-5 xl:col-span-4">
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col lg:sticky lg:top-4">
          <div class="px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex justify-between items-center">
            <div>
              <h2 class="text-sm font-black uppercase tracking-wide">${esc(opts.title || 'Venta')}</h2>
              <p id="pos-units" class="text-[11px] text-blue-100"></p>
            </div>
            <button id="pos-clear" class="hidden text-[11px] font-semibold bg-white/15 hover:bg-white/25 px-2 py-1 rounded-lg">Vaciar</button>
          </div>
          ${opts.headerFieldsHtml ? `<div class="p-4 border-b border-slate-100 space-y-3">${opts.headerFieldsHtml}</div>` : ''}
          <div id="pos-cart" class="p-4 space-y-2 max-h-[40vh] overflow-y-auto"></div>
          <div class="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
            <div class="flex justify-between items-end">
              <span class="text-xs font-black uppercase text-slate-400">Total</span>
              <span id="pos-total" class="text-3xl font-black tracking-tight text-slate-900"></span>
            </div>
            ${opts.footerFieldsHtml || ''}
            <div id="pos-msg" class="text-xs font-semibold text-red-600 min-h-[1rem]"></div>
            <button id="pos-action" class="w-full py-3.5 rounded-xl font-black uppercase tracking-wide text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.99] shadow-lg transition">${esc(opts.actionLabel || 'Procesar')}</button>
            <div id="pos-success" class="hidden text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const $ = (id) => root.querySelector('#' + id);
  const inCart = (id) => cart.find(l => l.product.id === id);
  const total = () => cart.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const units = () => cart.reduce((s, l) => s + l.qty, 0);
  const visibleProducts = () => opts.products().filter(p => !capToStock || stockOf(p) > 0);

  const flash = (msg) => {
    $('pos-msg').textContent = msg;
    clearTimeout(flashTimer);
    if (msg) flashTimer = setTimeout(() => { $('pos-msg').textContent = ''; }, 4000);
  };

  const success = (html) => {
    $('pos-success').classList.toggle('hidden', !html);
    $('pos-success').innerHTML = html || '';
  };

  const changed = () => {
    if (opts.onCartChange) opts.onCartChange(cart);
    renderGrid();
    renderCart();
  };

  const renderCategories = () => {
    const cats = [...new Set(visibleProducts().map(p => String(p.category || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (category && !cats.includes(category)) category = '';
    const chip = (value, text) => `
      <button data-cat="${esc(value)}" class="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
        category === value ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-blue-700'
      }">${esc(text)}</button>`;
    const wrap = $('pos-categories');
    wrap.innerHTML = cats.length ? chip('', 'Todas') + cats.map(c => chip(c, c)).join('') : '';
    wrap.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => {
      category = b.dataset.cat;
      renderCategories();
      renderGrid();
    }));
  };

  const renderGrid = () => {
    const q = norm(query.trim());
    const all = visibleProducts();
    const list = all
      .filter(p => !category || String(p.category || '').trim() === category)
      .filter(p => !q || [p.name, p.category, p.collection, p.brand, p.sku_briggs, p.sku, p.codigo_barra].some(v => norm(v).includes(q)))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));

    $('pos-count').textContent = `${list.length} producto${list.length === 1 ? '' : 's'}${capToStock ? ' disponible' + (list.length === 1 ? '' : 's') : ''}`;

    const grid = $('pos-grid');
    grid.innerHTML = list.length === 0
      ? `<div class="col-span-full py-16 text-center text-slate-400">
           <div class="text-4xl mb-2">📦</div>
           <p class="text-sm font-semibold">${all.length ? 'Ningún producto coincide con la búsqueda' : (capToStock ? 'Sin productos con existencia' : 'Sin productos en el catálogo')}</p>
           <p class="text-xs mt-1">${all.length ? 'Prueba con otro nombre, categoría o código.' : (capToStock ? 'El inventario se llena al completar un contenedor.' : '')}</p>
         </div>`
      : list.map(p => {
        const line = inCart(p.id);
        const left = stockOf(p) - (line ? line.qty : 0);
        const stockBadge = capToStock
          ? `<span class="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white ${left > 0 ? 'bg-emerald-500' : 'bg-red-500'}">${left > 0 ? fmtInt(left) + ' disp.' : 'Agotado'}</span>`
          : `<span class="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${stockOf(p) > 0 ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'}">${stockOf(p) > 0 ? fmtInt(stockOf(p)) + ' en stock' : 'Sin existencia'}</span>`;
        return `
        <button data-add="${esc(p.id)}" class="group relative text-left bg-white rounded-2xl border-2 ${line ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-100 hover:border-blue-400'} shadow-sm hover:shadow-md active:scale-[0.98] transition overflow-hidden flex flex-col min-h-[15rem] ${capToStock && left <= 0 ? 'opacity-60' : ''}">
          <div class="relative aspect-square bg-slate-50 flex-shrink-0">
            ${p.foto_url
              ? `<img src="${esc(p.foto_url)}" loading="lazy" decoding="async" class="w-full h-full object-cover" alt="">`
              : '<div class="w-full h-full flex items-center justify-center text-4xl text-slate-200">📦</div>'}
            ${stockBadge}
            ${line ? `<span class="absolute top-2 right-2 min-w-[1.5rem] h-6 px-1.5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">${fmtInt(line.qty)}</span>` : ''}
          </div>
          <div class="p-3 flex-1 flex flex-col gap-1">
            ${p.category ? `<span class="text-[10px] font-semibold uppercase tracking-wide text-violet-600">${esc(p.category)}</span>` : ''}
            <span class="text-sm font-bold text-slate-800 leading-tight line-clamp-2" data-name>${esc(p.name) || 'Sin nombre'}</span>
            <span class="text-[10px] font-mono text-slate-400">${esc(p.sku_briggs)}</span>
            <span class="mt-auto pt-1 font-black ${Number(p.sale_price) > 0 ? 'text-lg text-slate-900' : 'text-xs text-amber-600'}">${Number(p.sale_price) > 0 ? '$' + fmtNum(p.sale_price) : 'Sin precio'}</span>
          </div>
        </button>`;
      }).join('');

    grid.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => addOne(b.dataset.add)));
  };

  const addOne = (productId) => {
    const p = opts.products().find(x => x.id === productId);
    if (!p) return;
    const line = inCart(p.id);
    if (capToStock && (line ? line.qty : 0) + 1 > stockOf(p)) { flash(`Stock insuficiente de "${p.name}". Disponible: ${fmtInt(stockOf(p))}`); return; }
    if (line) line.qty += 1;
    else cart.push({ product: p, qty: 1, unitPrice: Number(p.sale_price) || 0 });
    success('');
    changed();
  };

  const setQty = (i, val) => {
    const l = cart[i];
    let q = Math.floor(Number(val));
    if (!Number.isFinite(q)) q = 0;
    if (capToStock && q > stockOf(l.product)) { flash(`Solo hay ${fmtInt(stockOf(l.product))} de "${l.product.name}".`); q = stockOf(l.product); }
    if (q <= 0) cart.splice(i, 1);
    else l.qty = q;
    changed();
  };

  const renderCart = () => {
    const list = $('pos-cart');
    list.innerHTML = cart.length === 0
      ? `<div class="py-10 text-center">
           <div class="text-4xl mb-2 text-slate-300">🛒</div>
           <p class="text-sm font-bold uppercase text-slate-400">Carrito vacío</p>
           <p class="text-xs mt-1 text-slate-400">Toca un producto para agregarlo</p>
         </div>`
      : cart.map((l, i) => {
        const over = !capToStock && l.qty > stockOf(l.product);
        return `
        <div class="flex gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
          ${l.product.foto_url
            ? `<img src="${esc(l.product.foto_url)}" loading="lazy" decoding="async" class="w-12 h-12 object-cover rounded-lg border border-slate-200 flex-shrink-0" alt="">`
            : '<div class="w-12 h-12 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-300 flex-shrink-0">📦</div>'}
          <div class="flex-1 min-w-0">
            <div class="flex justify-between gap-2">
              <p class="text-xs font-bold text-slate-800 truncate">${esc(l.product.name)}</p>
              <button data-del="${i}" title="Quitar" class="text-slate-300 hover:text-red-500 text-sm leading-none">✕</button>
            </div>
            <div class="flex items-center justify-between gap-2 mt-2">
              <div class="flex items-center gap-1">
                <button data-minus="${i}" class="w-7 h-7 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 font-bold text-slate-600">−</button>
                <input data-qty="${i}" type="number" min="0" ${capToStock ? `max="${stockOf(l.product)}"` : ''} step="1" value="${l.qty}" class="w-12 text-center text-sm font-bold bg-transparent outline-none">
                <button data-plus="${i}" class="w-7 h-7 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 font-bold text-slate-600">+</button>
              </div>
              <div class="flex items-center gap-1 text-[11px] text-slate-400">
                × $<input data-price="${i}" type="number" min="0" step="0.01" value="${l.unitPrice || ''}" placeholder="0.00" class="w-16 p-1 border ${l.unitPrice > 0 ? 'border-slate-200 bg-white' : 'border-amber-400 bg-amber-50'} rounded text-right text-xs">
              </div>
            </div>
            <div class="flex justify-between items-center mt-1">
              <span class="text-[10px] font-semibold text-amber-600">${over ? `Supera la existencia (${fmtInt(stockOf(l.product))})` : ''}</span>
              <span class="text-sm font-black text-emerald-600">$${fmtNum(l.qty * l.unitPrice)}</span>
            </div>
          </div>
        </div>`;
      }).join('');

    $('pos-total').textContent = `$${fmtNum(total())}`;
    $('pos-units').textContent = cart.length ? `${fmtInt(units())} unidad${units() === 1 ? '' : 'es'} · ${cart.length} producto${cart.length === 1 ? '' : 's'}` : '';
    $('pos-clear').classList.toggle('hidden', cart.length === 0);

    list.querySelectorAll('[data-minus]').forEach(b => b.addEventListener('click', () => setQty(Number(b.dataset.minus), cart[Number(b.dataset.minus)].qty - 1)));
    list.querySelectorAll('[data-plus]').forEach(b => b.addEventListener('click', () => {
      const i = Number(b.dataset.plus);
      setQty(i, cart[i].qty + 1);
    }));
    list.querySelectorAll('[data-qty]').forEach(el => el.addEventListener('change', (e) => setQty(Number(e.target.dataset.qty), e.target.value)));
    list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { cart.splice(Number(b.dataset.del), 1); changed(); }));
    list.querySelectorAll('[data-price]').forEach(el => el.addEventListener('change', (e) => {
      cart[Number(e.target.dataset.price)].unitPrice = Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100) / 100);
      changed();
    }));
  };

  $('pos-search').addEventListener('input', (e) => { query = e.target.value; renderGrid(); });
  // Enter con un único resultado (p. ej. un código tecleado) lo agrega directo.
  $('pos-search').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const only = root.querySelectorAll('#pos-grid [data-add]');
    if (only.length === 1) { addOne(only[0].dataset.add); e.target.select(); }
  });
  $('pos-clear').addEventListener('click', () => { if (confirm('¿Vaciar el carrito?')) { cart = []; changed(); } });

  renderCategories();
  renderGrid();
  renderCart();
  $('pos-search').focus();

  return {
    getCart: () => cart,
    total,
    flash,
    success,
    onAction: (fn) => $('pos-action').addEventListener('click', fn),
    setCart: (c) => { cart = c.slice(); changed(); },
    refresh: () => { renderCategories(); changed(); }
  };
}
