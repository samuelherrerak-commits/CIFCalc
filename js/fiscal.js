// IVA venezolano (Ley de IVA y su Reglamento, Providencia SNAT/2011/0071):
// cálculo del impuesto en ventas y compras, Libros de Compras y Ventas y el
// resumen de la declaración mensual (Forma 30 / 99030 del portal SENIAT).
// Módulo puro: recibe los datos ya leídos del Store.
//
// Los montos se guardan en USD (moneda funcional de la app); los libros y la
// declaración se pueden ver en Bs multiplicando cada documento por la tasa BCV
// de su fecha (tasa_bcv del documento).

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const IVA_TIPOS = [
  { value: 'general', label: 'Alícuota general' },
  { value: 'reducida', label: 'Alícuota reducida' },
  { value: 'exento', label: 'Exento / no sujeto' }
];

export function ivaTipoOf(product) {
  const t = String((product && product.iva_tipo) || '').toLowerCase();
  return t === 'reducida' || t === 'exento' ? t : 'general';
}

// lines = [{ amount, tipo }] (amount = cantidad × precio tal como se cobra).
// fs = Store.getFiscalSettings(). Devuelve la base por línea (para el
// asiento de ingreso) y los totales del documento.
export function computeTax(lines, fs) {
  const rates = { general: fs.rateGeneral / 100, reducida: fs.rateReducida / 100 };
  const out = { exempt: 0, base_general: 0, tax_general: 0, base_reducida: 0, tax_reducida: 0, lineBases: [] };
  for (const l of lines) {
    const amount = Number(l.amount) || 0;
    const tipo = fs.ivaEnabled ? (l.tipo || 'general') : 'exento';
    if (tipo === 'exento') {
      out.exempt += amount;
      out.lineBases.push(r2(amount));
      continue;
    }
    const base = r2(fs.pricesIncludeIva ? amount / (1 + rates[tipo]) : amount);
    out['base_' + tipo] += base;
    out.lineBases.push(base);
  }
  out.exempt = r2(out.exempt);
  out.base_general = r2(out.base_general);
  out.base_reducida = r2(out.base_reducida);
  out.tax_general = r2(out.base_general * rates.general);
  out.tax_reducida = r2(out.base_reducida * rates.reducida);
  out.subtotal = r2(out.exempt + out.base_general + out.base_reducida);
  out.tax = r2(out.tax_general + out.tax_reducida);
  out.total = r2(out.subtotal + out.tax);
  return out;
}

// Filas para mostrar el desglose (carrito, nota de venta, presupuesto).
export function taxSummaryRows(t, fs) {
  if (!fs.ivaEnabled) return [];
  const rows = [];
  if (t.base_general || t.base_reducida) rows.push(['Base imponible', r2(t.base_general + t.base_reducida)]);
  if (t.exempt) rows.push(['Exento', t.exempt]);
  if (t.tax_general) rows.push([`IVA ${fs.rateGeneral}%`, t.tax_general]);
  if (t.tax_reducida) rows.push([`IVA ${fs.rateReducida}%`, t.tax_reducida]);
  return rows;
}

export const DOC_TYPES = {
  factura: { label: 'Factura', code: '01', sign: 1 },
  nota_debito: { label: 'Nota de débito', code: '02', sign: 1 },
  nota_credito: { label: 'Nota de crédito', code: '03', sign: -1 },
  importacion: { label: 'Planilla de importación', code: '01', sign: 1 }
};

// Montos de un documento con signo (nota de crédito resta, anulada = 0) y
// en la moneda pedida.
export function docAmounts(d, currency = 'usd') {
  const sign = d.status === 'anulada' ? 0 : ((DOC_TYPES[d.doc_type] || DOC_TYPES.factura).sign);
  const k = currency === 'bs' ? (Number(d.tasa_bcv) || 0) : 1;
  const v = (x) => r2((Number(x) || 0) * sign * k);
  return {
    total: v(d.total), exempt: v(d.exempt),
    base_general: v(d.base_general), tax_general: v(d.tax_general),
    base_reducida: v(d.base_reducida), tax_reducida: v(d.tax_reducida),
    withheld: v(d.withheld)
  };
}

// IVA de importación: sale del asiento de cierre de cada contenedor (débito a
// IVA Acreditable). Si ya existe un registro en fiscal_docs con ese
// source_ref (el usuario le puso N.º de planilla, expediente o tasa), manda
// ese registro; si no, se arma uno virtual para que el libro esté completo.
export function importDocsFromJournal(movements, containers, fiscalDocs, rateFor) {
  const saved = new Set(fiscalDocs.filter(d => d.book === 'compras' && d.source_ref).map(d => d.source_ref));
  const byContainer = new Map();
  for (const m of movements) {
    if (m.source !== 'container_close' || String(m.codigo_cuenta) !== '1.1.03.01' || !(Number(m.debit) > 0)) continue;
    const prev = byContainer.get(m.source_ref) || { tax: 0, date: m.entry_date, ref: m.ref_doc };
    prev.tax += Number(m.debit) || 0;
    byContainer.set(m.source_ref, prev);
  }
  const out = [];
  for (const [cid, v] of byContainer) {
    if (!cid || saved.has(cid)) continue;
    const c = containers.find(x => x.id === cid) || {};
    const rate = Number(c.vat_rate) > 0 ? Number(c.vat_rate) / 100 : 0.16;
    const tax = r2(v.tax);
    const base = r2(tax / rate);
    out.push({
      id: 'imp-' + cid, virtual: true, book: 'compras', date: v.date, doc_type: 'importacion',
      invoice_number: '', control_number: '', affected_invoice: '', rif: '', name: `Importación ${c.bl_number || ''}`.trim(),
      total: r2(base + tax), exempt: 0, base_general: base, tax_general: tax, base_reducida: 0, tax_reducida: 0,
      withheld: 0, withholding_number: '', withholding_date: '', import_form: '', import_file: c.bl_number || '',
      ref_doc: v.ref, source_ref: cid, tasa_bcv: rateFor(v.date), status: 'emitida', notes: ''
    });
  }
  return out;
}

const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to);

// Filas del libro (ventas o compras) en el periodo, en orden cronológico y
// numeradas (N.º de operación).
export function bookRows(docs, book, from, to) {
  return docs
    .filter(d => d.book === book && inRange(String(d.date || ''), from, to))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.invoice_number || a.ref_doc).localeCompare(String(b.invoice_number || b.ref_doc)))
    .map((d, i) => ({ ...d, n: i + 1 }));
}

export function bookTotals(rows, currency) {
  const t = { total: 0, exempt: 0, base_general: 0, tax_general: 0, base_reducida: 0, tax_reducida: 0, withheld: 0 };
  for (const d of rows) {
    const a = docAmounts(d, currency);
    for (const k of Object.keys(t)) t[k] = r2(t[k] + a[k]);
  }
  return t;
}

export const monthBounds = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
};

const prevMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

// Declaración de un mes con los arrastres (excedente de crédito fiscal y
// retenciones no aplicadas) calculados desde el primer mes con movimiento.
// Los números entre corchetes son las casillas de la Forma 30 (99030);
// verifíquense contra la planilla vigente del portal antes de transcribir.
export function declaration(docs, ym, currency = 'usd') {
  const months = docs.map(d => String(d.date || '').slice(0, 7)).filter(Boolean).sort();
  let first = months[0] || ym;
  if (first > ym) first = ym;
  let carry = { excedente: 0, retenciones: 0 };
  let cur = first;
  const chain = [];
  while (cur <= ym) chain.push(cur), cur = nextMonth(cur);
  let result = null;
  for (const mo of chain) {
    result = monthDeclaration(docs, mo, currency, carry);
    carry = { excedente: result.c60, retenciones: result.c67 };
  }
  return result;
}

function nextMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

function monthDeclaration(docs, ym, currency, carry) {
  const { from, to } = monthBounds(ym);
  const v = bookTotals(bookRows(docs, 'ventas', from, to), currency);
  const comp = bookRows(docs, 'compras', from, to);
  const imp = bookTotals(comp.filter(d => d.doc_type === 'importacion'), currency);
  const loc = bookTotals(comp.filter(d => d.doc_type !== 'importacion'), currency);
  // Retenciones que nos hicieron los clientes: van al mes del comprobante.
  const ret = r2(docs.filter(d => d.book === 'ventas' && d.status !== 'anulada' && inRange(String(d.withholding_date || d.date || ''), from, to))
    .reduce((s, d) => s + docAmounts({ ...d, doc_type: 'factura' }, currency).withheld, 0));

  const D = {};
  D.c40 = v.exempt; D.c41 = 0;
  D.c42 = v.base_general; D.c43 = v.tax_general;
  D.c442 = 0; D.c452 = 0;
  D.c443 = v.base_reducida; D.c453 = v.tax_reducida;
  D.c46 = r2(D.c40 + D.c41 + D.c42 + D.c442 + D.c443);
  D.c47 = r2(D.c43 + D.c452 + D.c453);
  D.c48 = 0;
  D.c49 = r2(D.c47 + D.c48);

  D.c30 = r2(imp.exempt + loc.exempt);
  D.c31 = imp.base_general; D.c32 = imp.tax_general;
  D.c312 = 0; D.c322 = 0;
  D.c313 = imp.base_reducida; D.c323 = imp.tax_reducida;
  D.c33 = loc.base_general; D.c34 = loc.tax_general;
  D.c332 = 0; D.c342 = 0;
  D.c333 = loc.base_reducida; D.c343 = loc.tax_reducida;
  D.c35 = r2(D.c30 + D.c31 + D.c312 + D.c313 + D.c33 + D.c332 + D.c333);
  D.c36 = r2(D.c32 + D.c322 + D.c323 + D.c34 + D.c342 + D.c343);
  D.c70 = D.c36; D.c37 = 0; // sin prorrata: todas las ventas gravadas
  D.c71 = r2(D.c70 + D.c37);
  D.c20 = r2(carry.excedente);
  D.c21 = 0; D.c81 = 0; D.c82 = 0;
  D.c22 = r2(D.c71 + D.c20 + D.c81 + D.c82 - D.c21);

  D.c53 = r2(Math.max(0, D.c49 - D.c22));
  D.c60 = r2(Math.max(0, D.c22 - D.c49));

  D.c54 = r2(carry.retenciones);
  D.c66 = ret;
  D.c74 = r2(D.c54 + D.c66);
  D.c55 = r2(Math.min(D.c74, D.c53));
  D.c67 = r2(D.c74 - D.c55);
  D.c27 = r2(D.c53 - D.c55);
  D.c90 = D.c27;
  // Crédito fiscal efectivamente usado contra el débito (para el asiento).
  D.creditApplied = r2(Math.min(D.c22, D.c49));
  D.ym = ym; D.from = from; D.to = to; D.currency = currency;
  return D;
}

export const DECLARATION_LAYOUT = [
  { title: 'Débitos fiscales', rows: [
    ['Ventas internas no gravadas', 'c40'],
    ['Ventas de exportación', 'c41'],
    ['Ventas internas gravadas por alícuota general', 'c42', 'c43'],
    ['Ventas internas gravadas por alícuota general más adicional', 'c442', 'c452'],
    ['Ventas internas gravadas por alícuota reducida', 'c443', 'c453'],
    ['Total ventas y débitos fiscales para efectos de determinación', 'c46', 'c47', true],
    ['Ajustes a los débitos fiscales de periodos anteriores', null, 'c48'],
    ['Total débitos fiscales', null, 'c49', true]
  ] },
  { title: 'Créditos fiscales', rows: [
    ['Compras no gravadas y/o sin derecho a crédito fiscal', 'c30'],
    ['Importaciones gravadas por alícuota general', 'c31', 'c32'],
    ['Importaciones gravadas por alícuota general más adicional', 'c312', 'c322'],
    ['Importaciones gravadas por alícuota reducida', 'c313', 'c323'],
    ['Compras internas gravadas por alícuota general', 'c33', 'c34'],
    ['Compras internas gravadas por alícuota general más adicional', 'c332', 'c342'],
    ['Compras internas gravadas por alícuota reducida', 'c333', 'c343'],
    ['Total compras y créditos fiscales del período', 'c35', 'c36', true],
    ['Créditos fiscales totalmente deducibles', null, 'c70'],
    ['Créditos fiscales producto de la aplicación del porcentaje de la prorrata', null, 'c37'],
    ['Total créditos fiscales deducibles', null, 'c71', true],
    ['Excedente de créditos fiscales del mes anterior', null, 'c20'],
    ['Reintegro solicitado (sólo exportadores)', null, 'c21'],
    ['Reintegro (sólo quien suministre bienes o servicios a exportadores)', null, 'c81'],
    ['Ajustes a los créditos fiscales de periodos anteriores', null, 'c82'],
    ['Total créditos fiscales', null, 'c22', true]
  ] },
  { title: 'Autoliquidación', rows: [
    ['Total cuota tributaria del período', null, 'c53', true],
    ['Excedente de crédito fiscal para el mes siguiente', null, 'c60']
  ] },
  { title: 'Retenciones del IVA', rows: [
    ['Retenciones IVA acumuladas por descontar', null, 'c54'],
    ['Retenciones del IVA del período', null, 'c66'],
    ['Total retenciones del IVA', null, 'c74'],
    ['Retenciones del IVA soportadas y descontadas', null, 'c55'],
    ['Saldo de retenciones del IVA no aplicado', null, 'c67'],
    ['Sub-total impuesto a pagar', null, 'c27', true]
  ] },
  { title: 'Total a pagar', rows: [
    ['Total a pagar', null, 'c90', true]
  ] }
];

export { prevMonth };
