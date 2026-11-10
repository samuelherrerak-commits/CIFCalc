// Costo real de los contenedores.
//
// El contenedor (calculadora) es solo un ESTIMADO: completarlo mete la
// mercancía al inventario pero no registra asiento. Lo real son los pagos que
// se registran en Costos y se asignan a un contenedor (la línea del diario
// lleva source_ref = id del contenedor). Con eso:
//   • Por rubro (FOB, flete, seguro, arancel, tasa portuaria, agente aduanal,
//     otros) se compara lo estimado con lo registrado.
//   • El costo de cada producto se reparte ponderado: cada rubro registrado se
//     reparte entre los productos según el peso que tenía cada uno en ese rubro
//     del estimado. Mientras un rubro no tenga nada registrado se usa su
//     estimado (costo "con lo que va").
// Funciones puras: reciben los datos, no leen el Store.
import { computeContainer } from './utils.js';

export const COST_CATEGORIES = [
  { key: 'fob', label: 'FOB mercancía', code: '5.1.01', est: (c) => c.fobTotal },
  { key: 'freight', label: 'Flete marítimo', code: '5.1.02', est: (c) => c.oceanFreightAssigned },
  { key: 'insurance', label: 'Seguro', code: '5.1.03', est: (c) => c.insuranceAmount },
  { key: 'tariff', label: 'Arancel', code: '5.1.04', est: (c) => c.tariffAmount },
  { key: 'port', label: 'Tasa portuaria', code: '5.1.05', est: (c) => c.portFeeAmount },
  { key: 'broker', label: 'Agente aduanal', code: '5.1.06', est: (c) => c.customsBrokerAmount },
  { key: 'other', label: 'Otros (flete terrestre, aduana, operación)', code: '5.1.07', est: (c) => c.otherExpenses }
];

// Fuentes del diario que pueden llevar costo de un contenedor: los costos
// registrados (y, si quedan, los asientos de cierre del modelo anterior).
const COST_SOURCES = new Set(['cost', 'expense', 'container_close']);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function categoryForCode(code) {
  const c = String(code || '');
  const cat = COST_CATEGORIES.find(k => c.startsWith(k.code));
  return cat ? cat.key : 'other';
}

// ¿Esta línea del diario es costo (no IVA, no contrapartida)?
export function isCostLine(m, tipoOf) {
  if (!(Number(m.debit) > 0)) return false;
  const code = String(m.codigo_cuenta || '');
  return code.startsWith('5') || tipoOf.get(code) === 'Costo';
}

// Líneas de costo registradas para cada contenedor (hasta `date`, opcional).
export function realCostLines(movements, accounts, { date } = {}) {
  const tipoOf = new Map((accounts || []).map(a => [String(a.codigo), a.tipo]));
  const out = new Map();
  for (const m of movements) {
    if (!m.source_ref || !COST_SOURCES.has(m.source)) continue;
    if (date && String(m.entry_date || '').slice(0, 10) > date) continue;
    if (!isCostLine(m, tipoOf)) continue;
    if (!out.has(m.source_ref)) out.set(m.source_ref, []);
    out.get(m.source_ref).push(m);
  }
  return out;
}

// Análisis de un contenedor: estimado vs registrado por rubro y por producto.
export function analyzeContainer(container, items, lines = []) {
  const { calculated } = computeContainer(container, items);
  // Mientras el contenedor no se completa, un rubro pagado en parte (p. ej.
  // el anticipo del FOB) no reemplaza al estimado: se usa el mayor de los dos.
  const open = container.status !== 'closed';
  const cats = COST_CATEGORIES.map(k => {
    const est = calculated.reduce((s, c) => s + (Number(k.est(c)) || 0), 0);
    const real = lines.filter(m => categoryForCode(m.codigo_cuenta) === k.key).reduce((s, m) => s + (Number(m.debit) || 0), 0);
    return { key: k.key, label: k.label, code: k.code, estFn: k.est, est: r2(est), real: r2(real), used: open ? r2(Math.max(real, est)) : (real > 0 ? r2(real) : r2(est)), hasReal: real > 0 };
  });
  const estTotal = r2(cats.reduce((s, k) => s + k.est, 0));
  const realTotal = r2(cats.reduce((s, k) => s + k.real, 0));
  const usedTotal = r2(cats.reduce((s, k) => s + k.used, 0));
  const landedNoVat = calculated.reduce((s, c) => s + c.landedNoVat, 0);

  const products = calculated.filter(c => c.qty > 0).map(c => {
    let used = 0, real = 0;
    for (const k of cats) {
      // Peso del producto en el rubro; si el rubro no estaba estimado, se
      // reparte según el peso del producto en todo el costo estimado.
      const share = k.est > 0 ? (Number(k.estFn(c)) || 0) / k.est
        : (landedNoVat > 0 ? c.landedNoVat / landedNoVat : 0);
      used += k.used * share;
      real += k.real * share;
    }
    return {
      productId: c.item.product_id || '', name: c.item.name || '', sku: c.item.sku_briggs || c.item.sku || '', qty: c.qty,
      estUnit: r2(c.costNoVat), unit: c.qty > 0 ? r2(used / c.qty) : 0, realTotal: r2(real), usedTotal: r2(used)
    };
  });
  return {
    container, open, cats, estTotal, realTotal, usedTotal,
    diff: r2(realTotal - estTotal), coverage: estTotal > 0 ? realTotal / estTotal : 0,
    hasReal: realTotal > 0, products, lines
  };
}
