import Store from '../store.js';
import { fmtNum, esc } from '../utils.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { card, input } from '../components/accounting-shell.js';

const Ledger = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    const accounts = [...Store.getAll('accounts')].sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    const allLines = Store.getAll('movements').filter(l => l.codigo_cuenta);

    let selectedAccountId = accounts[0] ? accounts[0].id : null;

    const balanceFor = (account, lines) => {
      const debit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
      const credit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
      const balance = account.naturaleza === 'Acreedora' ? (credit - debit) : (debit - credit);
      return { debit, credit, balance };
    };

    const renderMovements = () => {
      const account = accounts.find(a => a.id === selectedAccountId);
      const tbody = document.getElementById('ledger-tbody');
      const summaryEl = document.getElementById('ledger-summary');
      if (!account) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-500">Selecciona una cuenta.</td></tr>`;
        summaryEl.textContent = '';
        return;
      }
      const lines = allLines
        .filter(l => l.codigo_cuenta === account.codigo)
        .sort((a, b) => new Date(a.entry_date || 0) - new Date(b.entry_date || 0));

      let running = 0;
      const rows = lines.map(l => {
        const debit = Number(l.debit) || 0;
        const credit = Number(l.credit) || 0;
        running += account.naturaleza === 'Acreedora' ? (credit - debit) : (debit - credit);
        return `
          <tr class="border-t border-slate-700/30 hover:bg-slate-800/30">
            <td class="py-1.5">${esc(l.entry_date || '')}</td>
            <td class="py-1.5 text-slate-200">${esc(l.ref_doc)} — ${esc(l.concepto || '')}</td>
            <td class="py-1.5 text-right font-mono text-blue-400">${debit ? '$' + fmtNum(debit) : ''}</td>
            <td class="py-1.5 text-right font-mono text-emerald-400">${credit ? '$' + fmtNum(credit) : ''}</td>
            <td class="py-1.5 text-right font-mono">$${fmtNum(running)}</td>
          </tr>
        `;
      }).join('');

      tbody.innerHTML = rows || `<tr><td colspan="5" class="py-4 text-center text-slate-500">Sin movimientos contabilizados para esta cuenta.</td></tr>`;
      summaryEl.textContent = `Saldo final: $${fmtNum(running)} (naturaleza ${account.naturaleza})`;
    };

    const renderTrialBalance = () => {
      let totalDebit = 0, totalCredit = 0;
      const rows = accounts.map(a => {
        const lines = allLines.filter(l => l.codigo_cuenta === a.codigo);
        if (lines.length === 0) return null;
        const { debit, credit, balance } = balanceFor(a, lines);
        totalDebit += debit;
        totalCredit += credit;
        return `
          <tr class="border-t border-slate-700/30 hover:bg-slate-800/30">
            <td class="py-1.5 font-mono text-slate-300">${esc(a.codigo)}</td>
            <td class="py-1.5 text-slate-200">${esc(a.nombre)}</td>
            <td class="py-1.5"><span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide text-slate-400 bg-slate-800">${esc(a.tipo)}</span></td>
            <td class="py-1.5 text-right font-mono">$${fmtNum(debit)}</td>
            <td class="py-1.5 text-right font-mono">$${fmtNum(credit)}</td>
            <td class="py-1.5 text-right font-mono font-black">$${fmtNum(balance)}</td>
          </tr>
        `;
      }).filter(Boolean);

      document.getElementById('trial-tbody').innerHTML = rows.join('') || `<tr><td colspan="6" class="py-4 text-center text-slate-500">Sin asientos contabilizados todavía.</td></tr>`;
      document.getElementById('trial-total-debit').textContent = `$${fmtNum(totalDebit)}`;
      document.getElementById('trial-total-credit').textContent = `$${fmtNum(totalCredit)}`;
    };

    const body = `
      <div class="${card}">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
          <h2 class="text-sm font-black uppercase tracking-wide text-slate-300">Mayor por Cuenta</h2>
          <div class="flex items-center gap-2">
            <select id="ledger-account" class="${input}" style="width:260px">
              ${accounts.map(a => `<option value="${a.id}">${esc(a.codigo)} — ${esc(a.nombre)}</option>`).join('')}
            </select>
            <span id="ledger-summary" class="text-xs text-slate-500 whitespace-nowrap"></span>
          </div>
        </div>
        <table class="w-full text-left text-xs">
          <thead><tr class="text-[9px] font-black text-slate-500 uppercase tracking-wider">
            <th class="py-1.5">Fecha</th><th class="py-1.5">Asiento / Concepto</th>
            <th class="py-1.5 text-right">Debe</th><th class="py-1.5 text-right">Haber</th><th class="py-1.5 text-right">Saldo</th>
          </tr></thead>
          <tbody id="ledger-tbody"></tbody>
        </table>
      </div>

      <div class="${card}">
        <h2 class="text-sm font-black uppercase tracking-wide text-slate-300">Balance de Comprobación</h2>
        <p class="text-xs text-slate-500 mb-3">Solo cuentas con movimientos registrados</p>
        <table class="w-full text-left text-xs">
          <thead><tr class="text-[9px] font-black text-slate-500 uppercase tracking-wider">
            <th class="py-1.5">Código</th><th class="py-1.5">Cuenta</th><th class="py-1.5">Tipo</th>
            <th class="py-1.5 text-right">Σ Debe</th><th class="py-1.5 text-right">Σ Haber</th><th class="py-1.5 text-right">Saldo</th>
          </tr></thead>
          <tbody id="trial-tbody"></tbody>
          <tfoot>
            <tr class="border-t border-slate-700/50 font-black">
              <td class="py-1.5" colspan="3">Totales</td>
              <td class="py-1.5 text-right" id="trial-total-debit"></td>
              <td class="py-1.5 text-right" id="trial-total-credit"></td>
              <td class="py-1.5"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('ledger'), body);

    document.getElementById('ledger-account').addEventListener('change', (e) => {
      selectedAccountId = e.target.value;
      renderMovements();
    }, { signal });

    renderMovements();
    renderTrialBalance();

    return () => destroy.abort();
  }
};

export default Ledger;
