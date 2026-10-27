import Store from '../store.js';
import { fmtNum, esc } from '../utils.js';
import { buildIncomeLines, buildTwoLineEntry, withRoundingPlug } from '../accounting.js';
import { computeTax, ivaTipoOf, taxSummaryRows } from '../fiscal.js';
import { contactOptions, quickAddContact } from '../components/contact-picker.js';
import { mountPOS } from '../components/pos.js';
import { printSalesDocument } from '../components/sales-document.js';
import { openBusinessProfileModal } from '../components/business-profile.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { input, label } from '../components/accounting-shell.js';

// Campos compactos del carrito.
const inputSm = input.replace('p-2', 'px-2 py-1.5');
const labelSm = 'block text-[10px] font-semibold text-slate-500 mb-0.5';

// El carrito sobrevive al cambiar de pestaña o al refresco tras la sincronización.
let savedCart = []; // [{ productId, qty, unitPrice }]
// Venta fiscal (con factura: IVA y Libro de Ventas) o sin factura (nota de
// entrega: sin IVA, solo el asiento contable). Se recuerda mientras la app
// esté abierta.
let saleFiscal = true;
// Las ventas sin factura usan el prefijo NE- (nota de entrega) en vez de VTA-.
export const isNonFiscalRef = (refDoc) => String(refDoc || '').startsWith('NE-');

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
  // Desglose de IVA desde el registro fiscal de la venta (si lo tiene).
  const fd = Store.getAll('fiscal_docs').find(d => d.book === 'ventas' && d.ref_doc === refDoc);
  const fs = Store.getFiscalSettings();
  const fiscal = fd ? {
    rows: taxSummaryRows({ ...fd, base_general: Number(fd.base_general), base_reducida: Number(fd.base_reducida), exempt: Number(fd.exempt), tax_general: Number(fd.tax_general), tax_reducida: Number(fd.tax_reducida) }, { ...fs, ivaEnabled: true })
      .concat(Number(fd.withheld) > 0 ? [['IVA retenido por el cliente', -Number(fd.withheld)]] : []),
    total: Number(fd.total),
    rate: Number(fd.tasa_bcv) || 0,
    invoice: fd.invoice_number, control: fd.control_number
  } : null;
  return {
    kind: 'sale', number: refDoc, date: lines[0].entry_date,
    title: isNonFiscalRef(refDoc) ? 'Nota de entrega' : undefined,
    client: contact ? { name: contact.name, rif: contact.rif, address: contact.address, phone: contact.phone, email: contact.email } : { name: entidad },
    items,
    paymentMethod: payAccount ? (payAccount.tipo_especifico === 'Clientes' ? `Crédito (${payAccount.nombre})` : payAccount.nombre) : (payLine ? payLine.cuenta_contable : ''),
    notes: concepto && concepto !== 'Venta' ? concepto : '',
    fiscal
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
    const fs = Store.getFiscalSettings();
    const selectedContact = () => contacts.find(c => c.id === (document.getElementById('f-contact') || {}).value);
    // Sin factura no se cobra IVA: el monto cobrado es todo ingreso.
    const isFiscal = () => fs.ivaEnabled && saleFiscal;
    const taxOf = (cart) => computeTax(cart.map(l => ({ amount: l.qty * l.unitPrice, tipo: ivaTipoOf(l.product) })), { ...fs, ivaEnabled: isFiscal() });
    // IVA que retiene el cliente si es contribuyente especial (75 % o 100 %).
    const retentionOf = (t) => {
      const pct = Number((selectedContact() || {}).iva_retention_pct) || 0;
      return isFiscal() && pct > 0 ? Math.round(t.tax * pct) / 100 : 0;
    };
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
      { key: 'efectivo', label: 'Efectivo', te: 'Efectivo', codigo: '1.1.01.01' },
      { key: 'banco', label: 'Banco', te: 'Banco', codigo: '1.1.01.02' },
      { key: 'credito', label: 'Crédito', te: 'Clientes', codigo: '1.1.02.01' }
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
        <button type="button" data-pay="${m.key}" title="Forma de pago" class="py-1.5 rounded-md text-xs transition ${
          payMethod === m.key ? 'bg-white text-slate-900 font-semibold shadow-sm' : 'text-slate-500 hover:text-slate-900'
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
      const fiscalByRef = new Map(Store.getAll('fiscal_docs').filter(d => d.book === 'ventas' && d.ref_doc).map(d => [d.ref_doc, d]));
      const byRef = new Map();
      for (const m of Store.getAll('movements').filter(x => x.source === 'sale')) {
        if (!byRef.has(m.ref_doc)) byRef.set(m.ref_doc, []);
        byRef.get(m.ref_doc).push(m);
      }
      return [...byRef.entries()]
        .map(([refDoc, lines]) => {
          const first = [...lines].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
          const items = lines.filter(l => Number(l.cantidad) > 0 && l.unidad === 'unidades' && Number(l.precio_venta) > 0);
          // Total cobrado (con IVA): lo que entró al debe, menos el redondeo.
          const total = lines.filter(l => Number(l.debit) > 0 && String(l.codigo_cuenta) !== '6.9.01.01').reduce((s, l) => s + (Number(l.debit) || 0), 0);
          const fd = fiscalByRef.get(refDoc);
          return { refDoc, date: first.entry_date, created: first.created_at, entidad: first.entidad, itemCount: items.length, total, fiscal: fd ? (fd.invoice_number || 'sí') : null, nonFiscal: isNonFiscalRef(refDoc) };
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
            <td class="p-2 font-mono">${esc(s.refDoc)}
              ${s.fiscal ? `<span class="ml-1 font-sans text-[10px] text-slate-500">· Factura${s.fiscal !== 'sí' ? ' ' + esc(s.fiscal) : ''}</span>` : ''}
              ${s.nonFiscal ? '<span class="ml-1 font-sans text-[10px] text-slate-400">· Sin factura</span>' : ''}</td>
            <td class="p-2 text-slate-500">${esc(s.entidad) || '—'}</td>
            <td class="p-2 text-right">${s.itemCount}</td>
            <td class="p-2 text-right font-mono text-slate-900">$${fmtNum(s.total)}</td>
            <td class="p-2 text-right"><button data-print-sale="${esc(s.refDoc)}" class="text-slate-500 hover:text-blue-600">Imprimir</button></td>
          </tr>
        `).join('');
      tbody.querySelectorAll('[data-print-sale]').forEach(b => b.addEventListener('click', () => printSale(b.dataset.printSale)));
    };

    const body = `
      ${sourceQuote ? `<div class="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">Carrito precargado desde el presupuesto <strong>${esc(sourceQuote.quote_number)}</strong>.${shortages.length ? `<div class="mt-1 text-amber-700">⚠ Sin existencia suficiente, se ajustó: ${esc(shortages.join(', '))}.</div>` : ''}</div>` : ''}
      <div id="pos-root"></div>
      <div class="bg-white border border-slate-200 rounded-xl p-4">
        <div class="flex items-center justify-between gap-2 mb-3">
          <h2 class="text-sm font-semibold text-slate-900">Ventas recientes</h2>
          <button id="btn-business" class="text-xs text-slate-500 hover:text-blue-600">Datos de la empresa</button>
        </div>
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
      // Mejor de: promoción vigente o descuento especial del cliente elegido.
      priceFor: (p) => Store.priceFor(p, contacts.find(c => c.id === (document.getElementById('f-contact') || {}).value)),
      actionLabel: 'Procesar venta',
      summary: (cart) => {
        const t = taxOf(cart);
        const ret = retentionOf(t);
        return { rows: taxSummaryRows(t, { ...fs, ivaEnabled: isFiscal() }).concat(ret ? [[`Retención IVA ${selectedContact().iva_retention_pct}% (la paga el cliente al SENIAT)`, -ret]] : []), total: t.total };
      },
      headerFieldsHtml: `
        <div>
          <label class="${label}">Cliente</label>
          <select id="f-contact" class="${input}">${contactOptions(contacts, 'cliente', sourceQuote ? sourceQuote.contact_id : '')}</select>
        </div>`,
      // Lo que se decide en cada venta (tipo y forma de pago) queda a la
      // vista; fecha, concepto y N.º de factura van en un desplegable para
      // que el carrito quepa en la pantalla sin desplazarse.
      footerFieldsHtml: `
        ${fs.ivaEnabled ? `<div id="f-fiscal" class="grid grid-cols-2 gap-0.5 p-0.5 rounded-lg bg-slate-100"></div>` : ''}
        <div>
          <div id="f-pay-methods" class="grid grid-cols-3 gap-0.5 p-0.5 rounded-lg bg-slate-100"></div>
          <select id="f-pay-account" class="${inputSm} hidden mt-1.5"></select>
        </div>
        <details id="f-more" class="rounded-lg border border-slate-200 bg-white">
          <summary class="px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer flex items-center justify-between gap-2">
            <span>Fecha, concepto${fs.ivaEnabled ? ' y N.º de factura' : ''}</span><span id="f-more-sum" class="text-slate-400 truncate"></span>
          </summary>
          <div class="px-2.5 pb-2.5 space-y-2">
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="${labelSm}">Fecha *</label>
                <input id="f-date" type="date" value="${new Date().toISOString().slice(0, 10)}" class="${inputSm}">
              </div>
              <div>
                <label class="${labelSm}">Concepto</label>
                <input id="f-concepto" type="text" placeholder="Venta" class="${inputSm}">
              </div>
            </div>
            ${fs.ivaEnabled ? `
            <div id="f-invoice-fields" class="grid grid-cols-2 gap-2">
              <div>
                <label class="${labelSm}">N.º factura fiscal</label>
                <input id="f-invoice" type="text" placeholder="Opcional" class="${inputSm}">
              </div>
              <div>
                <label class="${labelSm}">N.º de control</label>
                <input id="f-control" type="text" placeholder="00-000000" class="${inputSm}">
              </div>
            </div>` : ''}
          </div>
        </details>
`,
      onCartChange: (cart) => {
        if (!sourceQuote) savedCart = cart.map(l => ({ productId: l.product.id, qty: l.qty, unitPrice: l.unitPrice }));
      }
    });

    // Una venta solo toca Caja/Banco/CxC (debe) e Ingresos por Ventas (haber) —
    // el inventario es de referencia (stock en products), nunca una cuenta de
    // activo tocada aquí.
    const renderFiscal = () => {
      const wrap = document.getElementById('f-fiscal');
      if (!wrap) return;
      const opt = (val, text, hint) => `
        <button type="button" data-fiscal="${val}" title="${hint}" class="py-1.5 px-2 rounded-md text-xs transition ${
          saleFiscal === val ? 'bg-white text-slate-900 font-semibold shadow-sm' : 'text-slate-500 hover:text-slate-900'
        }">${text}</button>`;
      wrap.innerHTML = opt(true, 'Con factura', 'Fiscal · IVA y Libro de Ventas') + opt(false, 'Sin factura', 'Nota de entrega · sin IVA');
      wrap.querySelectorAll('[data-fiscal]').forEach(b => b.addEventListener('click', () => {
        saleFiscal = b.dataset.fiscal === 'true';
        renderFiscal();
        pos.refresh(); // el total cambia (con o sin IVA)
      }));
      document.getElementById('f-invoice-fields').classList.toggle('hidden', !saleFiscal);
      renderMoreSummary();
    };
    // Resumen del desplegable cerrado: fecha (si no es hoy), concepto y factura.
    const renderMoreSummary = () => {
      const el = document.getElementById('f-more-sum');
      if (!el) return;
      const d = document.getElementById('f-date').value;
      const parts = [d && d !== new Date().toISOString().slice(0, 10) ? d.split('-').reverse().join('/') : 'Hoy'];
      const c = document.getElementById('f-concepto').value.trim();
      if (c) parts.push(c);
      const inv = (document.getElementById('f-invoice') || {}).value;
      if (isFiscal() && inv) parts.push(`Fact. ${inv}`);
      el.textContent = parts.join(' · ');
    };

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
      if (!date) { document.getElementById('f-more').open = true; pos.flash('La fecha es obligatoria.'); return; }
      if (!payMethod) { pos.flash('Elige la forma de pago: Efectivo, Banco o Crédito.'); return; }
      if (payMethod === 'credito' && !contactId) { pos.flash('Una venta a crédito necesita un cliente (queda en Cuentas por Cobrar).'); return; }

      const contact = contacts.find(c => c.id === contactId);
      const entidad = contact ? contact.name : '';
      const paymentAccount = resolvePaymentAccount();
      if (!paymentAccount) { pos.flash('No se encontró la cuenta de la forma de pago.'); return; }
      const revAccount = revenueAccount();
      if (!revAccount) { pos.flash('Falta la cuenta "Ingresos por Ventas" en el Plan de Cuentas.'); return; }

      const fiscal = isFiscal();
      const refDoc = `${fiscal ? 'VTA' : 'NE'}-${Date.now().toString().slice(-6)}`;
      const tax = taxOf(cart);
      const withheld = retentionOf(tax);
      const ivaAccount = tax.tax > 0 ? (accounts.find(a => a.codigo === '2.1.04.01') || Store.ensureCatalogAccount('2.1.04.01')) : null;
      const retAccount = withheld > 0 ? (accounts.find(a => a.codigo === '1.1.03.02') || Store.ensureCatalogAccount('1.1.03.02')) : null;
      let allLines = [];
      cart.forEach((l, i) => {
        // El ingreso es la base imponible (sin IVA); si los precios incluyen
        // IVA, el precio unitario registrado también es sin IVA.
        const base = tax.lineBases[i];
        allLines = allLines.concat(buildIncomeLines({
          date, total: base, concepto: `${concepto} | ${l.product.name}`, entidad, refDoc,
          paymentAccount, revenueAccount: revAccount,
          sale: {
            qty: l.qty, unidad: 'unidades', unitPrice: fs.pricesIncludeIva ? base / l.qty : l.unitPrice, codigo: l.product.sku_briggs || '',
            // Costo del producto al momento de vender (margen exacto en Reportes) y precio de lista.
            unitCost: Number((Store.getById('products', l.product.id) || l.product).avg_cost) || 0,
            listPrice: l.listPrice || Number(l.product.sale_price) || l.unitPrice
          }
        }));
      });
      // IVA débito fiscal: lo cobra la empresa (Caja/Banco/CxC) salvo la parte
      // que retiene el cliente, que queda como IVA retenido a descontar.
      if (tax.tax > 0) {
        if (tax.tax - withheld > 0) allLines = allLines.concat(buildTwoLineEntry({ date, total: tax.tax - withheld, concepto: `${concepto} | IVA débito fiscal`, entidad, refDoc, debitAccount: paymentAccount, creditAccount: ivaAccount }));
        if (withheld > 0) allLines = allLines.concat(buildTwoLineEntry({ date, total: withheld, concepto: `${concepto} | IVA retenido por el cliente`, entidad, refDoc, debitAccount: retAccount, creditAccount: ivaAccount }));
      }
      Store.postJournalRows(withRoundingPlug(allLines, diffAccount(), date, refDoc), { source: 'sale' });

      for (const l of cart) {
        const current = Store.getById('products', l.product.id) || l.product;
        Store.update('products', { id: l.product.id, stock: (Number(current.stock) || 0) - l.qty });
      }
      if (sourceQuote) Store.update('quotes', { id: sourceQuote.id, status: 'convertido', converted_ref: refDoc });
      // Registro para el Libro de Ventas (solo ventas con factura).
      if (fiscal) {
        Store.insert('fiscal_docs', Store.newFiscalDoc({
          book: 'ventas', date, doc_type: 'factura',
          invoice_number: (document.getElementById('f-invoice') || {}).value?.trim() || '',
          control_number: (document.getElementById('f-control') || {}).value?.trim() || '',
          rif: contact ? contact.rif || '' : '', name: entidad || 'Consumidor final',
          total: tax.total, exempt: tax.exempt, base_general: tax.base_general, tax_general: tax.tax_general,
          base_reducida: tax.base_reducida, tax_reducida: tax.tax_reducida,
          withheld, withholding_date: withheld > 0 ? date : '',
          ref_doc: refDoc, tasa_bcv: Store.usdRateFor(date)
        }));
      }

      const total = pos.total();
      products = Store.getAll('products');
      document.getElementById('f-contact').value = '';
      document.getElementById('f-concepto').value = '';
      ['f-invoice', 'f-control'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      renderMoreSummary();
      pos.setCart([]);
      payMethod = '';
      renderPayMethods();
      pos.refresh();
      pos.success(`
        <div class="flex items-center justify-between gap-2">
          <span>${fiscal ? 'Venta' : 'Venta sin factura'} <strong>${esc(refDoc)}</strong> registrada por <strong>$${fmtNum(total)}</strong>${entidad ? ' a ' + esc(entidad) : ''}${entidad.endsWith('.') ? '' : '.'}</span>
          <button id="btn-print-last" class="flex-shrink-0 border border-slate-300 hover:bg-white text-slate-700 font-medium px-3 py-1.5 rounded-lg">Imprimir nota</button>
        </div>`);
      document.getElementById('btn-print-last').addEventListener('click', () => printSale(refDoc));
      renderRecentSales();
    });

    document.getElementById('f-contact').addEventListener('change', (e) => {
      if (e.target.value === '__new__') {
        const c = quickAddContact(Store, 'cliente');
        contacts = Store.getAll('contacts');
        e.target.innerHTML = contactOptions(contacts, 'cliente', c ? c.id : '');
      }
      pos.repriceAll(); // el descuento del cliente cambia los precios
    }, { signal });
    document.getElementById('btn-business').addEventListener('click', () => openBusinessProfileModal(Store), { signal });

    ['f-date', 'f-concepto', 'f-invoice'].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('input', renderMoreSummary, { signal }); });
    renderPayMethods();
    renderFiscal();
    renderMoreSummary();
    renderRecentSales();
    return () => destroy.abort();
  }
};

export default Sales;
