import Store from './store.js';
import { computeContainer } from './utils.js';
import { inferirTipo } from './accounting.js';
import { salesLines } from './analytics.js';

// Estados financieros (VEN-NIF PYME, basada en la NIIF para las PYMES):
// Situación Financiera, Resultado Integral, Cambios en el Patrimonio y Flujos
// de Efectivo (método directo), todos con periodo comparativo.
//
// Inventarios: el diario lleva el costo de cada contenedor completo directo a
// las cuentas de Costo (el inventario de la app es de referencia). Para
// presentar los estados según la Sección 13 se usa el sistema periódico:
//   Costo de ventas = Inventario inicial + Compras/costos del periodo − Inventario final
// y el inventario final aparece como activo corriente. El inventario a una
// fecha se valora a costo promedio ponderado con las entradas de contenedores
// completados (con asiento de cierre) y las salidas por ventas.

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const iso = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

function accountsInfo() {
  const accounts = Store.getAll('accounts');
  const byCode = new Map(accounts.map(a => [a.codigo, a]));
  return {
    byCode,
    tipoOf: (code) => (byCode.get(code) || {}).tipo || inferirTipo(code),
    nameOf: (code, fallback) => (byCode.get(code) || {}).nombre || fallback || code,
    teOf: (code) => (byCode.get(code) || {}).tipo_especifico || ''
  };
}

// Saldo de cada cuenta acumulado hasta `to` (o movimiento entre from y to).
function balances(movements, from, to) {
  const map = new Map();
  for (const m of movements) {
    const d = String(m.entry_date || '').slice(0, 10);
    if (to && d > to) continue;
    if (from && d < from) continue;
    const code = m.codigo_cuenta;
    if (!code) continue;
    const b = map.get(code) || { debit: 0, credit: 0, name: m.cuenta_contable };
    b.debit += Number(m.debit) || 0;
    b.credit += Number(m.credit) || 0;
    map.set(code, b);
  }
  return map;
}

// Inventario valorado a una fecha (fin del día `date`).
export function inventoryAt(date) {
  const movements = Store.getAll('movements');
  const closingDate = new Map();
  for (const m of movements) {
    if (m.source === 'container_close' && m.source_ref && !closingDate.has(m.source_ref)) closingDate.set(m.source_ref, String(m.entry_date).slice(0, 10));
  }
  const ins = new Map(); // productId → { qty, cost }
  for (const c of Store.getAll('containers')) {
    const d = closingDate.get(c.id);
    if (!d || d > date) continue; // solo contenedores cuyo costo ya está en el diario
    for (const calc of computeContainer(c, Store.getItemsByContainer(c.id)).calculated) {
      const pid = calc.item.product_id;
      if (!pid || !(calc.qty > 0)) continue;
      const e = ins.get(pid) || { qty: 0, cost: 0 };
      e.qty += calc.qty; e.cost += calc.qty * calc.costNoVat;
      ins.set(pid, e);
    }
  }
  const outs = new Map();
  for (const l of salesLines()) {
    if (!l.productId || l.date > date) continue;
    outs.set(l.productId, (outs.get(l.productId) || 0) + l.qty);
  }
  let value = 0, units = 0;
  const detail = [];
  const products = new Map(Store.getAll('products').map(p => [p.id, p]));
  for (const [pid, e] of ins) {
    const onHand = Math.max(0, e.qty - (outs.get(pid) || 0));
    if (!(onHand > 0)) continue;
    const avg = e.cost / e.qty;
    value += onHand * avg; units += onHand;
    detail.push({ name: (products.get(pid) || {}).name || 'Producto', qty: onHand, avg, value: onHand * avg });
  }
  return { value: r2(value), units, detail: detail.sort((a, b) => b.value - a.value) };
}

// Clasificación de cuentas para la presentación.
function classifyAsset(code, te) {
  if (code.startsWith('1.2')) return 'nc';
  if (te === 'Efectivo' || te === 'Banco') return 'efectivo';
  if (te === 'Clientes') return 'cxc';
  if (code.startsWith('1.1.03')) return 'impuestos';
  return 'otrosCorr';
}
function classifyLiability(code, te) {
  if (code.startsWith('2.2')) return 'nc';
  if (te === 'Proveedores' || code.startsWith('2.1.01') || code.startsWith('2.1.02')) return 'cxp';
  if (code.startsWith('2.1.03')) return 'prestamos';
  return 'otrosCorr';
}
function classifyResult(code, tipo) {
  if (tipo === 'Ingreso') return code.startsWith('4.1.01') ? 'ventas' : 'otrosIngresos';
  if (tipo === 'Costo') return 'compras';
  if (code.startsWith('6.1.01')) return 'admin';
  if (code.startsWith('6.1.02')) return 'distribucion';
  if (code.startsWith('6.1.03')) return 'gVentas';
  if (code.startsWith('6.8')) return 'financieros';
  return 'otrosGastos';
}

// Resultado de un periodo [from, to] con el costo de ventas periódico.
function incomeStatement(movements, info, from, to) {
  const b = balances(movements, from, to);
  const lines = { ventas: [], otrosIngresos: [], compras: [], admin: [], distribucion: [], gVentas: [], financieros: [], otrosGastos: [] };
  for (const [code, v] of b) {
    const tipo = info.tipoOf(code);
    if (!['Ingreso', 'Costo', 'Gasto'].includes(tipo)) continue;
    const amount = tipo === 'Ingreso' ? v.credit - v.debit : v.debit - v.credit;
    if (Math.abs(amount) < 0.005) continue;
    lines[classifyResult(code, tipo)].push({ code, name: info.nameOf(code, v.name), amount: r2(amount) });
  }
  const sum = (k) => r2(lines[k].reduce((s, l) => s + l.amount, 0));
  const invIni = from ? inventoryAt(addDays(from, -1)).value : 0;
  const invFin = inventoryAt(to).value;
  const compras = sum('compras');
  const costoVentas = r2(invIni + compras - invFin);
  const ventas = sum('ventas');
  const bruta = r2(ventas - costoVentas);
  const otrosIngresos = sum('otrosIngresos');
  const gastosOp = r2(sum('admin') + sum('distribucion') + sum('gVentas') + sum('otrosGastos'));
  const operativo = r2(bruta + otrosIngresos - gastosOp);
  const financieros = sum('financieros');
  const antesImpuesto = r2(operativo - financieros);
  return {
    lines, ventas, invIni, compras, invFin, costoVentas, bruta, otrosIngresos,
    admin: sum('admin'), distribucion: sum('distribucion'), gVentas: sum('gVentas'), otrosGastos: sum('otrosGastos'),
    gastosOp, operativo, financieros, antesImpuesto, impuesto: 0, resultado: antesImpuesto
  };
}

// Situación financiera al cierre de `date`.
function balanceSheet(movements, info, date, periodFrom) {
  const b = balances(movements, null, date);
  const groups = { efectivo: [], cxc: [], impuestos: [], otrosCorr: [], nc: [], cxp: [], prestamos: [], pOtrosCorr: [], pNc: [], capital: [] };
  let acumulado = 0; // resultado contable (sin ajuste de inventario) de todos los ingresos/costos/gastos
  for (const [code, v] of b) {
    const tipo = info.tipoOf(code);
    const te = info.teOf(code);
    const name = info.nameOf(code, v.name);
    if (tipo === 'Activo') {
      const amt = r2(v.debit - v.credit);
      if (Math.abs(amt) >= 0.005) groups[classifyAsset(code, te)].push({ code, name, amount: amt });
    } else if (tipo === 'Pasivo') {
      const amt = r2(v.credit - v.debit);
      const g = classifyLiability(code, te);
      if (Math.abs(amt) >= 0.005) groups[g === 'nc' ? 'pNc' : g === 'otrosCorr' ? 'pOtrosCorr' : g].push({ code, name, amount: amt });
    } else if (tipo === 'Patrimonio') {
      const amt = r2(v.credit - v.debit);
      if (Math.abs(amt) >= 0.005) groups.capital.push({ code, name, amount: amt });
    } else {
      acumulado += v.credit - v.debit; // ingresos suman, costos y gastos restan
    }
  }
  const inventario = inventoryAt(date).value;
  const sum = (arr) => r2(arr.reduce((s, l) => s + l.amount, 0));
  const efectivo = sum(groups.efectivo), cxc = sum(groups.cxc), impuestos = sum(groups.impuestos), otrosCorr = sum(groups.otrosCorr);
  const activoCorriente = r2(efectivo + cxc + inventario + impuestos + otrosCorr);
  const activoNC = sum(groups.nc);
  const activoTotal = r2(activoCorriente + activoNC);
  const cxp = sum(groups.cxp), prestamos = sum(groups.prestamos), pOtros = sum(groups.pOtrosCorr);
  const pasivoCorriente = r2(cxp + prestamos + pOtros);
  const pasivoNC = sum(groups.pNc);
  const pasivoTotal = r2(pasivoCorriente + pasivoNC);
  const capital = sum(groups.capital);
  // Resultado acumulado ajustado por inventario (sistema periódico desde el inicio).
  const resultadoTotal = r2(acumulado + inventario);
  const resultadoEjercicio = periodFrom ? incomeStatement(movements, info, periodFrom, date).resultado : resultadoTotal;
  const resultadosAcumulados = r2(resultadoTotal - resultadoEjercicio);
  const patrimonio = r2(capital + resultadosAcumulados + resultadoEjercicio);
  return {
    date, groups, inventario, efectivo, cxc, impuestos, otrosCorr, activoCorriente, activoNC, activoTotal,
    cxp, prestamos, pOtros, pasivoCorriente, pasivoNC, pasivoTotal, capital, resultadosAcumulados, resultadoEjercicio,
    patrimonio, pasivoPatrimonio: r2(pasivoTotal + patrimonio), diferencia: r2(activoTotal - pasivoTotal - patrimonio)
  };
}

// Cambios en el patrimonio de un periodo.
function equityChanges(movements, info, from, to) {
  const ini = balanceSheet(movements, info, addDays(from, -1), null);
  const capIni = ini.capital;
  const resultadosIni = r2(ini.resultadosAcumulados + ini.resultadoEjercicio);
  let aportes = 0, retiros = 0;
  for (const m of movements) {
    const d = String(m.entry_date || '').slice(0, 10);
    if (d < from || d > to || info.tipoOf(m.codigo_cuenta) !== 'Patrimonio') continue;
    aportes += Number(m.credit) || 0;
    retiros += Number(m.debit) || 0;
  }
  const resultado = incomeStatement(movements, info, from, to).resultado;
  return {
    capIni, resultadosIni, totalIni: r2(capIni + resultadosIni),
    aportes: r2(aportes), retiros: r2(retiros), resultado,
    capFin: r2(capIni + aportes - retiros), resultadosFin: r2(resultadosIni + resultado),
    totalFin: r2(capIni + aportes - retiros + resultadosIni + resultado)
  };
}

// Flujos de efectivo (método directo): cada documento que mueve Caja/Bancos
// se clasifica según su contrapartida principal.
const CF_LABELS = {
  cobrosClientes: ['operacion', 'Cobros procedentes de ventas a clientes'],
  otrosCobros: ['operacion', 'Otros cobros de operación'],
  pagosProveedores: ['operacion', 'Pagos a proveedores de mercancía y contenedores'],
  pagosGastos: ['operacion', 'Pagos por gastos de operación'],
  impuestos: ['operacion', 'Impuestos pagados / recuperados'],
  otrosOperacion: ['operacion', 'Otros flujos de operación'],
  inversion: ['inversion', 'Compra / venta de activos no corrientes'],
  prestamos: ['financiacion', 'Préstamos recibidos (pagados), neto'],
  capital: ['financiacion', 'Aportes de capital (retiros), neto']
};
function cashFlow(movements, info, from, to) {
  const isCash = (code) => ['Efectivo', 'Banco'].includes(info.teOf(code));
  const byRef = new Map();
  for (const m of movements) {
    const d = String(m.entry_date || '').slice(0, 10);
    if (d < from || d > to) continue;
    const k = m.ref_doc || m.id;
    if (!byRef.has(k)) byRef.set(k, []);
    byRef.get(k).push(m);
  }
  const totals = Object.fromEntries(Object.keys(CF_LABELS).map(k => [k, 0]));
  for (const lines of byRef.values()) {
    const net = lines.filter(l => isCash(l.codigo_cuenta)).reduce((s, l) => s + (Number(l.debit) || 0) - (Number(l.credit) || 0), 0);
    if (Math.abs(net) < 0.005) continue;
    const other = lines.filter(l => !isCash(l.codigo_cuenta))
      .sort((a, b) => (Math.abs(Number(b.debit) - Number(b.credit))) - (Math.abs(Number(a.debit) - Number(a.credit))))[0];
    let k = 'otrosOperacion';
    if (other) {
      const code = other.codigo_cuenta, tipo = info.tipoOf(code), te = info.teOf(code);
      if ((tipo === 'Ingreso' && code.startsWith('4.1.01')) || te === 'Clientes') k = 'cobrosClientes';
      else if (tipo === 'Ingreso') k = 'otrosCobros';
      else if (tipo === 'Costo' || te === 'Proveedores' || code.startsWith('2.1.01') || code.startsWith('2.1.02')) k = 'pagosProveedores';
      else if (tipo === 'Gasto') k = 'pagosGastos';
      else if (code.startsWith('1.1.03')) k = 'impuestos';
      else if (code.startsWith('1.2')) k = 'inversion';
      else if (tipo === 'Pasivo') k = 'prestamos';
      else if (tipo === 'Patrimonio') k = 'capital';
    }
    totals[k] += net;
  }
  const sec = (s) => r2(Object.entries(totals).filter(([k]) => CF_LABELS[k][0] === s).reduce((a, [, v]) => a + v, 0));
  const cashAt = (date) => { let t = 0; for (const [code, v] of balances(movements, null, date)) if (isCash(code)) t += v.debit - v.credit; return r2(t); };
  const inicial = cashAt(addDays(from, -1));
  const operacion = sec('operacion'), inversion = sec('inversion'), financiacion = sec('financiacion');
  const neto = r2(operacion + inversion + financiacion);
  const final = cashAt(to);
  return {
    rows: Object.entries(totals).map(([k, v]) => ({ key: k, section: CF_LABELS[k][0], label: CF_LABELS[k][1], amount: r2(v) })),
    operacion, inversion, financiacion, neto, inicial, final, diferencia: r2(inicial + neto - final)
  };
}

// Periodo actual y comparativo (mismo largo, inmediatamente anterior).
export function periodBounds(kind, year, month, from, to) {
  if (kind === 'anio') return { from: `${year}-01-01`, to: `${year}-12-31`, pFrom: `${year - 1}-01-01`, pTo: `${year - 1}-12-31`, label: `Ejercicio ${year}`, pLabel: `Ejercicio ${year - 1}` };
  if (kind === 'mes') {
    const m = String(month).padStart(2, '0');
    const last = new Date(Date.UTC(year, Number(month), 0)).getUTCDate();
    const pm = month === 1 ? 12 : month - 1, py = month === 1 ? year - 1 : year;
    const plast = new Date(Date.UTC(py, pm, 0)).getUTCDate();
    const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return { from: `${year}-${m}-01`, to: `${year}-${m}-${last}`, pFrom: `${py}-${String(pm).padStart(2, '0')}-01`, pTo: `${py}-${String(pm).padStart(2, '0')}-${plast}`, label: `${MONTHS[month - 1]} ${year}`, pLabel: `${MONTHS[pm - 1]} ${py}` };
  }
  const len = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
  return { from, to, pFrom: addDays(from, -len), pTo: addDays(from, -1), label: `${from} al ${to}`, pLabel: `${addDays(from, -len)} al ${addDays(from, -1)}` };
}

export function buildStatements(p) {
  const movements = Store.getAll('movements');
  const info = accountsInfo();
  return {
    p,
    bs: balanceSheet(movements, info, p.to, p.from),
    bsPrev: balanceSheet(movements, info, p.pTo, p.pFrom),
    is: incomeStatement(movements, info, p.from, p.to),
    isPrev: incomeStatement(movements, info, p.pFrom, p.pTo),
    eq: equityChanges(movements, info, p.from, p.to),
    eqPrev: equityChanges(movements, info, p.pFrom, p.pTo),
    cf: cashFlow(movements, info, p.from, p.to),
    cfPrev: cashFlow(movements, info, p.pFrom, p.pTo),
    inv: inventoryAt(p.to)
  };
}
