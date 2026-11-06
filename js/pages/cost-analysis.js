import Store from '../store.js';
import { fmtNum, esc } from '../utils.js';
import { analyzeContainer, realCostLines } from '../container-costs.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { card } from '../components/accounting-shell.js';

// Análisis de costos: lo que se calculó en Contenedores (estimado) contra lo
// que se registró en Contabilidad (Costos asignados a cada contenedor), por
// rubro y por producto.
const STATUS = { draft: 'Borrador', in_transit: 'En proceso', closed: 'Completo' };
const pct = (n) => `${(n * 100).toFixed(1).replace(/\.0$/, '')}%`;
const diffCell = (est, real) => {
  if (!(real > 0)) return '<span class="text-slate-300">—</span>';
  const d = real - est;
  if (Math.abs(d) < 0.005) return '<span class="text-slate-500">$0.00</span>';
  return `<span class="${d > 0 ? 'text-red-600' : 'text-emerald-700'}">${d > 0 ? '+' : '−'}$${fmtNum(Math.abs(d))}</span>`;
};

const CostAnalysis = {
  async render(app) {
    let selected = null;

    const analyses = () => {
      const real = realCostLines(Store.getAll('movements'), Store.getAll('accounts'));
      const seen = new Set();
      return Store.getAll('containers')
        .filter(c => !seen.has(c.id) && seen.add(c.id))
        .filter(c => c.status !== 'draft' || real.has(c.id))
        .map(c => analyzeContainer(c, Store.getItemsByContainer(c.id), real.get(c.id) || []))
        .sort((a, b) => String(b.container.operation_date || '').localeCompare(String(a.container.operation_date || '')));
    };

    const legacyHtml = () => {
      const legacy = Store.legacyClosingEntries();
      if (!legacy.length) return '';
      const total = legacy.reduce((s, e) => s + e.total, 0);
      return `
        <div class="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          <span class="flex-1">${legacy.length} asiento(s) de cierre o pago de contenedores del modelo anterior ($${fmtNum(total)}). Ya no se usan: el costo real sale de Costos.</span>
          <button id="btn-legacy" class="text-xs font-medium text-blue-600 hover:text-blue-700">Eliminar del diario</button>
        </div>`;
    };

    const detailHtml = (a) => {
      if (!a) return '';
      const c = a.container;
      const lines = [...a.lines].sort((x, y) => String(x.entry_date).localeCompare(String(y.entry_date)));
      return `
        <div class="${card} space-y-4">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 class="text-sm font-semibold text-slate-900">${esc(c.bl_number || 'Contenedor sin BL')}</h2>
              <p class="text-xs text-slate-400">${STATUS[c.status] || esc(c.status)}${c.operation_date ? ' · ' + esc(String(c.operation_date).slice(0, 10)) : ''}</p>
            </div>
            <a href="#/contenedor/${esc(c.id)}" class="text-xs text-slate-500 hover:text-slate-900">Abrir en Contenedores →</a>
          </div>

          <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div>
              <h3 class="text-xs font-semibold text-slate-500 mb-1">Por rubro</h3>
              <table class="w-full text-left text-xs">
                <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide"><th class="py-1.5">Rubro</th><th class="py-1.5 text-right">Estimado</th><th class="py-1.5 text-right">Registrado</th><th class="py-1.5 text-right">Diferencia</th></tr></thead>
                <tbody>${a.cats.filter(k => k.est > 0 || k.real > 0).map(k => `
                  <tr class="border-t border-slate-100">
                    <td class="py-1.5 text-slate-700">${esc(k.label)}</td>
                    <td class="py-1.5 text-right tabular-nums text-slate-500">$${fmtNum(k.est)}</td>
                    <td class="py-1.5 text-right tabular-nums ${k.real > 0 ? 'text-slate-900' : 'text-slate-300'}">${k.real > 0 ? '$' + fmtNum(k.real) : 'pendiente'}</td>
                    <td class="py-1.5 text-right tabular-nums">${diffCell(k.est, k.real)}</td>
                  </tr>`).join('')}
                  <tr class="border-t border-slate-300 font-semibold">
                    <td class="py-1.5">Total</td>
                    <td class="py-1.5 text-right tabular-nums">$${fmtNum(a.estTotal)}</td>
                    <td class="py-1.5 text-right tabular-nums">$${fmtNum(a.realTotal)}</td>
                    <td class="py-1.5 text-right tabular-nums">${diffCell(a.cats.filter(k => k.real > 0).reduce((s, k) => s + k.est, 0), a.realTotal)}</td>
                  </tr>
                </tbody>
              </table>
              <p class="text-[11px] text-slate-400 mt-1">La diferencia compara solo los rubros que ya tienen algo registrado. Sin IVA.</p>
            </div>

            <div>
              <h3 class="text-xs font-semibold text-slate-500 mb-1">Pagos asignados</h3>
              ${lines.length ? `
              <table class="w-full text-left text-xs">
                <tbody>${lines.map(m => `
                  <tr class="border-t border-slate-100 first:border-t-0">
                    <td class="py-1.5 text-slate-500 whitespace-nowrap pr-2">${esc(String(m.entry_date).slice(0, 10))}</td>
                    <td class="py-1.5"><div class="text-slate-700 truncate max-w-[16rem]">${esc(String(m.concepto || '').split('|')[0])}</div><div class="text-[10px] text-slate-400">${esc(m.ref_doc)} · ${esc(m.cuenta_contable)}${m.entidad ? ' · ' + esc(m.entidad) : ''}</div></td>
                    <td class="py-1.5 text-right tabular-nums">$${fmtNum(m.debit)}</td>
                  </tr>`).join('')}</tbody>
              </table>` : '<p class="text-xs text-slate-400 py-2">Todavía no hay costos asignados a este contenedor. Asígnalos en <a href="#/contabilidad/costos" class="text-blue-600">Costos</a>.</p>'}
            </div>
          </div>

          <div>
            <h3 class="text-xs font-semibold text-slate-500 mb-1">Costo unitario por producto <span class="font-normal text-slate-400">(ponderado; lo pendiente se toma del estimado)</span></h3>
            <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide"><th class="py-1.5">Producto</th><th class="py-1.5 text-right">Cant.</th><th class="py-1.5 text-right">Estimado c/u</th><th class="py-1.5 text-right">Real c/u</th><th class="py-1.5 text-right">Variación</th></tr></thead>
              <tbody>${a.products.map(p => {
                const v = p.estUnit > 0 ? (p.unit - p.estUnit) / p.estUnit : 0;
                return `
                <tr class="border-t border-slate-100">
                  <td class="py-1.5"><div class="text-slate-700">${esc(p.name)}</div><div class="text-[10px] font-mono text-slate-400">${esc(p.sku)}</div></td>
                  <td class="py-1.5 text-right tabular-nums">${fmtNum(p.qty).replace(/\.00$/, '')}</td>
                  <td class="py-1.5 text-right tabular-nums text-slate-500">$${fmtNum(p.estUnit)}</td>
                  <td class="py-1.5 text-right tabular-nums text-slate-900">$${fmtNum(p.unit)}</td>
                  <td class="py-1.5 text-right tabular-nums ${!a.hasReal || Math.abs(v) < 0.0005 ? 'text-slate-400' : v > 0 ? 'text-red-600' : 'text-emerald-700'}">${a.hasReal ? (v > 0 ? '+' : '') + pct(v) : '—'}</td>
                </tr>`; }).join('')}</tbody>
            </table>
            </div>
          </div>
        </div>`;
    };

    const draw = () => {
      const list = analyses();
      if (!selected || !list.some(a => a.container.id === selected)) selected = (list.find(a => a.hasReal) || list[0] || {}).container?.id || null;
      const current = list.find(a => a.container.id === selected);
      const body = `
        <div>
          <h1 class="text-xl font-semibold text-slate-900">Análisis de costos</h1>
          <p class="text-xs text-slate-400">Estimado en Contenedores contra lo registrado en Costos.</p>
        </div>
        ${legacyHtml()}
        <div class="${card} p-0 overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100"><th class="px-4 py-2">Contenedor</th><th class="px-4 py-2 text-right">Estimado</th><th class="px-4 py-2 text-right">Registrado</th><th class="px-4 py-2 text-right">Diferencia</th><th class="px-4 py-2 w-40">Registrado vs estimado</th></tr></thead>
            <tbody>${list.length ? list.map(a => `
              <tr data-ct="${esc(a.container.id)}" class="cursor-pointer border-t border-slate-100 ${a.container.id === selected ? 'bg-blue-50/60' : 'hover:bg-slate-50'}">
                <td class="px-4 py-2"><div class="text-slate-800">${esc(a.container.bl_number || 'Sin BL')}</div><div class="text-[11px] text-slate-400">${STATUS[a.container.status] || esc(a.container.status)}${a.container.operation_date ? ' · ' + esc(String(a.container.operation_date).slice(0, 10)) : ''}</div></td>
                <td class="px-4 py-2 text-right tabular-nums text-slate-500">$${fmtNum(a.estTotal)}</td>
                <td class="px-4 py-2 text-right tabular-nums ${a.hasReal ? 'text-slate-900' : 'text-slate-300'}">${a.hasReal ? '$' + fmtNum(a.realTotal) : '—'}</td>
                <td class="px-4 py-2 text-right tabular-nums">${diffCell(a.cats.filter(k => k.real > 0).reduce((s, k) => s + k.est, 0), a.realTotal)}</td>
                <td class="px-4 py-2"><div class="flex items-center gap-2"><div class="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div class="h-full bg-blue-500" style="width:${Math.min(100, a.coverage * 100).toFixed(0)}%"></div></div><span class="text-[11px] text-slate-500 w-10 text-right">${pct(a.coverage)}</span></div></td>
              </tr>`).join('') : '<tr><td colspan="5" class="px-4 py-6 text-center text-slate-400">No hay contenedores en proceso o completos.</td></tr>'}</tbody>
          </table>
        </div>
        ${detailHtml(current)}`;
      app.innerHTML = AccountingShell.wrap(AccountingTabs.render('cost-analysis'), body);
      app.querySelectorAll('[data-ct]').forEach(tr => tr.addEventListener('click', () => { selected = tr.dataset.ct; draw(); }));
      const legacyBtn = document.getElementById('btn-legacy');
      if (legacyBtn) legacyBtn.addEventListener('click', () => {
        if (!confirm('Se eliminarán del libro diario (y de Google Sheets) los asientos de cierre y de pago de contenedores del modelo anterior.\n\nLos costos registrados en Costos no se tocan. ¿Continuar?')) return;
        const n = Store.deleteLegacyClosingEntries();
        Store.applyRealCosts();
        alert(`Listo: ${n} asiento(s) eliminados.`);
        draw();
      });
    };

    draw();
    return () => {};
  }
};

export default CostAnalysis;
