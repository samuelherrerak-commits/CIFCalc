// Liquidación y pago mensual del IVA (los usan la página de IVA y el
// ejercicio de prueba). Asientos:
//   Liquidación (IVA-AAAA-MM): Debe IVA Débito Fiscal / Haber IVA Acreditable
//     (crédito aplicado) + IVA Retenido por Clientes + IVA por Pagar.
//   Pago (IVAP-AAAA-MM): Debe IVA por Pagar / Haber Banco.
import Store from './store.js';
import { buildTwoLineEntry } from './accounting.js';
import { declaration, importDocsFromJournal, monthBounds } from './fiscal.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const acc = (c) => Store.getAll('accounts').find(a => a.codigo === c) || Store.ensureCatalogAccount(c);

// Documentos de los libros: los guardados más los que salen del diario.
export function ivaDocs() {
  const saved = Store.getAll('fiscal_docs');
  const virtual = importDocsFromJournal(Store.getAll('movements'), Store.getAll('containers'), saved, (d) => Store.usdRateFor(d));
  return [...saved, ...virtual];
}

export const liquidationRef = (month) => `IVA-${month}`;
export const paymentRef = (month) => `IVAP-${month}`;

export function ivaStatus(month) {
  const movements = Store.getAll('movements');
  return {
    liquidated: movements.some(m => m.ref_doc === liquidationRef(month)),
    paid: movements.some(m => m.ref_doc === paymentRef(month))
  };
}

// Registra la liquidación del mes (siempre en USD, la moneda del diario).
export function liquidateIva(month) {
  if (ivaStatus(month).liquidated) return null;
  const usd = declaration(ivaDocs(), month, 'usd');
  if (!(usd.c49 > 0)) return null;
  const { to } = monthBounds(month);
  const ref = liquidationRef(month);
  const line = (a, d, c) => ({ entry_date: to, codigo_cuenta: a.codigo, cuenta_contable: a.nombre, concepto: `Liquidación IVA ${month}`, debit: r2(d), credit: r2(c), ref_doc: ref, entidad: 'SENIAT' });
  const lines = [line(acc('2.1.04.01'), usd.c49, 0)];
  if (usd.creditApplied > 0) lines.push(line(acc('1.1.03.01'), 0, usd.creditApplied));
  if (usd.c55 > 0) lines.push(line(acc('1.1.03.02'), 0, usd.c55));
  if (usd.c90 > 0) lines.push(line(acc('2.1.04.02'), 0, usd.c90));
  Store.postJournalRows(lines, { source: 'iva_liquidation' });
  return usd;
}

// Registra el pago al SENIAT de lo liquidado en el mes.
export function payIva(month, date) {
  const st = ivaStatus(month);
  if (!st.liquidated || st.paid) return null;
  const usd = declaration(ivaDocs(), month, 'usd');
  if (!(usd.c90 > 0)) return null;
  const bank = Store.getAll('accounts').filter(a => a.tipo_especifico === 'Banco').sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)))[0] || Store.ensureCatalogAccount('1.1.01.02');
  Store.postJournalRows(buildTwoLineEntry({ date, total: usd.c90, concepto: `Pago IVA ${month}`, entidad: 'SENIAT', refDoc: paymentRef(month), debitAccount: acc('2.1.04.02'), creditAccount: bank }), { source: 'iva_payment' });
  return usd.c90;
}
