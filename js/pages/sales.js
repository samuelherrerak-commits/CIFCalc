import Store from '../store.js';
import { fmtNum, esc } from '../utils.js';
import { buildIncomeLines, withRoundingPlug } from '../accounting.js';
import { contactOptions, quickAddContact } from '../components/contact-picker.js';
import { mountPOS } from '../components/pos.js';
import { printSalesDocument } from '../components/sales-document.js';
import { openBusinessProfileModal } from '../components/business-profile.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { input, label } from '../components/accounting-shell.js';

// El carrito sobrevive al cambiar de pestaña o al refresco tras la sincronización.
let savedCart = []; // [{ productId, qty, unitPrice }]

// Reconstruye la nota de venta desde el diario (las líneas de una venta
// comparten ref_doc; las de Ingresos por Ventas llevan cantidad/precio y el
// nombre del producto tras "|" en el concepto).
export function saleDocumentFromJournal(refDoc) {
  const lines = Store.getAll('movements').filter(m => m.source === 'sale' && m.ref_doc === refDoc);
  if (lines.length === 0) return null;
  const itemLines = lines.filter(l => Number(l.cantidad) > 0 && Number(l.precio_venta) > 0 && Number(l.credit) > 0);
  const products = Store.getAll('products');
  const items = itemLines.map(l => {
    const parts = String(l.concepto || '').split('|');
    const name = (parts[1] || parts[0] || '').trim();
    const product = products.find(p => p.name === name);
    return { name, sku: product ? product.sku_briggs : '', qty: Number(l.cantidad), unit: 'unidad', unitPrice: Number(l.precio_venta) };
  });
  const payLine = lines.find(l => Number(l.debit) > 0);
  const payAccount = payLine ? Store.getAll('accounts').find(a => a.codigo === payLine.codigo_cuenta) : null;
  const entidad = lines[0].entidad || '';
  const contact = Store.getAll('contacts').find(c => c.name === entidad);
  const concepto = itemLines.length ? String(itemLines[0].concepto || '').split('|')[0].trim() : '';
  return {
    kind: 'sale', number: refDoc, date: lines[0].entry_date,
    client: contact ? { name: contact.name, rif: contact.rif, address: contact.address, phone: contact.phone, email: contact.email } : { name: entidad },
    items,
    paymentMethod: payAccount ? (payAccount.tipo_especifico === 'Clientes' ? `Crédito (${payAccount.nombre})` : payAccount.nombre) : (payLine ? payLine.cuenta_contable : ''),
    notes: concepto && concepto !== 'Venta' ? concepto : ''
  };
}

const printSale = (refDoc) => {
  const doc = saleDocumentFromJournal(refDoc);
  if (doc) printSalesDocument(doc, Store.getBusinessProfile());
};

const Sales = {
  async render(app, params) {
    const destroy = new AbortController();
    const { signal } = destroy;

    const accounts = Store.getAll('accounts').filter(a => a.is_active !== false);
    let contacts = Store.getAll('contacts');
    let products = Store.getAll('products');

    // Si se llega desde Presupuestos ("Convertir en Venta"), se precarga el
    // carrito con los mismos productos/cantidades/precios del presupuesto.
    const sourceQuoteId = params && params[0] ? params[0] : null;
    const sourceQuote = sourceQuoteId ? Store.getById('quotes', sourceQuoteId) : null;
    const initialCart = [];
    const shortages = [];
    const source = sourceQuote ? Store.getQuoteItems(sourceQuote) : savedCart;
    for (const it of source) {
      const product = products.find(p => p.id === it.productId);
      const qty = Math.min(it.qty, Number(product && product.stock) || 0);
      if (qty < it.qty) shortages.push(`${it.name || (product && product.name) || 'Producto'} (${qty} de ${it.qty})`);
      if (product && qty > 0) initialCart.push({ product, qty, unitPrice: it.unitPrice });
    }

    // Forma de pago estilo LegalYa: tres botones. Cada uno usa la(s) cuenta(s)
    // con ese tipo específico; si no hay ninguna (p. ej. se borró el plan de
    // cuentas) se crea la del catálogo sugerido al procesar la venta.
    const PAY_METHODS = [
      { key: 'efectivo', label: '💵 Efectivo', te: 'Efectivo', codigo: '1.1.01.01' },
      { key: 'banco', label: '🏦 Banco', te: 'Banco', codigo: '1.1.01.02' },
      { key: 'credito', label: '🧾 Crédito', te: 'Clientes', codigo: '1.1.02.01' }
    ];
    let payMethod = '';
    const accountsFor = (m) => accounts.filter(a => a.tipo_especifico === m.te).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    const diffAccount = () => accounts.find(a => a.codigo === '6.9.01.01') || Store.ensureCatalogAccount('6.9.01.01');
    const revenueAccount = () => accounts.find(a => a.codigo === '4.1.01.01')
      || accounts.find(a => a.nombre === 'Ingresos por Ventas' && a.tipo === 'Ingreso')
      || Store.ensureCatalogAccount('4.1.01.01');

    const renderPayMethods = () => {
      const wrap = document.getElementById('f-pay-methods');
      wrap.innerHTML = PAY_METHODS.map(m => `
        <button type="button" data-pay="${m.key}" class="py-2.5 rounded-xl text-xs font-bold border-2 transition ${
          payMethod === m.key ? 'border-blue-600 bg-blue-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'
        }">${m.label}</button>`).join('');
      wrap.querySelectorAll('[data-pay]').forEach(b => b.addEventListener('click', () => { payMethod = b.dataset.pay; pos.flash(''); renderPayMethods(); }));
      // Si hay más de una cuenta de ese tipo (p. ej. dos bancos), se elige cuál.
      const m = PAY_METHODS.find(x => x.key === payMethod);
      const list = m ? accountsFor(m) : [];
      const sel = document.getElementById('f-pay-account');
      sel.classList.toggle('hidden', list.length < 2);
      if (list.length >= 2 && !list.some(a => a.id === sel.value)) {
        sel.innerHTML = list.map(a => `<option value="${a.id}">${esc(a.codigo)} — ${esc(a.nombre)}</option>`).join('');
      }
    };
    const resolvePaymentAccount = () => {
      const m = PAY_METHODS.find(x => x.key === payMethod);
      if (!m) return null;
      const list = accountsFor(m);
      if (list.length >= 2) return list.find(a => a.id === document.getElementById('f-pay-account').value) || list[0];
      return list[0] || Store.ensureCatalogAccount(m.codigo);
    };

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
        ? `<tr><td colspan="6" class="py-4 text-center text-slate-400">Sin ventas registradas todavía.</td></tr>`
        : list.map(s => `
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="p-2">${esc(s.date)}</td>
            <td class="p-2 font-mono">${esc(s.refDoc)}</td>
            <td class="p-2 text-slate-500">${esc(s.entidad) || '—'}</td>
            <td class="p-2 text-right">${s.itemCount}</td>
            <td class="p-2 text-right font-mono font-semibold text-emerald-700">$${fmtNum(s.total)}</td>
            <td class="p-2 text-right"><button data-print-sale="${esc(s.refDoc)}" class="text-blue-600 hover:text-blue-800 font-semibold">🖨 Nota</button></td>
          </tr>
        `).join('');
      tbody.querySelectorAll('[data-print-sale]').forEach(b => b.addEventListener('click', () => printSale(b.dataset.printSale)));
    };

    const body = `
      ${sourceQuote ? `<div class="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">Carrito precargado desde el presupuesto <strong>${esc(sourceQuote.quote_number)}</strong>.${shortages.length ? `<div class="mt-1 text-amber-700">⚠ Sin existencia suficiente, se ajustó: ${esc(shortages.join(', '))}.</div>` : ''}</div>` : ''}
      <div class="flex justify-end -mb-2">
        <button id="btn-business" class="text-xs font-semibold text-slate-500 hover:text-blue-700">⚙ Datos de la empresa (para la nota de venta)</button>
      </div>
      <div id="pos-root"></div>
      <div class="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
        <h2 class="text-sm font-bold text-slate-700 mb-3">Ventas Recientes</h2>
        <table class="w-full text-left text-xs">
          <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide"><th class="p-2">Fecha</th><th class="p-2">Referencia</th><th class="p-2">Cliente</th><th class="p-2 text-right">Ítems</th><th class="p-2 text-right">Total</th><th class="p-2"></th></tr></thead>
          <tbody id="sales-tbody"></tbody>
        </table>
      </div>
    `;
    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('sales'), body);

    const pos = mountPOS(document.getElementById('pos-root'), {
      products: () => products,
      cart: initialCart,
      capToStock: true,
      title: 'Venta',
      actionLabel: 'Procesar venta',
      headerFieldsHtml: `
        <div>
          <label class="${label}">Cliente</label>
          <select id="f-contact" class="${input}">${contactOptions(contacts, 'cliente', sourceQuote ? sourceQuote.contact_id : '')}</select>
        </div>`,
      footerFieldsHtml: `
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="${label}">Fecha *</label>
            <input id="f-date" type="date" value="${new Date().toISOString().slice(0, 10)}" class="${input}">
          </div>
          <div>
            <label class="${label}">Concepto</label>
            <input id="f-concepto" type="text" placeholder="Venta" class="${input}">
          </div>
        </div>
        <div>
          <label class="${label}">Forma de pago *</label>
          <div id="f-pay-methods" class="grid grid-cols-3 gap-2"></div>
          <select id="f-pay-account" class="${input} hidden mt-2"></select>
        </div>
`,
      onCartChange: (cart) => {
        if (!sourceQuote) savedCart = cart.map(l => ({ productId: l.product.id, qty: l.qty, unitPrice: l.unitPrice }));
      }
    });

    // Una venta solo toca Caja/Banco/CxC (debe) e Ingresos por Ventas (haber) —
    // el inventario es de referencia (stock en products), nunca una cuenta de
    // activo tocada aquí.
    pos.onAction(() => {
      const cart = pos.getCart();
      const date = document.getElementById('f-date').value;
      const contactId = document.getElementById('f-contact').value;
      const concepto = document.getElementById('f-concepto').value.trim() || 'Venta';

      if (cart.length === 0) { pos.flash('Agrega al menos un producto al carrito.'); return; }
      const noPrice = cart.find(l => !(l.unitPrice > 0));
      if (noPrice) { pos.flash(`Indica el precio de "${noPrice.product.name}".`); return; }
      const over = cart.find(l => l.qty > (Number((Store.getById('products', l.product.id) || l.product).stock) || 0));
      if (over) { pos.flash(`La existencia de "${over.product.name}" cambió; revisa la cantidad.`); return; }
      if (!date) { pos.flash('La fecha es obligatoria.'); return; }
      if (!payMethod) { pos.flash('Elige la forma de pago: Efectivo, Banco o Crédito.'); return; }
      if (payMethod === 'credito' && !contactId) { pos.flash('Una venta a crédito necesita un cliente (queda en Cuentas por Cobrar).'); return; }

      const contact = contacts.find(c => c.id === contactId);
      const entidad = contact ? contact.name : '';
      const paymentAccount = resolvePaymentAccount();
      if (!paymentAccount) { pos.flash('No se encontró la cuenta de la forma de pago.'); return; }
      const revAccount = revenueAccount();
      if (!revAccount) { pos.flash('Falta la cuenta "Ingresos por Ventas" en el Plan de Cuentas.'); return; }

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
        Store.update('products', { id: l.product.id, stock: (Number(current.stock) || 0) - l.qty });
      }
      if (sourceQuote) Store.update('quotes', { id: sourceQuote.id, status: 'convertido', converted_ref: refDoc });

      const total = pos.total();
      products = Store.getAll('products');
      document.getElementById('f-contact').value = '';
      document.getElementById('f-concepto').value = '';
      pos.setCart([]);
      payMethod = '';
      renderPayMethods();
      pos.refresh();
      pos.success(`
        <div class="flex items-center justify-between gap-2">
          <span>✅ Venta <strong>${esc(refDoc)}</strong> registrada por <strong>$${fmtNum(total)}</strong>${entidad ? ' a ' + esc(entidad) : ''}${entidad.endsWith('.') ? '' : '.'}</span>
          <button id="btn-print-last" class="flex-shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg">🖨 Imprimir nota</button>
        </div>`);
      document.getElementById('btn-print-last').addEventListener('click', () => printSale(refDoc));
      renderRecentSales();
    });

    document.getElementById('f-contact').addEventListener('change', (e) => {
      if (e.target.value !== '__new__') return;
      const c = quickAddContact(Store, 'cliente');
      contacts = Store.getAll('contacts');
      e.target.innerHTML = contactOptions(contacts, 'cliente', c ? c.id : '');
    }, { signal });
    document.getElementById('btn-business').addEventListener('click', () => openBusinessProfileModal(Store), { signal });

    renderPayMethods();
    renderRecentSales();
    return () => destroy.abort();
  }
};

export default Sales;
