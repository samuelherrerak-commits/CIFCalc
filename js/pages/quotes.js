import Store from '../store.js';
import { fmtNum, fmtInt, esc } from '../utils.js';
import { contactOptions, quickAddContact } from '../components/contact-picker.js';
import { mountPOS } from '../components/pos.js';
import { printSalesDocument } from '../components/sales-document.js';
import { openBusinessProfileModal } from '../components/business-profile.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { input, label } from '../components/accounting-shell.js';

// Presupuestos: mismo punto de venta que Ventas, pero al emitir NO se genera
// asiento ni se toca el stock — solo queda el documento como Pendiente.
// Flujo: Pendiente → Aprobado → Convertido (en Ventas), o Rechazado.
// Rutas: #/contabilidad/presupuestos (inicio), …/nuevo, …/<id> (editar pendiente).

const STATUS = {
  pendiente: { label: 'Pendiente', color: 'amber', icon: '⏳' },
  aprobado: { label: 'Aprobado', color: 'blue', icon: '👍' },
  convertido: { label: 'Convertido en venta', color: 'emerald', icon: '✅' },
  rechazado: { label: 'Rechazado', color: 'slate', icon: '✕' }
};
const FILTERS = [['pendiente', 'Pendientes'], ['aprobado', 'Aprobados'], ['convertido', 'Convertidos'], ['rechazado', 'Rechazados'], ['todos', 'Todos']];

let homeFilter = 'pendiente';
let lastEmittedId = null;
let draftCart = []; // carrito del presupuesto nuevo, sobrevive al cambiar de pestaña

const today = () => new Date().toISOString().slice(0, 10);

function quoteDocument(q) {
  const contact = q.contact_id ? Store.getById('contacts', q.contact_id) : null;
  return {
    kind: 'quote', number: q.quote_number, date: q.date, validUntil: q.valid_until,
    client: contact
      ? { name: contact.name, rif: contact.rif, address: contact.address, phone: contact.phone, email: contact.email }
      : { name: q.contact_name },
    items: Store.getQuoteItems(q).map(it => ({ name: it.name, sku: it.sku_briggs, qty: it.qty, unit: 'unidad', unitPrice: it.unitPrice })),
    notes: q.concepto,
    terms: Store.getBusinessProfile().terms
  };
}

const printQuote = (id) => {
  const q = Store.getById('quotes', id);
  if (q) printSalesDocument(quoteDocument(q), Store.getBusinessProfile());
};

const Quotes = {
  async render(app, params) {
    const param = params && params[0];
    if (param) return renderBuilder(app, param === 'nuevo' ? null : param);
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
        <button data-filter="${key}" class="text-left rounded-2xl border-2 p-4 transition ${homeFilter === key ? `border-${st.color}-400 bg-${st.color}-50` : 'border-slate-100 bg-white hover:border-slate-200'}">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold uppercase tracking-wide text-${st.color}-600">${st.icon} ${st.label}${key === 'convertido' ? '' : 's'}</span>
            <span class="text-xl font-black text-slate-800">${fmtInt(list.length)}</span>
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
           <div class="text-4xl mb-2">📄</div>
           <p class="text-sm font-semibold">Sin presupuestos ${homeFilter === 'todos' ? '' : (FILTERS.find(f => f[0] === homeFilter) || [, ''])[1].toLowerCase()}</p>
         </div>`
      : list.map(x => {
        const st = STATUS[x.status] || STATUS.pendiente;
        const items = Store.getQuoteItems(x);
        const units = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
        const thumbs = items.slice(0, 4).map(it => it.foto_url
          ? `<img src="${esc(it.foto_url)}" loading="lazy" class="w-8 h-8 rounded-lg object-cover border-2 border-white -ml-2 first:ml-0" alt="">`
          : '<div class="w-8 h-8 rounded-lg bg-slate-100 border-2 border-white -ml-2 first:ml-0 flex items-center justify-center text-xs">📦</div>').join('');
        const btn = (attr, text, cls) => `<button ${attr}="${esc(x.id)}" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold ${cls}">${text}</button>`;
        return `
        <div class="flex flex-col md:flex-row md:items-center gap-3 p-4 rounded-2xl border ${x.id === lastEmittedId ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-100 bg-white'} hover:shadow-sm transition">
          <div class="flex items-center gap-3 flex-1 min-w-0">
            <div class="flex pl-2">${thumbs}</div>
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-mono font-bold text-slate-800">${esc(x.quote_number)}</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold text-${st.color}-700 bg-${st.color}-100">${st.label}</span>
                ${isExpired(x) ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold text-red-700 bg-red-100">Vencido</span>' : ''}
                ${x.converted_ref ? `<span class="text-[10px] font-mono text-emerald-700">→ ${esc(x.converted_ref)}</span>` : ''}
              </div>
              <div class="text-sm text-slate-600 truncate">${esc(x.contact_name) || '<span class="text-slate-400">Sin cliente</span>'}</div>
              <div class="text-[11px] text-slate-400">${esc(x.date)}${x.valid_until ? ' · válido hasta ' + esc(x.valid_until) : ''} · ${fmtInt(units)} unid. en ${items.length} producto${items.length === 1 ? '' : 's'}</div>
            </div>
          </div>
          <div class="text-xl font-black text-slate-900 md:w-32 md:text-right">$${fmtNum(x.total)}</div>
          <div class="flex flex-wrap gap-1.5 md:justify-end md:w-[22rem]">
            ${btn('data-print', '🖨 Imprimir', 'bg-slate-100 text-slate-700 hover:bg-slate-200')}
            ${x.status === 'pendiente' ? btn('data-edit', 'Editar', 'bg-slate-100 text-slate-700 hover:bg-slate-200') : ''}
            ${x.status === 'pendiente' ? btn('data-approve', '👍 Aprobar', 'bg-blue-600 text-white hover:bg-blue-700') : ''}
            ${x.status === 'aprobado' ? btn('data-convert', '🛒 Convertir en venta', 'bg-emerald-600 text-white hover:bg-emerald-700') : ''}
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
    on('data-convert', id => { location.hash = `#/contabilidad/ventas/${id}`; });
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
        <button id="btn-business" class="text-xs font-semibold text-slate-500 hover:text-blue-700 px-2">⚙ Datos de la empresa</button>
        <a href="#/contabilidad/presupuestos/nuevo" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2.5 px-4 rounded-xl shadow-sm transition">+ Nuevo presupuesto</a>
      </div>
    </div>
    ${emitted && emitted.status === 'pendiente' ? `
      <div class="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-800">
        <span>✅ Presupuesto <strong>${esc(emitted.quote_number)}</strong> emitido por <strong>$${fmtNum(emitted.total)}</strong>. Quedó como pendiente.</span>
        <button id="btn-print-emitted" class="flex-shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg">🖨 Imprimir</button>
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
function renderBuilder(app, editId) {
  const destroy = new AbortController();
  const { signal } = destroy;
  const editing = editId ? Store.getById('quotes', editId) : null;
  if (editId && (!editing || editing.status !== 'pendiente')) {
    location.hash = '#/contabilidad/presupuestos';
    return;
  }

  let contacts = Store.getAll('contacts');
  const products = Store.getAll('products');
  const source = editing
    ? Store.getQuoteItems(editing)
    : draftCart;
  const initialCart = source
    .map(it => ({ product: products.find(p => p.id === it.productId), qty: it.qty, unitPrice: it.unitPrice }))
    .filter(l => l.product && l.qty > 0);

  const body = `
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <a href="#/contabilidad/presupuestos" class="w-9 h-9 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-600">←</a>
        <div>
          <h2 class="text-lg font-bold text-slate-800">${editing ? `Editar presupuesto ${esc(editing.quote_number)}` : 'Nuevo presupuesto'}</h2>
          <p class="text-xs text-slate-400">Elige los productos y cantidades. Al emitirlo queda pendiente; no toca la contabilidad ni el inventario.</p>
        </div>
      </div>
    </div>
    <div id="pos-root"></div>
  `;
  app.innerHTML = AccountingShell.wrap(AccountingTabs.render('quotes'), body);

  const pos = mountPOS(document.getElementById('pos-root'), {
    products: () => products,
    cart: initialCart,
    capToStock: false,
    title: 'Presupuesto',
    actionLabel: editing ? 'Guardar cambios' : 'Emitir presupuesto',
    headerFieldsHtml: `
      <div>
        <label class="${label}">Cliente</label>
        <select id="f-contact" class="${input}">${contactOptions(contacts, 'cliente', editing ? editing.contact_id : '')}</select>
      </div>`,
    footerFieldsHtml: `
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="${label}">Fecha *</label>
          <input id="f-date" type="date" value="${esc(editing ? editing.date : today())}" class="${input}">
        </div>
        <div>
          <label class="${label}">Válido hasta</label>
          <input id="f-valid" type="date" value="${esc(editing ? (editing.valid_until || '') : Store.newQuote().valid_until)}" class="${input}">
        </div>
      </div>
      <div>
        <label class="${label}">Notas</label>
        <input id="f-concepto" type="text" placeholder="Venta al mayor…" value="${esc(editing ? editing.concepto : '')}" class="${input}">
      </div>`,
    onCartChange: (cart) => {
      if (!editing) draftCart = cart.map(l => ({ productId: l.product.id, qty: l.qty, unitPrice: l.unitPrice }));
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
    if (!date) { pos.flash('La fecha es obligatoria.'); return; }
    if (validUntil && validUntil < date) { pos.flash('"Válido hasta" no puede ser anterior a la fecha.'); return; }

    const contact = contacts.find(c => c.id === contactId);
    const items = cart.map(l => ({
      productId: l.product.id, name: l.product.name, sku_briggs: l.product.sku_briggs,
      foto_url: l.product.foto_url || '', qty: l.qty, unitPrice: l.unitPrice
    }));
    const fields = {
      date, valid_until: validUntil, contact_id: contactId || '', contact_name: contact ? contact.name : '',
      concepto, items: JSON.stringify(items), total: Math.round(pos.total() * 100) / 100
    };

    if (editing) {
      Store.update('quotes', { id: editing.id, ...fields });
      lastEmittedId = editing.id;
    } else {
      lastEmittedId = Store.insert('quotes', Store.newQuote(fields)).id;
      draftCart = [];
    }
    homeFilter = 'pendiente';
    location.hash = '#/contabilidad/presupuestos';
  });

  document.getElementById('f-contact').addEventListener('change', (e) => {
    if (e.target.value !== '__new__') return;
    const c = quickAddContact(Store, 'cliente');
    contacts = Store.getAll('contacts');
    e.target.innerHTML = contactOptions(contacts, 'cliente', c ? c.id : '');
  }, { signal });

  return () => destroy.abort();
}

export default Quotes;
