import Store from '../store.js';
import { fmtNum, esc, num } from '../utils.js';
import { contactOptions, quickAddContact } from '../components/contact-picker.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { btnPrimary, btnSecondary, card, input, label } from '../components/accounting-shell.js';

const STATUS_LABEL = { pendiente: 'Pendiente', convertido: 'Convertido', rechazado: 'Rechazado' };
const STATUS_COLOR = { pendiente: 'amber', convertido: 'emerald', rechazado: 'slate' };

const Quotes = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    let contacts = Store.getAll('contacts');
    let cart = []; // [{ product, qty, unitPrice }]
    let pickerProduct = null;
    let pickerQuery = '';
    let printingQuote = null;

    const cartTotal = () => cart.reduce((s, l) => s + l.qty * l.unitPrice, 0);

    const recentQuotes = () => [...Store.getAll('quotes')]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 30);

    const renderList = () => {
      const tbody = document.getElementById('quotes-tbody');
      const list = recentQuotes();
      tbody.innerHTML = list.length === 0
        ? `<tr><td colspan="6" class="p-4 text-center text-slate-400">Sin presupuestos registrados todavía.</td></tr>`
        : list.map(q => `
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="p-2">${esc(q.date)}</td>
            <td class="p-2 font-semibold text-slate-700">${esc(q.quote_number)}</td>
            <td class="p-2 text-slate-600">${esc(q.contact_name)}</td>
            <td class="p-2 text-right font-mono">$${fmtNum(q.total)}</td>
            <td class="p-2"><span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold text-${STATUS_COLOR[q.status] || 'slate'}-700 bg-${STATUS_COLOR[q.status] || 'slate'}-100">${STATUS_LABEL[q.status] || q.status}</span></td>
            <td class="p-2 text-center whitespace-nowrap">
              <button data-print="${q.id}" class="text-slate-500 hover:text-slate-700 font-semibold text-xs px-1">Imprimir</button>
              ${q.status === 'pendiente' ? `
                <a href="#/contabilidad/ventas/${q.id}" class="text-blue-600 hover:text-blue-800 font-semibold text-xs px-1">Convertir en Venta</a>
                <button data-reject="${q.id}" class="text-red-500 hover:text-red-700 font-semibold text-xs px-1">Rechazar</button>
              ` : ''}
            </td>
          </tr>
        `).join('');

      tbody.querySelectorAll('[data-print]').forEach(btn => btn.addEventListener('click', () => printQuote(btn.dataset.print)));
      tbody.querySelectorAll('[data-reject]').forEach(btn => btn.addEventListener('click', () => {
        if (!confirm('¿Marcar este presupuesto como rechazado?')) return;
        Store.update('quotes', { id: btn.dataset.reject, status: 'rechazado' });
        renderList();
      }));
    };

    const renderCart = () => {
      const tbody = document.getElementById('cart-tbody');
      tbody.innerHTML = cart.length === 0
        ? `<tr><td colspan="5" class="p-4 text-center text-slate-400">Carrito vacío. Agrega un producto.</td></tr>`
        : cart.map((l, i) => `
          <tr class="border-b border-slate-100">
            <td class="p-2">
              <div class="flex items-center gap-2">
                ${l.product.foto_url ? `<img src="${esc(l.product.foto_url)}" loading="lazy" decoding="async" class="w-8 h-8 object-cover rounded border border-slate-200" alt="">` : '<div class="w-8 h-8 rounded border border-slate-200 bg-slate-50"></div>'}
                <div class="min-w-0">
                  <div class="text-xs font-bold text-slate-800 truncate">${esc(l.product.name)}</div>
                  <div class="text-[10px] text-slate-400">${esc(l.product.sku_briggs)}</div>
                </div>
              </div>
            </td>
            <td class="p-2 text-right"><input data-cart-qty="${i}" type="number" min="1" step="1" value="${l.qty}" class="w-16 p-1 border border-slate-300 rounded text-xs text-right bg-white"></td>
            <td class="p-2 text-right"><input data-cart-price="${i}" type="number" min="0" step="0.01" value="${l.unitPrice}" class="w-20 p-1 border border-slate-300 rounded text-xs text-right bg-white"></td>
            <td class="p-2 text-right font-mono text-slate-700">$${fmtNum(l.qty * l.unitPrice)}</td>
            <td class="p-2 text-center"><button data-cart-del="${i}" class="text-red-500 hover:text-red-700 font-bold px-1">✕</button></td>
          </tr>
        `).join('');

      document.getElementById('cart-total').textContent = `$${fmtNum(cartTotal())}`;

      tbody.querySelectorAll('[data-cart-qty]').forEach(elInp => elInp.addEventListener('input', (e) => {
        cart[Number(e.target.dataset.cartQty)].qty = Math.max(1, num(e.target));
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

    // --- Selector visual de productos (foto + stock de referencia) ---
    const renderPickerList = () => {
      const list = document.getElementById('pk-list');
      const q = pickerQuery.trim().toLowerCase();
      const products = Store.getAll('products').filter(p =>
        !q || [p.sku_briggs, p.sku, p.name].some(v => String(v || '').toLowerCase().includes(q))
      );
      list.innerHTML = products.length === 0
        ? `<div class="p-4 text-center text-slate-400 text-sm">Sin productos que coincidan.</div>`
        : products.map(p => `
          <div class="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-100 hover:bg-slate-50">
            <div class="flex items-center gap-3 min-w-0">
              ${p.foto_url ? `<img src="${esc(p.foto_url)}" loading="lazy" decoding="async" class="w-10 h-10 object-cover rounded border border-slate-200 flex-shrink-0" alt="">` : '<div class="w-10 h-10 rounded border border-slate-200 bg-slate-50 flex-shrink-0"></div>'}
              <div class="min-w-0">
                <div class="text-xs font-bold text-blue-700">${esc(p.sku_briggs) || '—'}</div>
                <div class="text-sm text-slate-800 truncate">${esc(p.name) || ''}</div>
                <div class="text-xs text-slate-400">Stock: ${fmtNum(p.stock)} · Costo prom.: $${fmtNum(p.avg_cost)}</div>
              </div>
            </div>
            <button data-pick="${p.id}" class="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg w-8 h-8 flex-shrink-0">+</button>
          </div>
        `).join('');

      list.querySelectorAll('[data-pick]').forEach(btn => btn.addEventListener('click', () => {
        const p = Store.getById('products', btn.dataset.pick);
        if (!p) return;
        pickerProduct = p;
        document.getElementById('pk-confirm-name').textContent = `${p.sku_briggs || '—'} — ${p.name || ''}`;
        document.getElementById('pk-qty').value = 1;
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
      if (qty <= 0) { alert('Indica una cantidad mayor a 0.'); return; }
      if (unitPrice <= 0) { alert('Indica un precio mayor a 0.'); return; }
      const existing = cart.find(l => l.product.id === pickerProduct.id);
      if (existing) existing.qty += qty;
      else cart.push({ product: pickerProduct, qty, unitPrice });
      closePicker();
      renderCart();
    };

    const handleContactChange = (e) => {
      if (e.target.value === '__new__') {
        const c = quickAddContact(Store, 'cliente');
        contacts = Store.getAll('contacts');
        e.target.innerHTML = contactOptions(contacts, 'cliente', c ? c.id : '');
      }
    };

    // Un presupuesto no toca el diario ni el stock — es solo un documento
    // pendiente hasta que se convierte en una venta real.
    const saveQuote = () => {
      const date = document.getElementById('f-date').value;
      const contactId = document.getElementById('f-contact').value;
      const concepto = document.getElementById('f-concepto').value.trim();
      const msgEl = document.getElementById('quote-msg');
      msgEl.textContent = '';

      if (cart.length === 0) { msgEl.textContent = 'Agrega al menos un producto.'; return; }
      if (!date) { msgEl.textContent = 'La fecha es obligatoria.'; return; }

      const contact = contacts.find(c => c.id === contactId);
      const items = cart.map(l => ({ productId: l.product.id, name: l.product.name, sku_briggs: l.product.sku_briggs, foto_url: l.product.foto_url || '', qty: l.qty, unitPrice: l.unitPrice }));

      Store.insert('quotes', Store.newQuote({
        date, contact_id: contactId || '', contact_name: contact ? contact.name : '',
        concepto, items: JSON.stringify(items), total: cartTotal()
      }));

      cart = [];
      document.getElementById('f-contact').value = '';
      document.getElementById('f-concepto').value = '';
      renderCart();
      renderList();
    };

    const printQuote = (quoteId) => {
      printingQuote = Store.getById('quotes', quoteId);
      if (!printingQuote) return;
      const items = Store.getQuoteItems(printingQuote);
      document.getElementById('print-quote-number').textContent = printingQuote.quote_number;
      document.getElementById('print-quote-date').textContent = printingQuote.date;
      document.getElementById('print-quote-client').textContent = printingQuote.contact_name || '—';
      document.getElementById('print-quote-concepto').textContent = printingQuote.concepto || '';
      document.getElementById('print-quote-items').innerHTML = items.map(it => `
        <tr>
          <td class="py-2 border-b border-slate-200">${esc(it.name)}</td>
          <td class="py-2 border-b border-slate-200 text-right">${fmtNum(it.qty)}</td>
          <td class="py-2 border-b border-slate-200 text-right">$${fmtNum(it.unitPrice)}</td>
          <td class="py-2 border-b border-slate-200 text-right">$${fmtNum(it.qty * it.unitPrice)}</td>
        </tr>
      `).join('');
      document.getElementById('print-quote-total').textContent = `$${fmtNum(printingQuote.total)}`;

      const navbar = document.getElementById('navbar');
      if (navbar) navbar.classList.add('print:hidden');
      window.print();
    };

    const body = `
      <div class="${card} space-y-3">
        <div class="flex justify-between items-center">
          <h2 class="text-sm font-bold text-slate-700">Nuevo Presupuesto</h2>
          <button id="btn-add-product" class="${btnPrimary}">+ Agregar Producto</button>
        </div>
        <table class="w-full text-left text-xs">
          <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide"><th class="p-2">Producto</th><th class="p-2 text-right">Cant.</th><th class="p-2 text-right">Precio Unit.</th><th class="p-2 text-right">Subtotal</th><th class="p-2"></th></tr></thead>
          <tbody id="cart-tbody"></tbody>
        </table>
        <div class="text-right text-sm font-bold text-slate-700">Total: <span id="cart-total" class="text-emerald-600"></span></div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          <div>
            <label class="${label}">Fecha *</label>
            <input id="f-date" type="date" value="${new Date().toISOString().slice(0, 10)}" class="${input}">
          </div>
          <div>
            <label class="${label}">Cliente</label>
            <select id="f-contact" class="${input}">${contactOptions(contacts, 'cliente')}</select>
          </div>
          <div>
            <label class="${label}">Notas</label>
            <input id="f-concepto" type="text" placeholder="Venta al mayor…" class="${input}">
          </div>
        </div>
        <div id="quote-msg" class="text-xs text-red-600"></div>
        <button id="btn-save-quote" class="${btnPrimary}">Guardar Presupuesto (Pendiente)</button>
      </div>

      <div class="${card}">
        <h2 class="text-sm font-bold text-slate-700 mb-3">Presupuestos</h2>
        <table class="w-full text-left text-xs">
          <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide"><th class="p-2">Fecha</th><th class="p-2">N°</th><th class="p-2">Cliente</th><th class="p-2 text-right">Total</th><th class="p-2">Estado</th><th class="p-2 text-center">Acciones</th></tr></thead>
          <tbody id="quotes-tbody"></tbody>
        </table>
      </div>

      <!-- Vista imprimible — oculta en pantalla, solo visible al imprimir -->
      <div id="print-area" class="hidden print:block fixed inset-0 bg-white p-10 z-[9999]">
        <h1 class="text-2xl font-bold text-slate-900">Maestro de Costo — Presupuesto</h1>
        <div class="flex justify-between mt-4 text-sm">
          <div><span class="text-slate-500">N° de Presupuesto:</span> <span id="print-quote-number" class="font-bold"></span></div>
          <div><span class="text-slate-500">Fecha:</span> <span id="print-quote-date" class="font-bold"></span></div>
        </div>
        <div class="mt-2 text-sm"><span class="text-slate-500">Cliente:</span> <span id="print-quote-client" class="font-bold"></span></div>
        <div class="mt-1 text-sm text-slate-600" id="print-quote-concepto"></div>
        <table class="w-full text-left text-sm mt-6">
          <thead><tr class="text-xs font-semibold text-slate-500 uppercase border-b-2 border-slate-300">
            <th class="py-2">Producto</th><th class="py-2 text-right">Cant.</th><th class="py-2 text-right">Precio Unit.</th><th class="py-2 text-right">Subtotal</th>
          </tr></thead>
          <tbody id="print-quote-items"></tbody>
        </table>
        <div class="text-right text-lg font-bold mt-4">Total: <span id="print-quote-total"></span></div>
      </div>
    `;

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('quotes'), body) + `
      <!-- Modal Selector de Productos -->
      <div id="product-picker" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-xl p-5 space-y-3 max-h-[90vh] flex flex-col">
          <div class="flex justify-between items-center">
            <h3 class="text-lg font-bold text-slate-800">Agregar Producto</h3>
            <button id="pk-close" class="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none">✕</button>
          </div>
          <input id="pk-search" type="text" placeholder="Buscar por SKU o nombre…" class="${input}">
          <div id="pk-list" class="flex-1 overflow-y-auto border border-slate-200 rounded-lg min-h-0"></div>
          <div id="pk-confirm" class="hidden bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3">
            <span id="pk-confirm-name" class="font-bold text-slate-800 text-sm block"></span>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="${label}">Cantidad *</label>
                <input id="pk-qty" type="number" min="1" step="1" class="${input}">
              </div>
              <div>
                <label class="${label}">Precio Unit. ($) *</label>
                <input id="pk-price" type="number" min="0" step="0.01" class="${input}">
              </div>
            </div>
            <div class="flex justify-end">
              <button id="pk-add" class="${btnPrimary}">+ Agregar</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-add-product').addEventListener('click', openPicker);
    document.getElementById('btn-save-quote').addEventListener('click', saveQuote);
    document.getElementById('f-contact').addEventListener('change', handleContactChange);
    document.getElementById('pk-search').addEventListener('input', (e) => { pickerQuery = e.target.value; renderPickerList(); });
    document.getElementById('pk-add').addEventListener('click', addToCart);
    document.getElementById('pk-close').addEventListener('click', closePicker);
    document.getElementById('product-picker').addEventListener('click', (e) => { if (e.target.id === 'product-picker') closePicker(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !document.getElementById('product-picker').classList.contains('hidden')) closePicker();
    }, { signal });
    window.addEventListener('afterprint', () => {
      const navbar = document.getElementById('navbar');
      if (navbar) navbar.classList.remove('print:hidden');
    }, { signal });

    renderCart();
    renderList();

    return () => destroy.abort();
  }
};

export default Quotes;
