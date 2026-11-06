import Store from '../store.js';
import { fmtNum, esc, ensureXlsx } from '../utils.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { card, input, label, btnSecondary } from '../components/accounting-shell.js';

// Libro mayor: se elige la cuenta y el rango de fechas; muestra el saldo
// anterior al rango, los movimientos con su saldo acumulado y los totales, y
// se puede exportar a Excel. Debajo, el balance de comprobación.
const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getFullYear()}-01-01`;
const dmy = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || ''); };
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Estado del filtro, se conserva al volver a la página en esta sesión.
const state = { accountId: null, from: yearStart(), to: today() };

function ledgerFor(account, movements, from, to) {
  const sign = account.naturaleza === 'Acreedora' ? -1 : 1;
  const lines = movements
    .filter(l => l.codigo_cuenta === account.codigo)
    .sort((a, b) => String(a.entry_date || '').localeCompare(String(b.entry_date || '')) || String(a.entry_number || '').localeCompare(String(b.entry_number || '')));
  let opening = 0;
  const rows = [];
  for (const l of lines) {
    const d = String(l.entry_date || '').slice(0, 10);
    const delta = sign * ((Number(l.debit) || 0) - (Number(l.credit) || 0));
    if (from && d < from) { opening += delta; continue; }
    if (to && d > to) continue;
    rows.push(l);
  }
  let running = opening, debit = 0, credit = 0;
  const out = rows.map(l => {
    const dbt = Number(l.debit) || 0, cdt = Number(l.credit) || 0;
    debit += dbt; credit += cdt;
    running += sign * (dbt - cdt);
    return { date: String(l.entry_date || '').slice(0, 10), number: l.entry_number || '', ref: l.ref_doc || '', concepto: String(l.concepto || '').split('|')[0].trim(), entidad: l.entidad || '', debit: dbt, credit: cdt, balance: r2(running) };
  });
  return { rows: out, opening: r2(opening), debit: r2(debit), credit: r2(credit), closing: r2(running) };
}

const Ledger = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    const accounts = [...Store.getAll('accounts')].sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    const allLines = Store.getAll('movements').filter(l => l.codigo_cuenta);
    const used = new Set(allLines.map(l => l.codigo_cuenta));
    if (!state.accountId || !accounts.some(a => a.id === state.accountId)) {
      state.accountId = (accounts.find(a => used.has(a.codigo)) || accounts[0] || {}).id || null;
    }
    const current = () => accounts.find(a => a.id === state.accountId);

    const renderMovements = () => {
      const account = current();
      const tbody = document.getElementById('ledger-tbody');
      const foot = document.getElementById('ledger-foot');
      if (!account) {
        tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-slate-400">Selecciona una cuenta.</td></tr>';
        foot.innerHTML = '';
        return;
      }
      const L = ledgerFor(account, allLines, state.from, state.to);
      tbody.innerHTML = `
        <tr class="border-b border-slate-100 bg-slate-50/60">
          <td class="p-2 text-slate-500">${esc(dmy(state.from))}</td><td class="p-2"></td><td class="p-2"></td><td class="p-2 text-slate-500">Saldo anterior</td>
          <td class="p-2"></td><td class="p-2"></td>
          <td class="p-2 text-right tabular-nums text-slate-700">$${fmtNum(L.opening)}</td>
        </tr>` + (L.rows.length ? L.rows.map(r => `
        <tr class="border-b border-slate-100 hover:bg-slate-50">
          <td class="p-2 whitespace-nowrap">${esc(dmy(r.date))}</td>
          <td class="p-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">${esc(r.number)}</td>
          <td class="p-2 text-slate-500 whitespace-nowrap">${esc(r.ref)}</td>
          <td class="p-2 text-slate-700">${esc(r.concepto)}${r.entidad ? `<span class="text-slate-400"> · ${esc(r.entidad)}</span>` : ''}</td>
          <td class="p-2 text-right tabular-nums">${r.debit ? '$' + fmtNum(r.debit) : ''}</td>
          <td class="p-2 text-right tabular-nums">${r.credit ? '$' + fmtNum(r.credit) : ''}</td>
          <td class="p-2 text-right tabular-nums">$${fmtNum(r.balance)}</td>
        </tr>`).join('') : '<tr><td colspan="7" class="p-4 text-center text-slate-400">Sin movimientos en este rango de fechas.</td></tr>');
      foot.innerHTML = `
        <tr class="border-t border-slate-300 font-semibold">
          <td class="p-2" colspan="4">Totales del período · ${L.rows.length} movimiento${L.rows.length === 1 ? '' : 's'}</td>
          <td class="p-2 text-right tabular-nums">$${fmtNum(L.debit)}</td>
          <td class="p-2 text-right tabular-nums">$${fmtNum(L.credit)}</td>
          <td class="p-2 text-right tabular-nums">$${fmtNum(L.closing)}</td>
        </tr>`;
      document.getElementById('ledger-nature').textContent = `Naturaleza ${String(account.naturaleza || '').toLowerCase()} · ${account.tipo || ''}`;
    };

    const exportExcel = async () => {
      const account = current();
      if (!account) return;
      const btn = document.getElementById('ledger-xlsx');
      btn.disabled = true; btn.textContent = 'Preparando…';
      try {
        const XLSX = await ensureXlsx();
        const L = ledgerFor(account, allLines, state.from, state.to);
        const biz = Store.getBusinessProfile();
        const aoa = [
          [biz.name || 'Empresa'],
          ['Libro mayor'],
          [`Cuenta: ${account.codigo} — ${account.nombre}`],
          [`Del ${dmy(state.from)} al ${dmy(state.to)}`],
          [],
          ['Fecha', 'N.º asiento', 'Referencia', 'Concepto', 'Entidad', 'Debe', 'Haber', 'Saldo'],
          [dmy(state.from), '', '', 'Saldo anterior', '', null, null, L.opening],
          ...L.rows.map(r => [dmy(r.date), r.number, r.ref, r.concepto, r.entidad, r.debit || null, r.credit || null, r.balance]),
          ['', '', '', 'Totales del período', '', L.debit, L.credit, L.closing]
        ];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = [{ wch: 11 }, { wch: 12 }, { wch: 16 }, { wch: 44 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
        // Formato numérico en Debe, Haber y Saldo.
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let R = 6; R <= range.e.r; R++) {
          for (const C of [5, 6, 7]) {
            const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
            if (cell && typeof cell.v === 'number') cell.z = '#,##0.00';
          }
        }
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Mayor');
        XLSX.writeFile(wb, `Mayor ${account.codigo} ${state.from} a ${state.to}.xlsx`);
      } catch (e) {
        alert(`No se pudo exportar: ${e.message}`);
      } finally {
        btn.disabled = false; btn.textContent = 'Exportar a Excel';
      }
    };

    const renderTrialBalance = () => {
      let totalDebit = 0, totalCredit = 0;
      const rows = accounts.map(a => {
        const lines = allLines.filter(l => l.codigo_cuenta === a.codigo);
        if (lines.length === 0) return null;
        const debit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
        const credit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
        const balance = a.naturaleza === 'Acreedora' ? (credit - debit) : (debit - credit);
        totalDebit += debit;
        totalCredit += credit;
        return `
          <tr data-acc="${esc(a.id)}" class="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" title="Ver el mayor de esta cuenta">
            <td class="p-2 font-mono text-slate-700">${esc(a.codigo)}</td>
            <td class="p-2 text-slate-800">${esc(a.nombre)}</td>
            <td class="p-2 text-slate-500">${esc(a.tipo)}</td>
            <td class="p-2 text-right tabular-nums">$${fmtNum(debit)}</td>
            <td class="p-2 text-right tabular-nums">$${fmtNum(credit)}</td>
            <td class="p-2 text-right tabular-nums font-semibold">$${fmtNum(balance)}</td>
          </tr>`;
      }).filter(Boolean);
      document.getElementById('trial-tbody').innerHTML = rows.join('') || '<tr><td colspan="6" class="p-4 text-center text-slate-400">Sin asientos contabilizados todavía.</td></tr>';
      document.getElementById('trial-total-debit').textContent = `$${fmtNum(totalDebit)}`;
      document.getElementById('trial-total-credit').textContent = `$${fmtNum(totalCredit)}`;
    };

    const body = `
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Libro mayor</h1>
        <p class="text-xs text-slate-400">Elige la cuenta y el rango de fechas.</p>
      </div>
      <div class="${card} space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_10rem_10rem_auto] gap-3 items-end">
          <div>
            <label class="${label}">Cuenta contable</label>
            <select id="ledger-account" class="${input}">
              ${accounts.map(a => `<option value="${a.id}" ${a.id === state.accountId ? 'selected' : ''}>${esc(a.codigo)} — ${esc(a.nombre)}${used.has(a.codigo) ? '' : ' (sin movimientos)'}</option>`).join('')}
            </select>
          </div>
          <div><label class="${label}">Desde</label><input id="ledger-from" type="date" value="${state.from}" class="${input}"></div>
          <div><label class="${label}">Hasta</label><input id="ledger-to" type="date" value="${state.to}" class="${input}"></div>
          <button id="ledger-xlsx" class="${btnSecondary} whitespace-nowrap">Exportar a Excel</button>
        </div>
        <p id="ledger-nature" class="text-[11px] text-slate-400"></p>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
              <th class="p-2">Fecha</th><th class="p-2">Asiento</th><th class="p-2">Referencia</th><th class="p-2">Concepto</th>
              <th class="p-2 text-right">Debe</th><th class="p-2 text-right">Haber</th><th class="p-2 text-right">Saldo</th>
            </tr></thead>
            <tbody id="ledger-tbody"></tbody>
            <tfoot id="ledger-foot"></tfoot>
          </table>
        </div>
      </div>

      <div class="${card}">
        <h2 class="text-sm font-semibold text-slate-900">Balance de comprobación</h2>
        <p class="text-xs text-slate-400 mb-3">Todas las cuentas con movimientos. Toca una para ver su mayor.</p>
        <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
            <th class="p-2">Código</th><th class="p-2">Cuenta</th><th class="p-2">Tipo</th>
            <th class="p-2 text-right">Σ Debe</th><th class="p-2 text-right">Σ Haber</th><th class="p-2 text-right">Saldo</th>
          </tr></thead>
          <tbody id="trial-tbody"></tbody>
          <tfoot>
            <tr class="border-t border-slate-300 font-semibold">
              <td class="p-2" colspan="3">Totales</td>
              <td class="p-2 text-right tabular-nums" id="trial-total-debit"></td>
              <td class="p-2 text-right tabular-nums" id="trial-total-credit"></td>
              <td class="p-2"></td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>
    `;

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('ledger'), body);

    document.getElementById('ledger-account').addEventListener('change', (e) => { state.accountId = e.target.value; renderMovements(); }, { signal });
    document.getElementById('ledger-from').addEventListener('change', (e) => { state.from = e.target.value; renderMovements(); }, { signal });
    document.getElementById('ledger-to').addEventListener('change', (e) => { state.to = e.target.value; renderMovements(); }, { signal });
    document.getElementById('ledger-xlsx').addEventListener('click', exportExcel, { signal });
    document.getElementById('trial-tbody').addEventListener('click', (e) => {
      const tr = e.target.closest('[data-acc]');
      if (!tr) return;
      state.accountId = tr.dataset.acc;
      document.getElementById('ledger-account').value = state.accountId;
      renderMovements();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, { signal });

    renderMovements();
    renderTrialBalance();

    return () => destroy.abort();
  }
};

export default Ledger;
