import Store from '../store.js';
import { fmtNum, fmtInt, esc } from '../utils.js';
import { contactOptions, quickAddContact } from '../components/contact-picker.js';
import { mountPOS } from '../components/pos.js';
import { printSalesDocument } from '../components/sales-document.js';
import { openBusinessProfileModal } from '../components/business-profile.js';
import { salesLines } from '../analytics.js';
import { computeTax, ivaTipoOf, taxSummaryRows } from '../fiscal.js';
import { createOrder } from '../orders.js';

// IVA de un presupuesto con la configuración fiscal actual (informativo: el
// impuesto se registra al convertirlo en venta).
// fiscal = false → venta sin factura: no lleva IVA.
function quoteTax(lines, fiscal = true) {
  const fs0 = Store.getFiscalSettings();
  const fs = { ...fs0, ivaEnabled: fs0.ivaEnabled && fiscal };
  const t = computeTax(lines.map(l => ({ amount: l.qty * l.unitPrice, tipo: ivaTipoOf(l.product) })), fs);
  return { rows: taxSummaryRows(t, fs), total: t.total };
}
export const isQuoteFiscal = (q) => !(q.fiscal === false || String(q.fiscal) === 'false');
export const isBs = (doc) => doc && doc.payment_currency === 'bs';
const fmtRate = (n) => Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Pago en bolívares: los precios en divisas se llevan a $ a tasa BCV con la
// tasa paralela (USDT), para no perder con la brecha cambiaria:
//   precio $BCV = precio en divisas × (USDT ÷ BCV);  Bs = precio $BCV × BCV.
export function fxFor(date) {
  const r = Store.ratesFor(date);
  const bcv = r ? Number(r.usd_bcv) || 0 : 0, usdt = r ? Number(r.usdt) || 0 : 0;
  return { bcv, usdt, factor: bcv > 0 && usdt > 0 ? Math.round((usdt / bcv) * 1e6) / 1e6 : 0, date: r ? r.date : '' };
}
export const paymentLabel = (doc) => isBs(doc)
  ? `Bolívares a tasa BCV ${fmtRate(doc.fx_bcv)} (precios ajustados por tasa USDT ${fmtRate(doc.fx_usdt)}, factor ×${Number(doc.fx_factor || 0).toFixed(4)}) · Total Bs ${fmtRate(Number(doc.total || 0) * Number(doc.fx_bcv || 0))}`
  : 'Divisas (USD en efectivo o USDT)';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { input, label } from '../components/accounting-shell.js';

const inputSm = input.replace('p-2', 'px-2 py-1.5');
const labelSm = 'block text-[10px] font-semibold text-slate-500 mb-0.5';

// Presupuestos: mismo punto de venta que Ventas, pero al emitir NO se genera
// asiento ni se toca el stock — solo queda el documento como Pendiente.
// Flujo: Pendiente → Aprobado → Convertido (en Ventas), o Rechazado.
// Rutas: #/contabilidad/presupuestos (inicio), …/nuevo, …/<id> (editar pendiente).

const STATUS = {
  pendiente: { label: 'Pendiente', color: 'amber', icon: '⏳' },
  aprobado: { label: 'Aprobado', color: 'blue', icon: '👍' },
  convertido: { label: 'Convertido en orden', color: 'emerald', icon: '✅' },
  rechazado: { label: 'Rechazado', color: 'slate', icon: '✕' }
};
const FILTERS = [['pendiente', 'Pendientes'], ['aprobado', 'Aprobados'], ['convertido', 'Convertidos'], ['rechazado', 'Rechazados'], ['todos', 'Todos']];

let homeFilter = 'pendiente';
let lastEmittedId = null;
let draftCart = []; // carrito del presupuesto nuevo, sobrevive al cambiar de pestaña
let draftFx = null; // forma de pago del borrador (sus precios ya están convertidos)

const today = () => new Date().toISOString().slice(0, 10);

export function quoteDocument(q) {
  const contact = q.contact_id ? Store.getById('contacts', q.contact_id) : null;
  return {
    kind: 'quote', title: q.kind === 'oferta' ? 'Oferta' : 'Presupuesto',
    number: q.quote_number, date: q.date, validUntil: q.valid_until,
    client: contact
      ? { name: contact.name, rif: contact.rif, address: contact.address, phone: contact.phone, email: contact.email }
      : { name: q.contact_name },
    items: Store.getQuoteItems(q).map(it => ({ name: it.name, sku: it.sku_briggs, qty: it.qty, unit: 'unidad', unitPrice: it.unitPrice, listPrice: it.listPrice, discountPct: it.discountPct })),
    notes: [q.concepto, `Forma de pago: ${paymentLabel(q)}`].filter(Boolean).join(' · '),
    terms: Store.getBusinessProfile().terms,
    fiscal: (() => {
      const items = Store.getQuoteItems(q);
      const t = quoteTax(items.map(it => ({ qty: it.qty, unitPrice: it.unitPrice, product: Store.getById('products', it.productId) })), isQuoteFiscal(q));
      return t.rows.length ? { ...t, rate: 0 } // sin equivalente en Bs: el pago en bolívares usa la tasa USDT ÷ BCV : null;
    })()
  };
}

// Mensaje de WhatsApp con el resumen de la oferta o presupuesto.
export function whatsappQuoteLink(q, contact) {
  let digits = String((contact && contact.phone) || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '58' + digits.slice(1);
  const biz = Store.getBusinessProfile().name;
  const items = Store.getQuoteItems(q);
  const text = [
    `Hola${contact && contact.name ? ' ' + contact.name : ''}, ${q.kind === 'oferta' ? 'te comparto una oferta especial' : 'te comparto el presupuesto'} ${q.quote_number}${biz ? ' de ' + biz : ''}:`,
    '',
    ...items.map(it => `• ${it.qty} x ${it.name} — $${fmtNum(it.unitPrice)} c/u`),
    '',
    `Total: $${fmtNum(q.total)}`,
    q.valid_until ? `Válido hasta: ${q.valid_until}` : ''
  ].filter((l, i, arr) => l !== '' || arr[i - 1] !== '').join('\n');
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
}

const printQuote = (id) => {
  const q = Store.getById('quotes', id);
  if (q) printSalesDocument(quoteDocument(q), Store.getBusinessProfile());
};

const Quotes = {
  async render(app, params) {
    const param = params && params[0];
    if (param) {
      // nuevo?cliente=<id>&tipo=oferta llega desde la ficha del cliente (CRM).
      const [path, qs] = String(param).split('?');
      const opts = Object.fromEntries(new URLSearchParams(qs || ''));
      return renderBuilder(app, path === 'nuevo' ? null : path, opts);
    }
    return renderHome(app);
  }
};

// ---------------------------------------------------------------------------
// Inicio: resumen por estado + lista filtrable
// ---------------------------------------------------------------------------
function renderHome(app) {
  const destroy = new AbortController();
  const { signal } = destroy;
  let query = '';

  const all = () => [...Store.getAll('quotes')].sort((a, b) =>
    String(b.date || '').localeCompare(String(a.date || '')) || new Date(b.created_at || 0) - new Date(a.created_at || 0));
  const isExpired = (q) => q.status === 'pendiente' && q.valid_until && q.valid_until < today();

  const renderTiles = () => {
    const quotes = all();
    const tile = (key) => {
      const st = STATUS[key];
      const list = quotes.filter(q => q.status === key);
      const sum = list.reduce((s, q) => s + (Number(q.total) || 0), 0);
      return `
        <button data-filter="${key}" class="text-left rounded-xl border p-4 transition ${homeFilter === key ? 'border-blue-500 ring-1 ring-blue-500 bg-white' : 'border-slate-200 bg-white hover:border-slate-300'}">
          <div class="flex items-center justify-between">
            <span class="text-xs text-slate-500">${st.label}${key === 'convertido' ? '' : 's'}</span>
            <span class="text-xl font-semibold text-slate-800">${fmtInt(list.length)}</span>
          </div>
          <div class="text-sm font-mono font-semibold text-slate-500 mt-1">$${fmtNum(sum)}</div>
        </button>`;
    };
    document.getElementById('q-tiles').innerHTML = ['pendiente', 'aprobado', 'convertido'].map(tile).join('');
    document.querySelectorAll('#q-tiles [data-filter]').forEach(b => b.addEventListener('click', () => { homeFilter = b.dataset.filter; renderAll(); }));
  };

  const renderFilters = () => {
    const quotes = all();
    document.getElementById('q-filters').innerHTML = FILTERS.map(([key, text]) => {
      const n = key === 'todos' ? quotes.length : quotes.filter(q => q.status === key).length;
      return `<button data-filter="${key}" class="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
        homeFilter === key ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300'
      }">${text} <span class="opacity-70">${n}</span></button>`;
    }).join('');
    document.querySelectorAll('#q-filters [data-filter]').forEach(b => b.addEventListener('click', () => { homeFilter = b.dataset.filter; renderAll(); }));
  };

  const renderList = () => {
    const q = query.trim().toLowerCase();
    const list = all()
      .filter(x => homeFilter === 'todos' || x.status === homeFilter)
      .filter(x => !q || [x.quote_number, x.contact_name, x.concepto].some(v => String(v || '').toLowerCase().includes(q)));
    const wrap = document.getElementById('q-list');
    wrap.innerHTML = list.length === 0
      ? `<div class="py-12 text-center text-slate-400">
           
           <p class="text-sm font-semibold">Sin presupuestos ${homeFilter === 'todos' ? '' : (FILTERS.find(f => f[0] === homeFilter) || [, ''])[1].toLowerCase()}</p>
         </div>`
      : list.map(x => {
        const st = STATUS[x.status] || STATUS.pendiente;
        const items = Store.getQuoteItems(x);
        const units = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
        const thumbs = items.slice(0, 4).map(it => it.foto_url
          ? `<img src="${esc(it.foto_url)}" loading="lazy" class="w-8 h-8 rounded-lg object-cover border-2 border-white -ml-2 first:ml-0" alt="">`
          : '<div class="w-8 h-8 rounded-lg bg-slate-100 border-2 border-white -ml-2 first:ml-0 flex items-center justify-center text-xs"></div>').join('');
        const btn = (attr, text, cls) => `<button ${attr}="${esc(x.id)}" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold ${cls}">${text}</button>`;
        return `
        <div class="flex flex-col md:flex-row md:items-center gap-3 p-4 rounded-2xl border ${x.id === lastEmittedId ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-100 bg-white'} hover:shadow-sm transition">
          <div class="flex items-center gap-3 flex-1 min-w-0">
            <div class="flex pl-2">${thumbs}</div>
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-mono font-bold text-slate-800">${esc(x.quote_number)}</span>
                ${x.kind === 'oferta' ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold text-violet-700 bg-violet-100">Oferta</span>' : ''}
                ${isQuoteFiscal(x) ? '' : '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold text-slate-600 bg-slate-100">Sin factura</span>'}
                ${isBs(x) ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold text-blue-700 bg-blue-50" title="${esc(paymentLabel(x))}">Pago en Bs · Bs ${fmtRate(Number(x.total) * Number(x.fx_bcv))}</span>` : ''}
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold text-${st.color}-700 bg-${st.color}-100">${st.label}</span>
                ${isExpired(x) ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold text-red-700 bg-red-100">Vencido</span>' : ''}
                ${x.converted_ref ? `<span class="text-[10px] font-mono text-emerald-700">→ ${esc(x.converted_ref)}</span>` : ''}
              </div>
              <div class="text-sm text-slate-600 truncate">${esc(x.contact_name) || '<span class="text-slate-400">Sin cliente</span>'}</div>
              <div class="text-[11px] text-slate-400">${esc(x.date)}${x.valid_until ? ' · válido hasta ' + esc(x.valid_until) : ''} · ${fmtInt(units)} unid. en ${items.length} producto${items.length === 1 ? '' : 's'}</div>
            </div>
          </div>
          <div class="text-xl font-semibold text-slate-900 md:w-32 md:text-right">$${fmtNum(x.total)}</div>
          <div class="flex flex-wrap gap-1.5 md:justify-end md:w-[22rem]">
            ${btn('data-print', 'Imprimir', 'bg-slate-100 text-slate-700 hover:bg-slate-200')}
            <a target="_blank" rel="noopener" href="${esc(whatsappQuoteLink(x, x.contact_id ? Store.getById('contacts', x.contact_id) : null))}" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600">WhatsApp</a>
            ${x.status === 'pendiente' ? btn('data-edit', 'Editar', 'bg-slate-100 text-slate-700 hover:bg-slate-200') : ''}
            ${x.status === 'pendiente' ? btn('data-approve', 'Aprobar', 'bg-blue-600 text-white hover:bg-blue-700') : ''}
            ${x.status === 'aprobado' ? btn('data-convert', 'Convertir en orden de venta', 'bg-emerald-600 text-white hover:bg-emerald-700') : ''}
            ${x.status === 'aprobado' ? btn('data-unapprove', 'Volver a pendiente', 'bg-slate-100 text-slate-700 hover:bg-slate-200') : ''}
            ${x.status === 'pendiente' || x.status === 'aprobado' ? btn('data-reject', 'Rechazar', 'text-red-600 hover:bg-red-50') : ''}
          </div>
        </div>`;
      }).join('');

    const on = (attr, fn) => wrap.querySelectorAll(`[${attr}]`).forEach(b => b.addEventListener('click', () => fn(b.getAttribute(attr))));
    on('data-print', printQuote);
    on('data-edit', id => { location.hash = `#/contabilidad/presupuestos/${id}`; });
    on('data-approve', id => { Store.update('quotes', { id, status: 'aprobado' }); homeFilter = 'aprobado'; lastEmittedId = id; renderAll(); });
    on('data-unapprove', id => { Store.update('quotes', { id, status: 'pendiente' }); renderAll(); });
    // Presupuesto aprobado → orden de venta (sin tocar inventario ni diario:
    // eso pasa con los anticipos, despachos y la factura de la orden).
    on('data-convert', id => {
      const q = Store.getById('quotes', id);
      if (!q) return;
      const products = Store.getAll('products');
      const items = Store.getQuoteItems(q).map(it => {
        const p = products.find(x => x.id === it.productId);
        const listPrice = Number(it.listPrice) || Number(it.unitPrice) || 0;
        return {
          productId: it.productId, name: it.name, sku: it.sku_briggs || '', qty: Number(it.qty),
          listPrice, discountPct: Number(it.discountPct) || 0, unitPrice: Number(it.unitPrice),
          ivaTipo: ivaTipoOf(p), dispatched: 0
        };
      });
      const contact = q.contact_id ? Store.getById('contacts', q.contact_id) : null;
      const order = createOrder({ date: new Date().toISOString().slice(0, 10), contact: contact || (q.contact_name ? { id: '', name: q.contact_name } : null), items, fiscal: isQuoteFiscal(q), notes: q.concepto || '', quoteId: q.id });
      Store.update('sales_orders', { id: order.id, payment_currency: q.payment_currency || 'divisas', fx_bcv: Number(q.fx_bcv) || 0, fx_usdt: Number(q.fx_usdt) || 0, fx_factor: Number(q.fx_factor) || 0 });
      Store.update('quotes', { id, status: 'convertido', converted_ref: order.order_number });
      location.hash = `#/contabilidad/ordenes/${order.id}`;
    });
    on('data-reject', id => {
      if (!confirm('¿Marcar este presupuesto como rechazado?')) return;
      Store.update('quotes', { id, status: 'rechazado' });
      renderAll();
    });
  };

  const renderAll = () => { renderTiles(); renderFilters(); renderList(); };

  const emitted = lastEmittedId ? Store.getById('quotes', lastEmittedId) : null;
  const body = `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-bold text-slate-800">Presupuestos</h2>
        <p class="text-xs text-slate-400">No generan asiento contable ni rebajan el inventario hasta convertirse en venta.</p>
      </div>
      <div class="flex items-center gap-2">
        <button id="btn-business" class="text-xs font-semibold text-slate-500 hover:text-blue-700 px-2">Datos de la empresa</button>
        <a href="#/contabilidad/presupuestos/nuevo" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2.5 px-4 rounded-xl shadow-sm transition">+ Nuevo presupuesto</a>
      </div>
    </div>
    ${emitted && emitted.status === 'pendiente' ? `
      <div class="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-800">
        <span>${emitted.kind === 'oferta' ? 'Oferta' : 'Presupuesto'} <strong>${esc(emitted.quote_number)}</strong> emitido por <strong>$${fmtNum(emitted.total)}</strong>. Quedó como pendiente.</span>
        <span class="flex gap-1.5 flex-shrink-0">
          <a target="_blank" rel="noopener" href="${esc(whatsappQuoteLink(emitted, emitted.contact_id ? Store.getById('contacts', emitted.contact_id) : null))}" class="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg">WhatsApp</a>
          <button id="btn-print-emitted" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg">Imprimir</button>
        </span>
      </div>` : ''}
    <div id="q-tiles" class="grid grid-cols-1 sm:grid-cols-3 gap-3"></div>
    <div class="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-3">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div id="q-filters" class="flex gap-2 overflow-x-auto pb-1"></div>
        <input id="q-search" type="text" placeholder="Buscar por N°, cliente o nota…" class="${input} md:max-w-xs">
      </div>
      <div id="q-list" class="space-y-2"></div>
    </div>
  `;
  app.innerHTML = AccountingShell.wrap(AccountingTabs.render('quotes'), body);

  document.getElementById('q-search').addEventListener('input', (e) => { query = e.target.value; renderList(); }, { signal });
  document.getElementById('btn-business').addEventListener('click', () => openBusinessProfileModal(Store), { signal });
  const printEmitted = document.getElementById('btn-print-emitted');
  if (printEmitted) printEmitted.addEventListener('click', () => printQuote(emitted.id), { signal });

  renderAll();
  return () => { lastEmittedId = null; destroy.abort(); };
}

// ---------------------------------------------------------------------------
// Nuevo / editar: mismo punto de venta que Ventas, sin asiento ni stock
// ---------------------------------------------------------------------------
function renderBuilder(app, editId, opts = {}) {
  const destroy = new AbortController();
  const { signal } = destroy;
  const editing = editId ? Store.getById('quotes', editId) : null;
  if (editId && (!editing || editing.status !== 'pendiente')) {
    location.hash = '#/contabilidad/presupuestos';
    return;
  }

  let contacts = Store.getAll('contacts');
  const products = Store.getAll('products');
  const kind = editing ? (editing.kind || 'presupuesto') : (opts.tipo === 'oferta' ? 'oferta' : 'presupuesto');
  const isOffer = kind === 'oferta';
  const presetContact = editing ? editing.contact_id : (opts.cliente || '');
  // Una oferta desde el CRM empieza vacía (no mezcla el borrador del presupuesto).
  const source = editing
    ? Store.getQuoteItems(editing)
    : (opts.cliente ? [] : draftCart);
  const currentContact = () => contacts.find(c => c.id === (document.getElementById('f-contact') || {}).value);
  // ⭐ Sugeridos: lo que este cliente ya ha comprado.
  const suggested = new Set();
  const refreshSuggested = () => {
    suggested.clear();
    const c = currentContact() || contacts.find(x => x.id === presetContact);
    if (!c) return;
    for (const l of salesLines()) if (l.productId && (l.contactId === c.id || l.entidad.trim() === String(c.name).trim())) suggested.add(l.productId);
  };
  const initialCart = source
    .map(it => ({ product: products.find(p => p.id === it.productId), qty: it.qty, unitPrice: it.unitPrice, listPrice: it.listPrice, discountPct: it.discountPct }))
    .filter(l => l.product && l.qty > 0);

  const body = `
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <a href="#/contabilidad/presupuestos" class="w-9 h-9 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-600">←</a>
        <div>
          <h2 class="text-lg font-bold text-slate-800">${editing ? `Editar ${isOffer ? 'oferta' : 'presupuesto'} ${esc(editing.quote_number)}` : (isOffer ? 'Nueva oferta' : 'Nuevo presupuesto')}</h2>
        </div>
      </div>
    </div>
    <div id="pos-root"></div>
  `;
  app.innerHTML = AccountingShell.wrap(AccountingTabs.render('quotes'), body);

  // Forma de pago: 'divisas' o 'bs'. fxApplied = factor con el que están los
  // precios del carrito ahora (1 en divisas).
  const fromDraft = !editing && !opts.cliente && draftFx;
  let payMode = fromDraft ? draftFx.payMode : (editing && isBs(editing) ? 'bs' : 'divisas');
  let fxApplied = fromDraft ? draftFx.fxApplied : (payMode === 'bs' ? (Number(editing.fx_factor) || 1) : 1);
  let fxUsed = fromDraft ? draftFx.fxUsed : (payMode === 'bs' ? { bcv: Number(editing.fx_bcv), usdt: Number(editing.fx_usdt), factor: Number(editing.fx_factor) } : null);
  const fiscalNow = () => ((document.getElementById('f-fiscal') || {}).value || (editing && !isQuoteFiscal(editing) ? 'no' : 'si')) !== 'no';
  const pos = mountPOS(document.getElementById('pos-root'), {
    products: () => products,
    cart: initialCart,
    capToStock: false, // importadora: se presupuesta todo el catálogo, se entrega después
    title: isOffer ? 'Oferta' : 'Presupuesto',
    actionLabel: editing ? 'Guardar cambios' : (isOffer ? 'Emitir oferta' : 'Emitir presupuesto'),
    suggestedIds: suggested,
    // En bolívares, los precios de lista se multiplican por el factor USDT/BCV.
    priceFor: (p) => {
      const pr = Store.priceFor(p, currentContact());
      if (fxApplied === 1) return pr;
      const k = fxApplied;
      return { ...pr, listPrice: Math.round(pr.listPrice * k * 100) / 100, unitPrice: Math.round(pr.unitPrice * k * 100) / 100 };
    },
    summary: (cart) => quoteTax(cart, fiscalNow()),
    headerFieldsHtml: `
      <div class="grid grid-cols-[minmax(0,1fr)_9.5rem] gap-2">
        <div>
          <label class="${label}">Cliente</label>
          <select id="f-contact" class="${input}">${contactOptions(contacts, 'cliente', presetContact)}</select>
        </div>
        <div>
          <label class="${label}">Venta</label>
          <select id="f-fiscal" class="${input}">
            <option value="si" ${!editing || isQuoteFiscal(editing) ? 'selected' : ''}>Con factura (IVA)</option>
            <option value="no" ${editing && !isQuoteFiscal(editing) ? 'selected' : ''}>Sin factura</option>
          </select>
        </div>
      </div>
      <div>
        <label class="${label}">Forma de pago</label>
        <div class="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100">
          <button type="button" data-pay="divisas" class="py-1.5 rounded-md text-xs">Divisas (USD / USDT)</button>
          <button type="button" data-pay="bs" class="py-1.5 rounded-md text-xs">Bolívares (tasa BCV)</button>
        </div>
        <p id="f-fx" class="text-[11px] text-slate-500 mt-1"></p>
      </div>
      <button id="f-custom" type="button" class="text-xs font-medium text-blue-600 hover:text-blue-700">+ Producto que no está en el catálogo</button>`,
    // Fecha, validez, notas y descuento en un desplegable: el carrito cabe
    // en la pantalla y el botón de emitir queda siempre a la vista.
    footerFieldsHtml: `
      <details id="f-more" class="rounded-lg border border-slate-200 bg-white" ${isOffer ? 'open' : ''}>
        <summary class="px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer flex items-center justify-between gap-2">
          <span>Fecha, validez, notas y descuento</span><span class="text-slate-400">▾</span>
        </summary>
        <div class="px-2.5 pb-2.5 space-y-2">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="${labelSm}">Fecha *</label>
              <input id="f-date" type="date" value="${esc(editing ? editing.date : today())}" class="${inputSm}">
            </div>
            <div>
              <label class="${labelSm}">Válido hasta</label>
              <input id="f-valid" type="date" value="${esc(editing ? (editing.valid_until || '') : Store.newQuote().valid_until)}" class="${inputSm}">
            </div>
          </div>
          <div>
            <label class="${labelSm}">Notas</label>
            <input id="f-concepto" type="text" placeholder="${isOffer ? 'Oferta especial por volumen…' : 'Venta al mayor…'}" value="${esc(editing ? editing.concepto : '')}" class="${inputSm}">
          </div>
          <div class="flex items-end gap-2">
            <div class="flex-1">
              <label class="${labelSm}">Descuento a toda la ${isOffer ? 'oferta' : 'cotización'} %</label>
              <input id="f-discount" type="number" min="0" max="90" step="0.5" placeholder="0" class="${inputSm}">
            </div>
            <button id="f-discount-apply" type="button" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white">Aplicar</button>
          </div>
        </div>
      </details>`,
    onCartChange: (cart) => {
      setTimeout(renderFx, 0);
      if (!editing && !opts.cliente) {
        draftCart = cart.map(l => ({ productId: l.product.id, qty: l.qty, unitPrice: l.unitPrice, listPrice: l.listPrice, discountPct: l.discountPct }));
        draftFx = { payMode, fxApplied, fxUsed };
      }
    }
  });

  pos.onAction(() => {
    const cart = pos.getCart();
    const date = document.getElementById('f-date').value;
    const validUntil = document.getElementById('f-valid').value;
    const contactId = document.getElementById('f-contact').value;
    const concepto = document.getElementById('f-concepto').value.trim();

    if (cart.length === 0) { pos.flash('Agrega al menos un producto.'); return; }
    const noPrice = cart.find(l => !(l.unitPrice > 0));
    if (noPrice) { pos.flash(`Indica el precio de "${noPrice.product.name}".`); return; }
    if (!date) { document.getElementById('f-more').open = true; pos.flash('La fecha es obligatoria.'); return; }
    if (validUntil && validUntil < date) { pos.flash('"Válido hasta" no puede ser anterior a la fecha.'); return; }

    const contact = contacts.find(c => c.id === contactId);
    const items = cart.map(l => ({
      productId: l.product.id, name: l.product.name, sku_briggs: l.product.sku_briggs,
      foto_url: l.product.foto_url || '', qty: l.qty, unitPrice: l.unitPrice,
      listPrice: l.listPrice, discountPct: l.discountPct || 0
    }));
    const fields = {
      date, valid_until: validUntil, contact_id: contactId || '', contact_name: contact ? contact.name : '',
      concepto, items: JSON.stringify(items), total: Math.round(pos.total() * 100) / 100, kind,
      fiscal: fiscalNow(),
      payment_currency: payMode,
      fx_bcv: payMode === 'bs' && fxUsed ? fxUsed.bcv : 0,
      fx_usdt: payMode === 'bs' && fxUsed ? fxUsed.usdt : 0,
      fx_factor: payMode === 'bs' && fxUsed ? fxUsed.factor : 0
    };

    if (editing) {
      Store.update('quotes', { id: editing.id, ...fields });
      lastEmittedId = editing.id;
    } else {
      lastEmittedId = Store.insert('quotes', Store.newQuote(fields)).id;
      draftCart = [];
      draftFx = null;
    }
    homeFilter = 'pendiente';
    location.hash = '#/contabilidad/presupuestos';
  });

  document.getElementById('f-contact').addEventListener('change', (e) => {
    if (e.target.value === '__new__') {
      const c = quickAddContact(Store, 'cliente');
      contacts = Store.getAll('contacts');
      e.target.innerHTML = contactOptions(contacts, 'cliente', c ? c.id : '');
    }
    refreshSuggested();
    pos.refresh();
    pos.repriceAll();
  }, { signal });
  document.getElementById('f-fiscal').addEventListener('change', () => pos.refresh(), { signal });
  // Botón de forma de pago.
  function renderFx() {
    document.querySelectorAll('[data-pay]').forEach(b => {
      const on = b.dataset.pay === payMode;
      b.className = 'py-1.5 rounded-md text-xs ' + (on ? 'bg-white text-slate-900 font-semibold shadow-sm' : 'text-slate-500 hover:text-slate-800');
    });
    const el = document.getElementById('f-fx');
    if (!el) return;
    if (payMode !== 'bs' || !fxUsed) { el.textContent = 'Precios en divisas: se cobran en USD en efectivo o USDT.'; return; }
    el.innerHTML = `USDT ${fmtRate(fxUsed.usdt)} ÷ BCV ${fmtRate(fxUsed.bcv)} = <strong>×${fxUsed.factor.toFixed(4)}</strong> · precios en $ a tasa BCV · <strong>Total Bs ${fmtRate(pos.total() * fxUsed.bcv)}</strong>`;
  }
  document.querySelectorAll('[data-pay]').forEach(b => b.addEventListener('click', () => {
    const mode = b.dataset.pay;
    if (mode === payMode) return;
    if (mode === 'bs') {
      const fx = fxFor(document.getElementById('f-date').value || today());
      if (!(fx.factor > 0)) { pos.flash('No hay tasa BCV y USDT guardadas para esa fecha. Revísalas en IVA → Tasas BCV.'); return; }
      pos.scalePrices(fx.factor / fxApplied);
      fxApplied = fx.factor; fxUsed = fx;
    } else {
      pos.scalePrices(1 / fxApplied);
      fxApplied = 1; fxUsed = null;
    }
    payMode = mode;
    if (!editing && !opts.cliente) draftFx = { payMode, fxApplied, fxUsed };
    renderFx();
  }, { signal }));
  renderFx();
  document.getElementById('f-custom').addEventListener('click', () => customProductModal((p, qty, price) => {
    products.push(p);
    pos.addProduct(p, qty, Math.round(price * fxApplied * 100) / 100);
  }), { signal });
  document.getElementById('f-discount-apply').addEventListener('click', () => {
    const pct = Math.max(0, Math.min(90, Number(document.getElementById('f-discount').value) || 0));
    if (!pos.getCart().length) { pos.flash('Agrega productos antes de aplicar el descuento.'); return; }
    pos.applyDiscount(pct);
  }, { signal });
  refreshSuggested();
  pos.refresh();

  return () => destroy.abort();
}

// Producto que todavía no está en el catálogo (se negocia antes de tenerlo):
// se crea en el catálogo con un código provisional (PROV-0001…), que se
// cambia por el código BRG en Productos cuando se vaya a importar. (Un
// producto sin código se considera basura y se borra, por eso el provisional.)
const nextProvisionalCode = () => {
  const n = Store.getAll('products').map(p => String(p.sku_briggs || '').match(/^PROV-(\d+)$/i)).filter(Boolean).map(m => Number(m[1]));
  return `PROV-${String((n.length ? Math.max(...n) : 0) + 1).padStart(4, '0')}`;
};
function customProductModal(onDone) {
  const cats = [...new Set(Store.getAll('products').map(p => String(p.category || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const wrap = document.createElement('div');
  wrap.className = 'fixed inset-0 z-50 bg-black/30 flex items-start sm:items-center justify-center p-3';
  wrap.innerHTML = `
    <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-4 space-y-3">
      <div class="flex justify-between items-center">
        <h2 class="text-sm font-semibold text-slate-900">Producto fuera del catálogo</h2>
        <button data-close class="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
      </div>
      <p class="text-xs text-slate-400">Queda en el catálogo con un código provisional (PROV-…). Cámbialo por el código BRG en Productos cuando lo vayas a importar.</p>
      <div><label class="${label}">Nombre del producto *</label><input id="cp-name" type="text" class="${input}" placeholder="Ej.: Grifo monomando lavaplatos negro"></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="${label}">Precio de venta *</label><input id="cp-price" type="number" min="0" step="0.01" class="${input}"></div>
        <div><label class="${label}">Cantidad</label><input id="cp-qty" type="number" min="1" step="1" value="1" class="${input}"></div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="${label}">Categoría</label>
          <select id="cp-cat" class="${input}"><option value="">— Sin categoría —</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
        <div><label class="${label}">IVA</label>
          <select id="cp-iva" class="${input}"><option value="general">IVA general</option><option value="reducida">IVA reducido</option><option value="exento">Exento</option></select></div>
      </div>
      <div id="cp-msg" class="text-xs text-red-600"></div>
      <div class="flex justify-end gap-2">
        <button data-close class="px-3 py-2 rounded-lg text-sm border border-slate-200 text-slate-700 hover:bg-slate-50">Cancelar</button>
        <button id="cp-save" class="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white">Agregar al presupuesto</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const $ = (id) => wrap.querySelector('#' + id);
  $('cp-name').focus();
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) wrap.remove(); });
  $('cp-save').addEventListener('click', () => {
    const name = $('cp-name').value.trim();
    const price = Math.round((Number($('cp-price').value) || 0) * 100) / 100;
    const qty = Math.max(1, Math.floor(Number($('cp-qty').value) || 1));
    if (!name) { $('cp-msg').textContent = 'Escribe el nombre del producto.'; return; }
    if (!(price > 0)) { $('cp-msg').textContent = 'Indica el precio de venta.'; return; }
    const p = Store.insert('products', { name, sale_price: price, category: $('cp-cat').value, iva_tipo: $('cp-iva').value, sku_briggs: nextProvisionalCode(), stock: 0, avg_cost: 0 });
    wrap.remove();
    onDone(p, qty, price);
  });
}

export default Quotes;
