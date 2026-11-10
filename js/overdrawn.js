// Cuentas sobregiradas: saldo contrario a su naturaleza (una cuenta deudora
// —activo, costo, gasto— con saldo acreedor, o una acreedora —pasivo,
// patrimonio, ingreso— con saldo deudor). También cuentas cuyo tipo no
// coincide con su código (p. ej. un 1.x marcado como Gasto), que por eso no
// aparecen donde deberían en los estados financieros.
import { inferirTipo, naturalezaForTipo } from './accounting.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const SOURCE_LABEL = {
  manual: 'Asientos manuales', container_close: 'Cierre de contenedor (modelo anterior)', container_payment: 'Pagos de contenedor',
  income: 'Otros ingresos', expense: 'Gastos', cost: 'Costos de importación', sale: 'Facturas de venta', inventory_reception: 'Recepciones',
  receivable_collection: 'Cobros', payable_settlement: 'Pagos a proveedores', order_advance: 'Anticipos de clientes',
  iva_liquidation: 'Liquidación de IVA', iva_payment: 'Pago de IVA'
};

export const tipoOfAccount = (acc, code) => (acc && acc.tipo) || inferirTipo(code);
export const natureOf = (acc, code) => (acc && acc.naturaleza) || naturalezaForTipo(tipoOfAccount(acc, code));
// +1 cuenta deudora (saldo = Debe − Haber), −1 acreedora (saldo = Haber − Debe).
export const natureSign = (acc, code) => (natureOf(acc, code) === 'Acreedora' ? -1 : 1);

// Saldo según su naturaleza de cada cuenta con movimientos (hasta `to`).
export function accountBalances(movements, accounts, to = null) {
  const byCode = new Map(accounts.map(a => [String(a.codigo), a]));
  const map = new Map();
  for (const m of movements) {
    const code = String(m.codigo_cuenta || '');
    if (!code || (to && String(m.entry_date || '').slice(0, 10) > to)) continue;
    const e = map.get(code) || { code, account: byCode.get(code) || null, name: m.cuenta_contable, debit: 0, credit: 0 };
    e.debit += Number(m.debit) || 0; e.credit += Number(m.credit) || 0;
    map.set(code, e);
  }
  return [...map.values()].map(e => {
    const sign = natureSign(e.account, e.code);
    const tipo = tipoOfAccount(e.account, e.code);
    const expected = inferirTipo(e.code);
    return {
      ...e, name: (e.account && e.account.nombre) || e.name || e.code, tipo, nature: natureOf(e.account, e.code),
      debit: r2(e.debit), credit: r2(e.credit), balance: r2(sign * (e.debit - e.credit)),
      misclassified: !!(e.account && e.account.tipo && expected && e.account.tipo !== expected) ? expected : ''
    };
  }).sort((a, b) => a.code.localeCompare(b.code));
}

export const isOverdrawn = (row) => row.balance < -0.005;

// Posibles causas según el tipo de cuenta.
function hintsFor(row, acc) {
  const te = (acc && acc.tipo_especifico) || '';
  const code = row.code;
  if (te === 'Banco' || te === 'Efectivo') return [
    'Se registraron pagos o gastos con esta cuenta antes de registrar el dinero que entró (aporte de capital, cobro, préstamo o depósito).',
    'Algún cobro o anticipo se registró en otra cuenta (p. ej. Caja en vez de Bancos).',
    'Si es un sobregiro real del banco, debe presentarse como pasivo (préstamo bancario) y no restando del efectivo.'
  ];
  if (te === 'Clientes' || code.startsWith('1.1.02')) return [
    'Se registró un cobro sin factura previa: si fue un pago adelantado, debió ir como anticipo en la orden de venta (Anticipos de clientes).',
    'Un cliente pagó de más o se registró dos veces el mismo cobro.',
    'Revisa el desglose por cliente: el saldo negativo indica a quién se le debe devolver o aplicar el dinero.'
  ];
  if (code.startsWith('1.1.03')) return [
    'La liquidación de IVA aplicó más crédito fiscal (o retenciones) del que estaba registrado en la cuenta.',
    'Una factura de compra con IVA se registró en el Libro de Compras pero su IVA no llegó a esta cuenta (o al revés).',
    'Compara el Libro de Compras del mes con los movimientos de esta cuenta.'
  ];
  if (te === 'Proveedores' || code.startsWith('2.1.01') || code.startsWith('2.1.02')) return [
    'Se pagó a un proveedor una factura que no se registró como compra a crédito (o se registró como gasto de contado).',
    'Un pago se registró dos veces, o fue un anticipo al proveedor (debería ir en un activo, no aquí).'
  ];
  if (code.startsWith('2.1.04')) return [
    'Se pagó al SENIAT más de lo liquidado, o se registró el pago sin la liquidación del mes.',
    'Revisa los asientos IVA- e IVAP- del período en el Libro diario.'
  ];
  if (code.startsWith('2.1.05')) return [
    'Se aplicó en una factura más anticipo del que se había recibido de ese cliente.',
    'Un anticipo se registró como cobro (en Cuentas por cobrar) en vez de anticipo.'
  ];
  if (row.tipo === 'Patrimonio') return ['Retiros de los socios mayores que los aportes y las utilidades acumuladas.'];
  if (row.tipo === 'Ingreso') return ['Devoluciones o notas de crédito mayores que las ventas del período, o un asiento con Debe y Haber invertidos.'];
  if (row.tipo === 'Costo' || row.tipo === 'Gasto') return ['Un reverso o corrección registrado al Haber mayor que el gasto original, o un asiento con Debe y Haber invertidos.'];
  return ['Revisa en el Libro mayor los movimientos alrededor de la fecha en que la cuenta pasó a negativo.'];
}

// Análisis de una cuenta: desde cuándo está en contra de su naturaleza, qué
// movimiento la llevó ahí, desglose por entidad y por origen, y posibles causas.
export function analyzeAccount(code, movements, accounts) {
  const acc = accounts.find(a => String(a.codigo) === String(code)) || null;
  const sign = natureSign(acc, code);
  const lines = movements.filter(m => String(m.codigo_cuenta) === String(code))
    .sort((a, b) => String(a.entry_date || '').localeCompare(String(b.entry_date || '')) || String(a.entry_number || '').localeCompare(String(b.entry_number || '')));
  let running = 0, since = null, trigger = null, minBal = 0, minDate = '';
  for (const l of lines) {
    const before = running;
    running = r2(running + sign * ((Number(l.debit) || 0) - (Number(l.credit) || 0)));
    if (before >= -0.005 && running < -0.005) { since = String(l.entry_date).slice(0, 10); trigger = l; }
    if (running >= -0.005) { since = null; trigger = null; }
    if (running < minBal) { minBal = running; minDate = String(l.entry_date).slice(0, 10); }
  }
  const byEntity = new Map(), bySource = new Map();
  for (const l of lines) {
    const k = String(l.entidad || '').trim() || 'Sin entidad';
    byEntity.set(k, r2((byEntity.get(k) || 0) + sign * ((Number(l.debit) || 0) - (Number(l.credit) || 0))));
    const s = SOURCE_LABEL[l.source] || l.source || 'Otros';
    const e = bySource.get(s) || { source: s, debit: 0, credit: 0, count: 0 };
    e.debit = r2(e.debit + (Number(l.debit) || 0)); e.credit = r2(e.credit + (Number(l.credit) || 0)); e.count++;
    bySource.set(s, e);
  }
  const row = accountBalances(lines, accounts)[0] || { code, balance: 0, tipo: tipoOfAccount(acc, code) };
  return {
    code, account: acc, row, balance: r2(running), since, trigger, worst: { balance: r2(minBal), date: minDate },
    byEntity: [...byEntity.entries()].map(([entidad, balance]) => ({ entidad, balance })).filter(e => Math.abs(e.balance) > 0.005).sort((a, b) => a.balance - b.balance),
    bySource: [...bySource.values()].sort((a, b) => (b.debit + b.credit) - (a.debit + a.credit)),
    hints: hintsFor(row, acc)
  };
}
