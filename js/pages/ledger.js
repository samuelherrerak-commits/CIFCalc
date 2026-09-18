import Store from '../store.js';
import { fmtNum, esc } from '../utils.js';
import { labelForType } from '../accounting.js';
import AccountingTabs from '../components/accounting-tabs.js';

const Ledger = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    const accounts = [...Store.getAll('accounts')].sort((a, b) => String(a.code).localeCompare(String(b.code)));
    const entries = Store.getAll('journal_entries').filter(e => e.status === 'posted');
    const postedIds = new Set(entries.map(e => e.id));
    const allLines = Store.getAll('journal_lines').filter(l => postedIds.has(l.entry_id));
    const entryById = new Map(entries.map(e => [e.id, e]));

    let selectedAccountId = accounts[0] ? accounts[0].id : null;

    const balanceFor = (account, lines) => {
      const debit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
      const credit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
      const balance = account.nature === 'acreedora' ? (credit - debit) : (debit - credit);
      return { debit, credit, balance };
    };

    const renderMovements = () => {
      const account = accounts.find(a => a.id === selectedAccountId);
      const tbody = document.getElementById('ledger-tbody');
      const summaryEl = document.getElementById('ledger-summary');
      if (!account) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">Selecciona una cuenta.</td></tr>`;
        summaryEl.textContent = '';
        return;
      }
      const lines = allLines
        .filter(l => l.account_id === account.id)
        .map(l => ({ ...l, entry: entryById.get(l.entry_id) }))
        .sort((a, b) => new Date(a.entry?.entry_date || 0) - new Date(b.entry?.entry_date || 0));

      let running = 0;
      const rows = lines.map(l => {
        const debit = Number(l.debit) || 0;
        const credit = Number(l.credit) || 0;
        running += account.nature === 'acreedora' ? (credit - debit) : (debit - credit);
        return `
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="p-2">${esc(l.entry?.entry_date || '')}</td>
            <td class="p-2">${esc(l.entry?.description || '')} ${l.memo ? `<span class="text-slate-400">— ${esc(l.memo)}</span>` : ''}</td>
            <td class="p-2 text-right">${debit ? '$' + fmtNum(debit) : ''}</td>
            <td class="p-2 text-right">${credit ? '$' + fmtNum(credit) : ''}</td>
            <td class="p-2 text-right font-mono">$${fmtNum(running)}</td>
          </tr>
        `;
      }).join('');

      tbody.innerHTML = rows || `<tr><td colspan="5" class="p-4 text-center text-slate-400">Sin movimientos contabilizados para esta cuenta.</td></tr>`;
      summaryEl.textContent = `Saldo final: $${fmtNum(running)} (naturaleza ${account.nature})`;
    };

    const renderTrialBalance = () => {
      const tbody = document.getElementById('trial-tbody');
      let totalDebit = 0, totalCredit = 0;
      const rows = accounts.map(a => {
        const lines = allLines.filter(l => l.account_id === a.id);
        if (lines.length === 0) return null;
        const { debit, credit, balance } = balanceFor(a, lines);
        totalDebit += debit;
        totalCredit += credit;
        return `
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="p-2 font-mono">${esc(a.code)}</td>
            <td class="p-2">${esc(a.name)}</td>
            <td class="p-2"><span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">${esc(labelForType(a.type))}</span></td>
            <td class="p-2 text-right">$${fmtNum(debit)}</td>
            <td class="p-2 text-right">$${fmtNum(credit)}</td>
            <td class="p-2 text-right font-mono font-bold">$${fmtNum(balance)}</td>
          </tr>
        `;
      }).filter(Boolean);

      document.getElementById('trial-tbody').innerHTML = rows.join('') || `<tr><td colspan="6" class="p-4 text-center text-slate-400">Sin asientos contabilizados todavía.</td></tr>`;
      document.getElementById('trial-total-debit').textContent = `$${fmtNum(totalDebit)}`;
      document.getElementById('trial-total-credit').textContent = `$${fmtNum(totalCredit)}`;
    };

    app.innerHTML = `
      <header class="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h1 class="text-2xl font-bold text-slate-900">Contabilidad</h1>
        <p class="text-sm text-slate-500">Partida doble en USD, integrada con el Maestro de Costo</p>
      </header>

      ${AccountingTabs.render('ledger')}

      <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-4 py-3 border-b border-slate-200">
          <h2 class="font-bold text-slate-800">Mayor por Cuenta</h2>
          <div class="flex items-center gap-2">
            <select id="ledger-account" class="p-2 border rounded-lg text-sm bg-slate-50">
              ${accounts.map(a => `<option value="${a.id}">${esc(a.code)} — ${esc(a.name)}</option>`).join('')}
            </select>
            <span id="ledger-summary" class="text-xs text-slate-500 whitespace-nowrap"></span>
          </div>
        </div>
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-100 border-b border-slate-200 text-slate-700">
              <th class="p-2">Fecha</th>
              <th class="p-2">Asiento / Concepto</th>
              <th class="p-2 text-right">Debe</th>
              <th class="p-2 text-right">Haber</th>
              <th class="p-2 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody id="ledger-tbody"></tbody>
        </table>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
        <div class="px-4 py-3 border-b border-slate-200">
          <h2 class="font-bold text-slate-800">Balance de Comprobación</h2>
          <p class="text-xs text-slate-500">Solo asientos contabilizados (estado "Contabilizado")</p>
        </div>
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-100 border-b border-slate-200 text-slate-700">
              <th class="p-2">Código</th>
              <th class="p-2">Cuenta</th>
              <th class="p-2">Clasificación</th>
              <th class="p-2 text-right">Σ Debe</th>
              <th class="p-2 text-right">Σ Haber</th>
              <th class="p-2 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody id="trial-tbody"></tbody>
          <tfoot>
            <tr class="bg-slate-50 font-bold border-t border-slate-200">
              <td class="p-2" colspan="3">Totales</td>
              <td class="p-2 text-right" id="trial-total-debit"></td>
              <td class="p-2 text-right" id="trial-total-credit"></td>
              <td class="p-2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;

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
