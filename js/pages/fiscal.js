import Store from '../store.js';
import { fmtNum, esc } from '../utils.js';
import { buildTwoLineEntry } from '../accounting.js';
import {
  DOC_TYPES, DECLARATION_LAYOUT, bookRows, bookTotals, declaration, docAmounts,
  importDocsFromJournal, monthBounds
} from '../fiscal.js';
import { ensureTodayRates, fmtBs } from '../rates.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { btnPrimary, btnSecondary, card, input, label } from '../components/accounting-shell.js';

// Impuestos (SENIAT): Libro de Ventas, Libro de Compras, resumen de la
// declaración mensual de IVA (Forma 30 / 99030), tasas BCV y configuración.
const TABS = [
  { key: 'ventas', label: 'Libro de ventas' },
  { key: 'compras', label: 'Libro de compras' },
  { key: 'declaracion', label: 'Declaración IVA' },
  { key: 'tasas', label: 'Tasas BCV' },
  { key: 'config', label: 'Configuración' }
];
const ACTIVE_KEY = { ventas: 'fiscal-books', compras: 'fiscal-books', declaracion: 'fiscal-decl', tasas: 'fiscal-rates', config: 'fiscal-decl' };

let month = new Date().toISOString().slice(0, 7);
let currency = 'usd';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const curCls = (c) => `px-3 py-1.5 rounded-md ${currency === c ? 'bg-white text-slate-900 font-semibold shadow-sm' : 'text-slate-500'}`;
const fmtDate = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const money = (n) => currency === 'bs' ? fmtBs(n).replace('Bs ', '') : fmtNum(n);
const monthLabel = (ym) => new Date(ym + '-15T12:00:00').toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });

// Todos los documentos fiscales: los guardados + el IVA de importación de los
// contenedores completados que todavía no tienen registro propio.
function allDocs() {
  const saved = Store.getAll('fiscal_docs');
  const virtual = importDocsFromJournal(Store.getAll('movements'), Store.getAll('containers'), saved, (d) => Store.usdRateFor(d));
  return [...saved, ...virtual];
}

const txType = (d) => d.status === 'anulada' ? '03-anul' : d.affected_invoice ? '02-compl' : '01-reg';

function csvDownload(filename, rows) {
  const csv = '﻿' + rows.map(r => r.map(v => {
    const s = typeof v === 'number' ? v.toFixed(2) : String(v == null ? '' : v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function printHtml(title, inner) {
  const p = Store.getBusinessProfile();
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const w = frame.contentWindow;
  w.document.open();
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page { size: landscape; margin: 10mm; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 8.5px; color: #0f172a; }
    h1 { font-size: 13px; margin: 0; } .sub { color: #475569; margin: 2px 0 10px; font-size: 10px; }
    table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #cbd5e1; padding: 3px 4px; }
    th { background: #f1f5f9; font-size: 7.5px; text-transform: uppercase; } td.n { text-align: right; font-family: monospace; }
    tr.tot td { font-weight: bold; background: #f8fafc; } .note { color: #64748b; margin-top: 8px; font-size: 8px; }
  </style></head><body>
    <h1>${esc(p.name || 'Empresa')} — ${esc(title)}</h1>
    <div class="sub">RIF: ${esc(p.rif || '—')} · Montos en ${currency === 'bs' ? 'bolívares (tasa BCV de cada documento)' : 'dólares (USD)'}</div>
    ${inner}
  </body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); setTimeout(() => frame.remove(), 1000); }, 300);
}

// ---------- Libros ----------
function bookColumns(book) {
  const base = [
    ['N.º Op.', d => d.n], ['Fecha', d => fmtDate(d.date)], ['RIF', d => d.rif], ['Nombre o razón social', d => d.name],
    ['Tipo doc.', d => (DOC_TYPES[d.doc_type] || DOC_TYPES.factura).label],
    ['N.º factura', d => d.doc_type === 'factura' || d.doc_type === 'importacion' ? (d.invoice_number || (book === 'ventas' ? d.ref_doc : '')) : ''],
    ['N.º control', d => d.control_number],
    ['N.º nota débito', d => d.doc_type === 'nota_debito' ? d.invoice_number : ''],
    ['N.º nota crédito', d => d.doc_type === 'nota_credito' ? d.invoice_number : ''],
    ['Tipo trans.', txType], ['Factura afectada', d => d.affected_invoice]
  ];
  if (book === 'compras') base.push(['N.º planilla import.', d => d.import_form], ['N.º expediente', d => d.import_file]);
  const amt = (k) => d => docAmounts(d, currency)[k];
  const nums = [
    [book === 'ventas' ? 'Total ventas incl. IVA' : 'Total compras incl. IVA', amt('total')],
    [book === 'ventas' ? 'Ventas exentas / no sujetas' : 'Compras sin derecho a crédito', amt('exempt')],
    ['Base imponible alíc. general', amt('base_general')], ['IVA alíc. general', amt('tax_general')],
    ['Base imponible alíc. reducida', amt('base_reducida')], ['IVA alíc. reducida', amt('tax_reducida')]
  ];
  if (book === 'ventas') nums.push(['IVA retenido por el comprador', amt('withheld')]);
  const tail = book === 'ventas' ? [['N.º comprobante retención', d => d.withholding_number]] : [];
  return { text: base, nums, tail };
}

function bookSummaryRows(book, t, fs) {
  return book === 'ventas'
    ? [
      ['Ventas internas no gravadas', t.exempt, 0],
      ['Ventas de exportación', 0, 0],
      [`Ventas internas gravadas alícuota general (${fs.rateGeneral}%)`, t.base_general, t.tax_general],
      [`Ventas internas gravadas alícuota reducida (${fs.rateReducida}%)`, t.base_reducida, t.tax_reducida],
      ['Total ventas y débitos fiscales', r2(t.exempt + t.base_general + t.base_reducida), r2(t.tax_general + t.tax_reducida)]
    ]
    : null;
}

function renderBook(el, book, fs) {
  const { from, to } = monthBounds(month);
  const docs = allDocs();
  const rows = bookRows(docs, book, from, to);
  const tot = bookTotals(rows, currency);
  const cols = bookColumns(book);
  const showReduced = rows.some(d => Number(d.base_reducida) > 0);
  const nums = cols.nums.filter(([h]) => showReduced || !/reducida/.test(h));
  const missingRate = currency === 'bs' ? rows.filter(d => !(Number(d.tasa_bcv) > 0)).length : 0;

  let summary;
  if (book === 'ventas') {
    summary = bookSummaryRows('ventas', tot, fs);
  } else {
    const imp = bookTotals(rows.filter(d => d.doc_type === 'importacion'), currency);
    const loc = bookTotals(rows.filter(d => d.doc_type !== 'importacion'), currency);
    summary = [
      ['Compras exentas y/o sin derecho a crédito fiscal', tot.exempt, 0],
      [`Importaciones gravadas alícuota general (${fs.rateGeneral}%)`, imp.base_general, imp.tax_general],
      [`Importaciones gravadas alícuota reducida (${fs.rateReducida}%)`, imp.base_reducida, imp.tax_reducida],
      [`Compras internas gravadas alícuota general (${fs.rateGeneral}%)`, loc.base_general, loc.tax_general],
      [`Compras internas gravadas alícuota reducida (${fs.rateReducida}%)`, loc.base_reducida, loc.tax_reducida],
      ['Total compras y créditos fiscales', r2(tot.exempt + tot.base_general + tot.base_reducida), r2(tot.tax_general + tot.tax_reducida)]
    ];
  }

  const tableHtml = (forPrint) => `
    <table class="${forPrint ? '' : 'w-full text-[11px] whitespace-nowrap'}">
      <thead><tr class="${forPrint ? '' : 'text-[9px] font-bold uppercase tracking-wide text-slate-500 bg-slate-50'}">
        ${[...cols.text, ...nums, ...cols.tail].map(([h]) => `<th class="${forPrint ? '' : 'p-2 text-left border-b border-slate-200'}">${h}</th>`).join('')}
        ${forPrint ? '' : `<th class="p-2 border-b border-slate-200">${currency === 'bs' ? 'Tasa BCV' : ''}</th><th class="p-2 border-b border-slate-200"></th>`}
      </tr></thead>
      <tbody>
        ${rows.length === 0 ? `<tr><td colspan="30" class="${forPrint ? '' : 'p-6 text-center text-slate-400'}">Sin documentos en ${esc(monthLabel(month))}.</td></tr>` : rows.map(d => `
          <tr class="${forPrint ? '' : `border-b border-slate-100 hover:bg-slate-50 ${d.status === 'anulada' ? 'line-through text-slate-400' : ''}`}">
            ${cols.text.map(([, f]) => `<td class="${forPrint ? '' : 'p-2'}">${esc(f(d))}</td>`).join('')}
            ${nums.map(([, f]) => `<td class="n ${forPrint ? '' : 'p-2 text-right font-mono'}">${money(f(d))}</td>`).join('')}
            ${cols.tail.map(([, f]) => `<td class="${forPrint ? '' : 'p-2'}">${esc(f(d))}</td>`).join('')}
            ${forPrint ? '' : `
              <td class="p-2 text-right font-mono text-slate-400">${currency === 'bs' ? (Number(d.tasa_bcv) > 0 ? fmtNum(d.tasa_bcv) : '<span class="text-red-600 font-bold">falta</span>') : ''}</td>
              <td class="p-2 text-right">
                ${d.virtual ? '<span class="text-[9px] font-bold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full mr-1">auto</span>' : ''}
                <button data-edit-doc="${esc(d.id)}" class="text-blue-600 hover:text-blue-800 font-semibold">Editar</button>
              </td>`}
          </tr>`).join('')}
        ${rows.length ? `<tr class="tot ${forPrint ? '' : 'font-bold bg-slate-50'}">
          <td colspan="${cols.text.length}" class="${forPrint ? '' : 'p-2 text-right'}">Totales</td>
          ${nums.map(([h]) => { const k = { 'Total ventas incl. IVA': 'total', 'Total compras incl. IVA': 'total', 'Ventas exentas / no sujetas': 'exempt', 'Compras sin derecho a crédito': 'exempt', 'Base imponible alíc. general': 'base_general', 'IVA alíc. general': 'tax_general', 'Base imponible alíc. reducida': 'base_reducida', 'IVA alíc. reducida': 'tax_reducida', 'IVA retenido por el comprador': 'withheld' }[h]; return `<td class="n ${forPrint ? '' : 'p-2 text-right font-mono'}">${money(tot[k])}</td>`; }).join('')}
          <td colspan="${cols.tail.length + (forPrint ? 0 : 2)}"></td>
        </tr>` : ''}
      </tbody>
    </table>`;

  // Vista en pantalla: columnas agrupadas para que el libro quepa sin
  // desplazamiento horizontal (la impresión y el CSV llevan todas las
  // columnas del formato SENIAT).
  const docCell = (d) => {
    const t = (DOC_TYPES[d.doc_type] || DOC_TYPES.factura).label;
    const num = d.invoice_number || (book === 'ventas' ? d.ref_doc : '');
    const extra = [
      d.control_number && `Control ${esc(d.control_number)}`,
      d.affected_invoice && `Afecta ${esc(d.affected_invoice)}`,
      d.import_form && `Planilla ${esc(d.import_form)}`,
      d.import_file && `Exp. ${esc(d.import_file)}`
    ].filter(Boolean).join(' · ');
    return `<div class="font-semibold text-slate-700">${esc(t)} ${num ? `<span class="font-mono">${esc(num)}</span>` : ''}</div>
      <div class="text-[10px] text-slate-400">${txType(d)}${extra ? ' · ' + extra : ''}</div>`;
  };
  const baseCell = (a, d) => {
    const parts = [];
    if (a.base_general) parts.push(`${money(a.base_general)}${Number(d.base_reducida) ? ` <span class="text-[9px] text-slate-400">${fs.rateGeneral}%</span>` : ''}`);
    if (a.base_reducida) parts.push(`${money(a.base_reducida)} <span class="text-[9px] text-slate-400">${fs.rateReducida}%</span>`);
    return parts.join('<br>') || money(0);
  };
  const screenTableHtml = () => {
    const th = (h, right) => `<th class="px-2 py-2 ${right ? 'text-right' : 'text-left'} border-b border-slate-200">${h}</th>`;
    return `
    <table class="w-full text-[11px]">
      <thead><tr class="text-[9px] font-bold uppercase tracking-wide text-slate-500 bg-slate-50">
        ${th('N.º')}${th('Fecha')}${th(book === 'ventas' ? 'Cliente' : 'Proveedor')}${th('Documento')}
        ${th(book === 'ventas' ? 'Total venta' : 'Total compra', 1)}${th(book === 'ventas' ? 'Exento' : 'Exento / sin crédito', 1)}${th('Base imponible', 1)}${th('IVA', 1)}
        ${book === 'ventas' ? th('Retenido', 1) : ''}${currency === 'bs' ? th('Tasa', 1) : ''}${th('')}
      </tr></thead>
      <tbody>
        ${rows.length === 0 ? `<tr><td colspan="12" class="p-6 text-center text-slate-400">Sin documentos en ${esc(monthLabel(month))}.</td></tr>` : rows.map(d => {
          const a = docAmounts(d, currency);
          return `
          <tr class="border-b border-slate-100 hover:bg-slate-50 align-top ${d.status === 'anulada' ? 'line-through text-slate-400' : ''}">
            <td class="px-2 py-1.5 text-slate-400">${d.n}</td>
            <td class="px-2 py-1.5 whitespace-nowrap">${fmtDate(d.date)}</td>
            <td class="px-2 py-1.5 max-w-[14rem]"><div class="font-semibold text-slate-700 truncate" title="${esc(d.name)}">${esc(d.name) || '—'}</div><div class="text-[10px] text-slate-400 font-mono">${esc(d.rif) || 'Sin RIF'}</div></td>
            <td class="px-2 py-1.5">${docCell(d)}</td>
            <td class="px-2 py-1.5 text-right font-mono font-semibold whitespace-nowrap">${money(a.total)}</td>
            <td class="px-2 py-1.5 text-right font-mono whitespace-nowrap">${money(a.exempt)}</td>
            <td class="px-2 py-1.5 text-right font-mono whitespace-nowrap">${baseCell(a, d)}</td>
            <td class="px-2 py-1.5 text-right font-mono whitespace-nowrap">${money(r2(a.tax_general + a.tax_reducida))}</td>
            ${book === 'ventas' ? `<td class="px-2 py-1.5 text-right font-mono whitespace-nowrap">${a.withheld ? money(a.withheld) : '—'}${d.withholding_number ? `<div class="text-[10px] text-slate-400">${esc(d.withholding_number)}</div>` : ''}</td>` : ''}
            ${currency === 'bs' ? `<td class="px-2 py-1.5 text-right font-mono text-slate-400">${Number(d.tasa_bcv) > 0 ? fmtNum(d.tasa_bcv) : '<span class="text-red-600 font-bold">falta</span>'}</td>` : ''}
            <td class="px-2 py-1.5 text-right whitespace-nowrap">
              ${d.virtual ? '<span class="text-[9px] font-bold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full mr-1">auto</span>' : ''}
              <button data-edit-doc="${esc(d.id)}" class="text-blue-600 hover:text-blue-800 font-semibold">Editar</button>
            </td>
          </tr>`; }).join('')}
        ${rows.length ? `<tr class="font-bold bg-slate-50">
          <td colspan="4" class="px-2 py-2 text-right">Totales</td>
          <td class="px-2 py-2 text-right font-mono">${money(tot.total)}</td>
          <td class="px-2 py-2 text-right font-mono">${money(tot.exempt)}</td>
          <td class="px-2 py-2 text-right font-mono">${money(r2(tot.base_general + tot.base_reducida))}</td>
          <td class="px-2 py-2 text-right font-mono">${money(r2(tot.tax_general + tot.tax_reducida))}</td>
          ${book === 'ventas' ? `<td class="px-2 py-2 text-right font-mono">${money(tot.withheld)}</td>` : ''}
          <td colspan="${currency === 'bs' ? 2 : 1}"></td>
        </tr>` : ''}
      </tbody>
    </table>`;
  };

  const summaryHtml = (forPrint) => `
    <table class="${forPrint ? '' : 'w-full text-xs'}" style="${forPrint ? 'width:60%;margin-top:10px' : ''}">
      <thead><tr class="${forPrint ? '' : 'text-[10px] font-bold uppercase text-slate-500'}"><th class="${forPrint ? '' : 'p-2 text-left'}">Resumen del período</th><th class="${forPrint ? '' : 'p-2 text-right'}">Base imponible</th><th class="${forPrint ? '' : 'p-2 text-right'}">${book === 'ventas' ? 'Débito fiscal' : 'Crédito fiscal'}</th></tr></thead>
      <tbody>${summary.map(([k, b, t], i) => `<tr class="${i === summary.length - 1 ? 'tot font-bold' : ''} ${forPrint ? '' : 'border-t border-slate-100'}"><td class="${forPrint ? '' : 'p-2'}">${esc(k)}</td><td class="n ${forPrint ? '' : 'p-2 text-right font-mono'}">${money(b)}</td><td class="n ${forPrint ? '' : 'p-2 text-right font-mono'}">${money(t)}</td></tr>`).join('')}</tbody>
    </table>`;

  const title = `Libro de ${book === 'ventas' ? 'Ventas' : 'Compras'} — ${monthLabel(month)}`;
  el.innerHTML = `
    <div class="${card} space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 class="text-sm font-semibold text-slate-800">${esc(title)}</h2>
          <p class="text-[11px] text-slate-500">${rows.length} documento${rows.length === 1 ? '' : 's'} · orden cronológico · ${currency === 'bs' ? 'en Bs a la tasa BCV de cada documento' : 'en USD'}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button id="bk-add" class="${btnSecondary} !text-xs">Registro manual</button>
          <button id="bk-csv" class="${btnSecondary} !text-xs">Exportar CSV</button>
          <button id="bk-print" class="${btnPrimary} !text-xs">Imprimir</button>
        </div>
      </div>
      ${missingRate ? `<div class="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">⚠ ${missingRate} documento(s) sin tasa BCV: en Bs salen en 0. Edítalos para ponerles la tasa del día, o carga las tasas en la pestaña Tasas BCV.</div>` : ''}
      ${book === 'compras' && rows.some(d => d.virtual) ? `<div class="text-xs text-violet-800 bg-violet-50 border border-violet-200 rounded-lg p-2">Las filas <strong>auto</strong> son el IVA de importación de contenedores completados (sale del asiento de cierre). Edítalas para ponerles el N.º de planilla de importación (DUA), el expediente y la tasa del día de la liquidación en aduana.</div>` : ''}
      <div class="overflow-x-auto thin-scroll">${screenTableHtml()}</div>
      <div class="max-w-2xl">${summaryHtml(false)}</div>
    </div>`;

  el.querySelectorAll('[data-edit-doc]').forEach(b => b.addEventListener('click', () => {
    const d = docs.find(x => x.id === b.dataset.editDoc);
    if (d) openDocModal(d, () => renderBook(el, book, fs));
  }));
  el.querySelector('#bk-add').addEventListener('click', () => {
    // Fecha por defecto: hoy si cae en el mes elegido; si no, el último día del mes.
    const today = new Date().toISOString().slice(0, 10);
    const date = today >= from && today <= to ? today : to;
    openDocModal(Store.newFiscalDoc({ book, date, tasa_bcv: Store.usdRateFor(date) }), () => renderBook(el, book, fs));
  });
  el.querySelector('#bk-print').addEventListener('click', () => printHtml(title, tableHtml(true) + summaryHtml(true) + '<p class="note">Libro llevado conforme al Reglamento de la Ley de IVA (arts. 70 al 78) y la Providencia SNAT/2011/0071. Tipo de transacción: 01-registro, 02-complemento, 03-anulación.</p>'));
  el.querySelector('#bk-csv').addEventListener('click', () => {
    const head = [...cols.text, ...nums, ...cols.tail].map(([h]) => h).concat(['Tasa BCV']);
    const body = rows.map(d => [...cols.text.map(([, f]) => f(d)), ...nums.map(([, f]) => f(d)), ...cols.tail.map(([, f]) => f(d)), Number(d.tasa_bcv) || '']);
    csvDownload(`libro-${book}-${month}-${currency}.csv`, [head, ...body, [], ['Resumen', 'Base imponible', book === 'ventas' ? 'Débito fiscal' : 'Crédito fiscal'], ...summary]);
  });
}

// Modal para editar (o crear a mano) un documento del libro. Solo toca el
// registro fiscal, nunca el diario: si la factura cambia de monto, el asiento
// se corrige aparte en el Libro Diario.
function openDocModal(doc, onSave) {
  const isNew = !doc.id;
  const wrap = document.createElement('div');
  wrap.className = 'fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4';
  const f = (id, lbl, val, type = 'text', extra = '') => `<div><label class="${label}">${lbl}</label><input id="d-${id}" type="${type}" ${type === 'number' ? 'step="0.01"' : ''} value="${esc(val == null ? '' : val)}" class="${input}" ${extra}></div>`;
  wrap.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4">
      <div class="flex justify-between items-center">
        <h3 class="font-semibold text-slate-900">${isNew ? 'Registro manual' : 'Editar documento'} — Libro de ${doc.book === 'ventas' ? 'Ventas' : 'Compras'}</h3>
        <button data-close class="text-slate-400 text-xl leading-none">✕</button>
      </div>
      ${isNew ? '<p class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">Solo agrega la línea al libro (p. ej. una nota de crédito o una factura registrada en otro sistema). No genera asiento contable.</p>' : ''}
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div><label class="${label}">Tipo de documento</label><select id="d-doc_type" class="${input}">${Object.entries(DOC_TYPES).filter(([k]) => doc.book === 'compras' || k !== 'importacion').map(([k, v]) => `<option value="${k}" ${doc.doc_type === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
        ${f('date', 'Fecha', doc.date, 'date')}
        ${f('tasa_bcv', 'Tasa BCV (Bs/USD)', doc.tasa_bcv || '', 'number')}
        ${f('invoice_number', 'N.º factura / nota', doc.invoice_number)}
        ${f('control_number', 'N.º de control', doc.control_number)}
        ${f('affected_invoice', 'Factura afectada', doc.affected_invoice)}
        ${f('rif', 'RIF', doc.rif)}
        <div class="md:col-span-2">${f('name', 'Nombre o razón social', doc.name)}</div>
        ${doc.book === 'compras' ? f('import_form', 'N.º planilla importación', doc.import_form) + f('import_file', 'N.º expediente', doc.import_file) : ''}
        ${f('exempt', 'Exento / sin crédito (USD)', doc.exempt, 'number')}
        ${f('base_general', 'Base alíc. general (USD)', doc.base_general, 'number')}
        ${f('tax_general', 'IVA alíc. general (USD)', doc.tax_general, 'number')}
        ${f('base_reducida', 'Base alíc. reducida (USD)', doc.base_reducida, 'number')}
        ${f('tax_reducida', 'IVA alíc. reducida (USD)', doc.tax_reducida, 'number')}
        ${doc.book === 'ventas' ? f('withheld', 'IVA retenido por el cliente (USD)', doc.withheld, 'number') + f('withholding_number', 'N.º comprobante retención', doc.withholding_number) + f('withholding_date', 'Fecha del comprobante', doc.withholding_date, 'date') : ''}
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <label class="flex items-center gap-2 text-xs font-semibold text-slate-600"><input id="d-anulada" type="checkbox" class="w-4 h-4 accent-red-600" ${doc.status === 'anulada' ? 'checked' : ''}> Documento anulado</label>
        <div id="d-msg" class="text-xs text-red-600"></div>
        <div class="flex gap-2">
          ${!isNew && !doc.virtual && !doc.ref_doc ? `<button id="d-del" class="${btnSecondary} !text-red-600">Eliminar</button>` : ''}
          <button data-close class="${btnSecondary}">Cancelar</button>
          <button id="d-save" class="${btnPrimary}">Guardar</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const $ = (id) => wrap.querySelector('#d-' + id);
  const close = () => wrap.remove();
  wrap.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  ['base_general', 'base_reducida'].forEach(k => $(k).addEventListener('change', () => {
    const fs = Store.getFiscalSettings();
    const t = k === 'base_general' ? 'tax_general' : 'tax_reducida';
    if (!Number($(t).value)) $(t).value = r2(Number($(k).value) * (k === 'base_general' ? fs.rateGeneral : fs.rateReducida) / 100);
  }));
  if ($('del')) $('del').addEventListener('click', () => { if (confirm('¿Eliminar este registro del libro?')) { Store.remove('fiscal_docs', doc.id); close(); onSave(); } });
  $('save').addEventListener('click', () => {
    const n = (k) => r2(($(k) || {}).value);
    const rec = {
      doc_type: $('doc_type').value, date: $('date').value, tasa_bcv: Number($('tasa_bcv').value) || 0,
      invoice_number: $('invoice_number').value.trim(), control_number: $('control_number').value.trim(),
      affected_invoice: $('affected_invoice').value.trim(), rif: $('rif').value.trim(), name: $('name').value.trim(),
      exempt: n('exempt'), base_general: n('base_general'), tax_general: n('tax_general'),
      base_reducida: n('base_reducida'), tax_reducida: n('tax_reducida'),
      status: $('anulada').checked ? 'anulada' : 'emitida'
    };
    if (doc.book === 'compras') Object.assign(rec, { import_form: $('import_form').value.trim(), import_file: $('import_file').value.trim() });
    if (doc.book === 'ventas') Object.assign(rec, { withheld: n('withheld'), withholding_number: $('withholding_number').value.trim(), withholding_date: $('withholding_date').value });
    rec.total = r2(rec.exempt + rec.base_general + rec.tax_general + rec.base_reducida + rec.tax_reducida);
    if (!rec.date) { $('msg').textContent = 'La fecha es obligatoria.'; return; }
    if (rec.doc_type === 'nota_credito' && !rec.affected_invoice) { $('msg').textContent = 'Una nota de crédito debe indicar la factura afectada.'; return; }
    if (doc.virtual) {
      // Fila automática de importación: pasa a ser un registro propio.
      const { id, virtual, n: _n, ...rest } = doc;
      Store.insert('fiscal_docs', { ...rest, ...rec });
    } else if (isNew) {
      Store.insert('fiscal_docs', { ...doc, ...rec });
    } else {
      Store.update('fiscal_docs', { id: doc.id, ...rec });
    }
    close();
    onSave();
  });
}

// ---------- Declaración ----------
function renderDeclaration(el) {
  const docs = allDocs();
  const D = declaration(docs, month, currency);
  const usd = currency === 'usd' ? D : declaration(docs, month, 'usd');
  const liqRef = `IVA-${month}`;
  const payRef = `IVAP-${month}`;
  const movements = Store.getAll('movements');
  const liquidated = movements.some(m => m.ref_doc === liqRef);
  const paid = movements.some(m => m.ref_doc === payRef);
  const { to } = monthBounds(month);
  const cell = (k) => k ? `<span class="text-[9px] text-slate-400 font-sans mr-1">[${k.slice(1)}]</span>${money(D[k])}` : '';

  const layout = (forPrint) => DECLARATION_LAYOUT.map(sec => `
    <tr class="${forPrint ? 'tot' : 'bg-slate-50 text-slate-500'}"><td colspan="3" class="${forPrint ? '' : 'p-2 text-[11px] font-semibold uppercase tracking-wide'}">${sec.title}</td></tr>
    ${sec.rows.map(([lbl, b, t, strong]) => `
      <tr class="${strong ? (forPrint ? 'tot' : 'font-bold bg-slate-50') : ''} ${forPrint ? '' : 'border-b border-slate-100'}">
        <td class="${forPrint ? '' : 'p-2'}">${esc(lbl)}</td>
        <td class="n ${forPrint ? '' : 'p-2 text-right font-mono'}">${cell(b)}</td>
        <td class="n ${forPrint ? '' : 'p-2 text-right font-mono'}">${cell(t)}</td>
      </tr>`).join('')}`).join('');

  el.innerHTML = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      ${[['Débito fiscal', D.c49, 'rose'], ['Crédito fiscal del mes', D.c71, 'sky'], ['Excedente para el mes siguiente', D.c60, 'violet'], ['Total a pagar', D.c90, 'emerald']]
        .map(([k, v]) => `<div class="rounded-xl border border-slate-200 bg-white p-3"><p class="text-xs text-slate-500">${k}</p><p class="text-xl font-semibold tabular-nums text-slate-900 mt-0.5">${currency === 'bs' ? 'Bs ' : '$'}${money(v)}</p></div>`).join('')}
    </div>
    <div class="${card} space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 class="text-sm font-semibold text-slate-800">Declaración de IVA — ${esc(monthLabel(month))}</h2>
          <p class="text-[11px] text-slate-500">Resumen para transcribir en la Forma 30 (99030) del portal fiscal del SENIAT. Entre corchetes, el número de casilla.</p>
        </div>
        <button id="dc-print" class="${btnPrimary} !text-xs">Imprimir resumen</button>
      </div>
      ${currency === 'usd' ? '<div class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">La declaración se presenta en <strong>bolívares</strong>. Cambia arriba a <strong>Bs</strong> para ver los montos convertidos con la tasa BCV de cada factura.</div>' : ''}
      <div class="overflow-x-auto"><table class="w-full text-xs">
        <thead><tr class="text-[10px] font-bold uppercase text-slate-500"><th class="p-2 text-left">Concepto</th><th class="p-2 text-right">Base imponible</th><th class="p-2 text-right">Débito / crédito fiscal</th></tr></thead>
        <tbody>${layout(false)}</tbody>
      </table></div>
      <p class="text-[11px] text-slate-400">Las casillas sin movimiento (exportaciones, alícuota adicional, prorrata, reintegros, ajustes) quedan en 0. Verifica los números de casilla con la planilla vigente antes de declarar; el plazo lo fija el calendario de declaraciones del SENIAT según el último dígito del RIF.</p>
    </div>
    <div class="${card} space-y-3">
      <h2 class="text-sm font-semibold text-slate-900">Asientos del IVA del mes (en USD)</h2>
      <p class="text-xs text-slate-500">Al cerrar el mes, el débito fiscal se compensa con el crédito fiscal y las retenciones; el saldo queda en <strong>IVA por Pagar (SENIAT)</strong> hasta que se paga.</p>
      <div class="grid md:grid-cols-2 gap-3">
        <div class="rounded-xl border ${liquidated ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200'} p-3 space-y-2">
          <p class="text-xs font-bold text-slate-700">1. Liquidación del mes</p>
          <ul class="text-[11px] text-slate-600 space-y-0.5">
            <li>Debe IVA Débito Fiscal: <strong>$${fmtNum(usd.c49)}</strong></li>
            <li>Haber IVA Acreditable: <strong>$${fmtNum(usd.creditApplied)}</strong></li>
            ${usd.c55 ? `<li>Haber IVA Retenido por Clientes: <strong>$${fmtNum(usd.c55)}</strong></li>` : ''}
            <li>Haber IVA por Pagar: <strong>$${fmtNum(usd.c90)}</strong></li>
          </ul>
          ${liquidated ? '<p class="text-xs font-bold text-emerald-700">✓ Registrada</p>' : `<button id="dc-liq" class="${btnPrimary} !text-xs disabled:opacity-40 disabled:cursor-not-allowed" ${usd.c49 > 0 ? '' : 'disabled'}>Registrar liquidación</button>`}
        </div>
        <div class="rounded-xl border ${paid ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200'} p-3 space-y-2">
          <p class="text-xs font-bold text-slate-700">2. Pago al SENIAT</p>
          <p class="text-[11px] text-slate-600">Debe IVA por Pagar / Haber Banco por <strong>$${fmtNum(usd.c90)}</strong>${currency === 'bs' ? ` (Bs ${money(D.c90)} declarados)` : ''}.</p>
          ${paid ? '<p class="text-xs font-bold text-emerald-700">✓ Pagado</p>' : `
            <div class="flex gap-2 items-end">
              <div class="flex-1"><label class="${label}">Fecha de pago</label><input id="dc-paydate" type="date" value="${new Date().toISOString().slice(0, 10)}" class="${input}"></div>
              <button id="dc-pay" class="${btnPrimary} !text-xs disabled:opacity-40 disabled:cursor-not-allowed" ${liquidated && usd.c90 > 0 ? '' : 'disabled title="Primero registra la liquidación"'}>Registrar pago</button>
            </div>`}
        </div>
      </div>
      <div id="dc-msg" class="text-xs text-red-600"></div>
    </div>`;

  el.querySelector('#dc-print').addEventListener('click', () => printHtml(`Declaración de IVA — ${monthLabel(month)}`,
    `<table><thead><tr><th>Concepto</th><th>Base imponible</th><th>Débito / crédito fiscal</th></tr></thead><tbody>${layout(true)}</tbody></table><p class="note">Resumen preparado para la Forma 30 (99030). Entre corchetes, el número de casilla.</p>`));
  const liqBtn = el.querySelector('#dc-liq');
  if (liqBtn) liqBtn.addEventListener('click', () => {
    if (!confirm(`¿Registrar la liquidación del IVA de ${monthLabel(month)}?`)) return;
    const acc = (c) => Store.getAll('accounts').find(a => a.codigo === c) || Store.ensureCatalogAccount(c);
    const deb = acc('2.1.04.01');
    const line = (a, d, c) => ({ entry_date: to, codigo_cuenta: a.codigo, cuenta_contable: a.nombre, concepto: `Liquidación IVA ${month}`, debit: r2(d), credit: r2(c), ref_doc: liqRef, entidad: 'SENIAT' });
    const lines = [line(deb, usd.c49, 0)];
    if (usd.creditApplied > 0) lines.push(line(acc('1.1.03.01'), 0, usd.creditApplied));
    if (usd.c55 > 0) lines.push(line(acc('1.1.03.02'), 0, usd.c55));
    if (usd.c90 > 0) lines.push(line(acc('2.1.04.02'), 0, usd.c90));
    Store.postJournalRows(lines, { source: 'iva_liquidation' });
    renderDeclaration(el);
  });
  const payBtn = el.querySelector('#dc-pay');
  if (payBtn) payBtn.addEventListener('click', () => {
    const date = el.querySelector('#dc-paydate').value;
    const accounts = Store.getAll('accounts');
    const bank = accounts.filter(a => a.tipo_especifico === 'Banco').sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)))[0] || Store.ensureCatalogAccount('1.1.01.02');
    const payable = accounts.find(a => a.codigo === '2.1.04.02') || Store.ensureCatalogAccount('2.1.04.02');
    if (!date) { el.querySelector('#dc-msg').textContent = 'Indica la fecha de pago.'; return; }
    if (!confirm(`¿Registrar el pago de $${fmtNum(usd.c90)} al SENIAT desde ${bank.nombre}?`)) return;
    Store.postJournalRows(buildTwoLineEntry({ date, total: usd.c90, concepto: `Pago IVA ${month}`, entidad: 'SENIAT', refDoc: payRef, debitAccount: payable, creditAccount: bank }), { source: 'iva_payment' });
    renderDeclaration(el);
  });
}

// ---------- Tasas ----------
function renderRates(el) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = Store.getAll('exchange_rates').filter(r => r.date).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 60);
  const cur = Store.ratesFor(today);
  const tile = (k, v) => `<div class="rounded-xl border border-slate-200 bg-white p-3"><p class="text-xs text-slate-500">${k}</p><p class="text-xl font-semibold tabular-nums text-slate-900 mt-0.5">${v > 0 ? fmtBs(v) : '—'}</p></div>`;
  el.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      ${tile('Dólar BCV', cur && cur.usd_bcv, 'emerald')}${tile('Euro BCV', cur && cur.eur_bcv, 'sky')}${tile('USDT (Binance P2P)', cur && cur.usdt, 'amber')}
    </div>
    <div class="${card} space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 class="text-sm font-semibold text-slate-900">Tasas de cambio</h2>
          <p class="text-[11px] text-slate-500">${cur ? `Vigente: ${fmtDate(cur.date)} · ${esc(cur.source || '')}` : 'Aún no hay tasas guardadas.'} Cada venta, gasto y asiento guarda la tasa BCV del dólar de su fecha.</p>
        </div>
        <button id="rt-refresh" class="${btnPrimary} !text-xs">↻ Consultar tasas de hoy</button>
      </div>
      <div id="rt-msg" class="text-xs"></div>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-2 items-end bg-slate-50 rounded-xl p-3">
        <div><label class="${label}">Fecha</label><input id="rt-date" type="date" value="${today}" class="${input}"></div>
        <div><label class="${label}">USD BCV</label><input id="rt-usd" type="number" step="0.0001" class="${input}"></div>
        <div><label class="${label}">EUR BCV</label><input id="rt-eur" type="number" step="0.0001" class="${input}"></div>
        <div><label class="${label}">USDT</label><input id="rt-usdt" type="number" step="0.0001" class="${input}"></div>
        <button id="rt-save" class="${btnSecondary} !text-xs">Guardar a mano</button>
      </div>
      <table class="w-full text-xs">
        <thead><tr class="text-[10px] font-bold uppercase text-slate-500"><th class="p-2 text-left">Fecha</th><th class="p-2 text-right">USD BCV</th><th class="p-2 text-right">EUR BCV</th><th class="p-2 text-right">USDT</th><th class="p-2 text-right">Brecha USDT/BCV</th><th class="p-2 text-left">Fuente</th></tr></thead>
        <tbody>${rows.length === 0 ? '<tr><td colspan="6" class="p-4 text-center text-slate-400">Sin tasas guardadas.</td></tr>' : rows.map(r => `
          <tr class="border-t border-slate-100">
            <td class="p-2">${fmtDate(r.date)}</td>
            <td class="p-2 text-right font-mono">${Number(r.usd_bcv) ? fmtNum(r.usd_bcv) : '—'}</td>
            <td class="p-2 text-right font-mono">${Number(r.eur_bcv) ? fmtNum(r.eur_bcv) : '—'}</td>
            <td class="p-2 text-right font-mono">${Number(r.usdt) ? fmtNum(r.usdt) : '—'}</td>
            <td class="p-2 text-right font-mono text-slate-500">${Number(r.usdt) && Number(r.usd_bcv) ? fmtNum((r.usdt / r.usd_bcv - 1) * 100) + '%' : '—'}</td>
            <td class="p-2 text-slate-400">${esc(r.source)}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
  const msg = el.querySelector('#rt-msg');
  el.querySelector('#rt-refresh').addEventListener('click', async () => {
    msg.className = 'text-xs text-slate-500';
    msg.textContent = 'Consultando…';
    try {
      await ensureTodayRates(Store, { force: true });
      renderRates(el);
    } catch (e) {
      msg.className = 'text-xs text-red-600';
      msg.textContent = `No se pudo consultar: ${e.message}. Puedes escribir la tasa a mano.`;
    }
  });
  el.querySelector('#rt-save').addEventListener('click', () => {
    const date = el.querySelector('#rt-date').value;
    const v = (id) => Number(el.querySelector(id).value) || 0;
    if (!date || !v('#rt-usd')) { msg.className = 'text-xs text-red-600'; msg.textContent = 'Indica la fecha y al menos la tasa del dólar BCV.'; return; }
    const prev = Store.getAll('exchange_rates').find(r => r.id === date) || {};
    Store.saveRates(date, { usd_bcv: v('#rt-usd'), eur_bcv: v('#rt-eur') || prev.eur_bcv, usdt: v('#rt-usdt') || prev.usdt }, 'manual');
    renderRates(el);
  });
}

// ---------- Configuración ----------
function renderConfig(el) {
  const fs = Store.getFiscalSettings();
  el.innerHTML = `
    <div class="${card} space-y-4 max-w-2xl">
      <h2 class="text-sm font-semibold text-slate-900">Configuración del IVA</h2>
      <label class="flex items-center gap-2 text-sm font-semibold text-slate-700"><input id="cf-enabled" type="checkbox" class="w-4 h-4 accent-blue-600" ${fs.ivaEnabled ? 'checked' : ''}> Calcular IVA en ventas y compras</label>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="${label}">Alícuota general (%)</label><input id="cf-general" type="number" step="0.01" value="${fs.rateGeneral}" class="${input}"></div>
        <div><label class="${label}">Alícuota reducida (%)</label><input id="cf-reducida" type="number" step="0.01" value="${fs.rateReducida}" class="${input}"></div>
      </div>
      <div>
        <label class="${label}">Los precios de venta del catálogo…</label>
        <div class="grid grid-cols-2 gap-2">
          <label class="flex items-start gap-2 rounded-xl border p-3 text-xs cursor-pointer ${!fs.pricesIncludeIva ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}"><input type="radio" name="cf-incl" value="0" ${!fs.pricesIncludeIva ? 'checked' : ''}> <span><strong>No incluyen IVA</strong><br>El IVA se suma al precio (precio $100 → total $${fmtNum(100 * (1 + fs.rateGeneral / 100))}).</span></label>
          <label class="flex items-start gap-2 rounded-xl border p-3 text-xs cursor-pointer ${fs.pricesIncludeIva ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}"><input type="radio" name="cf-incl" value="1" ${fs.pricesIncludeIva ? 'checked' : ''}> <span><strong>Ya incluyen IVA</strong><br>El IVA sale del precio (precio $100 → base $${fmtNum(100 / (1 + fs.rateGeneral / 100))}).</span></label>
        </div>
      </div>
      <ul class="text-[11px] text-slate-500 list-disc pl-4 space-y-1">
        <li>Los productos exentos o con alícuota reducida se marcan en <a href="#/contabilidad/inventario" class="text-blue-600 font-semibold">Inventario</a> (debajo del precio de venta).</li>
        <li>Los clientes contribuyentes especiales que retienen IVA (75 % o 100 %) se marcan en <a href="#/contabilidad/contactos" class="text-blue-600 font-semibold">Clientes y Contactos</a>.</li>
        <li>Las facturas de proveedores con IVA se registran en <a href="#/contabilidad/gastos" class="text-blue-600 font-semibold">Gastos</a> marcando "Factura con IVA". El IVA de importación sale solo del cierre de cada contenedor.</li>
      </ul>
      <div class="flex items-center gap-3"><button id="cf-save" class="${btnPrimary}">Guardar</button><span id="cf-msg" class="text-xs text-emerald-700"></span></div>
    </div>`;
  el.querySelector('#cf-save').addEventListener('click', () => {
    Store.saveFiscalSettings({
      ivaEnabled: el.querySelector('#cf-enabled').checked,
      rateGeneral: Number(el.querySelector('#cf-general').value) || 16,
      rateReducida: Number(el.querySelector('#cf-reducida').value) || 8,
      pricesIncludeIva: el.querySelector('input[name="cf-incl"]:checked').value === '1'
    });
    renderConfig(el);
    el.querySelector('#cf-msg').textContent = '✓ Guardado';
  });
}

const Fiscal = {
  async render(app, params) {
    const tab = TABS.some(t => t.key === (params && params[0])) ? params[0] : 'ventas';
    const fs = Store.getFiscalSettings();
    const usesPeriod = ['ventas', 'compras', 'declaracion'].includes(tab);
    const body = `
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-slate-900">Impuestos</h1>
          <p class="text-xs text-slate-500">IVA ${fs.ivaEnabled ? `activo (${fs.rateGeneral}% general · ${fs.rateReducida}% reducida · precios ${fs.pricesIncludeIva ? 'con' : 'sin'} IVA)` : '<strong class="text-red-600">desactivado</strong>'}</p>
        </div>
        ${usesPeriod ? `
        <div class="flex items-end gap-2">
          <div><label class="${label}">Mes</label><input id="fx-month" type="month" value="${month}" class="${input}"></div>
          <div class="flex gap-0.5 p-0.5 rounded-lg bg-slate-100 text-xs">
            ${['usd', 'bs'].map(c => `<button data-cur="${c}" class="${curCls(c)}">${c === 'usd' ? 'USD' : 'Bs'}</button>`).join('')}
          </div>
        </div>` : ''}
      </div>
      <div class="flex gap-5 overflow-x-auto no-scrollbar border-b border-slate-200">
        ${TABS.map(t => `<a href="#/contabilidad/fiscal/${t.key}" class="pb-2 -mb-px text-sm whitespace-nowrap border-b-2 ${t.key === tab ? 'border-blue-600 text-slate-900 font-medium' : 'border-transparent text-slate-500 hover:text-slate-900'}">${t.label}</a>`).join('')}
      </div>
      <div id="fx-body" class="space-y-5"></div>`;
    app.innerHTML = AccountingShell.wrap(AccountingTabs.render(ACTIVE_KEY[tab]), body);

    const el = document.getElementById('fx-body');
    const draw = () => {
      if (tab === 'ventas' || tab === 'compras') renderBook(el, tab, fs);
      else if (tab === 'declaracion') renderDeclaration(el);
      else if (tab === 'tasas') renderRates(el);
      else renderConfig(el);
    };
    const m = document.getElementById('fx-month');
    if (m) m.addEventListener('change', () => { if (m.value) { month = m.value; draw(); } });
    app.querySelectorAll('[data-cur]').forEach(b => b.addEventListener('click', () => {
      currency = b.dataset.cur;
      app.querySelectorAll('[data-cur]').forEach(x => { x.className = curCls(x.dataset.cur); });
      draw();
    }));
    draw();
  }
};

export default Fiscal;
