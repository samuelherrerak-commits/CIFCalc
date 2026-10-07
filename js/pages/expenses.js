import Store from '../store.js';
import { fmtNum, esc, num } from '../utils.js';
import { buildExpenseLines, withRoundingPlug } from '../accounting.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { btnPrimary, card, input, label } from '../components/accounting-shell.js';

const Expenses = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    let accounts = Store.getAll('accounts').filter(a => a.is_active !== false);

    const byTipo = (tipo) => accounts.filter(a => a.tipo === tipo).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    const byTipoEspecifico = (te) => accounts.filter(a => a.tipo_especifico === te).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    const accountOptions = (list) => list.map(a => `<option value="${a.id}">${esc(a.codigo)} — ${esc(a.nombre)}</option>`).join('');
    const diffAccount = () => accounts.find(a => a.codigo === '6.9.01.01');

    const recentExpenses = () => Store.getAll('movements')
      .filter(m => m.source === 'expense')
      .sort((a, b) => new Date(b.entry_date || 0) - new Date(a.entry_date || 0))
      .slice(0, 30);

    const renderList = () => {
      const tbody = document.getElementById('expenses-tbody');
      const list = recentExpenses();
      tbody.innerHTML = list.length === 0
        ? `<tr><td colspan="4" class="py-4 text-center text-slate-500">Sin gastos registrados todavía.</td></tr>`
        : list.map(m => `
          <tr class="border-t border-slate-700/30 hover:bg-slate-800/30">
            <td class="py-1.5">${esc(m.entry_date)}</td>
            <td class="py-1.5">${esc(m.ref_doc)} — ${esc(m.concepto)}</td>
            <td class="py-1.5 text-right font-mono">${m.debit > 0 ? '$' + fmtNum(m.debit) : ''}</td>
            <td class="py-1.5 text-slate-400">${esc(m.entidad)}</td>
          </tr>
        `).join('');
    };

    const saveExpense = () => {
      const date = document.getElementById('f-date').value;
      const expenseId = document.getElementById('f-expense').value;
      const paymentId = document.getElementById('f-payment').value;
      const entidad = document.getElementById('f-entidad').value.trim();
      const concepto = document.getElementById('f-concepto').value.trim();
      const total = num(document.getElementById('f-total'));
      const msgEl = document.getElementById('expense-msg');
      msgEl.textContent = '';

      if (!date) { msgEl.textContent = 'La fecha es obligatoria.'; return; }
      if (!expenseId) { msgEl.textContent = 'Selecciona la categoría de gasto.'; return; }
      if (!paymentId) { msgEl.textContent = 'Selecciona la cuenta de pago (Efectivo/Banco/Proveedores).'; return; }
      if (total <= 0) { msgEl.textContent = 'El monto debe ser mayor a 0.'; return; }
      if (!concepto) { msgEl.textContent = 'El concepto es obligatorio.'; return; }

      const refDoc = `GST-${Date.now().toString().slice(-6)}`;
      const data = {
        date, total, concepto, entidad, refDoc,
        paymentAccount: accounts.find(a => a.id === paymentId),
        expenseAccount: accounts.find(a => a.id === expenseId)
      };

      const lines = withRoundingPlug(buildExpenseLines(data), diffAccount(), date, refDoc);
      Store.postJournalRows(lines, { source: 'expense' });

      document.getElementById('f-total').value = '';
      document.getElementById('f-concepto').value = '';
      document.getElementById('f-entidad').value = '';
      renderList();
    };

    const body = `
      <div class="${card} space-y-3">
        <h2 class="text-sm font-black uppercase tracking-wide text-slate-300">Registrar Gasto</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label class="${label}">Fecha *</label>
            <input id="f-date" type="date" value="${new Date().toISOString().slice(0, 10)}" class="${input}">
          </div>
          <div>
            <label class="${label}">Categoría de Gasto *</label>
            <select id="f-expense" class="${input}">${accountOptions(byTipo('Gasto'))}</select>
          </div>
          <div>
            <label class="${label}">Monto Total *</label>
            <input id="f-total" type="number" min="0" step="0.01" class="${input}">
          </div>
          <div>
            <label class="${label}">Forma de Pago *</label>
            <select id="f-payment" class="${input}">
              <option value="">— Cuenta —</option>
              <optgroup label="Efectivo">${accountOptions(byTipoEspecifico('Efectivo'))}</optgroup>
              <optgroup label="Banco">${accountOptions(byTipoEspecifico('Banco'))}</optgroup>
              <optgroup label="Crédito (CxP)">${accountOptions(byTipoEspecifico('Proveedores'))}</optgroup>
            </select>
          </div>
          <div>
            <label class="${label}">Beneficiario</label>
            <input id="f-entidad" type="text" class="${input}">
          </div>
          <div class="sm:col-span-2 lg:col-span-2">
            <label class="${label}">Concepto *</label>
            <input id="f-concepto" type="text" class="${input}">
          </div>
        </div>
        <div id="expense-msg" class="text-xs text-rose-400"></div>
        <button id="btn-save-expense" class="${btnPrimary}">Registrar Gasto</button>
      </div>

      <div class="${card}">
        <h2 class="text-sm font-black uppercase tracking-wide text-slate-300 mb-3">Gastos Registrados</h2>
        <table class="w-full text-left text-xs">
          <thead><tr class="text-[9px] font-black text-slate-500 uppercase tracking-wider"><th class="py-1.5">Fecha</th><th class="py-1.5">Referencia</th><th class="py-1.5 text-right">Monto</th><th class="py-1.5">Beneficiario</th></tr></thead>
          <tbody id="expenses-tbody"></tbody>
        </table>
      </div>
    `;

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('expenses'), body);

    document.getElementById('btn-save-expense').addEventListener('click', saveExpense);

    renderList();

    return () => destroy.abort();
  }
};

export default Expenses;
