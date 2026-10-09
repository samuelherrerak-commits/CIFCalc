import Store from '../store.js';
import { fmtNum, esc, num } from '../utils.js';
import { buildTwoLineEntry, withRoundingPlug } from '../accounting.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { btnPrimary, card, input, label } from '../components/accounting-shell.js';

const Payables = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    const accounts = Store.getAll('accounts').filter(a => a.is_active !== false);
    const byTipoEspecifico = (te) => accounts.filter(a => a.tipo_especifico === te).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    const accountOptions = (list) => list.map(a => `<option value="${a.id}">${esc(a.codigo)} — ${esc(a.nombre)}</option>`).join('');
    const diffAccount = () => accounts.find(a => a.codigo === '6.9.01.01');
    // Específicamente "Proveedores por Pagar" — "Contenedores por Pagar" tiene
    // su propia pestaña Pagos aparte, no se mezclan aquí aunque ambas sean
    // tipo_especifico "Proveedores".
    const payableAccount = () => accounts.find(a => a.nombre === 'Proveedores por Pagar');

    // Saldo por proveedor: Σcredit - Σdebit de todas las líneas contra la
    // cuenta de Proveedores por Pagar, agrupadas por entidad.
    const supplierBalances = () => {
      const cxp = payableAccount();
      if (!cxp) return [];
      const movements = Store.getAll('movements').filter(m => m.codigo_cuenta === cxp.codigo);
      const balances = new Map();
      for (const m of movements) {
        const key = m.entidad || 'Sin especificar';
        const delta = (Number(m.credit) || 0) - (Number(m.debit) || 0);
        balances.set(key, (balances.get(key) || 0) + delta);
      }
      return [...balances.entries()]
        .map(([name, balance]) => ({ name, balance: Math.round(balance * 100) / 100 }))
        .filter(b => Math.abs(b.balance) > 0.01)
        .sort((a, b) => b.balance - a.balance);
    };

    const renderList = () => {
      const tbody = document.getElementById('payables-tbody');
      const rows = supplierBalances();
      tbody.innerHTML = rows.length === 0
        ? `<tr><td colspan="3" class="p-4 text-center text-slate-400">Sin cuentas por pagar pendientes.</td></tr>`
        : rows.map(r => `
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="p-2 font-semibold text-slate-700">${esc(r.name)}</td>
            <td class="p-2 text-right font-mono font-bold ${r.balance > 0.01 ? 'text-amber-600' : 'text-slate-400'}">$${fmtNum(r.balance)}</td>
            <td class="p-2 text-center">
              ${r.balance > 0.01
                ? `<button data-pay="${esc(r.name)}" class="text-blue-600 hover:text-blue-800 font-semibold text-xs">Registrar Pago</button>`
                : '<span class="text-xs text-slate-400">—</span>'}
            </td>
          </tr>
          <tr id="pay-form-${cssId(r.name)}" class="hidden">
            <td colspan="3" class="p-3 bg-slate-50 border-b border-slate-100">
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label class="${label}">Fecha *</label>
                  <input id="pf-date-${cssId(r.name)}" type="date" value="${new Date().toISOString().slice(0, 10)}" class="${input}">
                </div>
                <div>
                  <label class="${label}">Monto (saldo: $${fmtNum(r.balance)}) *</label>
                  <input id="pf-amount-${cssId(r.name)}" type="number" min="0" max="${r.balance}" step="0.01" value="${r.balance}" class="${input}">
                </div>
                <div>
                  <label class="${label}">Cuenta *</label>
                  <select id="pf-account-${cssId(r.name)}" class="${input}">
                    <option value="">— Cuenta —</option>
                    <optgroup label="Efectivo">${accountOptions(byTipoEspecifico('Efectivo'))}</optgroup>
                    <optgroup label="Banco">${accountOptions(byTipoEspecifico('Banco'))}</optgroup>
                  </select>
                </div>
              </div>
              <div id="pf-msg-${cssId(r.name)}" class="text-xs text-red-600 mt-2"></div>
              <div class="flex justify-end gap-2 mt-2">
                <button data-cancel="${esc(r.name)}" class="text-xs text-slate-500 hover:text-slate-700 font-semibold px-3 py-1.5">Cancelar</button>
                <button data-confirm="${esc(r.name)}" class="${btnPrimary}">Confirmar Pago</button>
              </div>
            </td>
          </tr>
        `).join('');

      tbody.querySelectorAll('[data-pay]').forEach(btn => btn.addEventListener('click', () => {
        document.getElementById(`pay-form-${cssId(btn.dataset.pay)}`).classList.remove('hidden');
      }));
      tbody.querySelectorAll('[data-cancel]').forEach(btn => btn.addEventListener('click', () => {
        document.getElementById(`pay-form-${cssId(btn.dataset.cancel)}`).classList.add('hidden');
      }));
      tbody.querySelectorAll('[data-confirm]').forEach(btn => btn.addEventListener('click', () => confirmPayment(btn.dataset.confirm, rows)));
    };

    const confirmPayment = (supplierName, rows) => {
      const id = cssId(supplierName);
      const row = rows.find(r => r.name === supplierName);
      const msgEl = document.getElementById(`pf-msg-${id}`);
      msgEl.textContent = '';
      const date = document.getElementById(`pf-date-${id}`).value;
      const amount = num(document.getElementById(`pf-amount-${id}`));
      const accountId = document.getElementById(`pf-account-${id}`).value;

      if (!date) { msgEl.textContent = 'La fecha es obligatoria.'; return; }
      if (amount <= 0 || amount > row.balance + 0.01) { msgEl.textContent = `Monto inválido (saldo disponible: $${fmtNum(row.balance)}).`; return; }
      if (!accountId) { msgEl.textContent = 'Selecciona la cuenta de pago (Efectivo/Banco).'; return; }

      const paymentAccount = accounts.find(a => a.id === accountId);
      const refDoc = `ABP-${Date.now().toString().slice(-6)}`;
      const data = {
        date, total: amount, concepto: `Abono a ${supplierName}`, entidad: supplierName, refDoc,
        debitAccount: payableAccount(), creditAccount: paymentAccount
      };
      const lines = withRoundingPlug(buildTwoLineEntry(data), diffAccount(), date, refDoc);
      Store.postJournalRows(lines, { source: 'payable_settlement' });

      renderList();
    };

    const body = `
      <div class="${card}">
        <h2 class="text-sm font-bold text-slate-700 mb-1">Cuentas por Pagar</h2>
        <p class="text-xs text-slate-400 mb-3">Saldo pendiente con cada proveedor contra Proveedores por Pagar (los contenedores tienen su propia pestaña "Pagos").</p>
        <table class="w-full text-left text-xs">
          <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
            <th class="p-2">Proveedor</th><th class="p-2 text-right">Saldo</th><th class="p-2 text-center">Acción</th>
          </tr></thead>
          <tbody id="payables-tbody"></tbody>
        </table>
      </div>
    `;

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('payables'), body);

    renderList();

    return () => destroy.abort();
  }
};

function cssId(name) {
  return String(name).replace(/[^a-zA-Z0-9]/g, '_');
}

export default Payables;
