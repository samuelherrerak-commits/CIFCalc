import Store from '../store.js';
import { fmtNum, esc, num } from '../utils.js';
import { buildIncomeLines, withRoundingPlug, totalsFor } from '../accounting.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { btnPrimary, btnSecondary, card, input, label } from '../components/accounting-shell.js';

const Sales = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    let accounts = Store.getAll('accounts').filter(a => a.is_active !== false);
    let cart = []; // [{ product, qty, unitPrice }]
    let pickerProduct = null;
    let pickerQuery = '';

    const byTipo = (tipo) => accounts.filter(a => a.tipo === tipo).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    const byTipoEspecifico = (te) => accounts.filter(a => a.tipo_especifico === te).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    const accountOptions = (list) => list.map(a => `<option value="${a.id}">${esc(a.codigo)} — ${esc(a.nombre)}</option>`).join('');
    const diffAccount = () => accounts.find(a => a.codigo === '6.9.01.01');
    const revenueAccount = () => accounts.find(a => a.nombre === 'Ingresos por Ventas' && a.tipo === 'Ingreso');
    const inventoryAccount = () => accounts.find(a => a.tipo_especifico === 'Inventario');

    const cartTotal = () => cart.reduce((s, l) => s + l.qty * l.unitPrice, 0);

    const recentSales = () => {
      const movs = Store.getAll('movements').filter(m => m.source === 'sale');
      const byRef = new Map();
      for (const m of movs) {
        if (!byRef.has(m.ref_doc)) byRef.set(m.ref_doc, []);
        byRef.get(m.ref_doc).push(m);
      }
      return [...byRef.entries()]
        .map(([refDoc, lines]) => {
          const first = [...lines].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
          // precio_venta > 0 aísla la línea de Ingresos por Ventas (credit) de
          // cada producto — la de costo y la de inventario también llevan
          // cantidad/unidad pero sin precio, y contarlas duplicaría el total.
          const items = lines.filter(l => Number(l.cantidad) > 0 && l.unidad === 'unidades' && Number(l.precio_venta) > 0);
          const total = items.reduce((s, l) => s + (Number(l.credit) || 0), 0);
          return { refDoc, date: first.entry_date, entidad: first.entidad, itemCount: items.length, total };
        })
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
        .slice(0, 20);
    };

    const renderRecentSales = () => {
      const tbody = document.getElementById('sales-tbody');
      const list = recentSales();
      tbody.innerHTML = list.length === 0
        ? `<tr><td colspan="5" class="py-4 text-center text-slate-500">Sin ventas registradas todavía.</td></tr>`
        : list.map(s => `
          <tr class="border-t border-slate-700/30 hover:bg-slate-800/30">
            <td class="py-1.5">${esc(s.date)}</td>
            <td class="py-1.5">${esc(s.refDoc)}</td>
            <td class="py-1.5 text-slate-400">${esc(s.entidad)}</td>
            <td class="py-1.5 text-right">${s.itemCount}</td>
            <td class="py-1.5 text-right font-mono">$${fmtNum(s.total)}</td>
          </tr>
        `).join('');
    };

    const renderCart = () => {
      const tbody = document.getElementById('cart-tbody');
      tbody.innerHTML = cart.length === 0
        ? `<tr><td colspan="5" class="py-4 text-center text-slate-500">Carrito vacío. Agrega un producto del inventario.</td></tr>`
        : cart.map((l, i) => `
          <tr class="border-t border-slate-700/30">
            <td class="py-1.5">
              <div class="flex items-center gap-2">
                ${l.product.foto_url ? `<img src="${esc(l.product.foto_url)}" loading="lazy" decoding="async" class="w-8 h-8 object-cover rounded border border-slate-700" alt="">` : '<div class="w-8 h-8 rounded border border-slate-700 bg-slate-800"></div>'}
                <div class="min-w-0">
                  <div class="text-xs font-bold text-slate-200 truncate">${esc(l.product.name)}</div>
                  <div class="text-[10px] text-slate-500">${esc(l.product.sku_briggs)}</div>
                </div>
              </div>
            </td>
            <td class="py-1.5 text-right"><input data-cart-qty="${i}" type="number" min="1" max="${Number(l.product.stock) || 0}" step="1" value="${l.qty}" class="w-16 p-1 bg-slate-900 border border-slate-700 rounded text-xs text-right text-slate-100"></td>
            <td class="py-1.5 text-right"><input data-cart-price="${i}" type="number" min="0" step="0.01" value="${l.unitPrice}" class="w-20 p-1 bg-slate-900 border border-slate-700 rounded text-xs text-right text-slate-100"></td>
            <td class="py-1.5 text-right font-mono text-slate-300">$${fmtNum(l.qty * l.unitPrice)}</td>
            <td class="py-1.5 text-center"><button data-cart-del="${i}" class="text-rose-400 hover:text-rose-300 font-bold px-1">✕</button></td>
          </tr>
        `).join('');

      document.getElementById('cart-total').textContent = `$${fmtNum(cartTotal())}`;

      tbody.querySelectorAll('[data-cart-qty]').forEach(elInp => elInp.addEventListener('input', (e) => {
        const i = Number(e.target.dataset.cartQty);
        const max = Number(cart[i].product.stock) || 0;
        let qty = num(e.target);
        if (qty > max) qty = max;
        cart[i].qty = qty;
        renderCart();
      }));
      tbody.querySelectorAll('[data-cart-price]').forEach(elInp => elInp.addEventListener('input', (e) => {
        cart[Number(e.target.dataset.cartPrice)].unitPrice = num(e.target);
        renderCart();
      }));
      tbody.querySelectorAll('[data-cart-del]').forEach(btn => btn.addEventListener('click', (e) => {
        cart.splice(Number(e.target.dataset.cartDel), 1);
        renderCart();
      }));
    };

    // --- Selector visual de productos del inventario (foto + stock) ---
    const renderPickerList = () => {
      const list = document.getElementById('pk-list');
      const q = pickerQuery.trim().toLowerCase();
      const products = Store.getAll('products').filter(p => Number(p.stock) > 0 && (
        !q || [p.sku_briggs, p.sku, p.name].some(v => String(v || '').toLowerCase().includes(q))
      ));
      list.innerHTML = products.length === 0
        ? `<div class="p-4 text-center text-slate-500 text-sm">Sin productos con stock disponible que coincidan.</div>`
        : products.map(p => `
          <div class="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-700/30 hover:bg-slate-800/30">
            <div class="flex items-center gap-3 min-w-0">
              ${p.foto_url ? `<img src="${esc(p.foto_url)}" loading="lazy" decoding="async" class="w-10 h-10 object-cover rounded border border-slate-700 flex-shrink-0" alt="">` : '<div class="w-10 h-10 rounded border border-slate-700 bg-slate-800 flex-shrink-0"></div>'}
              <div class="min-w-0">
                <div class="text-xs font-bold text-blue-400">${esc(p.sku_briggs) || '—'}</div>
                <div class="text-sm text-slate-200 truncate">${esc(p.name) || ''}</div>
                <div class="text-xs text-slate-500">Stock: ${fmtNum(p.stock)} · Costo prom.: $${fmtNum(p.avg_cost)}</div>
              </div>
            </div>
            <button data-pick="${p.id}" class="bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg w-8 h-8 flex-shrink-0">+</button>
          </div>
        `).join('');

      list.querySelectorAll('[data-pick]').forEach(btn => btn.addEventListener('click', () => {
        const p = Store.getById('products', btn.dataset.pick);
        if (!p) return;
        pickerProduct = p;
        document.getElementById('pk-confirm-name').textContent = `${p.sku_briggs || '—'} — ${p.name || ''} (stock: ${fmtNum(p.stock)})`;
        document.getElementById('pk-qty').value = 1;
        document.getElementById('pk-qty').max = Number(p.stock) || 0;
        document.getElementById('pk-price').value = Number(p.avg_cost) || 0;
        document.getElementById('pk-confirm').classList.remove('hidden');
        document.getElementById('pk-qty').focus();
      }));
    };

    const openPicker = () => {
      pickerProduct = null;
      pickerQuery = '';
      document.getElementById('pk-search').value = '';
      document.getElementById('pk-confirm').classList.add('hidden');
      document.getElementById('product-picker').classList.remove('hidden');
      renderPickerList();
      document.getElementById('pk-search').focus();
    };

    const closePicker = () => {
      document.getElementById('product-picker').classList.add('hidden');
      pickerProduct = null;
    };

    const addToCart = () => {
      if (!pickerProduct) return;
      const qty = num(document.getElementById('pk-qty'));
      const unitPrice = num(document.getElementById('pk-price'));
      if (qty <= 0 || qty > Number(pickerProduct.stock)) { alert(`Cantidad inválida (stock disponible: ${fmtNum(pickerProduct.stock)}).`); return; }
      if (unitPrice <= 0) { alert('Indica un precio de venta mayor a 0.'); return; }
      const existing = cart.find(l => l.product.id === pickerProduct.id);
      if (existing) {
        existing.qty = Math.min(existing.qty + qty, Number(pickerProduct.stock));
      } else {
        cart.push({ product: pickerProduct, qty, unitPrice });
      }
      closePicker();
      renderCart();
    };

    const confirmSale = () => {
      const date = document.getElementById('f-date').value;
      const paymentId = document.getElementById('f-payment').value;
      const costAccountId = document.getElementById('f-cost-account').value;
      const entidad = document.getElementById('f-entidad').value.trim();
      const concepto = document.getElementById('f-concepto').value.trim() || 'Venta';
      const msgEl = document.getElementById('sale-msg');
      msgEl.textContent = '';

      if (cart.length === 0) { msgEl.textContent = 'Agrega al menos un producto al carrito.'; return; }
      if (!date) { msgEl.textContent = 'La fecha es obligatoria.'; return; }
      if (!paymentId) { msgEl.textContent = 'Selecciona la forma de pago (Efectivo/Banco/Clientes).'; return; }
      if (!costAccountId) { msgEl.textContent = 'Selecciona la cuenta de costo.'; return; }

      const paymentAccount = accounts.find(a => a.id === paymentId);
      const costAccount = accounts.find(a => a.id === costAccountId);
      const revAccount = revenueAccount();
      const invAccount = inventoryAccount();
      if (!revAccount || !invAccount) { msgEl.textContent = 'Faltan cuentas "Ingresos por Ventas" o de Inventario en el Plan de Cuentas.'; return; }

      const refDoc = `VTA-${Date.now().toString().slice(-6)}`;
      let allLines = [];
      for (const l of cart) {
        const lineConcepto = `${concepto} | ${l.product.name}`;
        const data = {
          date, total: l.qty * l.unitPrice, concepto: lineConcepto, entidad, refDoc,
          paymentAccount, revenueAccount: revAccount,
          inventory: {
            qty: l.qty, unitCost: Number(l.product.avg_cost) || 0, unitPrice: l.unitPrice,
            unidad: 'unidades', costAccount, inventoryAccount: invAccount
          }
        };
        allLines = allLines.concat(buildIncomeLines(data));
      }

      const finalLines = withRoundingPlug(allLines, diffAccount(), date, refDoc);
      Store.postJournalRows(finalLines, { source: 'sale' });

      for (const l of cart) {
        Store.update('products', { id: l.product.id, stock: (Number(l.product.stock) || 0) - l.qty });
      }

      cart = [];
      document.getElementById('f-entidad').value = '';
      document.getElementById('f-concepto').value = '';
      renderCart();
      renderRecentSales();
    };

    const body = `
      <div class="${card} space-y-3">
        <div class="flex justify-between items-center">
          <h2 class="text-sm font-black uppercase tracking-wide text-slate-300">Carrito de Venta</h2>
          <button id="btn-add-product" class="${btnPrimary}">+ Agregar Producto</button>
        </div>
        <table class="w-full text-left text-xs">
          <thead><tr class="text-[9px] font-black text-slate-500 uppercase tracking-wider"><th class="py-1.5">Producto</th><th class="py-1.5 text-right">Cant.</th><th class="py-1.5 text-right">Precio Unit.</th><th class="py-1.5 text-right">Subtotal</th><th class="py-1.5"></th></tr></thead>
          <tbody id="cart-tbody"></tbody>
        </table>
        <div class="text-right text-sm font-black text-slate-200">Total: <span id="cart-total" class="text-emerald-400"></span></div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-700/30">
          <div>
            <label class="${label}">Fecha *</label>
            <input id="f-date" type="date" value="${new Date().toISOString().slice(0, 10)}" class="${input}">
          </div>
          <div>
            <label class="${label}">Forma de Pago *</label>
            <select id="f-payment" class="${input}">
              <option value="">— Cuenta —</option>
              <optgroup label="Efectivo">${accountOptions(byTipoEspecifico('Efectivo'))}</optgroup>
              <optgroup label="Banco">${accountOptions(byTipoEspecifico('Banco'))}</optgroup>
              <optgroup label="Crédito (CxC)">${accountOptions(byTipoEspecifico('Clientes'))}</optgroup>
            </select>
          </div>
          <div>
            <label class="${label}">Cuenta de Costo *</label>
            <select id="f-cost-account" class="${input}">${accountOptions(byTipo('Costo'))}</select>
          </div>
          <div>
            <label class="${label}">Cliente</label>
            <input id="f-entidad" type="text" class="${input}">
          </div>
          <div class="sm:col-span-2 lg:col-span-4">
            <label class="${label}">Concepto</label>
            <input id="f-concepto" type="text" placeholder="Venta" class="${input}">
          </div>
        </div>
        <div id="sale-msg" class="text-xs text-rose-400"></div>
        <button id="btn-confirm-sale" class="${btnPrimary}">Confirmar Venta</button>
      </div>

      <div class="${card}">
        <h2 class="text-sm font-black uppercase tracking-wide text-slate-300 mb-3">Ventas Recientes</h2>
        <table class="w-full text-left text-xs">
          <thead><tr class="text-[9px] font-black text-slate-500 uppercase tracking-wider"><th class="py-1.5">Fecha</th><th class="py-1.5">Referencia</th><th class="py-1.5">Cliente</th><th class="py-1.5 text-right">Ítems</th><th class="py-1.5 text-right">Total</th></tr></thead>
          <tbody id="sales-tbody"></tbody>
        </table>
      </div>
    `;

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('sales'), body) + `
      <!-- Modal Selector de Productos del Inventario -->
      <div id="product-picker" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-5 space-y-3 max-h-[90vh] flex flex-col text-slate-100">
          <div class="flex justify-between items-center">
            <h3 class="text-sm font-black uppercase tracking-wide">Agregar al Carrito</h3>
            <button id="pk-close" class="text-slate-500 hover:text-slate-300 text-xl font-bold leading-none">✕</button>
          </div>
          <input id="pk-search" type="text" placeholder="Buscar por SKU o nombre…" class="${input}">
          <div id="pk-list" class="flex-1 overflow-y-auto border border-slate-700 rounded-lg min-h-0"></div>
          <div id="pk-confirm" class="hidden bg-slate-800/50 border border-slate-700 rounded-lg p-3 space-y-3">
            <span id="pk-confirm-name" class="font-bold text-slate-200 text-sm block"></span>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="${label}">Cantidad *</label>
                <input id="pk-qty" type="number" min="1" step="1" class="${input}">
              </div>
              <div>
                <label class="${label}">Precio de Venta Unit. ($) *</label>
                <input id="pk-price" type="number" min="0" step="0.01" class="${input}">
              </div>
            </div>
            <div class="flex justify-end">
              <button id="pk-add" class="${btnPrimary}">+ Agregar al carrito</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-add-product').addEventListener('click', openPicker);
    document.getElementById('btn-confirm-sale').addEventListener('click', confirmSale);
    document.getElementById('pk-search').addEventListener('input', (e) => { pickerQuery = e.target.value; renderPickerList(); });
    document.getElementById('pk-add').addEventListener('click', addToCart);
    document.getElementById('pk-close').addEventListener('click', closePicker);
    document.getElementById('product-picker').addEventListener('click', (e) => { if (e.target.id === 'product-picker') closePicker(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !document.getElementById('product-picker').classList.contains('hidden')) closePicker();
    }, { signal });

    const defaultCost = accounts.find(a => a.nombre === 'Costo de Venta' && a.tipo === 'Costo');
    if (defaultCost) document.getElementById('f-cost-account').value = defaultCost.id;

    renderCart();
    renderRecentSales();

    return () => destroy.abort();
  }
};

export default Sales;
