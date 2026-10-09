import Store from '../store.js';
import { fmtNum, esc, num } from '../utils.js';
import { buildIncomeLines, withRoundingPlug } from '../accounting.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { btnPrimary, card, input, label } from '../components/accounting-shell.js';

const Income = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    let accounts = Store.getAll('accounts').filter(a => a.is_active !== false);

    // "Ingresos por Ventas" queda reservada al módulo de Ventas (vinculado al
    // inventario) — aquí solo se registran ingresos que no vienen de vender
    // un producto del catálogo (préstamos, otros ingresos).
    const byTipo = (tipo) => accounts.filter(a => a.tipo === tipo && a.nombre !== 'Ingresos por Ventas').sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    const byTipoEspecifico = (te) => accounts.filter(a => a.tipo_especifico === te).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    const accountOptions = (list) => list.map(a => `<option value="${a.id}">${esc(a.codigo)} — ${esc(a.nombre)}</option>`).join('');
    const diffAccount = () => accounts.find(a => a.codigo === '6.9.01.01');

    const recentIncome = () => Store.getAll('movements')
      .filter(m => m.source === 'income')
      .sort((a, b) => new Date(b.entry_date || 0) - new Date(a.entry_date || 0))
      .slice(0, 30);

    const renderList = () => {
      const tbody = document.getElementById('income-tbody');
      const list = recentIncome();
      tbody.innerHTML = list.length === 0
        ? `<tr><td colspan="4" class="p-4 text-center text-slate-400">Sin ingresos registrados todavía.</td></tr>`
        : list.map(m => `
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="p-2">${esc(m.entry_date)}</td>
            <td class="p-2">${esc(m.ref_doc)} — ${esc(m.concepto)}</td>
            <td class="p-2 text-right font-mono">${m.debit > 0 ? '$' + fmtNum(m.debit) : ''}</td>
            <td class="p-2 text-slate-500">${esc(m.entidad)}</td>
          </tr>
        `).join('');
    };

    const saveIncome = () => {
      const date = document.getElementById('f-date').value;
      const revenueId = document.getElementById('f-revenue').value;
      const paymentId = document.getElementById('f-payment').value;
      const entidad = document.getElementById('f-entidad').value.trim();
      const concepto = document.getElementById('f-concepto').value.trim();
      const total = num(document.getElementById('f-total'));
      const msgEl = document.getElementById('income-msg');
      msgEl.textContent = '';

      if (!date) { msgEl.textContent = 'La fecha es obligatoria.'; return; }
      if (!revenueId) { msgEl.textContent = 'Selecciona la cuenta de ingreso.'; return; }
      if (!paymentId) { msgEl.textContent = 'Selecciona la cuenta de pago (Efectivo/Banco/Clientes).'; return; }
      if (total <= 0) { msgEl.textContent = 'El monto debe ser mayor a 0.'; return; }
      if (!concepto) { msgEl.textContent = 'El concepto es obligatorio.'; return; }

      const refDoc = `ING-${Date.now().toString().slice(-6)}`;
      const data = {
        date, total, concepto, entidad, refDoc,
        paymentAccount: accounts.find(a => a.id === paymentId),
        revenueAccount: accounts.find(a => a.id === revenueId)
      };

      const lines = withRoundingPlug(buildIncomeLines(data), diffAccount(), date, refDoc);
      Store.postJournalRows(lines, { source: 'income' });

      document.getElementById('f-total').value = '';
      document.getElementById('f-concepto').value = '';
      document.getElementById('f-entidad').value = '';
      renderList();
    };

    const body = `
      <div class="${card} space-y-3">
        <h2 class="text-sm font-bold text-slate-700">Registrar Ingreso</h2>
        <p class="text-xs text-slate-400">Para vender un producto del inventario usa el módulo de Ventas — aquí solo van préstamos recibidos u otros ingresos que no sean venta de mercancía.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label class="${label}">Fecha *</label>
            <input id="f-date" type="date" value="${new Date().toISOString().slice(0, 10)}" class="${input}">
          </div>
          <div>
            <label class="${label}">Cuenta de Ingreso *</label>
            <select id="f-revenue" class="${input}">${accountOptions(byTipo('Ingreso'))}</select>
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
              <optgroup label="Crédito (CxC)">${accountOptions(byTipoEspecifico('Clientes'))}</optgroup>
            </select>
          </div>
          <div>
            <label class="${label}">Cliente / Contraparte</label>
            <input id="f-entidad" type="text" class="${input}">
          </div>
          <div class="sm:col-span-2 lg:col-span-2">
            <label class="${label}">Concepto *</label>
            <input id="f-concepto" type="text" class="${input}">
          </div>
        </div>
        <div id="income-msg" class="text-xs text-red-600"></div>
        <button id="btn-save-income" class="${btnPrimary}">Registrar Ingreso</button>
      </div>

      <div class="${card}">
        <h2 class="text-sm font-bold text-slate-700 mb-3">Ingresos Registrados</h2>
        <table class="w-full text-left text-xs">
          <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide"><th class="p-2">Fecha</th><th class="p-2">Referencia</th><th class="p-2 text-right">Monto</th><th class="p-2">Cliente</th></tr></thead>
          <tbody id="income-tbody"></tbody>
        </table>
      </div>
    `;

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('income'), body);

    document.getElementById('btn-save-income').addEventListener('click', saveIncome);

    renderList();

    return () => destroy.abort();
  }
};

export default Income;
