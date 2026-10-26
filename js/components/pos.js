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
//   priceFor(product) → { listPrice, unitPrice, discountPct, label } (promoción
//                       o descuento del cliente); por defecto el precio de venta
//   summary(cart)     → { rows: [[etiqueta, monto]], total } para mostrar el
//                       desglose de IVA sobre el total (por defecto, sin IVA)
//   suggestedIds      → Set de productos sugeridos (p. ej. los que ya compra el
//                       cliente): chip "⭐ Sugeridos" y etiqueta en la tarjeta
// Cada línea del carrito: { product, qty, unitPrice, listPrice, label, manual }.
// "manual" = precio escrito a mano: no se recalcula al cambiar el cliente.
const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const stockOf = (p) => Number(p.stock) || 0;

export function mountPOS(root, opts) {
  const capToStock = !!opts.capToStock;
  const priceFor = opts.priceFor || ((p) => ({ listPrice: Number(p.sale_price) || 0, unitPrice: Number(p.sale_price) || 0, discountPct: 0, label: '' }));
  const suggested = opts.suggestedIds || new Set();
  const SUGGESTED = '__sugeridos__';
  let cart = (opts.cart || []).map(l => ({ listPrice: Number(l.product.sale_price) || l.unitPrice, label: '', manual: true, ...l }));
  let query = '';
  let category = '';
  let flashTimer = null;
  let actionInView = false;

  // En pantallas grandes el punto de venta ocupa exactamente el alto
  // disponible (--pos-h): el catálogo y el carrito se desplazan por dentro y
  // el total y el botón de acción quedan siempre a la vista. En el teléfono
  // las columnas se apilan y la página se desplaza normal.
  root.innerHTML = `
    <div class="pos-wrap grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem] gap-3 lg:h-[var(--pos-h,auto)]">
      <div class="flex flex-col gap-2 min-h-0 min-w-0">
        <div class="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3 shrink-0">
          <div class="relative flex-1">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            <input id="pos-search" type="text" autocomplete="off" placeholder="Buscar por nombre, categoría o código…"
              class="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none text-sm font-semibold">
          </div>
          <span id="pos-count" class="hidden sm:block text-[11px] font-semibold text-slate-400 whitespace-nowrap pr-2"></span>
        </div>
        <div id="pos-categories" class="flex gap-1.5 overflow-x-auto no-scrollbar shrink-0"></div>
        <div id="pos-grid" class="grid [grid-template-columns:repeat(auto-fill,minmax(9.5rem,1fr))] auto-rows-max content-start gap-2.5 lg:flex-1 lg:min-h-0 lg:overflow-y-auto thin-scroll pr-1 pb-1"></div>
      </div>

      <div class="min-h-0">
        <div id="pos-cart-card" class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col lg:h-full scroll-mt-16">
          <div class="px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex justify-between items-center shrink-0">
            <div class="flex items-baseline gap-2">
              <h2 class="text-sm font-black uppercase tracking-wide">${esc(opts.title || 'Venta')}</h2>
              <p id="pos-units" class="text-[11px] text-blue-100"></p>
            </div>
            <button id="pos-clear" class="hidden text-[11px] font-semibold bg-white/15 hover:bg-white/25 px-2 py-1 rounded-lg">Vaciar</button>
          </div>
          ${opts.headerFieldsHtml ? `<div class="px-3 py-2 border-b border-slate-100 space-y-2 shrink-0">${opts.headerFieldsHtml}</div>` : ''}
          <div id="pos-cart" class="p-2.5 space-y-1.5 flex-1 min-h-[7rem] max-h-[45vh] lg:max-h-none overflow-y-auto thin-scroll"></div>
          <div class="px-3 py-2.5 bg-slate-50 border-t border-slate-200 space-y-2 shrink-0">
            <div id="pos-summary" class="space-y-0.5 text-[11px] text-slate-500"></div>
            <div class="flex justify-between items-end">
              <span class="text-xs font-black uppercase text-slate-400">Total</span>
              <span id="pos-total" class="text-2xl font-black tracking-tight text-slate-900"></span>
            </div>
            ${opts.footerFieldsHtml || ''}
            <div id="pos-msg" class="text-xs font-semibold text-red-600 empty:hidden"></div>
            <button id="pos-action" class="w-full py-3 rounded-xl font-black uppercase tracking-wide text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.99] shadow-lg transition">${esc(opts.actionLabel || 'Procesar')}</button>
            <div id="pos-success" class="hidden text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-2.5"></div>
          </div>
        </div>
      </div>
    </div>
    <button id="pos-jump" type="button" class="hidden lg:!hidden fixed bottom-[4.25rem] md:bottom-4 inset-x-3 md:left-auto md:w-80 z-30 items-center justify-between gap-2 px-4 py-3 rounded-2xl bg-blue-600 text-white font-bold text-sm shadow-xl">
      <span>🛒 Ver carrito <span id="pos-jump-n" class="text-blue-100 font-semibold"></span></span><span id="pos-jump-total" class="font-black"></span>
    </button>
  `;
  // Alto disponible: desde donde empieza el punto de venta hasta el borde
  // inferior de la ventana (mínimo 34rem para que el carrito siempre quepa).
  const fit = () => {
    const wrap = root.querySelector('.pos-wrap');
    if (!wrap || !wrap.isConnected) { window.removeEventListener('resize', fit); return; }
    const top = wrap.getBoundingClientRect().top + window.scrollY;
    wrap.style.setProperty('--pos-h', `${Math.max(544, window.innerHeight - top - 16)}px`);
  };
  window.addEventListener('resize', fit);
  requestAnimationFrame(fit);

  const $ = (id) => root.querySelector('#' + id);
  const inCart = (id) => cart.find(l => l.product.id === id);
  const subtotal = () => cart.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const summary = () => (opts.summary && cart.length ? opts.summary(cart) : null);
  const total = () => { const sm = summary(); return sm ? sm.total : subtotal(); };
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
    if (category && category !== SUGGESTED && !cats.includes(category)) category = '';
    const chip = (value, text) => `
      <button data-cat="${esc(value)}" class="px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition ${
        category === value ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-blue-700'
      }">${esc(text)}</button>`;
    const wrap = $('pos-categories');
    const sugCount = visibleProducts().filter(p => suggested.has(p.id)).length;
    if (category === SUGGESTED && !sugCount) category = '';
    wrap.innerHTML = (cats.length || sugCount)
      ? chip('', 'Todas') + (sugCount ? chip(SUGGESTED, `⭐ Sugeridos (${sugCount})`) : '') + cats.map(c => chip(c, c)).join('')
      : '';
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
      .filter(p => !category || (category === SUGGESTED ? suggested.has(p.id) : String(p.category || '').trim() === category))
      .filter(p => !q || [p.name, p.category, p.collection, p.brand, p.sku_briggs, p.sku, p.codigo_barra].some(v => norm(v).includes(q)))
      .sort((a, b) => (suggested.has(b.id) - suggested.has(a.id)) || String(a.name).localeCompare(String(b.name)));

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
        <button data-add="${esc(p.id)}" class="group relative text-left bg-white rounded-xl border-2 ${line ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-100 hover:border-blue-400'} shadow-sm hover:shadow-md active:scale-[0.98] transition overflow-hidden flex flex-col ${capToStock && left <= 0 ? 'opacity-60' : ''}">
          <div class="relative aspect-[4/3] bg-white flex-shrink-0 border-b border-slate-50">
            ${p.foto_url
              ? `<img src="${esc(p.foto_url)}" loading="lazy" decoding="async" class="w-full h-full object-contain p-1.5" alt="">`
              : '<div class="w-full h-full flex items-center justify-center text-3xl text-slate-200">📦</div>'}
            ${stockBadge}
            ${line ? `<span class="absolute top-2 right-2 min-w-[1.5rem] h-6 px-1.5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">${fmtInt(line.qty)}</span>` : ''}
          </div>
          <div class="px-2.5 py-2 flex-1 flex flex-col gap-0.5">
            ${p.category ? `<span class="text-[9px] font-semibold uppercase tracking-wide text-violet-600 truncate">${esc(p.category)}</span>` : ''}
            <span class="text-[13px] font-bold text-slate-800 leading-tight line-clamp-2" title="${esc(p.name)}" data-name>${esc(p.name) || 'Sin nombre'}</span>
            <span class="text-[10px] font-mono text-slate-400">${esc(p.sku_briggs)}</span>
            ${suggested.has(p.id) ? '<span class="self-start text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">⭐ Lo compra</span>' : ''}
            ${(() => {
              const pr = priceFor(p);
              if (!(pr.listPrice > 0)) return '<span class="mt-auto pt-1 font-black text-xs text-amber-600">Sin precio</span>';
              return pr.discountPct > 0
                ? `<span class="mt-auto pt-1 flex items-baseline gap-1.5 flex-wrap"><span class="font-black text-base text-emerald-700">$${fmtNum(pr.unitPrice)}</span><span class="text-[11px] text-slate-400 line-through">$${fmtNum(pr.listPrice)}</span><span class="text-[10px] font-bold text-rose-600">-${fmtNum(pr.discountPct).replace(/\.00$/, '')}%</span></span>`
                : `<span class="mt-auto pt-1 font-black text-base text-slate-900">$${fmtNum(pr.listPrice)}</span>`;
            })()}
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
    else {
      const pr = priceFor(p);
      cart.push({ product: p, qty: 1, unitPrice: pr.unitPrice, listPrice: pr.listPrice, label: pr.label, manual: false });
    }
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
      ? `<div class="py-6 text-center">
           <div class="text-3xl mb-1 text-slate-300">🛒</div>
           <p class="text-sm font-bold uppercase text-slate-400">Carrito vacío</p>
           <p class="text-xs mt-1 text-slate-400">Toca un producto para agregarlo</p>
         </div>`
      : cart.map((l, i) => {
        const over = !capToStock && l.qty > stockOf(l.product);
        return `
        <div class="flex gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100">
          ${l.product.foto_url
            ? `<img src="${esc(l.product.foto_url)}" loading="lazy" decoding="async" class="w-10 h-10 object-contain bg-white rounded-lg border border-slate-200 flex-shrink-0" alt="">`
            : '<div class="w-10 h-10 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-300 flex-shrink-0">📦</div>'}
          <div class="flex-1 min-w-0">
            <div class="flex justify-between gap-2">
              <p class="text-xs font-bold text-slate-800 truncate" title="${esc(l.product.name)}">${esc(l.product.name)}</p>
              <button data-del="${i}" title="Quitar" class="text-slate-300 hover:text-red-500 text-sm leading-none">✕</button>
            </div>
            <div class="flex items-center gap-1.5 mt-1">
              <div class="flex items-center">
                <button data-minus="${i}" class="w-6 h-6 rounded-md bg-white border border-slate-200 hover:bg-slate-100 font-bold text-slate-600 text-sm leading-none">−</button>
                <input data-qty="${i}" type="number" min="0" ${capToStock ? `max="${stockOf(l.product)}"` : ''} step="1" value="${l.qty}" class="w-10 text-center text-sm font-bold bg-transparent outline-none">
                <button data-plus="${i}" class="w-6 h-6 rounded-md bg-white border border-slate-200 hover:bg-slate-100 font-bold text-slate-600 text-sm leading-none">+</button>
              </div>
              <div class="flex items-center gap-0.5 text-[11px] text-slate-400">
                × $<input data-price="${i}" type="number" min="0" step="0.01" value="${l.unitPrice || ''}" placeholder="0.00" class="w-16 px-1 py-0.5 border ${l.unitPrice > 0 ? 'border-slate-200 bg-white' : 'border-amber-400 bg-amber-50'} rounded text-right text-xs">
              </div>
              <span class="ml-auto text-sm font-black text-emerald-600 whitespace-nowrap">$${fmtNum(l.qty * l.unitPrice)}</span>
            </div>
            ${over || (l.label && l.unitPrice < l.listPrice) ? `<p class="text-[10px] font-semibold mt-0.5 ${over ? 'text-amber-600' : 'text-rose-600'}">${over ? `Supera la existencia (${fmtInt(stockOf(l.product))})` : `${esc(l.label)} · antes $${fmtNum(l.listPrice)}`}</p>` : ''}
          </div>
        </div>`;
      }).join('');

    const sm = summary();
    $('pos-summary').innerHTML = sm && sm.rows.length
      ? sm.rows.map(([k, v]) => `<div class="flex justify-between"><span>${esc(k)}</span><span class="font-mono font-semibold text-slate-700">$${fmtNum(v)}</span></div>`).join('')
      : '';
    $('pos-total').textContent = `$${fmtNum(sm ? sm.total : subtotal())}`;
    $('pos-units').textContent = cart.length ? `${fmtInt(units())} unidad${units() === 1 ? '' : 'es'} · ${cart.length} producto${cart.length === 1 ? '' : 's'}` : '';
    $('pos-clear').classList.toggle('hidden', cart.length === 0);
    // Teléfono/tableta: atajo flotante al carrito (queda debajo del catálogo).
    const showJump = cart.length > 0 && !actionInView;
    $('pos-jump').classList.toggle('hidden', !showJump);
    $('pos-jump').classList.toggle('flex', showJump);
    $('pos-jump-n').textContent = `(${fmtInt(units())})`;
    $('pos-jump-total').textContent = $('pos-total').textContent;

    list.querySelectorAll('[data-minus]').forEach(b => b.addEventListener('click', () => setQty(Number(b.dataset.minus), cart[Number(b.dataset.minus)].qty - 1)));
    list.querySelectorAll('[data-plus]').forEach(b => b.addEventListener('click', () => {
      const i = Number(b.dataset.plus);
      setQty(i, cart[i].qty + 1);
    }));
    list.querySelectorAll('[data-qty]').forEach(el => el.addEventListener('change', (e) => setQty(Number(e.target.dataset.qty), e.target.value)));
    list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { cart.splice(Number(b.dataset.del), 1); changed(); }));
    list.querySelectorAll('[data-price]').forEach(el => el.addEventListener('change', (e) => {
      const l = cart[Number(e.target.dataset.price)];
      l.unitPrice = Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100) / 100);
      l.manual = true;
      l.label = l.unitPrice < l.listPrice ? `Precio especial -${fmtNum((1 - l.unitPrice / l.listPrice) * 100).replace(/\.00$/, '')}%` : '';
      changed();
    }));
  };

  $('pos-jump').addEventListener('click', () => $('pos-cart-card').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  // El atajo se esconde cuando el botón de acción ya está a la vista.
  new IntersectionObserver(([e]) => {
    actionInView = e.isIntersecting;
    const showJump = cart.length > 0 && !actionInView;
    $('pos-jump').classList.toggle('hidden', !showJump);
    $('pos-jump').classList.toggle('flex', showJump);
  }).observe($('pos-action'));
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
    subtotal,
    flash,
    success,
    onAction: (fn) => $('pos-action').addEventListener('click', fn),
    setCart: (c) => { cart = c.slice(); changed(); },
    // Recalcula los precios no escritos a mano (p. ej. al elegir otro cliente).
    repriceAll: () => {
      for (const l of cart) {
        if (l.manual) continue;
        const pr = priceFor(l.product);
        Object.assign(l, { unitPrice: pr.unitPrice, listPrice: pr.listPrice, label: pr.label });
      }
      changed();
    },
    // Descuento general (%) sobre el precio de lista de todas las líneas.
    applyDiscount: (pct) => {
      for (const l of cart) {
        const base = l.listPrice || Number(l.product.sale_price) || l.unitPrice;
        l.listPrice = base;
        l.unitPrice = Math.round(base * (1 - pct / 100) * 100) / 100;
        l.label = pct > 0 ? `Oferta -${pct}%` : '';
        l.manual = true;
      }
      changed();
    },
    refresh: () => { renderCategories(); changed(); }
  };
}
