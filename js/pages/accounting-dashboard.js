import Store from '../store.js';
import { fmtNum, esc } from '../utils.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { card } from '../components/accounting-shell.js';
import { icon } from '../components/icons.js';

// Prefijo del ref_doc → tipo de actividad (igual patrón que recentActivity de LegalYa).
const DOC_TYPES = {
  ING: { label: 'Ingreso', color: 'emerald', icon: 'plus' },
  VTA: { label: 'Venta', color: 'emerald', icon: 'cart' },
  NE: { label: 'Venta sin factura', color: 'emerald', icon: 'cart' },
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

const ACT_TONE = {
  emerald: 'bg-emerald-50 text-emerald-600', rose: 'bg-rose-50 text-rose-600', sky: 'bg-sky-50 text-sky-600',
  orange: 'bg-orange-50 text-orange-600', violet: 'bg-violet-50 text-violet-600', amber: 'bg-amber-50 text-amber-600', slate: 'bg-slate-100 text-slate-500'
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
      .slice(0, 8);

    // Mayores deudores: saldo positivo de cuentas por cobrar, agrupado por entidad.
    const cxcCodes = codesFor('Clientes');
    const debtorBalances = new Map();
    for (const m of movements) {
      if (!cxcCodes.has(m.codigo_cuenta)) continue;
      const key = m.entidad || 'Sin especificar';
      const delta = (Number(m.debit) || 0) - (Number(m.credit) || 0);
      debtorBalances.set(key, (debtorBalances.get(key) || 0) + delta);
    }
    const topDebtors = [...debtorBalances.entries()]
      .filter(([, bal]) => bal > 0.01)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    // Top vendidos: líneas de venta, cantidad agregada por producto (el
    // concepto se guarda como "<concepto> | <nombre producto>").
    const productQty = new Map();
    for (const m of movements) {
      // precio_venta > 0 aísla la línea de Ingresos por Ventas (credit) de cada
      // producto — el resto de las líneas de la venta no llevan precio.
      if (m.source !== 'sale' || !(Number(m.cantidad) > 0) || m.unidad !== 'unidades' || !(Number(m.precio_venta) > 0)) continue;
      const parts = String(m.concepto || '').split('|');
      const productName = (parts[1] || parts[0] || 'Producto').trim();
      productQty.set(productName, (productQty.get(productName) || 0) + Number(m.cantidad));
    }
    const topProducts = [...productQty.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Cifras del mes en curso (como los diarios del tablero de Odoo).
    const ym = new Date().toISOString().slice(0, 7);
    const inMonth = (m) => String(m.entry_date || '').startsWith(ym);
    const tipoOf = new Map(accounts.map(a => [String(a.codigo), a.tipo]));
    const teOf = new Map(accounts.map(a => [String(a.codigo), a.tipo_especifico]));
    const monthSales = movements.filter(m => inMonth(m) && String(m.codigo_cuenta).startsWith('4.1.01')).reduce((t, m) => t + (Number(m.credit) || 0) - (Number(m.debit) || 0), 0);
    const monthSaleDocs = new Set(movements.filter(m => inMonth(m) && m.source === 'sale').map(m => m.ref_doc)).size;
    const monthSpend = movements.filter(m => inMonth(m) && ['Gasto', 'Costo'].includes(tipoOf.get(String(m.codigo_cuenta)))).reduce((t, m) => t + (Number(m.debit) || 0) - (Number(m.credit) || 0), 0);
    const owe = (prefix) => movements.filter(m => String(m.codigo_cuenta).startsWith(prefix)).reduce((t, m) => t + (Number(m.credit) || 0) - (Number(m.debit) || 0), 0);
    const oweContainers = owe('2.1.01');
    const oweSuppliers = movements.filter(m => teOf.get(String(m.codigo_cuenta)) === 'Proveedores' && !String(m.codigo_cuenta).startsWith('2.1.01')).reduce((t, m) => t + (Number(m.credit) || 0) - (Number(m.debit) || 0), 0);
    const oweTaxes = owe('2.1.04');
    const monthName = new Date().toLocaleDateString('es-VE', { month: 'long' });

    // Tarjeta tipo "diario": ícono con color suave, cifra principal y acción.
    const tone = {
      emerald: 'bg-emerald-50 text-emerald-600', rose: 'bg-rose-50 text-rose-600',
      sky: 'bg-sky-50 text-sky-600', amber: 'bg-amber-50 text-amber-600', violet: 'bg-violet-50 text-violet-600', orange: 'bg-orange-50 text-orange-600'
    };
    const journalCard = ({ title, ic, color, value, sub, actions }) => `
      <div class="bg-white rounded-xl border border-slate-200/70 shadow-sm p-4 flex flex-col">
        <div class="flex items-center gap-2.5">
          <span class="w-9 h-9 rounded-lg ${tone[color]} flex items-center justify-center">${icon(ic)}</span>
          <span class="text-sm font-medium text-slate-700">${title}</span>
        </div>
        <div class="mt-3 text-2xl font-semibold text-slate-900 tabular-nums">$${fmtNum(value)}</div>
        <div class="text-xs text-slate-400 mt-0.5">${sub}</div>
        <div class="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          ${actions.map(([href, txt, primary]) => `<a href="${href}" class="${primary ? 'font-semibold text-blue-600 hover:text-blue-700' : 'text-slate-500 hover:text-slate-900'}">${txt}</a>`).join('')}
        </div>
      </div>`;

    const listRow = (name, amount, href) => `
      <a href="${href}" class="flex items-center justify-between py-2 text-sm hover:bg-slate-50 -mx-2 px-2 rounded-lg">
        <span class="text-slate-600 truncate">${esc(name)}</span><span class="font-medium text-slate-900 tabular-nums">$${fmtNum(amount)}</span>
      </a>`;

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
    const pendings = [
      dueTasks.length && { href: '#/contabilidad/contactos', icon: 'clock', title: `${dueTasks.length} seguimiento(s) de clientes para hoy o vencidos`, value: 'Ver clientes' },
      payableCount && { href: '#/contabilidad/pagos', icon: 'ship', title: `${payableCount} contenedor(es) por pagar`, value: '$' + fmtNum(payableTotal) },
      withoutEntry && { href: '#/contabilidad/pagos', icon: 'alert', warn: true, title: `${withoutEntry} contenedor(es) completo(s) sin asiento`, value: 'Generar' },
      stats.porCobrar > 0.01 && { href: '#/contabilidad/por-cobrar', icon: 'inbox', title: 'Clientes te deben', value: '$' + fmtNum(stats.porCobrar) },
      pendingQuotes.length && { href: '#/contabilidad/presupuestos', icon: 'file', title: `${pendingQuotes.length} presupuesto(s) pendiente(s)`, value: '$' + fmtNum(pendingQuotes.reduce((s2, q) => s2 + (Number(q.total) || 0), 0)) },
      approvedQuotes.length && { href: '#/contabilidad/presupuestos', icon: 'check', title: `${approvedQuotes.length} presupuesto(s) aprobado(s) por vender`, value: 'Convertir' },
      noPrice && { href: '#/contabilidad/inventario', icon: 'tag', title: `${noPrice} producto(s) con existencia sin precio`, value: 'Poner precio' }
    ].filter(Boolean);
    const pendingRow = (pd) => `
      <a href="${pd.href}" class="flex items-center gap-3 py-2.5 px-1 hover:bg-slate-50 rounded-lg transition">
        <span class="${pd.warn ? 'text-amber-500' : 'text-slate-400'}">${icon(pd.icon)}</span>
        <span class="flex-1 text-sm text-slate-700">${pd.title}</span>
        <span class="text-xs text-slate-500 whitespace-nowrap">${pd.value} →</span>
      </a>`;

    const activityRow = (a) => `
      <a href="#/contabilidad/diario" class="flex items-center gap-3 py-2.5 px-1 -mx-1 rounded-lg hover:bg-slate-50 border-t border-slate-100 first:border-t-0">
        <span class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${ACT_TONE[a.type.color] || ACT_TONE.slate}">${icon(a.type.icon, 'w-4 h-4')}</span>
        <div class="flex-1 min-w-0">
          <div class="text-xs text-slate-700 truncate">${esc(a.desc) || esc(a.type.label)}</div>
          <div class="text-[10px] text-slate-400 truncate">${esc(a.refDoc)} ${a.entidad ? '· ' + esc(a.entidad) : ''} · ${esc(a.date || '')}</div>
        </div>
        <div class="text-xs font-mono text-slate-700 shrink-0">$${fmtNum(a.amount)}</div>
      </a>
    `;

    const today = new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' });
    const body = `
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="text-xs text-slate-400 first-letter:uppercase">${esc(today)}</p>
          <h1 class="text-xl font-semibold text-slate-900">Resumen</h1>
        </div>
        <div class="flex gap-2">
          <a href="#/contabilidad/gastos" class="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-white border border-slate-200 hover:border-slate-300 text-slate-700 shadow-sm">${icon('wallet', 'w-4 h-4')}Registrar gasto</a>
          <a href="#/contabilidad/ventas" class="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm">${icon('cart', 'w-4 h-4')}Nueva venta</a>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        ${journalCard({ title: 'Ventas', ic: 'cart', color: 'emerald', value: monthSales, sub: `${monthSaleDocs} venta${monthSaleDocs === 1 ? '' : 's'} en ${monthName}`,
          actions: [['#/contabilidad/ventas', 'Nueva venta', true], ['#/contabilidad/presupuestos/nuevo', 'Presupuesto'], ['#/contabilidad/reportes/ventas', 'Reporte']] })}
        ${journalCard({ title: 'Compras y gastos', ic: 'wallet', color: 'rose', value: monthSpend, sub: `Costos y gastos de ${monthName}`,
          actions: [['#/contabilidad/gastos', 'Registrar gasto', true], ['#/contabilidad/reportes/gastos', 'Reporte']] })}
        ${journalCard({ title: 'Banco', ic: 'landmark', color: 'sky', value: stats.banco, sub: 'Saldo disponible',
          actions: [['#/contabilidad/mayor', 'Ver movimientos', true]] })}
        ${journalCard({ title: 'Caja', ic: 'inbox', color: 'amber', value: stats.caja, sub: 'Efectivo disponible',
          actions: [['#/contabilidad/mayor', 'Ver movimientos', true]] })}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="${card}">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-2.5">
              <span class="w-9 h-9 rounded-lg ${tone.violet} flex items-center justify-center">${icon('inbox')}</span>
              <div><p class="text-sm font-medium text-slate-700">Te deben</p><p class="text-xs text-slate-400">Cuentas por cobrar</p></div>
            </div>
            <p class="text-xl font-semibold text-slate-900 tabular-nums">$${fmtNum(stats.porCobrar)}</p>
          </div>
          <div class="mt-3 divide-y divide-slate-100">
            ${topDebtors.length ? topDebtors.map(([n, b]) => listRow(n, b, '#/contabilidad/por-cobrar')).join('') : '<p class="text-sm text-slate-400 py-2">Ningún cliente te debe.</p>'}
          </div>
        </div>
        <div class="${card}">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-2.5">
              <span class="w-9 h-9 rounded-lg ${tone.orange} flex items-center justify-center">${icon('receipt')}</span>
              <div><p class="text-sm font-medium text-slate-700">Debes</p><p class="text-xs text-slate-400">Cuentas por pagar</p></div>
            </div>
            <p class="text-xl font-semibold text-slate-900 tabular-nums">$${fmtNum(oweContainers + oweSuppliers + oweTaxes)}</p>
          </div>
          <div class="mt-3 divide-y divide-slate-100">
            ${listRow('Contenedores por pagar', oweContainers, '#/contabilidad/pagos')}
            ${listRow('Proveedores por pagar', oweSuppliers, '#/contabilidad/por-pagar')}
            ${oweTaxes > 0.005 ? listRow('IVA por declarar y pagar', oweTaxes, '#/contabilidad/fiscal/declaracion') : ''}
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 space-y-4">
          <div class="${card}">
            <h2 class="text-sm font-semibold text-slate-900 mb-1">Pendientes</h2>
            ${pendings.length
              ? `<div class="divide-y divide-slate-100">${pendings.map(pendingRow).join('')}</div>`
              : '<p class="text-sm text-slate-500 py-2">Todo al día: no hay nada pendiente.</p>'}
          </div>
          <div class="${card}">
            <h2 class="text-sm font-semibold text-slate-900 mb-1">Más vendidos</h2>
            ${topProducts.length === 0
              ? '<p class="text-sm text-slate-400 py-2">Sin ventas registradas todavía.</p>'
              : `<div class="divide-y divide-slate-100">${topProducts.map(([name, qty], i) => `
                  <div class="flex items-center justify-between text-sm py-2">
                    <span class="text-slate-600 truncate"><span class="text-slate-400 mr-2">${i + 1}</span>${esc(name)}</span>
                    <span class="text-slate-500 tabular-nums">${fmtNum(qty).replace(/\.00$/, '')} u.</span>
                  </div>`).join('')}</div>`}
          </div>
        </div>
        <div class="${card}">
          <h2 class="text-sm font-semibold text-slate-900 mb-1">Actividad reciente</h2>
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
