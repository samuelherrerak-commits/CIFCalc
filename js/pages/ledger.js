import Store from '../store.js';
import { fmtNum, esc, ensureXlsx } from '../utils.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { card, input, label, btnSecondary } from '../components/accounting-shell.js';
import { accountBalances, analyzeAccount, isOverdrawn } from '../overdrawn.js';

// Libro mayor: se elige la cuenta y el rango de fechas; muestra el saldo
// anterior al rango, los movimientos con su saldo acumulado y los totales, y
// se puede exportar a Excel. Debajo, el balance de comprobación.
const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getFullYear()}-01-01`;
const dmy = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || ''); };
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Estado del filtro, se conserva al volver a la página en esta sesión.
const state = { accountId: null, from: yearStart(), to: today(), onlyOverdrawn: false, analyze: null };

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
          <td class="p-2 text-right tabular-nums ${L.opening < -0.005 ? 'text-red-600' : 'text-slate-700'}">${L.opening < -0.005 ? `($${fmtNum(-L.opening)})` : '$' + fmtNum(L.opening)}</td>
        </tr>` + (L.rows.length ? L.rows.map(r => `
        <tr class="border-b border-slate-100 hover:bg-slate-50">
          <td class="p-2 whitespace-nowrap">${esc(dmy(r.date))}</td>
          <td class="p-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">${esc(r.number)}</td>
          <td class="p-2 text-slate-500 whitespace-nowrap">${esc(r.ref)}</td>
          <td class="p-2 text-slate-700">${esc(r.concepto)}${r.entidad ? `<span class="text-slate-400"> · ${esc(r.entidad)}</span>` : ''}</td>
          <td class="p-2 text-right tabular-nums">${r.debit ? '$' + fmtNum(r.debit) : ''}</td>
          <td class="p-2 text-right tabular-nums">${r.credit ? '$' + fmtNum(r.credit) : ''}</td>
          <td class="p-2 text-right tabular-nums ${r.balance < -0.005 ? 'text-red-600 font-medium' : ''}">${r.balance < -0.005 ? `($${fmtNum(-r.balance)})` : '$' + fmtNum(r.balance)}</td>
        </tr>`).join('') : '<tr><td colspan="7" class="p-4 text-center text-slate-400">Sin movimientos en este rango de fechas.</td></tr>');
      foot.innerHTML = `
        <tr class="border-t border-slate-300 font-semibold">
          <td class="p-2" colspan="4">Totales del período · ${L.rows.length} movimiento${L.rows.length === 1 ? '' : 's'}</td>
          <td class="p-2 text-right tabular-nums">$${fmtNum(L.debit)}</td>
          <td class="p-2 text-right tabular-nums">$${fmtNum(L.credit)}</td>
          <td class="p-2 text-right tabular-nums ${L.closing < -0.005 ? 'text-red-600' : ''}">${L.closing < -0.005 ? `($${fmtNum(-L.closing)})` : '$' + fmtNum(L.closing)}</td>
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

    const money = (v) => (v < -0.005 ? `($${fmtNum(-v)})` : '$' + fmtNum(v));
    const renderTrialBalance = () => {
      const all = accountBalances(allLines, accounts, state.to);
      const over = all.filter(isOverdrawn);
      const wrong = all.filter(r => r.misclassified);
      const rows = state.onlyOverdrawn ? all.filter(r => isOverdrawn(r) || r.misclassified) : all;
      const totalDebit = all.reduce((s, r) => s + r.debit, 0), totalCredit = all.reduce((s, r) => s + r.credit, 0);
      document.getElementById('trial-alert').innerHTML = over.length || wrong.length ? `
        <div class="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <span class="flex-1">${over.length ? `<strong>${over.length}</strong> cuenta(s) con saldo contrario a su naturaleza (sobregiradas)` : ''}${over.length && wrong.length ? ' · ' : ''}${wrong.length ? `<strong>${wrong.length}</strong> cuenta(s) con un tipo que no corresponde a su código` : ''}.</span>
          <label class="flex items-center gap-1.5 text-xs"><input id="trial-only" type="checkbox" ${state.onlyOverdrawn ? 'checked' : ''}> Ver solo esas</label>
        </div>` : '<div class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">✓ Ninguna cuenta está sobregirada: todos los saldos están según su naturaleza.</div>';
      const only = document.getElementById('trial-only');
      if (only) only.addEventListener('change', () => { state.onlyOverdrawn = only.checked; renderTrialBalance(); });

      document.getElementById('trial-tbody').innerHTML = rows.length === 0 ? '<tr><td colspan="7" class="p-4 text-center text-slate-400">Sin asientos contabilizados todavía.</td></tr>' : rows.map(r => {
        const bad = isOverdrawn(r);
        return `
          <tr data-acc="${esc((accounts.find(a => a.codigo === r.code) || {}).id || '')}" data-code="${esc(r.code)}" class="border-b border-slate-100 cursor-pointer ${bad ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-slate-50'}" title="Ver el mayor de esta cuenta">
            <td class="p-2 font-mono text-slate-700">${esc(r.code)}</td>
            <td class="p-2 text-slate-800">${esc(r.name)}${bad ? ' <span class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-600 text-white">Sobregirada</span>' : ''}${r.misclassified ? ` <span class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500 text-white" title="Por su código debería ser ${esc(r.misclassified)}">Tipo: ${esc(r.tipo)} → ${esc(r.misclassified)}</span>` : ''}</td>
            <td class="p-2 text-slate-500">${esc(r.tipo)} <span class="text-slate-400">· ${esc(String(r.nature).toLowerCase())}</span></td>
            <td class="p-2 text-right tabular-nums">$${fmtNum(r.debit)}</td>
            <td class="p-2 text-right tabular-nums">$${fmtNum(r.credit)}</td>
            <td class="p-2 text-right tabular-nums font-semibold ${bad ? 'text-red-600' : ''}">${money(r.balance)}</td>
            <td class="p-2 text-right">${bad || r.misclassified ? `<button data-analyze="${esc(r.code)}" class="text-xs font-semibold text-red-700 hover:text-red-900">Analizar</button>` : ''}</td>
          </tr>`;
      }).join('');
      document.getElementById('trial-total-debit').textContent = `$${fmtNum(totalDebit)}`;
      document.getElementById('trial-total-credit').textContent = `$${fmtNum(totalCredit)}`;
      document.getElementById('trial-date').textContent = `Saldos al ${dmy(state.to)}, según la naturaleza de cada cuenta. Toca una cuenta para ver su mayor.`;
    };

    // Panel de análisis de una cuenta sobregirada o mal clasificada.
    const renderAnalysis = () => {
      const el = document.getElementById('od-analysis');
      if (!state.analyze) { el.innerHTML = ''; return; }
      const A = analyzeAccount(state.analyze, allLines.filter(l => String(l.entry_date || '').slice(0, 10) <= state.to), accounts);
      const r = A.row;
      const tr = A.trigger;
      el.innerHTML = `
        <div class="${card} border-red-200 space-y-4">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 class="text-sm font-semibold text-slate-900">Análisis · ${esc(r.code)} — ${esc(r.name)}</h2>
              <p class="text-xs text-slate-500">${esc(r.tipo)} de naturaleza ${esc(String(r.nature).toLowerCase())}: su saldo normal es ${r.nature === 'Acreedora' ? 'acreedor (Haber mayor que Debe)' : 'deudor (Debe mayor que Haber)'}.</p>
            </div>
            <button id="od-close" class="text-xs text-slate-500 hover:text-slate-800">Cerrar análisis</button>
          </div>
          ${r.misclassified ? `<div class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">Esta cuenta está marcada como <strong>${esc(r.tipo)}</strong> pero su código (${esc(r.code)}) corresponde a <strong>${esc(r.misclassified)}</strong>. Por eso aparece en el lugar equivocado de los estados financieros. Corrígela en <a class="underline" href="#/contabilidad/cuentas">Plan de cuentas</a>.</div>` : ''}
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="rounded-lg border border-slate-200 px-3 py-2"><div class="text-[11px] text-slate-500">Saldo al ${esc(dmy(state.to))}</div><div class="text-lg font-semibold tabular-nums ${A.balance < -0.005 ? 'text-red-600' : 'text-slate-900'}">${money(A.balance)}</div><div class="text-[11px] text-slate-400">${A.balance < -0.005 ? 'contrario a su naturaleza' : 'según su naturaleza'}</div></div>
            <div class="rounded-lg border border-slate-200 px-3 py-2"><div class="text-[11px] text-slate-500">Negativa desde</div><div class="text-lg font-semibold text-slate-900">${A.since ? esc(dmy(A.since)) : '—'}</div><div class="text-[11px] text-slate-400 truncate">${tr ? `${esc(tr.entry_number || '')} ${esc(tr.ref_doc || '')} · ${esc(String(tr.concepto || '').split('|')[0])}` : 'no está en negativo'}</div></div>
            <div class="rounded-lg border border-slate-200 px-3 py-2"><div class="text-[11px] text-slate-500">Punto más bajo</div><div class="text-lg font-semibold tabular-nums ${A.worst.balance < -0.005 ? 'text-red-600' : 'text-slate-900'}">${money(A.worst.balance)}</div><div class="text-[11px] text-slate-400">${A.worst.date ? esc(dmy(A.worst.date)) : '—'}</div></div>
          </div>
          ${tr ? `<div class="text-sm text-slate-700">El movimiento que la llevó a negativo: <strong>${esc(dmy(String(tr.entry_date).slice(0, 10)))}</strong> · asiento ${esc(tr.entry_number || '')} · ${esc(tr.ref_doc || '')} · ${esc(String(tr.concepto || '').split('|')[0])}${tr.entidad ? ' · ' + esc(tr.entidad) : ''} · ${Number(tr.debit) ? 'Debe $' + fmtNum(tr.debit) : 'Haber $' + fmtNum(tr.credit)}</div>` : ''}
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <h3 class="text-xs font-semibold text-slate-500 mb-1">Por cliente / proveedor (saldo según su naturaleza)</h3>
              ${A.byEntity.length ? `<table class="w-full text-xs"><tbody>${A.byEntity.slice(0, 12).map(e => `<tr class="border-t border-slate-100"><td class="py-1.5 text-slate-700">${esc(e.entidad)}</td><td class="py-1.5 text-right tabular-nums ${e.balance < -0.005 ? 'text-red-600 font-medium' : ''}">${money(e.balance)}</td></tr>`).join('')}</tbody></table>` : '<p class="text-xs text-slate-400">Sin desglose por entidad.</p>'}
            </div>
            <div>
              <h3 class="text-xs font-semibold text-slate-500 mb-1">Por tipo de operación</h3>
              <table class="w-full text-xs"><thead><tr class="text-[10px] uppercase text-slate-400"><th class="text-left py-1">Origen</th><th class="text-right py-1">Debe</th><th class="text-right py-1">Haber</th></tr></thead>
                <tbody>${A.bySource.map(x => `<tr class="border-t border-slate-100"><td class="py-1.5 text-slate-700">${esc(x.source)} <span class="text-slate-400">(${x.count})</span></td><td class="py-1.5 text-right tabular-nums">$${fmtNum(x.debit)}</td><td class="py-1.5 text-right tabular-nums">$${fmtNum(x.credit)}</td></tr>`).join('')}</tbody></table>
            </div>
          </div>
          <div>
            <h3 class="text-xs font-semibold text-slate-500 mb-1">Posibles causas a revisar</h3>
            <ul class="list-disc pl-5 space-y-1 text-sm text-slate-700">${A.hints.map(h => `<li>${esc(h)}</li>`).join('')}</ul>
          </div>
        </div>`;
      document.getElementById('od-close').addEventListener('click', () => { state.analyze = null; renderAnalysis(); });
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
        <div id="od-analysis"></div>
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
        <p id="trial-date" class="text-xs text-slate-400 mb-3"></p>
        <div id="trial-alert" class="mb-3"></div>
        <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
            <th class="p-2">Código</th><th class="p-2">Cuenta</th><th class="p-2">Tipo</th>
            <th class="p-2 text-right">Σ Debe</th><th class="p-2 text-right">Σ Haber</th><th class="p-2 text-right">Saldo</th><th class="p-2"></th>
          </tr></thead>
          <tbody id="trial-tbody"></tbody>
          <tfoot>
            <tr class="border-t border-slate-300 font-semibold">
              <td class="p-2" colspan="3">Totales</td>
              <td class="p-2 text-right tabular-nums" id="trial-total-debit"></td>
              <td class="p-2 text-right tabular-nums" id="trial-total-credit"></td>
              <td class="p-2"></td><td class="p-2"></td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>
    `;

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('ledger'), body);

    document.getElementById('ledger-account').addEventListener('change', (e) => { state.accountId = e.target.value; renderMovements(); }, { signal });
    document.getElementById('ledger-from').addEventListener('change', (e) => { state.from = e.target.value; renderMovements(); }, { signal });
    document.getElementById('ledger-to').addEventListener('change', (e) => { state.to = e.target.value; renderMovements(); renderTrialBalance(); renderAnalysis(); }, { signal });
    document.getElementById('ledger-xlsx').addEventListener('click', exportExcel, { signal });
    document.getElementById('trial-tbody').addEventListener('click', (e) => {
      const an = e.target.closest('[data-analyze]');
      const tr = e.target.closest('[data-acc]');
      if (!tr) return;
      if (an) state.analyze = an.dataset.analyze;
      if (tr.dataset.acc) state.accountId = tr.dataset.acc;
      renderAnalysis();
      document.getElementById('ledger-account').value = state.accountId;
      renderMovements();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, { signal });

    // Desde Estados financieros: #/contabilidad/mayor?analizar=<código>
    const q = new URLSearchParams((location.hash.split('?')[1] || ''));
    if (q.get('analizar')) {
      state.analyze = q.get('analizar');
      const acc = accounts.find(a => a.codigo === state.analyze);
      if (acc) { state.accountId = acc.id; document.getElementById('ledger-account').value = acc.id; }
    }
    renderMovements();
    renderTrialBalance();
    renderAnalysis();

    return () => destroy.abort();
  }
};

export default Ledger;
