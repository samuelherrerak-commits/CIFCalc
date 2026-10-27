import Store from '../store.js';
import { esc, fmtNum, fmtInt } from '../utils.js';
import { salesLines, customerStats, receivableByEntidad, daysBetween } from '../analytics.js';
import { printSalesDocument } from '../components/sales-document.js';
import { saleDocumentFromJournal } from './sales.js';
import { quoteDocument, whatsappQuoteLink } from './quotes.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { btnPrimary, card, input, label } from '../components/accounting-shell.js';

// CRM: directorio de clientes y proveedores con etapa, bitácora, tareas de
// seguimiento, historial de compras, productos que compra cada cliente y
// ofertas personalizadas. Rutas: #/contabilidad/contactos (lista) y
// #/contabilidad/contactos/<id> (ficha).

const TYPE_LABEL = { cliente: 'Cliente', proveedor: 'Proveedor', ambos: 'Cliente y Proveedor' };
export const STAGES = {
  prospecto: { label: 'Prospecto', color: 'sky', icon: '🌱' },
  activo: { label: 'Activo', color: 'emerald', icon: '✅' },
  inactivo: { label: 'Inactivo', color: 'amber', icon: '💤' },
  perdido: { label: 'Perdido', color: 'slate', icon: '✕' }
};
const CHANNELS = {
  llamada: 'Llamada', whatsapp: 'WhatsApp', visita: 'Visita', correo: 'Correo', nota: 'Nota'
};
const today = () => new Date().toISOString().slice(0, 10);
// Vuelve a pintar la vista actual pasando por el router (limpia los listeners).
const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
const stageOf = (c) => STAGES[c.stage] || STAGES.activo;
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const ago = (date) => {
  if (!date) return 'Nunca';
  const d = daysBetween(date, today());
  return d <= 0 ? 'Hoy' : d === 1 ? 'Ayer' : `Hace ${d} días`;
};
export const waLink = (phone, text = '') => {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '58' + digits.slice(1); // número venezolano local → +58
  return digits ? `https://wa.me/${digits}${text ? '?text=' + encodeURIComponent(text) : ''}` : '';
};

// La fecha del próximo seguimiento del contacto = la tarea pendiente más próxima.
function refreshNextFollowup(contactId) {
  const next = Store.getAll('crm_activities')
    .filter(a => a.contact_id === contactId && a.kind === 'tarea' && !(a.done === true || String(a.done) === 'true') && a.due_date)
    .map(a => a.due_date).sort()[0] || '';
  Store.update('contacts', { id: contactId, next_followup_date: next });
}

function contactModal(existing, onSaved) {
  const c = existing || Store.newContact();
  const wrap = document.createElement('div');
  wrap.className = 'fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4';
  wrap.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <div class="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
        <h3 class="font-bold text-slate-800">${existing ? 'Editar contacto' : 'Nuevo contacto'}</h3>
        <button data-close class="text-slate-400 text-xl leading-none">✕</button>
      </div>
      <div class="p-5 grid grid-cols-2 gap-3">
        <div class="col-span-2"><label class="${label}">Nombre / Razón social *</label><input id="m-name" class="${input}" value="${esc(c.name)}"></div>
        <div><label class="${label}">Rol</label><select id="m-type" class="${input}">${Object.entries(TYPE_LABEL).map(([k, v]) => `<option value="${k}" ${c.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div><label class="${label}">Etapa</label><select id="m-stage" class="${input}">${Object.entries(STAGES).map(([k, v]) => `<option value="${k}" ${(c.stage || 'activo') === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
        <div><label class="${label}">Cédula / RIF</label><input id="m-rif" class="${input}" value="${esc(c.rif)}" placeholder="J-12345678-9"></div>
        <div><label class="${label}">Teléfono / WhatsApp</label><input id="m-phone" class="${input}" value="${esc(c.phone)}" placeholder="0414-1234567"></div>
        <div class="col-span-2"><label class="${label}">Correo</label><input id="m-email" type="email" class="${input}" value="${esc(c.email)}"></div>
        <div class="col-span-2"><label class="${label}">Dirección</label><input id="m-address" class="${input}" value="${esc(c.address)}"></div>
        <div><label class="${label}">Descuento especial %</label><input id="m-discount" type="number" min="0" max="90" step="0.5" class="${input}" value="${Number(c.discount_pct) || ''}" placeholder="0"></div>
        <div><label class="${label}">Etiquetas</label><input id="m-tags" class="${input}" value="${esc(c.tags)}" placeholder="mayorista, constructora"></div>
        <div class="col-span-2"><label class="${label}">Retención de IVA (contribuyente especial)</label><select id="m-retention" class="${input}">${[[0, 'No retiene'], [75, 'Retiene el 75 % del IVA'], [100, 'Retiene el 100 % del IVA']].map(([v, t]) => `<option value="${v}" ${Number(c.iva_retention_pct) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="col-span-2"><label class="${label}">Notas</label><textarea id="m-notes" rows="3" class="${input}">${esc(c.notes)}</textarea></div>
        <p class="col-span-2 text-[11px] text-slate-400">El descuento especial se aplica solo en Ventas cuando eliges a este cliente (si hay una promoción mayor, se usa la promoción).</p>
        <div id="m-msg" class="col-span-2 text-xs text-red-600"></div>
      </div>
      <div class="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
        <button data-close class="text-sm font-semibold text-slate-500 px-3">Cancelar</button>
        <button id="m-save" class="${btnPrimary}">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const $ = (id) => wrap.querySelector('#' + id);
  const close = () => wrap.remove();
  wrap.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  $('m-save').addEventListener('click', () => {
    const rec = {
      name: $('m-name').value.trim(), type: $('m-type').value, stage: $('m-stage').value, rif: $('m-rif').value.trim(),
      phone: $('m-phone').value.trim(), email: $('m-email').value.trim(), address: $('m-address').value.trim(),
      discount_pct: Math.max(0, Math.min(90, Number($('m-discount').value) || 0)), tags: $('m-tags').value.trim(), notes: $('m-notes').value.trim(),
      iva_retention_pct: Number($('m-retention').value) || 0
    };
    if (!rec.name) { $('m-msg').textContent = 'El nombre es obligatorio.'; return; }
    if (rec.rif && !Store.isContactRifUnique(rec.rif, existing ? existing.id : null)) { $('m-msg').textContent = 'Ya existe un contacto con ese RIF.'; return; }
    const saved = existing ? Store.update('contacts', { id: existing.id, ...rec }) : Store.insert('contacts', Store.newContact(rec));
    close();
    onSaved && onSaved(saved);
  });
  $('m-name').focus();
}

const Contacts = {
  async render(app, params) {
    const id = params && params[0];
    return id ? renderProfile(app, id) : renderList(app);
  }
};

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------
let listState = { query: '', type: '', stage: '', sort: 'revenue' };

function renderList(app) {
  const destroy = new AbortController();
  const { signal } = destroy;
  const stats = customerStats();
  const receivables = receivableByEntidad();
  const statFor = (c) => stats.get(c.id) || stats.get('name:' + c.name) || null;
  const t = today();

  const draw = () => {
    const contacts = Store.getAll('contacts');
    const q = listState.query.trim().toLowerCase();
    const rows = contacts
      .filter(c => !listState.type || c.type === listState.type || (listState.type === 'cliente' && c.type === 'ambos'))
      .filter(c => !listState.stage || (c.stage || 'activo') === listState.stage)
      .filter(c => !q || [c.name, c.rif, c.email, c.phone, c.tags].some(v => String(v || '').toLowerCase().includes(q)))
      .map(c => ({ c, s: statFor(c), owed: receivables.get(String(c.name || '').trim()) || 0 }));
    const sorters = {
      revenue: (a, b) => (b.s ? b.s.revenue : 0) - (a.s ? a.s.revenue : 0),
      last: (a, b) => String(b.s ? b.s.last : '').localeCompare(String(a.s ? a.s.last : '')),
      followup: (a, b) => String(a.c.next_followup_date || '9999').localeCompare(String(b.c.next_followup_date || '9999')),
      name: (a, b) => String(a.c.name).localeCompare(String(b.c.name))
    };
    rows.sort(sorters[listState.sort] || sorters.revenue);

    const clients = contacts.filter(c => c.type !== 'proveedor');
    const due = clients.filter(c => c.next_followup_date && c.next_followup_date <= t).length;
    const dormant = clients.filter(c => { const s = statFor(c); return s && daysBetween(s.last, t) > 60; }).length;
    const tile = (txt, val, color, stage) => `
      <button data-stage-tile="${stage}" class="text-left rounded-xl border p-4 transition ${listState.stage === stage && stage ? 'border-blue-500 ring-1 ring-blue-500 bg-white' : 'border-slate-200 bg-white hover:border-slate-300'}">
        <div class="text-xs text-slate-500">${txt}</div>
        <div class="text-2xl font-semibold text-slate-900">${fmtInt(val)}</div>
      </button>`;
    document.getElementById('crm-tiles').innerHTML =
      tile('Clientes activos', clients.filter(c => (c.stage || 'activo') === 'activo').length, 'emerald', 'activo') +
      tile('Prospectos', clients.filter(c => c.stage === 'prospecto').length, 'sky', 'prospecto') +
      tile('Seguimientos para hoy', due, 'rose', '') +
      tile('Sin comprar +60 días', dormant, 'amber', '');
    document.querySelectorAll('[data-stage-tile]').forEach(b => b.addEventListener('click', () => {
      if (!b.dataset.stageTile) { listState.sort = b.textContent.includes('Seguimientos') ? 'followup' : 'last'; }
      else listState.stage = listState.stage === b.dataset.stageTile ? '' : b.dataset.stageTile;
      document.getElementById('crm-sort').value = listState.sort;
      draw();
    }));

    document.getElementById('crm-count').textContent = `${rows.length} contacto${rows.length === 1 ? '' : 's'}`;
    const el = document.getElementById('crm-list');
    el.innerHTML = rows.length === 0
      ? '<p class="text-sm text-slate-400 py-10 text-center">Sin contactos que coincidan.</p>'
      : rows.map(({ c, s, owed }) => {
        const st = stageOf(c);
        const overdue = c.next_followup_date && c.next_followup_date <= t;
        return `
        <a href="#/contabilidad/contactos/${esc(c.id)}" class="flex flex-col md:flex-row md:items-center gap-3 p-3 rounded-2xl border border-slate-100 hover:border-violet-300 hover:shadow-sm bg-white transition">
          <div class="flex items-center gap-3 flex-1 min-w-0">
            <div class="w-11 h-11 rounded-2xl bg-violet-100 text-violet-700 font-semibold flex items-center justify-center shrink-0">${esc(initials(c.name))}</div>
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-bold text-slate-800 truncate">${esc(c.name)}</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold text-${st.color}-700 bg-${st.color}-100">${st.label}</span>
                ${c.type !== 'cliente' ? `<span class="text-[10px] font-semibold text-slate-400">${TYPE_LABEL[c.type] || ''}</span>` : ''}
                ${Number(c.discount_pct) > 0 ? `<span class="text-[10px] font-bold text-rose-600">-${fmtNum(c.discount_pct).replace(/\.00$/, '')}%</span>` : ''}
              </div>
              <div class="text-[11px] text-slate-400 truncate">${[c.rif, c.phone, c.tags].filter(Boolean).map(esc).join(' · ') || '—'}</div>
            </div>
          </div>
          <div class="grid grid-cols-4 gap-3 text-right md:w-[30rem] shrink-0">
            <div><div class="text-[10px] uppercase font-bold text-slate-400">Compras</div><div class="text-sm font-semibold text-slate-800">$${fmtNum(s ? s.revenue : 0)}</div><div class="text-[10px] text-slate-400">${s ? s.orders : 0} venta(s)</div></div>
            <div><div class="text-[10px] uppercase font-bold text-slate-400">Última</div><div class="text-xs font-bold text-slate-700">${ago(s && s.last)}</div></div>
            <div><div class="text-[10px] uppercase font-bold text-slate-400">Por cobrar</div><div class="text-xs font-bold ${owed > 0.01 ? 'text-sky-700' : 'text-slate-300'}">$${fmtNum(Math.max(0, owed))}</div></div>
            <div><div class="text-[10px] uppercase font-bold text-slate-400">Seguimiento</div><div class="text-xs font-bold ${overdue ? 'text-rose-600' : 'text-slate-500'}">${c.next_followup_date ? (overdue ? '' : '') + esc(c.next_followup_date) : '—'}</div></div>
          </div>
        </a>`;
      }).join('');
  };

  const body = `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Clientes y Contactos</h1>
        <p class="text-xs text-slate-500">Lo que compra cada cliente, su seguimiento y sus ofertas. Toca un contacto para ver su ficha.</p>
      </div>
      <button id="btn-new" class="${btnPrimary}">+ Nuevo contacto</button>
    </div>
    <div id="crm-tiles" class="grid grid-cols-2 lg:grid-cols-4 gap-3"></div>
    <div class="${card} space-y-3">
      <div class="flex flex-col lg:flex-row gap-2 lg:items-center justify-between">
        <div class="flex gap-2 flex-wrap items-center">
          <input id="crm-search" class="${input}" style="width:240px" placeholder="Buscar nombre, RIF, teléfono, etiqueta…" value="${esc(listState.query)}">
          <select id="crm-type" class="${input}" style="width:160px">
            <option value="">Todos los roles</option><option value="cliente">Clientes</option><option value="proveedor">Proveedores</option>
          </select>
          <select id="crm-stage" class="${input}" style="width:150px">
            <option value="">Todas las etapas</option>${Object.entries(STAGES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
          </select>
          <select id="crm-sort" class="${input}" style="width:190px">
            <option value="revenue">Mayor comprador</option><option value="last">Compra más reciente</option>
            <option value="followup">Próximo seguimiento</option><option value="name">Nombre A-Z</option>
          </select>
        </div>
        <span id="crm-count" class="text-xs font-semibold text-slate-400"></span>
      </div>
      <div id="crm-list" class="space-y-2"></div>
    </div>`;
  app.innerHTML = AccountingShell.wrap(AccountingTabs.render('contacts'), body);
  document.getElementById('crm-type').value = listState.type;
  document.getElementById('crm-stage').value = listState.stage;
  document.getElementById('crm-sort').value = listState.sort;
  document.getElementById('crm-search').addEventListener('input', (e) => { listState.query = e.target.value; draw(); }, { signal });
  document.getElementById('crm-type').addEventListener('change', (e) => { listState.type = e.target.value; draw(); }, { signal });
  document.getElementById('crm-stage').addEventListener('change', (e) => { listState.stage = e.target.value; draw(); }, { signal });
  document.getElementById('crm-sort').addEventListener('change', (e) => { listState.sort = e.target.value; draw(); }, { signal });
  document.getElementById('btn-new').addEventListener('click', () => contactModal(null, (c) => { location.hash = `#/contabilidad/contactos/${c.id}`; }), { signal });
  draw();
  return () => destroy.abort();
}

// ---------------------------------------------------------------------------
// Ficha del cliente
// ---------------------------------------------------------------------------
let profileTab = 'compras';

function renderProfile(app, contactId) {
  const destroy = new AbortController();
  const { signal } = destroy;
  const contact = Store.getById('contacts', contactId);
  if (!contact) { location.hash = '#/contabilidad/contactos'; return; }

  const name = String(contact.name || '').trim();
  const lines = salesLines().filter(l => l.contactId === contact.id || (!l.contactId && l.entidad.trim() === name));
  const s = customerStats(lines).values().next().value || { revenue: 0, margin: 0, orders: 0, avgTicket: 0, last: '', first: '', qty: 0 };
  const owed = receivableByEntidad().get(name) || 0;
  const orderDates = [...new Set(lines.map(l => l.date))].sort();
  const freq = orderDates.length > 1 ? Math.round(daysBetween(orderDates[0], orderDates[orderDates.length - 1]) / (orderDates.length - 1)) : null;
  const st = stageOf(contact);
  const products = Store.getAll('products');

  // Productos que compra (y sugerencias de su misma categoría que aún no compra).
  const byProduct = new Map();
  for (const l of lines) {
    const k = l.productId || l.productName;
    const r = byProduct.get(k) || { name: l.productName, sku: l.sku, foto: l.foto, category: l.category, qty: 0, revenue: 0, times: new Set(), lastDate: '', lastPrice: 0 };
    r.qty += l.qty; r.revenue += l.revenue; r.times.add(l.refDoc);
    if (l.date >= r.lastDate) { r.lastDate = l.date; r.lastPrice = l.unitPrice; }
    byProduct.set(k, r);
  }
  const bought = [...byProduct.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
  const boughtIds = new Set(lines.map(l => l.productId).filter(Boolean));
  const favCats = new Set(lines.map(l => l.category));
  const crossSell = products.filter(p => !boughtIds.has(p.id) && favCats.has(p.category) && Number(p.stock) > 0).slice(0, 8);

  const kpi = (lbl, val, sub = '') => `
    <div class="bg-white border border-slate-200 rounded-2xl p-3">
      <div class="text-[10px] font-bold uppercase tracking-wide text-slate-400">${lbl}</div>
      <div class="text-lg font-semibold text-slate-900">${val}</div>
      ${sub ? `<div class="text-[10px] text-slate-400">${sub}</div>` : ''}
    </div>`;

  const tabs = [['compras', 'Compras'], ['productos', 'Lo que compra'], ['seguimiento', 'Seguimiento'], ['ofertas', 'Ofertas'], ['datos', 'Datos']];

  const renderTab = () => {
    document.getElementById('pf-tabs').innerHTML = tabs.map(([k, v]) => `
      <button data-tab="${k}" class="px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${profileTab === k ? 'bg-violet-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-violet-300'}">${v}</button>`).join('');
    document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { profileTab = b.dataset.tab; renderTab(); }));
    const el = document.getElementById('pf-body');
    if (profileTab === 'compras') el.innerHTML = comprasHtml();
    else if (profileTab === 'productos') el.innerHTML = productosHtml();
    else if (profileTab === 'seguimiento') el.innerHTML = seguimientoHtml();
    else if (profileTab === 'ofertas') el.innerHTML = ofertasHtml();
    else el.innerHTML = datosHtml();
    bindTab();
  };

  const comprasHtml = () => {
    const byRef = new Map();
    for (const l of lines) {
      const r = byRef.get(l.refDoc) || { refDoc: l.refDoc, date: l.date, payment: l.payment, items: 0, qty: 0, total: 0, margin: 0 };
      r.items++; r.qty += l.qty; r.total += l.revenue; r.margin += l.margin; byRef.set(l.refDoc, r);
    }
    const docs = [...byRef.values()].sort((a, b) => b.date.localeCompare(a.date));
    return docs.length === 0
      ? '<p class="text-sm text-slate-400 py-8 text-center">Este cliente todavía no tiene compras registradas.</p>'
      : `<table class="w-full text-xs"><thead><tr class="text-[10px] uppercase tracking-wide text-slate-400 text-left">
          <th class="p-2">Fecha</th><th class="p-2">Venta</th><th class="p-2">Pago</th><th class="p-2 text-right">Productos</th><th class="p-2 text-right">Unid.</th><th class="p-2 text-right">Total</th><th class="p-2 text-right">Margen</th><th class="p-2"></th></tr></thead>
        <tbody>${docs.map(d => `<tr class="border-t border-slate-100">
          <td class="p-2">${esc(d.date)}</td><td class="p-2 font-mono">${esc(d.refDoc)}</td><td class="p-2">${esc(d.payment)}</td>
          <td class="p-2 text-right">${d.items}</td><td class="p-2 text-right">${fmtInt(d.qty)}</td>
          <td class="p-2 text-right font-bold">$${fmtNum(d.total)}</td>
          <td class="p-2 text-right ${d.margin >= 0 ? 'text-emerald-700' : 'text-red-600'}">$${fmtNum(d.margin)}</td>
          <td class="p-2 text-right"><button data-print-sale="${esc(d.refDoc)}" class="text-slate-500 hover:text-blue-600">Imprimir</button></td></tr>`).join('')}</tbody></table>`;
  };

  const productosHtml = () => `
    ${bought.length === 0 ? '<p class="text-sm text-slate-400 py-6 text-center">Aún no ha comprado productos.</p>' : `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2">${bought.map(([, r]) => `
        <div class="flex items-center gap-3 p-2.5 rounded-xl border border-slate-100">
          ${r.foto ? `<img src="${esc(r.foto)}" class="w-12 h-12 rounded-lg object-cover border border-slate-200" alt="">` : '<div class="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center"></div>'}
          <div class="flex-1 min-w-0">
            <div class="text-xs font-bold text-slate-800 truncate">${esc(r.name)}</div>
            <div class="text-[10px] text-slate-400">${esc(r.sku)} · ${r.times.size} compra(s) · última ${esc(r.lastDate)} a $${fmtNum(r.lastPrice)}</div>
          </div>
          <div class="text-right"><div class="text-sm font-semibold">${fmtInt(r.qty)} u.</div><div class="text-[10px] text-slate-400">$${fmtNum(r.revenue)}</div></div>
        </div>`).join('')}</div>`}
    ${crossSell.length ? `
      <h3 class="text-xs font-bold text-slate-600 mt-5 mb-2">Podría interesarle (de las categorías que compra, con existencia)</h3>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2">${crossSell.map(p => `
        <div class="rounded-xl border border-slate-100 p-2">
          ${p.foto_url ? `<img src="${esc(p.foto_url)}" class="w-full aspect-square object-cover rounded-lg" alt="">` : '<div class="w-full aspect-square rounded-lg bg-slate-100 flex items-center justify-center text-2xl"></div>'}
          <div class="text-[11px] font-bold text-slate-700 mt-1 line-clamp-2">${esc(p.name)}</div>
          <div class="text-[10px] text-slate-400">${fmtInt(p.stock)} disp. · $${fmtNum(p.sale_price)}</div>
        </div>`).join('')}</div>` : ''}`;

  const activities = () => Store.getAll('crm_activities').filter(a => a.contact_id === contact.id);
  const isDone = (a) => a.done === true || String(a.done) === 'true';

  const seguimientoHtml = () => {
    const acts = activities();
    const tasks = acts.filter(a => a.kind === 'tarea' && !isDone(a)).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
    // Línea de tiempo: actividades, tareas cumplidas, compras y ofertas.
    const timeline = [
      ...acts.filter(a => a.kind !== 'tarea' || isDone(a)).map(a => ({ date: a.kind === 'tarea' ? a.due_date : a.date, icon: a.kind === 'tarea' ? '✅' : (CHANNELS[a.channel] || '📝').split(' ')[0], title: a.kind === 'tarea' ? 'Tarea cumplida' : (CHANNELS[a.channel] || 'Nota').split(' ').slice(1).join(' '), text: a.note, id: a.id })),
      ...[...new Set(lines.map(l => l.refDoc))].map(ref => { const ls = lines.filter(l => l.refDoc === ref); return { date: ls[0].date, icon: '🛒', title: 'Compra ' + ref, text: `${ls.length} producto(s) · $${fmtNum(ls.reduce((x, l) => x + l.revenue, 0))}` }; }),
      ...Store.getAll('quotes').filter(q => q.contact_id === contact.id).map(q => ({ date: q.date, icon: q.kind === 'oferta' ? '🎯' : '📄', title: `${q.kind === 'oferta' ? 'Oferta' : 'Presupuesto'} ${q.quote_number}`, text: `$${fmtNum(q.total)} · ${q.status}` }))
    ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="space-y-3">
          <div class="rounded-2xl border border-slate-200 p-3 space-y-2">
            <h3 class="text-xs font-bold text-slate-700">Registrar contacto con el cliente</h3>
            <div class="flex flex-wrap gap-1.5" id="act-channels">${Object.entries(CHANNELS).map(([k, v], i) => `<button data-channel="${k}" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${i === 0 ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-600'}">${v}</button>`).join('')}</div>
            <textarea id="act-note" rows="2" class="${input}" placeholder="¿Qué se habló? (p. ej. pidió precio de 50 mezcladoras, quedó en confirmar el lunes)"></textarea>
            <div class="flex gap-2 items-end">
              <div class="flex-1"><label class="${label}">Fecha</label><input id="act-date" type="date" value="${today()}" class="${input}"></div>
              <button id="act-save" class="${btnPrimary}">Guardar</button>
            </div>
          </div>
          <div class="rounded-2xl border border-slate-200 p-3 space-y-2">
            <h3 class="text-xs font-bold text-slate-700">Programar próximo seguimiento</h3>
            <input id="task-note" class="${input}" placeholder="Llamar para confirmar el pedido…">
            <div class="flex gap-2 items-end">
              <div class="flex-1"><label class="${label}">¿Cuándo?</label><input id="task-date" type="date" class="${input}"></div>
              <button id="task-save" class="${btnPrimary}">Programar</button>
            </div>
          </div>
          <div>
            <h3 class="text-xs font-bold text-slate-700 mb-2">Tareas pendientes</h3>
            ${tasks.length === 0 ? '<p class="text-xs text-slate-400">Sin tareas pendientes.</p>' : tasks.map(a => `
              <div class="flex items-center gap-2 p-2.5 rounded-xl border ${a.due_date <= today() ? 'border-rose-200 bg-rose-50' : 'border-slate-100'} mb-1.5">
                <button data-done="${esc(a.id)}" title="Marcar como hecha" class="w-6 h-6 rounded-full border-2 border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 shrink-0"></button>
                <div class="flex-1 min-w-0"><div class="text-xs font-semibold text-slate-700">${esc(a.note) || 'Seguimiento'}</div>
                <div class="text-[10px] ${a.due_date <= today() ? 'text-rose-600 font-bold' : 'text-slate-400'}">${a.due_date < today() ? 'Vencida · ' : a.due_date === today() ? 'Hoy · ' : ''}${esc(a.due_date)}</div></div>
                <button data-del-act="${esc(a.id)}" class="text-slate-300 hover:text-red-500 text-xs">✕</button>
              </div>`).join('')}
          </div>
        </div>
        <div>
          <h3 class="text-xs font-bold text-slate-700 mb-2">Historial</h3>
          ${timeline.length === 0 ? '<p class="text-xs text-slate-400">Sin actividad todavía.</p>' : `<ol class="relative border-l-2 border-slate-100 ml-3 space-y-3">${timeline.map(e => `
            <li class="ml-4">
              <span class="absolute -left-[13px] w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span></span>
              <div class="text-[10px] text-slate-400">${esc(e.date)}</div>
              <div class="text-xs font-bold text-slate-700">${esc(e.title)}</div>
              ${e.text ? `<div class="text-xs text-slate-500 whitespace-pre-line">${esc(e.text)}</div>` : ''}
            </li>`).join('')}</ol>`}
        </div>
      </div>`;
  };

  const ofertasHtml = () => {
    const quotes = Store.getAll('quotes').filter(q => q.contact_id === contact.id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <p class="text-xs text-slate-500">Arma una oferta con los productos que ya compra (⭐) o los que te interese mover, con un descuento especial, e imprímela o mándala por WhatsApp.</p>
        <a href="#/contabilidad/presupuestos/nuevo?cliente=${esc(contact.id)}&tipo=oferta" class="${btnPrimary} whitespace-nowrap">Nueva oferta</a>
      </div>
      ${quotes.length === 0 ? '<p class="text-sm text-slate-400 py-6 text-center">Sin ofertas ni presupuestos para este cliente.</p>' : quotes.map(q => `
        <div class="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-xl border border-slate-100 mb-2">
          <div class="flex-1">
            <div class="text-xs font-bold text-slate-800">${q.kind === 'oferta' ? 'Oferta' : 'Presupuesto'} ${esc(q.quote_number)} <span class="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600">${esc(q.status)}</span></div>
            <div class="text-[11px] text-slate-400">${esc(q.date)}${q.valid_until ? ' · válida hasta ' + esc(q.valid_until) : ''} · ${Store.getQuoteItems(q).length} producto(s)</div>
          </div>
          <div class="text-lg font-semibold text-slate-900">$${fmtNum(q.total)}</div>
          <div class="flex gap-1.5">
            <button data-print-quote="${esc(q.id)}" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200">Imprimir</button>
            ${contact.phone ? `<a target="_blank" rel="noopener" href="${esc(whatsappQuoteLink(q, contact))}" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white">WhatsApp</a>` : ''}
          </div>
        </div>`).join('')}`;
  };

  const datosHtml = () => `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
      ${[['Rol', TYPE_LABEL[contact.type]], ['Etapa', `${st.label}`], ['Cédula / RIF', contact.rif], ['Teléfono', contact.phone], ['Correo', contact.email], ['Dirección', contact.address],
        ['Descuento especial', Number(contact.discount_pct) > 0 ? `${contact.discount_pct}%` : 'Ninguno'], ['Etiquetas', contact.tags], ['Retención de IVA', Number(contact.iva_retention_pct) > 0 ? `${contact.iva_retention_pct}% (contribuyente especial)` : 'No retiene'], ['Cliente desde', s.first || '—']]
        .map(([k, v]) => `<div class="rounded-xl bg-slate-50 p-3"><div class="text-[10px] uppercase font-bold text-slate-400">${k}</div><div class="font-semibold text-slate-800">${esc(v) || '—'}</div></div>`).join('')}
      <div class="md:col-span-2 rounded-xl bg-slate-50 p-3"><div class="text-[10px] uppercase font-bold text-slate-400">Notas</div><div class="text-slate-700 whitespace-pre-line">${esc(contact.notes) || '—'}</div></div>
    </div>
    <div class="flex gap-2 mt-4">
      <button id="pf-edit" class="${btnPrimary}">Editar datos</button>
      <button id="pf-delete" class="text-sm font-semibold text-red-600 px-3">Eliminar contacto</button>
    </div>`;

  const bindTab = () => {
    const el = document.getElementById('pf-body');
    el.querySelectorAll('[data-print-sale]').forEach(b => b.addEventListener('click', () => {
      const doc = saleDocumentFromJournal(b.dataset.printSale);
      if (doc) printSalesDocument(doc, Store.getBusinessProfile());
    }));
    el.querySelectorAll('[data-print-quote]').forEach(b => b.addEventListener('click', () => {
      const q = Store.getById('quotes', b.dataset.printQuote);
      if (q) printSalesDocument(quoteDocument(q), Store.getBusinessProfile());
    }));
    let channel = 'llamada';
    el.querySelectorAll('[data-channel]').forEach(b => b.addEventListener('click', () => {
      channel = b.dataset.channel;
      el.querySelectorAll('[data-channel]').forEach(x => { x.className = `px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${x === b ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-600'}`; });
    }));
    const actSave = el.querySelector('#act-save');
    if (actSave) actSave.addEventListener('click', () => {
      const note = el.querySelector('#act-note').value.trim();
      if (!note) { el.querySelector('#act-note').focus(); return; }
      Store.insert('crm_activities', Store.newActivity({ contact_id: contact.id, kind: 'actividad', channel, date: el.querySelector('#act-date').value || today(), note }));
      renderTab();
    });
    const taskSave = el.querySelector('#task-save');
    if (taskSave) taskSave.addEventListener('click', () => {
      const due = el.querySelector('#task-date').value;
      if (!due) { el.querySelector('#task-date').focus(); return; }
      Store.insert('crm_activities', Store.newActivity({ contact_id: contact.id, kind: 'tarea', channel: 'nota', date: today(), due_date: due, note: el.querySelector('#task-note').value.trim() || 'Hacer seguimiento' }));
      refreshNextFollowup(contact.id);
      renderTab();
    });
    el.querySelectorAll('[data-done]').forEach(b => b.addEventListener('click', () => {
      Store.update('crm_activities', { id: b.dataset.done, done: true });
      refreshNextFollowup(contact.id);
      renderTab();
    }));
    el.querySelectorAll('[data-del-act]').forEach(b => b.addEventListener('click', () => {
      if (!confirm('¿Eliminar esta tarea?')) return;
      Store.remove('crm_activities', b.dataset.delAct);
      refreshNextFollowup(contact.id);
      renderTab();
    }));
    const edit = el.querySelector('#pf-edit');
    if (edit) edit.addEventListener('click', () => contactModal(contact, rerender));
    const del = el.querySelector('#pf-delete');
    if (del) del.addEventListener('click', () => {
      if (!confirm(`¿Eliminar a ${contact.name} del directorio? Sus ventas y asientos no se borran.`)) return;
      Store.remove('contacts', contact.id);
      for (const a of activities()) Store.remove('crm_activities', a.id);
      location.hash = '#/contabilidad/contactos';
    });
  };

  const wa = waLink(contact.phone);
  const body = `
    <a href="#/contabilidad/contactos" class="text-xs font-semibold text-slate-500 hover:text-violet-700">← Clientes y Contactos</a>
    <div class="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-4">
      <div class="flex items-center gap-4 flex-1 min-w-0">
        <div class="w-16 h-16 rounded-2xl bg-violet-600 text-white text-xl font-semibold flex items-center justify-center shrink-0">${esc(initials(contact.name))}</div>
        <div class="min-w-0">
          <h1 class="text-xl font-semibold text-slate-900 truncate">${esc(contact.name)}</h1>
          <div class="flex items-center gap-2 flex-wrap mt-1">
            <select id="pf-stage" class="text-[11px] font-bold rounded-full px-2 py-1 border-0 bg-${st.color}-100 text-${st.color}-700">
              ${Object.entries(STAGES).map(([k, v]) => `<option value="${k}" ${(contact.stage || 'activo') === k ? 'selected' : ''}>${v.label}</option>`).join('')}
            </select>
            <span class="text-xs text-slate-400">${esc(TYPE_LABEL[contact.type] || '')}${contact.rif ? ' · ' + esc(contact.rif) : ''}</span>
            ${Number(contact.discount_pct) > 0 ? `<span class="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">Descuento especial -${fmtNum(contact.discount_pct).replace(/\.00$/, '')}%</span>` : ''}
            ${contact.tags ? String(contact.tags).split(',').map(t => t.trim()).filter(Boolean).map(t => `<span class="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">#${esc(t)}</span>`).join('') : ''}
          </div>
        </div>
      </div>
      <div class="flex gap-2 flex-wrap">
        ${wa ? `<a href="${esc(wa)}" target="_blank" rel="noopener" class="px-3 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white">WhatsApp</a>` : ''}
        ${contact.phone ? `<a href="tel:${esc(contact.phone)}" class="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700">Llamar</a>` : ''}
        <a href="#/contabilidad/presupuestos/nuevo?cliente=${esc(contact.id)}&tipo=oferta" class="px-3 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white">Nueva oferta</a>
        <button id="pf-followup" class="px-3 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 hover:border-violet-300 text-slate-700">Seguimiento</button>
      </div>
    </div>
    <div class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
      ${kpi('Total comprado', '$' + fmtNum(s.revenue), `${s.orders} compra(s)`)}
      ${kpi('Margen', '$' + fmtNum(s.margin), s.revenue > 0 ? fmtNum(s.margin / s.revenue * 100).replace(/\.00$/, '') + '% de la venta' : '')}
      ${kpi('Ticket promedio', '$' + fmtNum(s.avgTicket))}
      ${kpi('Unidades', fmtInt(s.qty))}
      ${kpi('Última compra', ago(s.last), s.last || '')}
      ${kpi('Compra cada', freq ? `${freq} días` : '—', freq ? 'en promedio' : 'necesita 2+ compras')}
      ${kpi('Te debe', '$' + fmtNum(Math.max(0, owed)), owed > 0.01 ? '<a class="text-sky-600 font-semibold" href="#/contabilidad/por-cobrar">Cobrar →</a>' : 'Al día')}
    </div>
    <div id="pf-tabs" class="flex gap-2 overflow-x-auto pb-1"></div>
    <div id="pf-body" class="${card}"></div>`;
  app.innerHTML = AccountingShell.wrap(AccountingTabs.render('contacts'), body);

  document.getElementById('pf-stage').addEventListener('change', (e) => {
    Store.update('contacts', { id: contact.id, stage: e.target.value });
    rerender();
  }, { signal });
  document.getElementById('pf-followup').addEventListener('click', () => { profileTab = 'seguimiento'; renderTab(); document.getElementById('task-date').focus(); }, { signal });
  renderTab();
  return () => destroy.abort();
}

export default Contacts;
