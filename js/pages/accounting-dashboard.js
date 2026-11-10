import Store from '../store.js';
import { fmtNum, esc } from '../utils.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell from '../components/accounting-shell.js';
import { icon } from '../components/icons.js';
import { CONTAINER_PAYMENTS_ENABLED } from '../features.js';
import { dispatchStatus, orderMoney } from '../orders.js';

// Prefijo del ref_doc → tipo de actividad (igual patrón que recentActivity de LegalYa).
const DOC_TYPES = {
  ING: { label: 'Ingreso', color: 'emerald', icon: 'plus' },
  VTA: { label: 'Venta', color: 'emerald', icon: 'cart' },
  NE: { label: 'Venta sin factura', color: 'emerald', icon: 'cart' },
  ANT: { label: 'Anticipo de cliente', color: 'violet', icon: 'inbox' },
  GST: { label: 'Gasto', color: 'rose', icon: 'wallet' },
  REC: { label: 'Recepción', color: 'sky', icon: 'box' },
  COS: { label: 'Costo', color: 'rose', icon: 'tag' },
  PAG: { label: 'Pago de contenedor', color: 'orange', icon: 'ship' },
  COB: { label: 'Cobro', color: 'violet', icon: 'inbox' },
  ABP: { label: 'Abono a proveedor', color: 'orange', icon: 'receipt' },
  CIE: { label: 'Cierre de contenedor', color: 'sky', icon: 'ship' },
  IVA: { label: 'Liquidación de IVA', color: 'amber', icon: 'calculator' },
  IVAP: { label: 'Pago de IVA', color: 'amber', icon: 'calculator' },
  MAN: { label: 'Asiento manual', color: 'slate', icon: 'journal' }
};

function docTypeFor(refDoc) {
  const prefix = String(refDoc || '').split('-')[0].toUpperCase();
  return DOC_TYPES[prefix] || { label: 'Movimiento', color: 'slate', icon: 'journal' };
}

const AccountingDashboard = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    const accounts = Store.getAll('accounts');
    const movements = Store.getAll('movements');

    const codesFor = (tipoEspecifico) => new Set(accounts.filter(a => a.tipo_especifico === tipoEspecifico).map(a => a.codigo));
    const codesForTipos = (tipos) => new Set(accounts.filter(a => tipos.includes(a.tipo)).map(a => a.codigo));

    const sumBalance = (codes) => movements
      .filter(m => codes.has(m.codigo_cuenta))
      .reduce((s, m) => s + (Number(m.debit) || 0) - (Number(m.credit) || 0), 0);

    const sumDebit = (codes) => movements
      .filter(m => codes.has(m.codigo_cuenta))
      .reduce((s, m) => s + (Number(m.debit) || 0), 0);

    const stats = {
      caja: sumBalance(codesFor('Efectivo')),
      banco: sumBalance(codesFor('Banco')),
      porCobrar: sumBalance(codesFor('Clientes')),
      // Lo que realmente deben los clientes: saldo de sus órdenes de venta
      // (facturadas o no, con o sin factura).
      ...(() => {
        let all = 0, inv = 0;
        for (const o of Store.getAll('sales_orders')) {
          if (o.status === 'anulada') continue;
          const b = Math.max(0, orderMoney(o).balance);
          all += b; if (o.status === 'facturada') inv += b;
        }
        return { porCobrarOrdenes: all, porCobrarFacturado: inv };
      })(),
      gastosCostos: sumDebit(codesForTipos(['Gasto', 'Costo']))
    };

    // Actividad reciente: agrupa por ref_doc, última primero, últimos 8 documentos.
    const byRef = new Map();
    for (const m of movements) {
      if (!m.ref_doc) continue;
      if (!byRef.has(m.ref_doc)) byRef.set(m.ref_doc, []);
      byRef.get(m.ref_doc).push(m);
    }
    const recentActivity = [...byRef.entries()]
      .map(([refDoc, lines]) => {
        const sorted = [...lines].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        const first = sorted[0];
        const type = docTypeFor(refDoc);
        const amount = Math.max(...lines.map(l => Number(l.debit) || 0));
        const desc = String(first.concepto || '').split('|')[0].trim();
        return { refDoc, type, amount, desc, entidad: first.entidad, date: first.entry_date, createdAt: first.created_at };
      })
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 6);

    // Cifras del mes en curso (como los diarios del tablero de Odoo).
    const ym = new Date().toISOString().slice(0, 7);
    const inMonth = (m) => String(m.entry_date || '').startsWith(ym);
    const tipoOf = new Map(accounts.map(a => [String(a.codigo), a.tipo]));
    const teOf = new Map(accounts.map(a => [String(a.codigo), a.tipo_especifico]));
    const monthSales = movements.filter(m => inMonth(m) && String(m.codigo_cuenta).startsWith('4.1.01')).reduce((t, m) => t + (Number(m.credit) || 0) - (Number(m.debit) || 0), 0);
    const monthSaleDocs = new Set(movements.filter(m => inMonth(m) && m.source === 'sale' && Number(m.credit) > 0 && String(m.codigo_cuenta).startsWith('4.1.01')).map(m => m.ref_doc)).size;
    const monthSpend = movements.filter(m => inMonth(m) && ['Gasto', 'Costo'].includes(tipoOf.get(String(m.codigo_cuenta)))).reduce((t, m) => t + (Number(m.debit) || 0) - (Number(m.credit) || 0), 0);
    const owe = (prefix) => movements.filter(m => String(m.codigo_cuenta).startsWith(prefix)).reduce((t, m) => t + (Number(m.credit) || 0) - (Number(m.debit) || 0), 0);
    const oweContainers = owe('2.1.01');
    const oweSuppliers = movements.filter(m => teOf.get(String(m.codigo_cuenta)) === 'Proveedores' && !String(m.codigo_cuenta).startsWith('2.1.01')).reduce((t, m) => t + (Number(m.credit) || 0) - (Number(m.debit) || 0), 0);
    const oweTaxes = owe('2.1.04');
    const monthName = new Date().toLocaleDateString('es-VE', { month: 'long' });

    // Pendientes: lo que necesita atención, cada uno lleva a su pantalla.
    const closed = Store.getAll('containers').filter(c => c.status === 'closed');
    let payableTotal = 0, payableCount = 0, withoutEntry = 0;
    for (const c of closed) {
      const lines = movements.filter(m => m.source_ref === c.id && String(m.codigo_cuenta).startsWith('2.'));
      if (!movements.some(m => m.source === 'container_close' && m.source_ref === c.id)) { withoutEntry++; continue; }
      const bal = lines.reduce((s2, m) => s2 + (Number(m.credit) || 0) - (Number(m.debit) || 0), 0);
      if (bal > 0.01) { payableTotal += bal; payableCount++; }
    }
    const quotes = Store.getAll('quotes');
    const pendingQuotes = quotes.filter(q => q.status === 'pendiente');
    const approvedQuotes = quotes.filter(q => q.status === 'aprobado');
    const noPrice = Store.getAll('products').filter(p => Number(p.stock) > 0 && !(Number(p.sale_price) > 0)).length;
    const todayIso = new Date().toISOString().slice(0, 10);
    const dueTasks = Store.getAll('crm_activities').filter(a => a.kind === 'tarea' && !(a.done === true || String(a.done) === 'true') && a.due_date && a.due_date <= todayIso);
    const openOrders = Store.getAll('sales_orders').filter(o => o.status !== 'anulada');
    const toDispatch = openOrders.filter(o => dispatchStatus(o).pending > 0).length;
    const pendings = [
      dueTasks.length && { href: '#/contabilidad/contactos', icon: 'clock', title: `${dueTasks.length} seguimiento(s) de clientes para hoy o vencidos`, value: 'Ver clientes' },
      CONTAINER_PAYMENTS_ENABLED && payableCount && { href: '#/contabilidad/pagos', icon: 'ship', title: `${payableCount} contenedor(es) por pagar`, value: '$' + fmtNum(payableTotal) },
      CONTAINER_PAYMENTS_ENABLED && withoutEntry && { href: '#/contabilidad/pagos', icon: 'alert', warn: true, title: `${withoutEntry} contenedor(es) completo(s) sin asiento`, value: 'Generar' },
      stats.porCobrarOrdenes > 0.01 && { href: '#/contabilidad/por-cobrar', icon: 'inbox', title: 'Clientes te deben (órdenes de venta)', value: '$' + fmtNum(stats.porCobrarOrdenes) },
      toDispatch && { href: '#/contabilidad/ordenes', icon: 'ship', title: `${toDispatch} orden(es) con mercancía por despachar`, value: 'Ver órdenes' },
      pendingQuotes.length && { href: '#/contabilidad/presupuestos', icon: 'file', title: `${pendingQuotes.length} presupuesto(s) pendiente(s)`, value: '$' + fmtNum(pendingQuotes.reduce((s2, q) => s2 + (Number(q.total) || 0), 0)) },
      approvedQuotes.length && { href: '#/contabilidad/presupuestos', icon: 'check', title: `${approvedQuotes.length} presupuesto(s) aprobado(s) por vender`, value: 'Convertir' },
      noPrice && { href: '#/contabilidad/catalogo', icon: 'tag', title: `${noPrice} producto(s) con existencia sin precio`, value: 'Poner precio' }
    ].filter(Boolean);
    const pendingRow = (pd) => `
      <a href="${pd.href}" class="flex items-center gap-3 py-2.5 px-1 hover:bg-slate-50 rounded-lg transition">
        <span class="${pd.warn ? 'text-amber-500' : 'text-slate-400'}">${icon(pd.icon)}</span>
        <span class="flex-1 text-sm text-slate-700">${pd.title}</span>
        <span class="text-xs text-slate-500 whitespace-nowrap">${pd.value} →</span>
      </a>`;

    const activityRow = (a) => `
      <a href="#/contabilidad/diario" class="flex items-center gap-3 py-2 px-1 -mx-1 rounded-lg hover:bg-slate-50 border-t border-slate-100 first:border-t-0">
        <div class="flex-1 min-w-0">
          <div class="text-sm text-slate-700 truncate">${esc(a.desc) || esc(a.type.label)}</div>
          <div class="text-[11px] text-slate-400 truncate">${esc(a.type.label)}${a.entidad ? ' · ' + esc(a.entidad) : ''} · ${esc(a.date || '')}</div>
        </div>
        <div class="text-sm text-slate-700 tabular-nums shrink-0">$${fmtNum(a.amount)}</div>
      </a>
    `;

    const today = new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' });
    const oweTotal = oweContainers + oweSuppliers + oweTaxes;
    // Cifras clave en una sola franja: sin íconos de colores ni enlaces de más;
    // cada cifra lleva a su pantalla.
    const kpi = (href, label, value, sub, extra = '') => `
      <a href="${href}" class="block px-4 py-3 hover:bg-slate-50 transition ${extra}">
        <div class="text-xs text-slate-500">${label}</div>
        <div class="mt-0.5 text-xl font-semibold text-slate-900 tabular-nums">$${fmtNum(value)}</div>
        <div class="text-[11px] text-slate-400 truncate">${sub}</div>
      </a>`;
    const body = `
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="text-xs text-slate-400 first-letter:uppercase">${esc(today)}</p>
          <h1 class="text-xl font-semibold text-slate-900">Resumen</h1>
        </div>
        <div class="flex gap-2">
          <a href="#/contabilidad/gastos" class="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-white border border-slate-200 hover:border-slate-300 text-slate-700">${icon('wallet', 'w-4 h-4')}Registrar gasto</a>
          <a href="#/contabilidad/presupuestos/nuevo" class="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold">${icon('file', 'w-4 h-4')}Nuevo presupuesto</a>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-slate-200/70 grid grid-cols-2 lg:grid-cols-5 divide-x divide-y lg:divide-y-0 divide-slate-100 overflow-hidden">
        ${kpi('#/contabilidad/reportes/ventas', `Ventas de ${monthName}`, monthSales, `${monthSaleDocs} factura${monthSaleDocs === 1 ? '' : 's'}`)}
        ${kpi('#/contabilidad/reportes/gastos', `Gastos de ${monthName}`, monthSpend, 'Costos y gastos')}
        ${kpi('#/contabilidad/mayor', 'Disponible', stats.banco + stats.caja, `Banco $${fmtNum(stats.banco)} · Caja $${fmtNum(stats.caja)}`)}
        ${kpi('#/contabilidad/por-cobrar', 'Te deben', stats.porCobrarOrdenes, `$${fmtNum(stats.porCobrarFacturado)} ya facturado`)}
        ${kpi('#/contabilidad/por-pagar', 'Debes', oweTotal, oweTaxes > 0.005 ? `Incluye IVA $${fmtNum(oweTaxes)}` : 'Cuentas por pagar', 'col-span-2 lg:col-span-1')}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div class="lg:col-span-3 bg-white rounded-xl border border-slate-200/70 p-4">
          <h2 class="text-sm font-semibold text-slate-900 mb-1">Pendientes</h2>
          ${pendings.length
            ? `<div class="divide-y divide-slate-100">${pendings.map(pendingRow).join('')}</div>`
            : '<p class="text-sm text-slate-500 py-2">Todo al día: no hay nada pendiente.</p>'}
        </div>
        <div class="lg:col-span-2 bg-white rounded-xl border border-slate-200/70 p-4">
          <div class="flex items-center justify-between mb-1">
            <h2 class="text-sm font-semibold text-slate-900">Actividad reciente</h2>
            <a href="#/contabilidad/diario" class="text-xs text-slate-500 hover:text-slate-900">Libro diario →</a>
          </div>
          ${recentActivity.length === 0
            ? '<p class="text-sm text-slate-400 py-2">Sin movimientos registrados todavía.</p>'
            : recentActivity.map(activityRow).join('')}
        </div>
      </div>
    `;

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('dashboard'), body);

    return () => destroy.abort();
  }
};

export default AccountingDashboard;
