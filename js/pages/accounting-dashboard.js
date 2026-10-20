import Store from '../store.js';
import { fmtNum, esc } from '../utils.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { card } from '../components/accounting-shell.js';

// Prefijo del ref_doc → tipo de actividad (igual patrón que recentActivity de LegalYa).
const DOC_TYPES = {
  ING: { label: 'Ingreso', color: 'emerald', icon: '↑' },
  VTA: { label: 'Venta', color: 'emerald', icon: '🛒' },
  GST: { label: 'Gasto', color: 'rose', icon: '↓' },
  REC: { label: 'Recepción', color: 'blue', icon: '📦' },
  COS: { label: 'Costo', color: 'amber', icon: '⚙' },
  PAG: { label: 'Pago Contenedor', color: 'blue', icon: '💳' },
  COB: { label: 'Cobro', color: 'emerald', icon: '💰' },
  ABP: { label: 'Abono a Proveedor', color: 'blue', icon: '💳' },
  CIE: { label: 'Cierre de Contenedor', color: 'slate', icon: '🧾' },
  MAN: { label: 'Asiento Manual', color: 'slate', icon: '✎' }
};

function docTypeFor(refDoc) {
  const prefix = String(refDoc || '').split('-')[0].toUpperCase();
  return DOC_TYPES[prefix] || { label: 'Movimiento', color: 'slate', icon: '•' };
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

    const statCard = (lbl, value, colorName, href, icon) => `
      <a href="${href}" class="group block bg-white border border-slate-200 hover:border-${colorName}-300 hover:shadow-md rounded-2xl p-4 transition">
        <div class="flex items-center justify-between mb-1">
          <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wide">${esc(lbl)}</span>
          <span class="w-8 h-8 rounded-xl bg-${colorName}-50 flex items-center justify-center">${icon}</span>
        </div>
        <div class="text-2xl font-black text-${colorName}-600">$${fmtNum(value)}</div>
        <div class="text-[10px] font-semibold text-slate-300 group-hover:text-${colorName}-500 mt-1">Ver detalle →</div>
      </a>
    `;

    // Accesos rápidos (como el menú de inicio de LegalYa).
    // Mismos colores que las secciones del menú: verde = ingresos, rojo =
    // gastos, celeste = activo (te deben), naranja = pasivo (debes).
    const actions = [
      ['#/contabilidad/ventas', 'Nueva venta', '🛒', 'bg-emerald-600 hover:bg-emerald-700 text-white'],
      ['#/contabilidad/presupuestos/nuevo', 'Presupuesto', '📄', 'bg-emerald-500 hover:bg-emerald-600 text-white'],
      ['#/contabilidad/gastos', 'Registrar gasto', '💸', 'bg-rose-500 hover:bg-rose-600 text-white'],
      ['#/contabilidad/por-cobrar', 'Cobrar a clientes', '💵', 'bg-sky-500 hover:bg-sky-600 text-white'],
      ['#/contabilidad/pagos', 'Pagar contenedor', '🚢', 'bg-orange-500 hover:bg-orange-600 text-white'],
      ['#/contabilidad/inventario', 'Ver stock', '📦', 'bg-white hover:bg-slate-50 text-slate-800 border border-slate-200'],
      ['#/contabilidad/contactos', 'Contactos', '👥', 'bg-slate-700 hover:bg-slate-800 text-white']
    ];
    const actionBtn = ([href, text, icon, cls]) => `
      <a href="${href}" class="${cls} rounded-2xl p-4 flex flex-col justify-between min-h-[96px] shadow-sm hover:shadow-lg hover:-translate-y-0.5 active:scale-95 transition">
        <span class="text-2xl">${icon}</span>
        <span class="text-xs font-black uppercase tracking-wide">${text}</span>
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
      dueTasks.length && { href: '#/contabilidad/contactos', icon: '⏰', color: 'violet', title: `${dueTasks.length} seguimiento(s) de clientes para hoy o vencidos`, value: 'Ver clientes' },
      payableCount && { href: '#/contabilidad/pagos', icon: '🚢', color: 'orange', title: `${payableCount} contenedor(es) por pagar`, value: '$' + fmtNum(payableTotal) },
      withoutEntry && { href: '#/contabilidad/pagos', icon: '⚠️', color: 'red', title: `${withoutEntry} contenedor(es) completo(s) sin asiento`, value: 'Generar' },
      stats.porCobrar > 0.01 && { href: '#/contabilidad/por-cobrar', icon: '💵', color: 'sky', title: 'Clientes te deben', value: '$' + fmtNum(stats.porCobrar) },
      pendingQuotes.length && { href: '#/contabilidad/presupuestos', icon: '⏳', color: 'amber', title: `${pendingQuotes.length} presupuesto(s) pendiente(s)`, value: '$' + fmtNum(pendingQuotes.reduce((s2, q) => s2 + (Number(q.total) || 0), 0)) },
      approvedQuotes.length && { href: '#/contabilidad/presupuestos', icon: '👍', color: 'blue', title: `${approvedQuotes.length} presupuesto(s) aprobado(s) por vender`, value: 'Convertir' },
      noPrice && { href: '#/contabilidad/inventario', icon: '🏷️', color: 'violet', title: `${noPrice} producto(s) con existencia sin precio`, value: 'Poner precio' }
    ].filter(Boolean);
    const pendingRow = (pd) => `
      <a href="${pd.href}" class="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-${pd.color}-300 hover:bg-${pd.color}-50 transition">
        <span class="w-9 h-9 rounded-xl bg-${pd.color}-100 flex items-center justify-center shrink-0">${pd.icon}</span>
        <span class="flex-1 text-xs font-semibold text-slate-700">${pd.title}</span>
        <span class="text-xs font-black text-${pd.color}-700 whitespace-nowrap">${pd.value} →</span>
      </a>`;

    const activityRow = (a) => `
      <a href="#/contabilidad/diario" class="flex items-center gap-3 py-2.5 px-1 -mx-1 rounded-lg hover:bg-slate-50 border-t border-slate-100 first:border-t-0">
        <div class="w-8 h-8 rounded-full bg-${a.type.color}-100 flex items-center justify-center text-${a.type.color}-600 text-sm shrink-0">${a.type.icon}</div>
        <div class="flex-1 min-w-0">
          <div class="text-xs font-bold text-slate-700 truncate">${esc(a.desc) || esc(a.type.label)}</div>
          <div class="text-[10px] text-slate-400 truncate">${esc(a.refDoc)} ${a.entidad ? '· ' + esc(a.entidad) : ''} · ${esc(a.date || '')}</div>
        </div>
        <div class="text-xs font-mono font-bold text-slate-700 shrink-0">$${fmtNum(a.amount)}</div>
      </a>
    `;

    const today = new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' });
    const body = `
      <div>
        <p class="text-[11px] font-bold uppercase tracking-widest text-blue-600">${esc(today)}</p>
        <h1 class="text-2xl font-black text-slate-900">¿Qué quieres hacer hoy?</h1>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
        ${actions.map(actionBtn).join('')}
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        ${statCard('Caja', stats.caja, 'emerald', '#/contabilidad/mayor', '💵')}
        ${statCard('Banco', stats.banco, 'blue', '#/contabilidad/mayor', '🏦')}
        ${statCard('Por Cobrar', stats.porCobrar, 'sky', '#/contabilidad/por-cobrar', '🧾')}
        ${statCard('Gastos y Costos', stats.gastosCostos, 'rose', '#/contabilidad/gastos', '💸')}
      </div>

      <div class="${card}">
        <h2 class="text-sm font-bold text-slate-700 mb-2">Pendientes</h2>
        ${pendings.length
          ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-2">${pendings.map(pendingRow).join('')}</div>`
          : '<p class="text-xs text-emerald-600 font-semibold py-2">✅ Todo al día: no hay nada pendiente.</p>'}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 space-y-4">
          <div class="${card}">
            <h2 class="text-sm font-bold text-slate-700 mb-1">Top Vendidos</h2>
            ${topProducts.length === 0
              ? '<p class="text-xs text-slate-400 py-3">Sin ventas registradas todavía.</p>'
              : `<div class="space-y-1.5 pt-1">${topProducts.map(([name, qty], i) => `
                  <div class="flex items-center justify-between text-xs py-1">
                    <span class="text-slate-600 truncate">${i + 1}. ${esc(name)}</span>
                    <span class="font-mono font-bold text-slate-500">${fmtNum(qty)} u.</span>
                  </div>
                `).join('')}</div>`
            }
          </div>
          <div class="${card}">
            <h2 class="text-sm font-bold text-slate-700 mb-1">Mayores Deudores</h2>
            ${topDebtors.length === 0
              ? '<p class="text-xs text-slate-400 py-3">Sin cuentas por cobrar pendientes.</p>'
              : `<div class="space-y-1.5 pt-1">${topDebtors.map(([name, bal], i) => `
                  <div class="flex items-center justify-between text-xs py-1">
                    <span class="text-slate-600 truncate">${i + 1}. ${esc(name)}</span>
                    <span class="font-mono font-bold text-amber-600">$${fmtNum(bal)}</span>
                  </div>
                `).join('')}</div>`
            }
          </div>
        </div>
        <div class="${card}">
          <h2 class="text-sm font-bold text-slate-700 mb-1">Actividad Reciente</h2>
          ${recentActivity.length === 0
            ? '<p class="text-xs text-slate-400 py-3">Sin movimientos registrados todavía.</p>'
            : recentActivity.map(activityRow).join('')
          }
        </div>
      </div>
    `;

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('dashboard'), body);

    return () => destroy.abort();
  }
};

export default AccountingDashboard;
