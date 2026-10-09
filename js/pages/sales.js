import Store from '../store.js';
import { fmtNum, fmtInt, esc } from '../utils.js';
import { buildIncomeLines, withRoundingPlug } from '../accounting.js';
import { contactOptions, quickAddContact } from '../components/contact-picker.js';
import AccountingTabs from '../components/accounting-tabs.js';
import { input, label } from '../components/accounting-shell.js';
import AccountingShell from '../components/accounting-shell.js';

// Punto de venta al estilo LegalYa: a la izquierda los productos con
// existencia (buscador por nombre/categoría/código + filtro por categoría, un
// toque agrega 1 unidad), a la derecha el carrito con cantidades −/+ y el
// cobro. El stock es de referencia: solo se descuenta de products.stock.
// El carrito sobrevive al cambiar de pestaña o al refresco tras la sincronización.
let savedCart = []; // [{ productId, qty, unitPrice }]

const Sales = {
  async render(app, params) {
    const destroy = new AbortController();
    const { signal } = destroy;

    let accounts = Store.getAll('accounts').filter(a => a.is_active !== false);
    let contacts = Store.getAll('contacts');
    let products = Store.getAll('products');
    let cart = []; // [{ product, qty, unitPrice }]
    let query = '';
    let category = '';
    let lastSale = null;

    // Si se llega desde Presupuestos ("Convertir en Venta"), se precarga el
    // carrito con los mismos productos/cantidades/precios del presupuesto.
    const sourceQuoteId = params && params[0] ? params[0] : null;
    const sourceQuote = sourceQuoteId ? Store.getById('quotes', sourceQuoteId) : null;
    if (sourceQuote) {
      for (const it of Store.getQuoteItems(sourceQuote)) {
        const product = products.find(p => p.id === it.productId);
        const qty = Math.min(it.qty, Number(product && product.stock) || 0);
        if (product && qty > 0) cart.push({ product, qty, unitPrice: it.unitPrice });
      }
    } else {
      for (const it of savedCart) {
        const product = products.find(p => p.id === it.productId);
        const qty = Math.min(it.qty, Number(product && product.stock) || 0);
        if (product && qty > 0) cart.push({ product, qty, unitPrice: it.unitPrice });
      }
    }

    const byTipoEspecifico = (te) => accounts.filter(a => a.tipo_especifico === te).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    const accountOptions = (list) => list.map(a => `<option value="${a.id}">${esc(a.codigo)} — ${esc(a.nombre)}</option>`).join('');
    const diffAccount = () => accounts.find(a => a.codigo === '6.9.01.01');
    const revenueAccount = () => accounts.find(a => a.nombre === 'Ingresos por Ventas' && a.tipo === 'Ingreso');

    const stockOf = (p) => Number(p.stock) || 0;
    const inCart = (id) => cart.find(l => l.product.id === id);
    const cartTotal = () => cart.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const cartUnits = () => cart.reduce((s, l) => s + l.qty, 0);
    const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    const available = () => products.filter(p => stockOf(p) > 0);
    const categories = () => [...new Set(available().map(p => String(p.category || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

    // ---------- Catálogo (izquierda) ----------
    const renderCategories = () => {
      const wrap = document.getElementById('pos-categories');
      const cats = categories();
      if (category && !cats.includes(category)) category = '';
      const chip = (value, text) => `
        <button data-cat="${esc(value)}" class="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
          category === value ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-blue-700'
        }">${esc(text)}</button>`;
      wrap.innerHTML = cats.length ? chip('', 'Todas') + cats.map(c => chip(c, c)).join('') : '';
      wrap.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => {
        category = b.dataset.cat;
        renderCategories();
        renderGrid();
      }));
    };

    const renderGrid = () => {
      const grid = document.getElementById('pos-grid');
      const q = norm(query.trim());
      const list = available()
        .filter(p => !category || String(p.category || '').trim() === category)
        .filter(p => !q || [p.name, p.category, p.collection, p.brand, p.sku_briggs, p.sku, p.codigo_barra].some(v => norm(v).includes(q)))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));

      document.getElementById('pos-count').textContent = `${list.length} producto${list.length === 1 ? '' : 's'} disponible${list.length === 1 ? '' : 's'}`;

      grid.innerHTML = list.length === 0
        ? `<div class="col-span-full py-16 text-center text-slate-400">
             <div class="text-4xl mb-2">📦</div>
             <p class="text-sm font-semibold">${available().length ? 'Ningún producto coincide con la búsqueda' : 'Sin productos con existencia'}</p>
             <p class="text-xs mt-1">${available().length ? 'Prueba con otro nombre, categoría o código.' : 'El inventario se llena al completar un contenedor.'}</p>
           </div>`
        : list.map(p => {
          const line = inCart(p.id);
          const left = stockOf(p) - (line ? line.qty : 0);
          return `
          <button data-add="${esc(p.id)}" class="group relative text-left bg-white rounded-2xl border-2 ${line ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-100 hover:border-blue-400'} shadow-sm hover:shadow-md active:scale-[0.98] transition overflow-hidden flex flex-col ${left <= 0 ? 'opacity-60' : ''}">
            <div class="relative aspect-square bg-slate-50">
              ${p.foto_url
                ? `<img src="${esc(p.foto_url)}" loading="lazy" decoding="async" class="w-full h-full object-cover" alt="">`
                : '<div class="w-full h-full flex items-center justify-center text-4xl text-slate-200">📦</div>'}
              <span class="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${left > 0 ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}">${left > 0 ? fmtInt(left) + ' disp.' : 'Agotado'}</span>
              ${line ? `<span class="absolute top-2 right-2 min-w-[1.5rem] h-6 px-1.5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">${fmtInt(line.qty)}</span>` : ''}
            </div>
            <div class="p-3 flex-1 flex flex-col gap-1">
              ${p.category ? `<span class="text-[10px] font-semibold uppercase tracking-wide text-violet-600">${esc(p.category)}</span>` : ''}
              <span class="text-sm font-bold text-slate-800 leading-tight line-clamp-2">${esc(p.name) || 'Sin nombre'}</span>
              <span class="text-[10px] font-mono text-slate-400">${esc(p.sku_briggs)}</span>
              <span class="mt-auto pt-1 text-lg font-black ${Number(p.sale_price) > 0 ? 'text-slate-900' : 'text-amber-600 text-xs'}">${Number(p.sale_price) > 0 ? '$' + fmtNum(p.sale_price) : 'Sin precio'}</span>
            </div>
          </button>`;
        }).join('');

      grid.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => addOne(b.dataset.add)));
    };

    const addOne = (productId) => {
      const p = products.find(x => x.id === productId);
      if (!p) return;
      const line = inCart(p.id);
      if ((line ? line.qty : 0) + 1 > stockOf(p)) { flash(`Stock insuficiente de "${p.name}". Disponible: ${fmtInt(stockOf(p))}`); return; }
      if (line) line.qty += 1;
      else cart.push({ product: p, qty: 1, unitPrice: Number(p.sale_price) || 0 });
      lastSale = null;
      renderAll();
    };

    // ---------- Carrito (derecha) ----------
    const setQty = (i, val) => {
      const l = cart[i];
      let q = Math.floor(Number(val));
      if (!Number.isFinite(q)) q = 0;
      if (q > stockOf(l.product)) { flash(`Solo hay ${fmtInt(stockOf(l.product))} de "${l.product.name}".`); q = stockOf(l.product); }
      if (q <= 0) cart.splice(i, 1);
      else l.qty = q;
      renderAll();
    };

    const renderCart = () => {
      const list = document.getElementById('cart-list');
      list.innerHTML = cart.length === 0
        ? `<div class="py-10 text-center text-slate-300">
             <div class="text-4xl mb-2">🛒</div>
             <p class="text-sm font-bold uppercase text-slate-400">Carrito vacío</p>
             <p class="text-xs mt-1 text-slate-400">Toca un producto para agregarlo</p>
           </div>`
        : cart.map((l, i) => `
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
                  <input data-qty="${i}" type="number" min="0" max="${stockOf(l.product)}" step="1" value="${l.qty}" class="w-12 text-center text-sm font-bold bg-transparent outline-none">
                  <button data-plus="${i}" class="w-7 h-7 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 font-bold text-slate-600">+</button>
                </div>
                <div class="flex items-center gap-1 text-[11px] text-slate-400">
                  × $<input data-price="${i}" type="number" min="0" step="0.01" value="${l.unitPrice || ''}" placeholder="0.00" class="w-16 p-1 border ${l.unitPrice > 0 ? 'border-slate-200' : 'border-amber-400 bg-amber-50'} rounded text-right text-xs bg-white">
                </div>
              </div>
              <p class="text-right text-sm font-black text-emerald-600 mt-1">$${fmtNum(l.qty * l.unitPrice)}</p>
            </div>
          </div>
        `).join('');

      document.getElementById('cart-total').textContent = `$${fmtNum(cartTotal())}`;
      document.getElementById('cart-units').textContent = cart.length ? `${fmtInt(cartUnits())} unidad${cartUnits() === 1 ? '' : 'es'} · ${cart.length} producto${cart.length === 1 ? '' : 's'}` : '';
      document.getElementById('btn-clear-cart').classList.toggle('hidden', cart.length === 0);

      list.querySelectorAll('[data-minus]').forEach(b => b.addEventListener('click', () => setQty(Number(b.dataset.minus), cart[Number(b.dataset.minus)].qty - 1)));
      list.querySelectorAll('[data-plus]').forEach(b => b.addEventListener('click', () => setQty(Number(b.dataset.plus), cart[Number(b.dataset.plus)].qty + 1)));
      list.querySelectorAll('[data-qty]').forEach(el => el.addEventListener('change', (e) => setQty(Number(e.target.dataset.qty), e.target.value)));
      list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { cart.splice(Number(b.dataset.del), 1); renderAll(); }));
      list.querySelectorAll('[data-price]').forEach(el => el.addEventListener('change', (e) => {
        cart[Number(e.target.dataset.price)].unitPrice = Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100) / 100);
        renderAll();
      }));
    };

    const renderSuccess = () => {
      const el = document.getElementById('sale-success');
      el.classList.toggle('hidden', !lastSale);
      if (lastSale) el.innerHTML = `✅ Venta <strong>${esc(lastSale.refDoc)}</strong> registrada por <strong>$${fmtNum(lastSale.total)}</strong>${lastSale.entidad ? ' a ' + esc(lastSale.entidad) : ''}.`;
    };

    const renderAll = () => {
      savedCart = sourceQuote ? [] : cart.map(l => ({ productId: l.product.id, qty: l.qty, unitPrice: l.unitPrice }));
      renderGrid(); renderCart(); renderSuccess();
    };

    let flashTimer = null;
    const flash = (msg) => {
      const el = document.getElementById('sale-msg');
      el.textContent = msg;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => { el.textContent = ''; }, 4000);
    };

    // ---------- Ventas recientes ----------
    const recentSales = () => {
      const byRef = new Map();
      for (const m of Store.getAll('movements').filter(x => x.source === 'sale')) {
        if (!byRef.has(m.ref_doc)) byRef.set(m.ref_doc, []);
        byRef.get(m.ref_doc).push(m);
      }
      return [...byRef.entries()]
        .map(([refDoc, lines]) => {
          const first = [...lines].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
          const items = lines.filter(l => Number(l.cantidad) > 0 && l.unidad === 'unidades' && Number(l.precio_venta) > 0);
          const total = items.reduce((s, l) => s + (Number(l.credit) || 0), 0);
          return { refDoc, date: first.entry_date, created: first.created_at, entidad: first.entidad, itemCount: items.length, total };
        })
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0) || new Date(b.created || 0) - new Date(a.created || 0))
        .slice(0, 20);
    };

    const renderRecentSales = () => {
      const tbody = document.getElementById('sales-tbody');
      const list = recentSales();
      tbody.innerHTML = list.length === 0
        ? `<tr><td colspan="5" class="py-4 text-center text-slate-400">Sin ventas registradas todavía.</td></tr>`
        : list.map(s => `
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="p-2">${esc(s.date)}</td>
            <td class="p-2 font-mono">${esc(s.refDoc)}</td>
            <td class="p-2 text-slate-500">${esc(s.entidad) || '—'}</td>
            <td class="p-2 text-right">${s.itemCount}</td>
            <td class="p-2 text-right font-mono font-semibold text-emerald-700">$${fmtNum(s.total)}</td>
          </tr>
        `).join('');
    };

    const handleContactChange = (e) => {
      if (e.target.value !== '__new__') return;
      const c = quickAddContact(Store, 'cliente');
      contacts = Store.getAll('contacts');
      e.target.innerHTML = contactOptions(contacts, 'cliente', c ? c.id : '');
    };

    // Una venta solo toca Caja/Banco/CxC (debe) e Ingresos por Ventas (haber) —
    // el inventario es de referencia (stock en products), nunca una cuenta de
    // activo tocada aquí.
    const confirmSale = () => {
      const date = document.getElementById('f-date').value;
      const paymentId = document.getElementById('f-payment').value;
      const contactId = document.getElementById('f-contact').value;
      const concepto = document.getElementById('f-concepto').value.trim() || 'Venta';

      if (cart.length === 0) { flash('Agrega al menos un producto al carrito.'); return; }
      const noPrice = cart.find(l => !(l.unitPrice > 0));
      if (noPrice) { flash(`Indica el precio de "${noPrice.product.name}".`); return; }
      const over = cart.find(l => l.qty > stockOf(Store.getById('products', l.product.id) || l.product));
      if (over) { flash(`La existencia de "${over.product.name}" cambió; revisa la cantidad.`); return; }
      if (!date) { flash('La fecha es obligatoria.'); return; }
      if (!paymentId) { flash('Selecciona la forma de pago (Efectivo, Banco o Crédito).'); return; }

      const contact = contacts.find(c => c.id === contactId);
      const entidad = contact ? contact.name : '';
      const paymentAccount = accounts.find(a => a.id === paymentId);
      const revAccount = revenueAccount();
      if (!revAccount) { flash('Falta la cuenta "Ingresos por Ventas" en el Plan de Cuentas.'); return; }

      const refDoc = `VTA-${Date.now().toString().slice(-6)}`;
      let allLines = [];
      for (const l of cart) {
        allLines = allLines.concat(buildIncomeLines({
          date, total: l.qty * l.unitPrice, concepto: `${concepto} | ${l.product.name}`, entidad, refDoc,
          paymentAccount, revenueAccount: revAccount,
          sale: { qty: l.qty, unidad: 'unidades', unitPrice: l.unitPrice }
        }));
      }
      Store.postJournalRows(withRoundingPlug(allLines, diffAccount(), date, refDoc), { source: 'sale' });

      for (const l of cart) {
        const current = Store.getById('products', l.product.id) || l.product;
        Store.update('products', { id: l.product.id, stock: stockOf(current) - l.qty });
      }
      if (sourceQuote) Store.update('quotes', { id: sourceQuote.id, status: 'convertido', converted_ref: refDoc });

      lastSale = { refDoc, total: cartTotal(), entidad };
      cart = [];
      products = Store.getAll('products');
      document.getElementById('f-contact').value = '';
      document.getElementById('f-concepto').value = '';
      renderCategories();
      renderAll();
      renderRecentSales();
    };

    const body = `
      ${sourceQuote ? `<div class="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">Carrito precargado desde el presupuesto <strong>${esc(sourceQuote.quote_number)}</strong>.</div>` : ''}
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <!-- Catálogo de productos disponibles -->
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
          <div id="pos-grid" class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 lg:max-h-[75vh] lg:overflow-y-auto pr-1"></div>
        </div>

        <!-- Carrito y cobro -->
        <div class="lg:col-span-5 xl:col-span-4">
          <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col lg:sticky lg:top-4">
            <div class="px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex justify-between items-center">
              <div>
                <h2 class="text-sm font-black uppercase tracking-wide">Venta</h2>
                <p id="cart-units" class="text-[11px] text-blue-100"></p>
              </div>
              <button id="btn-clear-cart" class="hidden text-[11px] font-semibold bg-white/15 hover:bg-white/25 px-2 py-1 rounded-lg">Vaciar</button>
            </div>

            <div class="p-4 border-b border-slate-100">
              <label class="${label}">Cliente</label>
              <select id="f-contact" class="${input}">${contactOptions(contacts, 'cliente', sourceQuote ? sourceQuote.contact_id : '')}</select>
            </div>

            <div id="cart-list" class="p-4 space-y-2 max-h-[40vh] overflow-y-auto"></div>

            <div class="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
              <div class="flex justify-between items-end">
                <span class="text-xs font-black uppercase text-slate-400">Total a cobrar</span>
                <span id="cart-total" class="text-3xl font-black tracking-tight text-slate-900"></span>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="${label}">Fecha *</label>
                  <input id="f-date" type="date" value="${new Date().toISOString().slice(0, 10)}" class="${input}">
                </div>
                <div>
                  <label class="${label}">Forma de pago *</label>
                  <select id="f-payment" class="${input}">
                    <option value="">— Elegir —</option>
                    <optgroup label="Efectivo">${accountOptions(byTipoEspecifico('Efectivo'))}</optgroup>
                    <optgroup label="Banco">${accountOptions(byTipoEspecifico('Banco'))}</optgroup>
                    <optgroup label="Crédito (por cobrar)">${accountOptions(byTipoEspecifico('Clientes'))}</optgroup>
                  </select>
                </div>
              </div>
              <div>
                <label class="${label}">Concepto</label>
                <input id="f-concepto" type="text" placeholder="Venta" class="${input}">
              </div>
              <div id="sale-msg" class="text-xs font-semibold text-red-600 min-h-[1rem]"></div>
              <button id="btn-confirm-sale" class="w-full py-3.5 rounded-xl font-black uppercase tracking-wide text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.99] shadow-lg transition">Procesar venta</button>
              <div id="sale-success" class="hidden text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
        <h2 class="text-sm font-bold text-slate-700 mb-3">Ventas Recientes</h2>
        <table class="w-full text-left text-xs">
          <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide"><th class="p-2">Fecha</th><th class="p-2">Referencia</th><th class="p-2">Cliente</th><th class="p-2 text-right">Ítems</th><th class="p-2 text-right">Total</th></tr></thead>
          <tbody id="sales-tbody"></tbody>
        </table>
      </div>
    `;

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('sales'), body);

    document.getElementById('pos-search').addEventListener('input', (e) => { query = e.target.value; renderGrid(); }, { signal });
    // Enter con un solo resultado (p. ej. código escaneado o tecleado) lo agrega directo.
    document.getElementById('pos-search').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const only = document.querySelectorAll('#pos-grid [data-add]');
      if (only.length === 1) { addOne(only[0].dataset.add); e.target.select(); }
    }, { signal });
    document.getElementById('btn-confirm-sale').addEventListener('click', confirmSale);
    document.getElementById('btn-clear-cart').addEventListener('click', () => { if (confirm('¿Vaciar el carrito?')) { cart = []; renderAll(); } });
    document.getElementById('f-contact').addEventListener('change', handleContactChange);

    renderCategories();
    renderAll();
    renderRecentSales();
    document.getElementById('pos-search').focus();

    return () => destroy.abort();
  }
};

export default Sales;
