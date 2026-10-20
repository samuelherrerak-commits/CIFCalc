import Store from '../store.js';
import { esc, fmtNum, fmtInt } from '../utils.js';
import { buildStatements, periodBounds } from '../financials.js';
import { receivableByEntidad } from '../analytics.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { card, input, label } from '../components/accounting-shell.js';

// Estados financieros según VEN-NIF PYME: Situación Financiera, Resultado
// Integral, Cambios en el Patrimonio, Flujos de Efectivo (método directo) y
// Notas, con periodo comparativo, controles de cuadre e impresión con firmas.

const TABS = [
  ['esf', '🏛️ Situación Financiera'], ['eri', '📊 Resultados'], ['ecp', '🧮 Cambios en el Patrimonio'],
  ['efe', '💵 Flujos de Efectivo'], ['notas', '📝 Notas']
];
let state = { tab: 'esf', kind: 'anio', year: new Date().getFullYear(), month: new Date().getMonth() + 1, from: '', to: '' };
try { state = { ...state, ...JSON.parse(localStorage.getItem('cif_fs_state') || '{}') }; } catch { /* sin almacenamiento */ }

// Montos: negativos entre paréntesis, como en los estados financieros.
const money = (v) => {
  const n = Math.round((Number(v) || 0) * 100) / 100;
  if (Math.abs(n) < 0.005) return '—';
  return n < 0 ? `(${fmtNum(-n)})` : fmtNum(n);
};
const longDate = (iso) => {
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const [y, m, d] = String(iso).split('-').map(Number);
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
};

// Filas de tabla: [texto, actual, anterior, opciones]
function row(text, cur, prev, o = {}) {
  const cls = o.total ? 'font-bold border-t border-slate-300' : o.grand ? 'font-black border-t-2 border-double border-slate-800' : o.head ? 'font-bold text-slate-800 pt-3' : '';
  const indent = o.indent ? `padding-left:${o.indent * 16}px` : '';
  if (o.head) return `<tr><td colspan="3" class="py-1 ${cls}" style="${indent}">${esc(text)}</td></tr>`;
  return `<tr class="${o.muted ? 'text-slate-500' : ''}">
    <td class="py-1 pr-3 ${cls}" style="${indent}">${esc(text)}${o.note ? ` <span class="text-[10px] text-blue-600 align-super">${o.note}</span>` : ''}</td>
    <td class="py-1 text-right font-mono tabular-nums ${cls}">${money(cur)}</td>
    <td class="py-1 text-right font-mono tabular-nums text-slate-500 ${cls}">${money(prev)}</td></tr>`;
}
function table(p, rows, curLabel, prevLabel) {
  return `<table class="w-full text-[13px]">
    <thead><tr class="text-[10px] uppercase tracking-wide text-slate-400"><th class="text-left py-1"></th>
      <th class="text-right py-1 w-36">${esc(curLabel || p.label)}</th><th class="text-right py-1 w-36">${esc(prevLabel || p.pLabel)}</th></tr></thead>
    <tbody>${rows.join('')}</tbody></table>`;
}

function esfHtml(s) {
  const { bs: a, bsPrev: b, p } = s;
  const lines = (key, isPrevGroups) => {
    const curL = a.groups[key], prevL = b.groups[key];
    const names = new Map();
    for (const l of curL) names.set(l.code, l.name);
    for (const l of prevL) names.set(l.code, l.name);
    return [...names.entries()].sort().map(([code, name]) => row(name, (curL.find(l => l.code === code) || {}).amount, (prevL.find(l => l.code === code) || {}).amount, { indent: 2, muted: true }));
  };
  return table(p, [
    row('ACTIVO', 0, 0, { head: true }),
    row('Activo corriente', 0, 0, { head: true, indent: 1 }),
    row('Efectivo y equivalentes de efectivo', a.efectivo, b.efectivo, { indent: 1, note: '4' }), ...lines('efectivo'),
    row('Cuentas por cobrar comerciales', a.cxc, b.cxc, { indent: 1, note: '5' }),
    row('Inventarios', a.inventario, b.inventario, { indent: 1, note: '6' }),
    row('Impuestos por recuperar (IVA)', a.impuestos, b.impuestos, { indent: 1 }),
    ...(a.otrosCorr || b.otrosCorr ? [row('Otros activos corrientes', a.otrosCorr, b.otrosCorr, { indent: 1 })] : []),
    row('Total activo corriente', a.activoCorriente, b.activoCorriente, { total: true, indent: 1 }),
    ...(a.activoNC || b.activoNC ? [row('Activo no corriente', a.activoNC, b.activoNC, { indent: 1 }), ...lines('nc')] : []),
    row('TOTAL ACTIVO', a.activoTotal, b.activoTotal, { grand: true }),
    row('PASIVO Y PATRIMONIO', 0, 0, { head: true }),
    row('Pasivo corriente', 0, 0, { head: true, indent: 1 }),
    row('Cuentas por pagar comerciales', a.cxp, b.cxp, { indent: 1, note: '7' }), ...lines('cxp'),
    row('Préstamos por pagar', a.prestamos, b.prestamos, { indent: 1 }),
    ...(a.pOtros || b.pOtros ? [row('Otros pasivos corrientes', a.pOtros, b.pOtros, { indent: 1 })] : []),
    row('Total pasivo corriente', a.pasivoCorriente, b.pasivoCorriente, { total: true, indent: 1 }),
    ...(a.pasivoNC || b.pasivoNC ? [row('Pasivo no corriente', a.pasivoNC, b.pasivoNC, { indent: 1 })] : []),
    row('TOTAL PASIVO', a.pasivoTotal, b.pasivoTotal, { total: true }),
    row('Patrimonio', 0, 0, { head: true, indent: 1 }),
    row('Capital social', a.capital, b.capital, { indent: 1 }),
    row('Resultados acumulados', a.resultadosAcumulados, b.resultadosAcumulados, { indent: 1 }),
    row('Resultado del ejercicio', a.resultadoEjercicio, b.resultadoEjercicio, { indent: 1 }),
    row('TOTAL PATRIMONIO', a.patrimonio, b.patrimonio, { total: true }),
    row('TOTAL PASIVO Y PATRIMONIO', a.pasivoPatrimonio, b.pasivoPatrimonio, { grand: true })
  ], `Al ${longDate(p.to)}`, `Al ${longDate(p.pTo)}`);
}

function eriHtml(s) {
  const { is: a, isPrev: b, p } = s;
  const det = (key) => {
    const names = new Map();
    for (const l of a.lines[key]) names.set(l.code, l.name);
    for (const l of b.lines[key]) names.set(l.code, l.name);
    return [...names.entries()].sort().map(([code, name]) => row(name, (a.lines[key].find(l => l.code === code) || {}).amount, (b.lines[key].find(l => l.code === code) || {}).amount, { indent: 2, muted: true }));
  };
  return table(p, [
    row('Ingresos de actividades ordinarias', a.ventas, b.ventas, { note: '8' }),
    row('Menos: Costo de ventas', -a.costoVentas, -b.costoVentas, { note: '9' }),
    row('Ganancia bruta', a.bruta, b.bruta, { total: true }),
    row('Otros ingresos', a.otrosIngresos, b.otrosIngresos), ...det('otrosIngresos'),
    row('Menos: Gastos de distribución y logística', -a.distribucion, -b.distribucion),
    row('Menos: Gastos de ventas', -a.gVentas, -b.gVentas),
    row('Menos: Gastos de administración', -a.admin, -b.admin),
    row('Menos: Otros gastos', -a.otrosGastos, -b.otrosGastos), ...det('otrosGastos'),
    row('Resultado de actividades de operación', a.operativo, b.operativo, { total: true }),
    row('Menos: Costos financieros', -a.financieros, -b.financieros),
    row('Resultado antes de impuesto', a.antesImpuesto, b.antesImpuesto, { total: true }),
    row('Menos: Impuesto sobre la renta', -a.impuesto, -b.impuesto, { note: '10' }),
    row('RESULTADO DEL EJERCICIO', a.resultado, b.resultado, { grand: true }),
    row('Otro resultado integral', 0, 0),
    row('RESULTADO INTEGRAL TOTAL', a.resultado, b.resultado, { grand: true })
  ]);
}

function ecpHtml(s) {
  const block = (e, label, fromIso, toIso) => `
    <tr><td class="py-1 font-bold pt-3" colspan="4">${esc(label)}</td></tr>
    ${[['Saldo al ' + longDate(fromIso), e.capIni, e.resultadosIni, e.totalIni, true],
       ['Aportes de capital', e.aportes, 0, e.aportes],
       ['Retiros / dividendos', -e.retiros, 0, -e.retiros],
       ['Resultado integral del periodo', 0, e.resultado, e.resultado],
       ['Saldo al ' + longDate(toIso), e.capFin, e.resultadosFin, e.totalFin, true]]
      .map(([t, c, r, tot, bold]) => `<tr class="${bold ? 'font-bold border-t border-slate-300' : ''}"><td class="py-1 pl-4">${esc(t)}</td>
        <td class="py-1 text-right font-mono">${money(c)}</td><td class="py-1 text-right font-mono">${money(r)}</td><td class="py-1 text-right font-mono">${money(tot)}</td></tr>`).join('')}`;
  const dayBefore = (iso) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
  return `<table class="w-full text-[13px]">
    <thead><tr class="text-[10px] uppercase tracking-wide text-slate-400"><th></th><th class="text-right w-36">Capital social</th><th class="text-right w-36">Resultados acumulados</th><th class="text-right w-36">Total patrimonio</th></tr></thead>
    <tbody>${block(s.eqPrev, s.p.pLabel, dayBefore(s.p.pFrom), s.p.pTo)}${block(s.eq, s.p.label, dayBefore(s.p.from), s.p.to)}</tbody></table>`;
}

function efeHtml(s) {
  const { cf: a, cfPrev: b, p } = s;
  const sec = (key, title, totalLabel, tot, ptot) => [
    row(title, 0, 0, { head: true }),
    ...a.rows.filter(r => r.section === key).map((r, i) => row(r.label, r.amount, b.rows.find(x => x.key === r.key).amount, { indent: 1 })),
    row(totalLabel, tot, ptot, { total: true })
  ];
  return table(p, [
    ...sec('operacion', 'Flujos de efectivo por actividades de operación', 'Efectivo neto de actividades de operación', a.operacion, b.operacion),
    ...sec('inversion', 'Flujos de efectivo por actividades de inversión', 'Efectivo neto de actividades de inversión', a.inversion, b.inversion),
    ...sec('financiacion', 'Flujos de efectivo por actividades de financiación', 'Efectivo neto de actividades de financiación', a.financiacion, b.financiacion),
    row('Aumento (disminución) neto del efectivo', a.neto, b.neto, { total: true }),
    row('Efectivo al inicio del periodo', a.inicial, b.inicial),
    row('EFECTIVO AL FINAL DEL PERIODO', a.final, b.final, { grand: true })
  ]);
}

function notasHtml(s) {
  const prof = Store.getBusinessProfile();
  const { bs, is, inv, p } = s;
  const cxc = [...receivableByEntidad().entries()].filter(([, v]) => v > 0.01).sort((x, y) => y[1] - x[1]);
  const small = (rows, cols) => `<table class="w-full text-xs mt-1 mb-2"><thead><tr class="text-[10px] uppercase text-slate-400">${cols.map((c, i) => `<th class="${i ? 'text-right' : 'text-left'} py-0.5">${c}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
  const tr = (...cells) => `<tr class="border-t border-slate-100">${cells.map((c, i) => `<td class="py-0.5 ${i ? 'text-right font-mono' : ''}">${c}</td>`).join('')}</tr>`;
  return `<div class="space-y-4 text-[13px] leading-relaxed text-slate-700">
    <section><h3 class="font-bold text-slate-900">1. Entidad</h3>
      <p>${esc(prof.name || '[Nombre de la empresa]')}${prof.rif ? `, RIF ${esc(prof.rif)}` : ''}${prof.address ? `, domiciliada en ${esc(prof.address)}` : ''}. Se dedica a la importación y comercialización de mercancía (grifería, accesorios de baño y similares).</p></section>
    <section><h3 class="font-bold text-slate-900">2. Bases de preparación</h3>
      <p>Los estados financieros se preparan de acuerdo con los Principios de Contabilidad de Aceptación General en Venezuela para Pequeñas y Medianas Entidades (VEN-NIF PYME), emitidos por la Federación de Colegios de Contadores Públicos de Venezuela, basados en la NIIF para las PYMES, sobre la base del costo histórico. Se presentan en dólares estadounidenses (USD), moneda en la que la entidad registra sus operaciones, con cifras comparativas del periodo anterior.</p>
      <p class="text-amber-700">Si la moneda funcional determinada fuera el bolívar, los Boletines de Aplicación VEN-NIF exigen reexpresar las cifras por los efectos de la inflación. Esta determinación y la conversión a bolívares para fines fiscales deben validarse con el contador público.</p></section>
    <section><h3 class="font-bold text-slate-900">3. Políticas contables significativas</h3>
      <ul class="list-disc pl-5 space-y-1">
        <li><strong>Efectivo y equivalentes:</strong> caja y saldos en bancos de disponibilidad inmediata.</li>
        <li><strong>Cuentas por cobrar comerciales:</strong> ventas a crédito al valor de la transacción, sin intereses.</li>
        <li><strong>Inventarios:</strong> al menor entre el costo y el precio de venta estimado menos costos de terminación y venta. El costo incluye FOB, flete, seguro, arancel, tasa portuaria, agente aduanal y demás costos hasta su ubicación actual, sin IVA (recuperable), y se determina por el método del costo promedio ponderado. El costo de ventas se determina por el sistema periódico: inventario inicial + compras del periodo − inventario final.</li>
        <li><strong>Reconocimiento de ingresos:</strong> al entregar la mercancía al cliente, por el precio acordado neto de descuentos.</li>
        <li><strong>Cuentas por pagar:</strong> obligaciones con proveedores del exterior (contenedores) y locales, al valor de la transacción.</li>
        <li><strong>Impuesto sobre la renta:</strong> no se ha calculado en estos estados; debe determinarlo el contador público según la Ley de ISLR y reconocer el impuesto corriente y diferido (Sección 29).</li>
      </ul></section>
    <section><h3 class="font-bold text-slate-900">4. Efectivo y equivalentes de efectivo</h3>
      ${small(bs.groups.efectivo.map(l => tr(esc(l.name), money(l.amount))).concat(tr('<strong>Total</strong>', `<strong>${money(bs.efectivo)}</strong>`)), ['Cuenta', 'Saldo'])}</section>
    <section><h3 class="font-bold text-slate-900">5. Cuentas por cobrar comerciales</h3>
      ${cxc.length ? small(cxc.slice(0, 15).map(([n, v]) => tr(esc(n || 'Sin cliente'), money(v))).concat(tr('<strong>Total</strong>', `<strong>${money(bs.cxc)}</strong>`)), ['Cliente', 'Saldo']) : '<p class="text-slate-400">Sin saldos por cobrar.</p>'}</section>
    <section><h3 class="font-bold text-slate-900">6. Inventarios</h3>
      <p>Mercancía disponible para la venta al ${esc(longDate(p.to))}: ${fmtInt(inv.units)} unidades por ${money(inv.value)} USD.</p>
      ${inv.detail.length ? small(inv.detail.slice(0, 15).map(d => tr(esc(d.name), fmtInt(d.qty), money(d.avg), money(d.value))), ['Producto', 'Unidades', 'Costo promedio', 'Total']) : ''}
      ${inv.detail.length > 15 ? `<p class="text-xs text-slate-400">… y ${inv.detail.length - 15} producto(s) más.</p>` : ''}</section>
    <section><h3 class="font-bold text-slate-900">7. Cuentas por pagar comerciales</h3>
      ${small(bs.groups.cxp.map(l => tr(esc(l.name), money(l.amount))).concat(tr('<strong>Total</strong>', `<strong>${money(bs.cxp)}</strong>`)), ['Cuenta', 'Saldo'])}</section>
    <section><h3 class="font-bold text-slate-900">8. Ingresos de actividades ordinarias</h3>
      <p>Ventas de mercancía del periodo: ${money(is.ventas)} USD, netas de descuentos y promociones.</p></section>
    <section><h3 class="font-bold text-slate-900">9. Costo de ventas</h3>
      ${small([tr('Inventario inicial', money(is.invIni)), tr('(+) Compras y costos de importación del periodo', money(is.compras)), tr('(−) Inventario final', money(-is.invFin)), tr('<strong>Costo de ventas</strong>', `<strong>${money(is.costoVentas)}</strong>`)], ['Concepto', 'USD'])}
      ${is.lines.compras.length ? small(is.lines.compras.map(l => tr(esc(l.name), money(l.amount))), ['Compras y costos por concepto', 'USD']) : ''}</section>
    <section><h3 class="font-bold text-slate-900">10. Impuesto sobre la renta</h3>
      <p>Pendiente de determinación por el contador público. El resultado del ejercicio se presenta antes de considerar el ISLR del periodo.</p></section>
  </div>`;
}

const STATEMENT_TITLES = {
  esf: 'Estado de Situación Financiera', eri: 'Estado de Resultado Integral', ecp: 'Estado de Cambios en el Patrimonio',
  efe: 'Estado de Flujos de Efectivo (método directo)', notas: 'Notas a los Estados Financieros'
};
const RENDER = { esf: esfHtml, eri: eriHtml, ecp: ecpHtml, efe: efeHtml, notas: notasHtml };

// Impresión: encabezado con la empresa, el estado, periodo y moneda, y firmas.
function printStatements(s, which) {
  const prof = Store.getBusinessProfile();
  const page = (key) => `
    <section class="page">
      <header>
        ${prof.logo ? `<img src="${esc(prof.logo)}" class="logo" alt="">` : ''}
        <div class="co">${esc(prof.name || '[Nombre de la empresa]')}</div>
        ${prof.rif ? `<div class="sub">RIF: ${esc(prof.rif)}</div>` : ''}
        <div class="title">${STATEMENT_TITLES[key]}</div>
        <div class="sub">${key === 'esf' ? `Al ${longDate(s.p.to)} y ${longDate(s.p.pTo)}` : `${esc(s.p.label)} y ${esc(s.p.pLabel)}`}</div>
        <div class="sub">(Expresado en dólares estadounidenses — USD)</div>
      </header>
      <div class="body">${RENDER[key](s)}</div>
      ${key !== 'notas' ? '<p class="foot">Las notas adjuntas forman parte integral de estos estados financieros.</p>' : ''}
      <div class="signs"><div><span></span>Representante legal</div><div><span></span>Contador público<br>C.P.C. N.º ________</div></div>
    </section>`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(STATEMENT_TITLES[which] || 'Estados financieros')}</title>
    <style>
      @page { size: letter; margin: 16mm; }
      body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 11.5px; margin: 0; }
      .page { page-break-after: always; } .page:last-child { page-break-after: auto; }
      header { text-align: center; margin-bottom: 14px; } .logo { max-height: 48px; margin-bottom: 6px; }
      .co { font-weight: 800; font-size: 15px; } .title { font-weight: 800; font-size: 14px; margin-top: 8px; text-transform: uppercase; } .sub { color: #374151; }
      table { width: 100%; border-collapse: collapse; } th { font-size: 9.5px; text-transform: uppercase; color: #6b7280; padding: 4px 0; }
      td { padding: 2.5px 0; vertical-align: top; } .text-right { text-align: right; } .font-mono { font-family: "Courier New", monospace; }
      .font-bold, .font-black { font-weight: 700; } .border-t { border-top: 1px solid #9ca3af; } .border-t-2 { border-top: 3px double #111827; }
      .text-slate-500, .text-slate-400 { color: #6b7280; } .text-blue-600 { color: #1d4ed8; } .text-amber-700 { color: #92400e; }
      h3 { font-size: 12px; margin: 12px 0 4px; } ul { margin: 0; padding-left: 18px; } p { margin: 4px 0; }
      .foot { margin-top: 14px; font-style: italic; color: #4b5563; }
      .signs { display: flex; justify-content: space-around; margin-top: 56px; text-align: center; }
      .signs div { width: 40%; } .signs span { display: block; border-top: 1px solid #111827; margin-bottom: 4px; }
    </style></head><body>${(which === 'todos' ? Object.keys(RENDER) : [which]).map(page).join('')}</body></html>`;
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  frame.contentWindow.document.open(); frame.contentWindow.document.write(html); frame.contentWindow.document.close();
  setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 1000); }, 300);
}

const FinancialStatements = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;
    const years = (() => {
      const ys = new Set(Store.getAll('movements').map(m => Number(String(m.entry_date).slice(0, 4))).filter(Boolean));
      ys.add(new Date().getFullYear());
      return [...ys].sort((a, b) => b - a);
    })();

    const draw = () => {
      try { localStorage.setItem('cif_fs_state', JSON.stringify(state)); } catch { /* sin almacenamiento */ }
      const p = periodBounds(state.kind, Number(state.year), Number(state.month), state.from || `${state.year}-01-01`, state.to || new Date().toISOString().slice(0, 10));
      const s = buildStatements(p);
      window.__fsLast = s;
      document.getElementById('fs-tabs').innerHTML = TABS.map(([k, t]) => `
        <button data-tab="${k}" class="px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${state.tab === k ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-400'}">${t}</button>`).join('');
      document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { state.tab = b.dataset.tab; draw(); }));

      const okBs = Math.abs(s.bs.diferencia) < 0.01 && Math.abs(s.bsPrev.diferencia) < 0.01;
      const okCf = Math.abs(s.cf.diferencia) < 0.01 && Math.abs(s.cfPrev.diferencia) < 0.01;
      const okEq = Math.abs(s.eq.totalFin - s.bs.patrimonio) < 0.01;
      const check = (ok, txt, bad) => `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}">${ok ? '✓' : '⚠'} ${ok ? txt : bad}</span>`;
      const warn = (txt) => `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800">⚠ ${txt}</span>`;
      const issues = s.issues || {};
      const warnings = [
        issues.orphanTotal > 0.01 ? warn(`Hay asiento(s) de cierre de contenedores que no están completos por $${fmtNum(issues.orphanTotal)} (${esc(issues.orphanNames.join(', '))}): suman a compras y al costo de ventas`) : '',
        s.is.costoVentas < -0.01 ? warn(`El costo de ventas salió negativo ($${fmtNum(s.is.costoVentas)}): el inventario final vale más que las compras registradas; revisa los contenedores completados`) : '',
        issues.unlinkedCost > 0.01 ? warn(`$${fmtNum(issues.unlinkedCost)} de contenedores completos son productos sin vincular al catálogo: no entran al inventario y van completos al costo de ventas`) : ''
      ].join('');
      document.getElementById('fs-checks').innerHTML = warnings +
        check(okBs, 'Activo = Pasivo + Patrimonio', `El balance no cuadra por ${money(s.bs.diferencia)}`) +
        check(okEq, 'Patrimonio concilia con el balance', 'El patrimonio no concilia') +
        check(okCf, 'Flujo de efectivo concilia con caja y bancos', `El flujo no concilia por ${money(s.cf.diferencia)}`);

      const kpi = (t, v, sub) => `<div class="bg-white border border-slate-200 rounded-2xl p-3"><div class="text-[10px] font-bold uppercase tracking-wide text-slate-400">${t}</div><div class="text-lg font-black text-slate-900">$${fmtNum(v)}</div><div class="text-[10px] text-slate-400">${sub}</div></div>`;
      const ac = s.bs.activoCorriente, pc = s.bs.pasivoCorriente;
      document.getElementById('fs-kpis').innerHTML =
        kpi('Ventas', s.is.ventas, esc(p.label)) +
        kpi('Resultado del ejercicio', s.is.resultado, s.is.ventas ? `${fmtNum(s.is.resultado / s.is.ventas * 100)}% de las ventas` : '—') +
        kpi('Activo total', s.bs.activoTotal, `al ${p.to}`) +
        kpi('Patrimonio', s.bs.patrimonio, `al ${p.to}`) +
        `<div class="bg-white border border-slate-200 rounded-2xl p-3"><div class="text-[10px] font-bold uppercase tracking-wide text-slate-400">Liquidez corriente</div><div class="text-lg font-black text-slate-900">${pc > 0 ? fmtNum(ac / pc) : '—'}</div><div class="text-[10px] text-slate-400">activo corriente / pasivo corriente</div></div>`;

      document.getElementById('fs-title').textContent = STATEMENT_TITLES[state.tab];
      document.getElementById('fs-sub').textContent = state.tab === 'esf' ? `Al ${longDate(p.to)}, comparativo al ${longDate(p.pTo)} · USD` : `${p.label}, comparativo ${p.pLabel} · USD`;
      document.getElementById('fs-body').innerHTML = RENDER[state.tab](s);
    };

    const opt = (arr, v) => arr.map(([k, t]) => `<option value="${k}" ${String(k) === String(v) ? 'selected' : ''}>${t}</option>`).join('');
    const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const body = `
      <div class="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-black text-slate-900">Estados Financieros</h1>
          <p class="text-xs text-slate-500">Según VEN-NIF PYME, con cifras comparativas. Se generan solos desde el Libro Diario. Los montos entre paréntesis son negativos (se restan).</p>
        </div>
        <div class="flex gap-2">
          <button id="fs-print" class="px-3 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 hover:border-slate-400">🖨 Imprimir este estado</button>
          <button id="fs-print-all" class="px-3 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-black text-white">🖨 Imprimir juego completo</button>
        </div>
      </div>
      <div class="${card} grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
        <div><label class="${label}">Periodo</label><select id="fs-kind" class="${input}">${opt([['anio', 'Ejercicio anual'], ['mes', 'Mes'], ['custom', 'Personalizado']], state.kind)}</select></div>
        <div class="${state.kind === 'custom' ? 'hidden' : ''}"><label class="${label}">Año</label><select id="fs-year" class="${input}">${opt(years.map(y => [y, y]), state.year)}</select></div>
        <div class="${state.kind === 'mes' ? '' : 'hidden'}"><label class="${label}">Mes</label><select id="fs-month" class="${input}">${opt(MONTHS.map((m, i) => [i + 1, m]), state.month)}</select></div>
        <div class="${state.kind === 'custom' ? '' : 'hidden'}"><label class="${label}">Desde</label><input id="fs-from" type="date" class="${input}" value="${esc(state.from)}"></div>
        <div class="${state.kind === 'custom' ? '' : 'hidden'}"><label class="${label}">Hasta</label><input id="fs-to" type="date" class="${input}" value="${esc(state.to)}"></div>
      </div>
      <div id="fs-kpis" class="grid grid-cols-2 md:grid-cols-5 gap-3"></div>
      <div id="fs-checks" class="flex flex-wrap gap-2"></div>
      <div id="fs-tabs" class="flex gap-2 overflow-x-auto pb-1"></div>
      <div class="${card}">
        <div class="text-center mb-4">
          <div class="text-xs font-bold text-slate-500">${esc(Store.getBusinessProfile().name || '')}</div>
          <h2 id="fs-title" class="text-base font-black uppercase tracking-wide text-slate-900"></h2>
          <div id="fs-sub" class="text-xs text-slate-500"></div>
        </div>
        <div id="fs-body" class="overflow-x-auto"></div>
      </div>
      <p class="text-[11px] text-slate-400">Estos estados son una herramienta de gestión. Para fines legales y fiscales deben ser revisados y firmados por un contador público colegiado (C.P.C.), quien también determina el ISLR y valida la moneda funcional.</p>`;
    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('financials'), body);

    const on = (id, ev, fn) => document.getElementById(id).addEventListener(ev, fn, { signal });
    const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
    on('fs-kind', 'change', (e) => { state.kind = e.target.value; if (state.kind === 'custom' && !state.from) { state.from = `${new Date().getFullYear()}-01-01`; state.to = new Date().toISOString().slice(0, 10); } rerender(); });
    on('fs-year', 'change', (e) => { state.year = Number(e.target.value); draw(); });
    on('fs-month', 'change', (e) => { state.month = Number(e.target.value); draw(); });
    on('fs-from', 'change', (e) => { state.from = e.target.value; draw(); });
    on('fs-to', 'change', (e) => { state.to = e.target.value; draw(); });
    on('fs-print', 'click', () => printStatements(window.__fsLast, state.tab));
    on('fs-print-all', 'click', () => printStatements(window.__fsLast, 'todos'));
    draw();
    return () => destroy.abort();
  }
};

export default FinancialStatements;
