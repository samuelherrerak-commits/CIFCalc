import Store from '../store.js';
import { fmtNum, esc } from '../utils.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { card, badge } from '../components/accounting-shell.js';

// Prefijo del ref_doc → tipo de actividad (igual patrón que recentActivity de LegalYa).
const DOC_TYPES = {
  ING: { label: 'Ingreso', color: 'emerald', icon: '↑' },
  GST: { label: 'Gasto', color: 'rose', icon: '↓' },
  REC: { label: 'Recepción', color: 'blue', icon: '📦' },
  COS: { label: 'Costo', color: 'amber', icon: '⚙' },
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
    const accountsByCodigo = new Map(accounts.map(a => [a.codigo, a]));

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

    // Top vendidos: líneas de ingreso con inventario, cantidad agregada por producto
    // (el concepto se guarda como "<concepto> | <nombre producto>" al vender inventario).
    const productQty = new Map();
    for (const m of movements) {
      if (m.source !== 'income' || !(Number(m.cantidad) > 0) || m.unidad !== 'unidades') continue;
      const parts = String(m.concepto || '').split('|');
      const productName = (parts[1] || parts[0] || 'Producto').trim();
      productQty.set(productName, (productQty.get(productName) || 0) + Number(m.cantidad));
    }
    const topProducts = [...productQty.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    const statCard = (label, value, colorName) => `
      <div class="${card}">
        <div class="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">${esc(label)}</div>
        <div class="text-2xl font-black text-${colorName}-400">$${fmtNum(value)}</div>
      </div>
    `;

    const activityRow = (a) => `
      <div class="flex items-center gap-3 py-2.5 border-t border-slate-700/30 first:border-t-0">
        <div class="w-8 h-8 rounded-full bg-${a.type.color}-500/10 border border-${a.type.color}-500/20 flex items-center justify-center text-${a.type.color}-400 text-sm shrink-0">${a.type.icon}</div>
        <div class="flex-1 min-w-0">
          <div class="text-xs font-bold text-slate-200 truncate">${esc(a.desc) || esc(a.type.label)}</div>
          <div class="text-[10px] text-slate-500 truncate">${esc(a.refDoc)} ${a.entidad ? '· ' + esc(a.entidad) : ''} · ${esc(a.date || '')}</div>
        </div>
        <div class="text-xs font-mono font-black text-slate-300 shrink-0">$${fmtNum(a.amount)}</div>
      </div>
    `;

    const body = `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        ${statCard('Caja', stats.caja, 'emerald')}
        ${statCard('Banco', stats.banco, 'blue')}
        ${statCard('Por Cobrar', stats.porCobrar, 'amber')}
        ${statCard('Gastos y Costos', stats.gastosCostos, 'rose')}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 space-y-4">
          <div class="${card}">
            <h2 class="text-sm font-black uppercase tracking-wide text-slate-300 mb-1">Top Vendidos</h2>
            ${topProducts.length === 0
              ? '<p class="text-xs text-slate-500 py-3">Sin ventas de inventario registradas todavía.</p>'
              : `<div class="space-y-1.5 pt-1">${topProducts.map(([name, qty], i) => `
                  <div class="flex items-center justify-between text-xs py-1">
                    <span class="text-slate-300 truncate">${i + 1}. ${esc(name)}</span>
                    <span class="font-mono font-black text-slate-400">${fmtNum(qty)} u.</span>
                  </div>
                `).join('')}</div>`
            }
          </div>
          <div class="${card}">
            <h2 class="text-sm font-black uppercase tracking-wide text-slate-300 mb-1">Mayores Deudores</h2>
            ${topDebtors.length === 0
              ? '<p class="text-xs text-slate-500 py-3">Sin cuentas por cobrar pendientes.</p>'
              : `<div class="space-y-1.5 pt-1">${topDebtors.map(([name, bal], i) => `
                  <div class="flex items-center justify-between text-xs py-1">
                    <span class="text-slate-300 truncate">${i + 1}. ${esc(name)}</span>
                    <span class="font-mono font-black text-amber-400">$${fmtNum(bal)}</span>
                  </div>
                `).join('')}</div>`
            }
          </div>
        </div>
        <div class="${card}">
          <h2 class="text-sm font-black uppercase tracking-wide text-slate-300 mb-1">Actividad Reciente</h2>
          ${recentActivity.length === 0
            ? '<p class="text-xs text-slate-500 py-3">Sin movimientos registrados todavía.</p>'
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
