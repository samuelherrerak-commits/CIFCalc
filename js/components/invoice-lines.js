import { fmtNum, esc } from '../utils.js';
import { line } from '../accounting.js';

// Líneas de una factura de proveedor (Costos y Gastos). Una misma factura
// puede traer varios conceptos (FOB de la mercancía, flete, seguro, un
// descuento…) y cada uno va a su propia cuenta contable. Un descuento se
// escribe en negativo: resta de la cuenta que se elija (normalmente la misma
// del concepto que rebaja).
//
// Con factura fiscal, cada línea indica además si es exenta o gravada (16 % u
// 8 %): de ahí salen el exento y las bases imponibles del Libro de Compras.

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
let seq = 0;

export const IVA_TYPES = [
  { key: 'G', label: (fs) => `${fs.rateGeneral}%` },
  { key: 'R', label: (fs) => `${fs.rateReducida}%` },
  { key: 'E', label: () => 'Exento' }
];

// groups = [{ label, accounts: [{ id, codigo, nombre }] }]
const accountSelect = (groups, selected) => '<option value="">— Cuenta —</option>' + groups.filter(g => g.accounts.length).map(g =>
  `<optgroup label="${esc(g.label)}">${g.accounts.map(a => `<option value="${esc(a.id)}" ${a.id === selected ? 'selected' : ''}>${esc(a.codigo)} — ${esc(a.nombre)}</option>`).join('')}</optgroup>`).join('');

export function invoiceLinesHtml({ label }) {
  return `
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <label class="${label} !mb-0">Líneas de la factura *</label>
        <span class="text-[11px] text-slate-400">Un descuento va en negativo (ej. −150).</span>
      </div>
      <div class="border border-slate-200 rounded-xl overflow-x-auto">
        <table class="w-full text-xs">
          <thead class="bg-slate-50 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
            <tr><th class="p-2 text-left">Concepto</th><th class="p-2 text-left">Cuenta contable</th><th class="p-2 text-left il-iva-col">IVA</th><th class="p-2 text-right">Monto</th><th class="p-2 w-8"></th></tr>
          </thead>
          <tbody id="il-body"></tbody>
          <tfoot>
            <tr class="border-t border-slate-200">
              <td class="p-2" colspan="2"><button type="button" id="il-add" class="text-xs font-semibold text-blue-600 hover:text-blue-800">+ Agregar línea</button></td>
              <td class="p-2 text-right text-slate-500 il-iva-col"></td>
              <td class="p-2 text-right"><span class="text-slate-500">Subtotal</span> <span id="il-subtotal" class="font-mono font-semibold text-slate-900">$0.00</span></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div id="il-by-account" class="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500"></div>
    </div>`;
}

// fs = Store.getFiscalSettings(); groups = cuentas para elegir; onChange(totals)
export function mountInvoiceLines({ fs, groups, input, onChange }) {
  const $ = (id) => document.getElementById(id);
  const body = $('il-body');
  let rows = [];
  let withIva = false;
  const allAccounts = groups.flatMap(g => g.accounts);
  const cell = 'w-full p-1.5 border border-slate-200 rounded-md text-xs bg-white';

  const blank = () => ({ key: ++seq, concepto: '', accountId: '', iva: 'G', amount: '' });

  const totals = () => {
    const valid = rows.map(r => ({ ...r, amount: r2(parseFloat(r.amount)) })).filter(r => r.amount);
    const by = (k) => r2(valid.filter(r => r.iva === k).reduce((s, r) => s + r.amount, 0));
    const perAccount = new Map();
    for (const r of valid) perAccount.set(r.accountId, r2((perAccount.get(r.accountId) || 0) + r.amount));
    return {
      lines: valid,
      subtotal: r2(valid.reduce((s, r) => s + r.amount, 0)),
      exempt: by('E'), base_general: by('G'), base_reducida: by('R'),
      perAccount
    };
  };

  const renderTotals = () => {
    const t = totals();
    $('il-subtotal').textContent = (t.subtotal < 0 ? '−$' : '$') + fmtNum(Math.abs(t.subtotal));
    const names = new Map(allAccounts.map(a => [a.id, `${a.codigo} ${a.nombre}`]));
    $('il-by-account').innerHTML = t.perAccount.size > 1
      ? 'Por cuenta: ' + [...t.perAccount.entries()].map(([id, v]) => `<span><span class="text-slate-600">${esc(names.get(id) || 'Sin cuenta')}</span> <span class="font-mono">${v < 0 ? '−' : ''}$${fmtNum(Math.abs(v))}</span></span>`).join('')
      : '';
    if (onChange) onChange(t);
  };

  const render = () => {
    body.innerHTML = rows.map(r => `
      <tr data-key="${r.key}" class="border-t border-slate-100">
        <td class="p-1.5 min-w-[10rem]"><input data-f="concepto" type="text" value="${esc(r.concepto)}" placeholder="Ej. FOB mercancía" class="${cell}"></td>
        <td class="p-1.5 min-w-[13rem]"><select data-f="accountId" class="${cell}">${accountSelect(groups, r.accountId)}</select></td>
        <td class="p-1.5 il-iva-col ${withIva ? '' : 'hidden'}"><select data-f="iva" class="${cell}">${IVA_TYPES.map(t => `<option value="${t.key}" ${r.iva === t.key ? 'selected' : ''}>${esc(t.label(fs))}</option>`).join('')}</select></td>
        <td class="p-1.5 w-32"><input data-f="amount" type="number" step="0.01" value="${esc(r.amount)}" placeholder="0.00" class="${cell} text-right font-mono"></td>
        <td class="p-1.5 text-center">${rows.length > 1 ? `<button type="button" data-del class="text-slate-300 hover:text-red-600 text-base leading-none" title="Quitar línea">✕</button>` : ''}</td>
      </tr>`).join('');
    document.querySelectorAll('.il-iva-col').forEach(el => el.classList.toggle('hidden', !withIva));
    renderTotals();
  };

  body.addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-key]');
    const f = e.target.dataset.f;
    if (!tr || !f) return;
    const r = rows.find(x => String(x.key) === tr.dataset.key);
    r[f] = e.target.value;
    renderTotals();
  });
  body.addEventListener('change', (e) => {
    const tr = e.target.closest('tr[data-key]');
    const f = e.target.dataset.f;
    if (!tr || !f) return;
    const r = rows.find(x => String(x.key) === tr.dataset.key);
    r[f] = e.target.value;
    // El concepto vacío toma el nombre de la cuenta.
    if (f === 'accountId' && !r.concepto) {
      const a = allAccounts.find(x => x.id === r.accountId);
      if (a) { r.concepto = a.nombre; tr.querySelector('[data-f="concepto"]').value = a.nombre; }
    }
    renderTotals();
  });
  body.addEventListener('click', (e) => {
    if (!e.target.closest('[data-del]')) return;
    const key = e.target.closest('tr[data-key]').dataset.key;
    rows = rows.filter(x => String(x.key) !== key);
    render();
  });
  $('il-add').addEventListener('click', () => {
    const last = rows[rows.length - 1];
    rows.push({ ...blank(), iva: last ? last.iva : 'G' });
    render();
    const inputs = body.querySelectorAll('[data-f="concepto"]');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  rows = [blank()];
  render();

  return {
    totals,
    // Muestra u oculta la columna de IVA (solo con factura fiscal).
    setFiscal(on) { withIva = !!on; render(); },
    validate() {
      const t = totals();
      if (!t.lines.length) return 'Agrega al menos una línea con monto.';
      if (t.lines.some(r => !r.accountId)) return 'Cada línea con monto necesita su cuenta contable.';
      if (rows.some(r => !r2(parseFloat(r.amount)) && (r.concepto || r.accountId))) return 'Hay una línea sin monto: complétala o quítala.';
      if (!(t.subtotal > 0)) return 'El total de la factura debe ser mayor a 0.';
      return '';
    },
    reset() { rows = [blank()]; render(); },
    // Líneas del diario: debe (o haber, si es descuento) de cada cuenta.
    journalLines({ date, concepto, refDoc, entidad }) {
      return totals().lines.map(r => {
        const account = allAccounts.find(a => a.id === r.accountId);
        const text = r.concepto && r.concepto !== concepto ? `${concepto} | ${r.concepto}` : concepto;
        return line(date, account, r.amount > 0 ? r.amount : 0, r.amount < 0 ? -r.amount : 0, text, refDoc, entidad);
      });
    }
  };
}
