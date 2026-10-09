import Store from '../store.js';
import { fmtNum, esc, num } from '../utils.js';
import { buildPayableSettlementLines, withRoundingPlug } from '../accounting.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { btnPrimary, card, input, label } from '../components/accounting-shell.js';

const ContainerPayments = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    const accounts = Store.getAll('accounts').filter(a => a.is_active !== false);
    const accountsByCodigo = new Map(accounts.map(a => [a.codigo, a]));
    const byTipoEspecifico = (te) => accounts.filter(a => a.tipo_especifico === te).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    const accountOptions = (list) => list.map(a => `<option value="${a.id}">${esc(a.codigo)} — ${esc(a.nombre)}</option>`).join('');
    const diffAccount = () => accounts.find(a => a.codigo === '6.9.01.01');

    let activePaymentId = null;

    // Para cada contenedor cerrado, el saldo del pasivo es Σcredit - Σdebit de
    // las líneas de ese contenedor (source_ref) cuya cuenta es tipo Pasivo —
    // cubre tanto el crédito original del cierre como los pagos posteriores,
    // sin asumir cuál cuenta específica se usó en el mapeo.
    const containerBalances = () => {
      const containers = Store.getAll('containers').filter(c => c.status === 'closed');
      const movements = Store.getAll('movements').filter(m => m.source === 'container_close' || m.source === 'container_payment');
      return containers.map(c => {
        const lines = movements.filter(m => m.source_ref === c.id);
        const pasivoLines = lines.filter(m => accountsByCodigo.get(m.codigo_cuenta)?.tipo === 'Pasivo');
        const original = pasivoLines.filter(m => m.source === 'container_close').reduce((s, m) => s + (Number(m.credit) || 0), 0);
        const paid = pasivoLines.filter(m => m.source === 'container_payment').reduce((s, m) => s + (Number(m.debit) || 0), 0);
        const balance = Math.round((original - paid) * 100) / 100;
        const payableCodigo = pasivoLines[0] ? pasivoLines[0].codigo_cuenta : '';
        const payableAccount = accountsByCodigo.get(payableCodigo);
        return { container: c, original, paid, balance, payableAccount };
      }).sort((a, b) => new Date(b.container.operation_date || 0) - new Date(a.container.operation_date || 0));
    };

    const renderList = () => {
      const tbody = document.getElementById('payments-tbody');
      const rows = containerBalances();
      tbody.innerHTML = rows.length === 0
        ? `<tr><td colspan="6" class="p-4 text-center text-slate-400">Sin contenedores completados todavía.</td></tr>`
        : rows.map(r => `
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="p-2">${esc(r.container.operation_date)}</td>
            <td class="p-2 font-semibold text-slate-700">${esc(r.container.bl_number) || '—'}</td>
            <td class="p-2 text-right font-mono">$${fmtNum(r.original)}</td>
            <td class="p-2 text-right font-mono text-emerald-600">$${fmtNum(r.paid)}</td>
            <td class="p-2 text-right font-mono font-bold ${r.balance > 0.01 ? 'text-amber-600' : 'text-slate-400'}">$${fmtNum(r.balance)}</td>
            <td class="p-2 text-center">
              ${r.balance > 0.01
                ? `<button data-pay="${r.container.id}" class="text-blue-600 hover:text-blue-800 font-semibold text-xs">Registrar Pago</button>`
                : '<span class="text-xs text-emerald-600 font-semibold">✓ Pagado</span>'}
            </td>
          </tr>
          <tr id="pay-form-${r.container.id}" class="hidden">
            <td colspan="6" class="p-3 bg-slate-50 border-b border-slate-100">
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label class="${label}">Fecha *</label>
                  <input id="pf-date-${r.container.id}" type="date" value="${new Date().toISOString().slice(0, 10)}" class="${input}">
                </div>
                <div>
                  <label class="${label}">Monto (saldo: $${fmtNum(r.balance)}) *</label>
                  <input id="pf-amount-${r.container.id}" type="number" min="0" max="${r.balance}" step="0.01" value="${r.balance}" class="${input}">
                </div>
                <div>
                  <label class="${label}">Cuenta *</label>
                  <select id="pf-account-${r.container.id}" class="${input}">
                    <option value="">— Cuenta —</option>
                    <optgroup label="Efectivo">${accountOptions(byTipoEspecifico('Efectivo'))}</optgroup>
                    <optgroup label="Banco">${accountOptions(byTipoEspecifico('Banco'))}</optgroup>
                  </select>
                </div>
              </div>
              <div id="pf-msg-${r.container.id}" class="text-xs text-red-600 mt-2"></div>
              <div class="flex justify-end gap-2 mt-2">
                <button data-cancel="${r.container.id}" class="text-xs text-slate-500 hover:text-slate-700 font-semibold px-3 py-1.5">Cancelar</button>
                <button data-confirm="${r.container.id}" class="${btnPrimary}">Confirmar Pago</button>
              </div>
            </td>
          </tr>
        `).join('');

      tbody.querySelectorAll('[data-pay]').forEach(btn => btn.addEventListener('click', () => {
        activePaymentId = btn.dataset.pay;
        document.getElementById(`pay-form-${activePaymentId}`).classList.remove('hidden');
      }));
      tbody.querySelectorAll('[data-cancel]').forEach(btn => btn.addEventListener('click', () => {
        document.getElementById(`pay-form-${btn.dataset.cancel}`).classList.add('hidden');
      }));
      tbody.querySelectorAll('[data-confirm]').forEach(btn => btn.addEventListener('click', () => confirmPayment(btn.dataset.confirm, rows)));
    };

    const confirmPayment = (containerId, rows) => {
      const row = rows.find(r => r.container.id === containerId);
      const msgEl = document.getElementById(`pf-msg-${containerId}`);
      msgEl.textContent = '';
      const date = document.getElementById(`pf-date-${containerId}`).value;
      const amount = num(document.getElementById(`pf-amount-${containerId}`));
      const accountId = document.getElementById(`pf-account-${containerId}`).value;

      if (!date) { msgEl.textContent = 'La fecha es obligatoria.'; return; }
      if (amount <= 0 || amount > row.balance + 0.01) { msgEl.textContent = `Monto inválido (saldo disponible: $${fmtNum(row.balance)}).`; return; }
      if (!accountId) { msgEl.textContent = 'Selecciona la cuenta de pago (Efectivo/Banco).'; return; }
      if (!row.payableAccount) { msgEl.textContent = 'No se encontró la cuenta del pasivo de este contenedor.'; return; }

      const paymentAccount = accounts.find(a => a.id === accountId);
      const refDoc = `PAG-${Date.now().toString().slice(-6)}`;
      const data = {
        date, total: amount, concepto: `Pago contenedor ${row.container.bl_number || ''}`, entidad: '', refDoc,
        payableAccount: row.payableAccount, paymentAccount
      };
      const lines = withRoundingPlug(buildPayableSettlementLines(data), diffAccount(), date, refDoc);
      Store.postJournalRows(lines, { source: 'container_payment', sourceRef: containerId });

      renderList();
    };

    const body = `
      <div class="${card}">
        <h2 class="text-sm font-bold text-slate-700 mb-1">Pagos de Contenedores</h2>
        <p class="text-xs text-slate-400 mb-3">Saldo pendiente contra Contenedores por Pagar de cada contenedor ya completado.</p>
        <table class="w-full text-left text-xs">
          <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
            <th class="p-2">Fecha</th><th class="p-2">BL / Embarque</th><th class="p-2 text-right">Monto Original</th>
            <th class="p-2 text-right">Pagado</th><th class="p-2 text-right">Saldo</th><th class="p-2 text-center">Acción</th>
          </tr></thead>
          <tbody id="payments-tbody"></tbody>
        </table>
      </div>
    `;

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('payments'), body);

    renderList();

    return () => destroy.abort();
  }
};

export default ContainerPayments;
