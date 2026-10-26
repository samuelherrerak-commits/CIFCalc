import { fmtNum, esc } from '../utils.js';

// Bloque "Factura fiscal" para Gastos y Costos: una factura de proveedor
// puede traer renglones exentos y renglones gravados (a la alícuota general
// o reducida) a la vez. La base imponible es la parte gravada, y solo sobre
// ella se calcula el IVA; lo exento no lleva IVA. Una factura totalmente
// exenta también se registra (va al Libro de Compras como compra sin derecho
// a crédito fiscal).
//
// El IVA se calcula solo (base × alícuota) pero se puede corregir a mano para
// que coincida al céntimo con la factura.

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function invoiceFieldsHtml(fs, { input, label }) {
  if (!fs.ivaEnabled) return '';
  const money = (id, placeholder = '0.00') => `<input id="${id}" type="number" min="0" step="0.01" placeholder="${placeholder}" class="${input} text-right font-mono">`;
  return `
    <label class="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
      <input id="inv-on" type="checkbox" class="w-4 h-4 accent-blue-600"> Registrar factura fiscal del proveedor <span class="font-normal text-slate-400">(va al Libro de Compras)</span>
    </label>
    <div id="inv-box" class="hidden bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
      <div class="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2">
        <div>
          <label class="${label}">N.º factura *</label>
          <input id="inv-number" type="text" class="${input}">
        </div>
        <div>
          <label class="${label}">N.º de control</label>
          <input id="inv-control" type="text" placeholder="00-000000" class="${input}">
        </div>
        <div class="col-span-2 sm:col-span-1">
          <label class="${label}" title="Renglones sin IVA">Exento / no sujeto</label>
          ${money('inv-exempt')}
        </div>
        <div>
          <label class="${label}">Base imponible ${esc(fs.rateGeneral)}%</label>
          ${money('inv-base-g')}
        </div>
        <div>
          <label class="${label}">IVA ${esc(fs.rateGeneral)}%</label>
          ${money('inv-tax-g')}
        </div>
        <div>
          <label class="${label}">Base imponible ${esc(fs.rateReducida)}%</label>
          ${money('inv-base-r')}
        </div>
        <div>
          <label class="${label}">IVA ${esc(fs.rateReducida)}%</label>
          ${money('inv-tax-r')}
        </div>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div id="inv-summary" class="flex flex-wrap gap-x-4 gap-y-1 text-xs"></div>
        <p class="text-[11px] text-slate-500">El IVA se calcula solo sobre la base imponible; corrígelo si la factura trae otro monto por redondeo.</p>
      </div>
    </div>`;
}

// totalInput: el campo "Monto Total" de la página; con factura se vuelve de
// solo lectura y muestra el total de la factura (lo que se paga).
export function mountInvoiceFields(fs, { totalInput, totalLabel, onChange } = {}) {
  const $ = (id) => document.getElementById(id);
  const on = $('inv-on');
  if (!on) {
    return { active: () => false, read: () => null, validate: () => '', reset: () => {} };
  }
  const val = (id) => r2(parseFloat($(id).value));
  const manual = { 'inv-tax-g': false, 'inv-tax-r': false };

  const read = () => {
    const exempt = val('inv-exempt'), base_general = val('inv-base-g'), base_reducida = val('inv-base-r');
    const tax_general = val('inv-tax-g'), tax_reducida = val('inv-tax-r');
    const net = r2(exempt + base_general + base_reducida);
    const tax = r2(tax_general + tax_reducida);
    return {
      invoice_number: $('inv-number').value.trim(), control_number: $('inv-control').value.trim(),
      exempt, base_general, tax_general, base_reducida, tax_reducida,
      net, tax, total: r2(net + tax)
    };
  };

  const autoTax = () => {
    if (!manual['inv-tax-g']) $('inv-tax-g').value = val('inv-base-g') ? r2(val('inv-base-g') * fs.rateGeneral / 100).toFixed(2) : '';
    if (!manual['inv-tax-r']) $('inv-tax-r').value = val('inv-base-r') ? r2(val('inv-base-r') * fs.rateReducida / 100).toFixed(2) : '';
  };

  const render = () => {
    const active = on.checked;
    $('inv-box').classList.toggle('hidden', !active);
    if (totalInput) {
      totalInput.readOnly = active;
      totalInput.classList.toggle('bg-slate-100', active);
      if (active) totalInput.value = read().total ? read().total.toFixed(2) : '';
    }
    if (totalLabel) totalLabel.textContent = active ? 'Total factura (calculado)' : 'Monto Total *';
    const t = read();
    const tile = (k, v, strong) => `<span class="text-slate-500">${k}: <span class="font-mono ${strong ? 'font-black text-slate-900' : 'font-semibold text-slate-700'}">$${fmtNum(v)}</span></span>`;
    $('inv-summary').innerHTML = tile('Exento', t.exempt) + tile('Base imponible', r2(t.base_general + t.base_reducida)) + tile('IVA (crédito fiscal)', t.tax) + tile('Total factura', t.total, true);
    if (onChange) onChange(t);
  };

  on.addEventListener('change', render);
  ['inv-exempt', 'inv-base-g', 'inv-base-r'].forEach(id => $(id).addEventListener('input', () => { autoTax(); render(); }));
  ['inv-tax-g', 'inv-tax-r'].forEach(id => $(id).addEventListener('input', () => { manual[id] = $(id).value !== ''; render(); }));

  return {
    active: () => on.checked,
    read,
    validate: () => {
      if (!on.checked) return '';
      const t = read();
      if (!t.invoice_number) return 'Indica el N.º de la factura del proveedor (va al Libro de Compras).';
      if (!(t.total > 0)) return 'Indica al menos un monto de la factura: exento o base imponible.';
      if ((t.tax_general > 0 && !t.base_general) || (t.tax_reducida > 0 && !t.base_reducida)) return 'Hay IVA sin base imponible: revisa los renglones de la factura.';
      return '';
    },
    reset: () => {
      ['inv-number', 'inv-control', 'inv-exempt', 'inv-base-g', 'inv-tax-g', 'inv-base-r', 'inv-tax-r'].forEach(id => { $(id).value = ''; });
      manual['inv-tax-g'] = manual['inv-tax-r'] = false;
      render();
    }
  };
}

// Registro del Libro de Compras a partir de lo leído en el bloque.
export function purchaseFiscalDoc(Store, t, { date, contact, entidad, concepto, refDoc }) {
  return Store.newFiscalDoc({
    book: 'compras', date, doc_type: 'factura',
    invoice_number: t.invoice_number, control_number: t.control_number,
    rif: contact ? contact.rif || '' : '', name: entidad || concepto,
    total: t.total, exempt: t.exempt,
    base_general: t.base_general, tax_general: t.tax_general,
    base_reducida: t.base_reducida, tax_reducida: t.tax_reducida,
    ref_doc: refDoc, tasa_bcv: Store.usdRateFor(date), notes: concepto
  });
}
