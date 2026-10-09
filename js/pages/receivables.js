import Store from '../store.js';
import { fmtNum, esc, num } from '../utils.js';
import { buildTwoLineEntry, withRoundingPlug } from '../accounting.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { btnPrimary, card, input, label } from '../components/accounting-shell.js';

const Receivables = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    const accounts = Store.getAll('accounts').filter(a => a.is_active !== false);
    const byTipoEspecifico = (te) => accounts.filter(a => a.tipo_especifico === te).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    const accountOptions = (list) => list.map(a => `<option value="${a.id}">${esc(a.codigo)} — ${esc(a.nombre)}</option>`).join('');
    const diffAccount = () => accounts.find(a => a.codigo === '6.9.01.01');
    const receivableAccount = () => accounts.find(a => a.tipo_especifico === 'Clientes');

    let activeId = null;

    // Saldo por cliente: Σdebit - Σcredit de todas las líneas contra la cuenta
    // de Cuentas por Cobrar, agrupadas por entidad (nombre del contacto).
    const clientBalances = () => {
      const cxc = receivableAccount();
      if (!cxc) return [];
      const movements = Store.getAll('movements').filter(m => m.codigo_cuenta === cxc.codigo);
      const balances = new Map();
      for (const m of movements) {
        const key = m.entidad || 'Sin especificar';
        const delta = (Number(m.debit) || 0) - (Number(m.credit) || 0);
        balances.set(key, (balances.get(key) || 0) + delta);
      }
      return [...balances.entries()]
        .map(([name, balance]) => ({ name, balance: Math.round(balance * 100) / 100 }))
        .filter(b => Math.abs(b.balance) > 0.01)
        .sort((a, b) => b.balance - a.balance);
    };

    const renderList = () => {
      const tbody = document.getElementById('receivables-tbody');
      const rows = clientBalances();
      tbody.innerHTML = rows.length === 0
        ? `<tr><td colspan="3" class="p-4 text-center text-slate-400">Sin cuentas por cobrar pendientes.</td></tr>`
        : rows.map(r => `
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="p-2 font-semibold text-slate-700">${esc(r.name)}</td>
            <td class="p-2 text-right font-mono font-bold ${r.balance > 0.01 ? 'text-amber-600' : 'text-slate-400'}">$${fmtNum(r.balance)}</td>
            <td class="p-2 text-center">
              ${r.balance > 0.01
                ? `<button data-collect="${esc(r.name)}" class="text-blue-600 hover:text-blue-800 font-semibold text-xs">Registrar Cobro</button>`
                : '<span class="text-xs text-slate-400">—</span>'}
            </td>
          </tr>
          <tr id="collect-form-${cssId(r.name)}" class="hidden">
            <td colspan="3" class="p-3 bg-slate-50 border-b border-slate-100">
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label class="${label}">Fecha *</label>
                  <input id="cf-date-${cssId(r.name)}" type="date" value="${new Date().toISOString().slice(0, 10)}" class="${input}">
                </div>
                <div>
                  <label class="${label}">Monto (saldo: $${fmtNum(r.balance)}) *</label>
                  <input id="cf-amount-${cssId(r.name)}" type="number" min="0" max="${r.balance}" step="0.01" value="${r.balance}" class="${input}">
                </div>
                <div>
                  <label class="${label}">Cuenta *</label>
                  <select id="cf-account-${cssId(r.name)}" class="${input}">
                    <option value="">— Cuenta —</option>
                    <optgroup label="Efectivo">${accountOptions(byTipoEspecifico('Efectivo'))}</optgroup>
                    <optgroup label="Banco">${accountOptions(byTipoEspecifico('Banco'))}</optgroup>
                  </select>
                </div>
              </div>
              <div id="cf-msg-${cssId(r.name)}" class="text-xs text-red-600 mt-2"></div>
              <div class="flex justify-end gap-2 mt-2">
                <button data-cancel="${esc(r.name)}" class="text-xs text-slate-500 hover:text-slate-700 font-semibold px-3 py-1.5">Cancelar</button>
                <button data-confirm="${esc(r.name)}" class="${btnPrimary}">Confirmar Cobro</button>
              </div>
            </td>
          </tr>
        `).join('');

      tbody.querySelectorAll('[data-collect]').forEach(btn => btn.addEventListener('click', () => {
        document.getElementById(`collect-form-${cssId(btn.dataset.collect)}`).classList.remove('hidden');
      }));
      tbody.querySelectorAll('[data-cancel]').forEach(btn => btn.addEventListener('click', () => {
        document.getElementById(`collect-form-${cssId(btn.dataset.cancel)}`).classList.add('hidden');
      }));
      tbody.querySelectorAll('[data-confirm]').forEach(btn => btn.addEventListener('click', () => confirmCollection(btn.dataset.confirm, rows)));
    };

    const confirmCollection = (clientName, rows) => {
      const id = cssId(clientName);
      const row = rows.find(r => r.name === clientName);
      const msgEl = document.getElementById(`cf-msg-${id}`);
      msgEl.textContent = '';
      const date = document.getElementById(`cf-date-${id}`).value;
      const amount = num(document.getElementById(`cf-amount-${id}`));
      const accountId = document.getElementById(`cf-account-${id}`).value;

      if (!date) { msgEl.textContent = 'La fecha es obligatoria.'; return; }
      if (amount <= 0 || amount > row.balance + 0.01) { msgEl.textContent = `Monto inválido (saldo disponible: $${fmtNum(row.balance)}).`; return; }
      if (!accountId) { msgEl.textContent = 'Selecciona la cuenta de cobro (Efectivo/Banco).'; return; }

      const paymentAccount = accounts.find(a => a.id === accountId);
      const refDoc = `COB-${Date.now().toString().slice(-6)}`;
      const data = {
        date, total: amount, concepto: `Cobro a ${clientName}`, entidad: clientName, refDoc,
        debitAccount: paymentAccount, creditAccount: receivableAccount()
      };
      const lines = withRoundingPlug(buildTwoLineEntry(data), diffAccount(), date, refDoc);
      Store.postJournalRows(lines, { source: 'receivable_collection' });

      renderList();
    };

    const body = `
      <div class="${card}">
        <h2 class="text-sm font-bold text-slate-700 mb-1">Cuentas por Cobrar</h2>
        <p class="text-xs text-slate-400 mb-3">Saldo pendiente de cada cliente contra Cuentas por Cobrar.</p>
        <table class="w-full text-left text-xs">
          <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
            <th class="p-2">Cliente</th><th class="p-2 text-right">Saldo</th><th class="p-2 text-center">Acción</th>
          </tr></thead>
          <tbody id="receivables-tbody"></tbody>
        </table>
      </div>
    `;

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('receivables'), body);

    renderList();

    return () => destroy.abort();
  }
};

function cssId(name) {
  return String(name).replace(/[^a-zA-Z0-9]/g, '_');
}

export default Receivables;
