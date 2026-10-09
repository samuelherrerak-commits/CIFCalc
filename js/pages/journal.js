import Store from '../store.js';
import { fmtNum, esc, num } from '../utils.js';
import { withRoundingPlug, totalsFor } from '../accounting.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { btnPrimary, btnSecondary, card, input, label } from '../components/accounting-shell.js';

const SOURCE_LABEL = { manual: 'Manual', container_close: 'Auto-Cierre', income: 'Ingreso', expense: 'Gasto', cost: 'Costo', sale: 'Venta', inventory_reception: 'Recepción' };
const MAX_ROWS = 200;

const Journal = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    let accounts = Store.getAll('accounts');
    let query = '';
    let accountFilter = '';
    let lines = [];

    const accountOptions = (selected) => {
      const sorted = [...accounts].filter(a => a.is_active !== false).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
      return `<option value="">— Cuenta —</option>` + sorted.map(a =>
        `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.codigo)} — ${esc(a.nombre)}</option>`
      ).join('');
    };

    const filteredRows = () => {
      const q = query.trim().toLowerCase();
      const accFilterObj = accounts.find(a => a.id === accountFilter);
      return Store.getAll('movements')
        .filter(m => {
          if (accFilterObj && m.codigo_cuenta !== accFilterObj.codigo) return false;
          if (!q) return true;
          return [m.concepto, m.ref_doc].some(v => String(v || '').toLowerCase().includes(q));
        })
        .sort((a, b) => new Date(b.entry_date || 0) - new Date(a.entry_date || 0));
    };

    const renderList = () => {
      const rows = filteredRows();
      const totals = totalsFor(rows);
      document.getElementById('journal-total-debit').textContent = `$${fmtNum(totals.debit)}`;
      document.getElementById('journal-total-credit').textContent = `$${fmtNum(totals.credit)}`;
      document.getElementById('journal-count').textContent = `${rows.length} asiento${rows.length === 1 ? '' : 's'}`;

      const shown = rows.slice(0, MAX_ROWS);
      const tbody = document.getElementById('journal-tbody');
      tbody.innerHTML = shown.length === 0
        ? `<tr><td colspan="6" class="py-4 text-center text-slate-500">Sin asientos.</td></tr>`
        : shown.map(m => `
          <tr class="border-t border-slate-700/30 hover:bg-slate-800/30">
            <td class="py-1.5">${esc(m.entry_date)}</td>
            <td class="py-1.5 text-slate-200">${esc(m.concepto)}</td>
            <td class="py-1.5" title="${esc(m.cuenta_contable)}"><span class="font-mono text-slate-300">${esc(m.codigo_cuenta)}</span></td>
            <td class="py-1.5 text-right font-mono text-blue-400">${m.debit > 0 ? '$' + fmtNum(m.debit) : ''}</td>
            <td class="py-1.5 text-right font-mono text-emerald-400">${m.credit > 0 ? '$' + fmtNum(m.credit) : ''}</td>
            <td class="py-1.5 text-slate-500">${esc(m.ref_doc)}</td>
          </tr>
        `).join('');

      document.getElementById('journal-footer-note').textContent =
        rows.length > MAX_ROWS ? `Mostrando ${MAX_ROWS} de ${rows.length} asientos.` : '';
    };

    const accountOptionsForFilter = () => {
      const sorted = [...accounts].sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
      return `<option value="">Todas las cuentas</option>` + sorted.map(a =>
        `<option value="${a.id}">${esc(a.codigo)} — ${esc(a.nombre)}</option>`
      ).join('');
    };

    // --- Asiento manual ---
    const renderLines = () => {
      const tbody = document.getElementById('lines-tbody');
      tbody.innerHTML = lines.map((l, i) => `
        <tr>
          <td class="p-1"><select data-line-acc="${i}" class="w-full p-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100">${accountOptions(l.account_id)}</select></td>
          <td class="p-1"><input data-line-debit="${i}" type="number" min="0" step="0.01" value="${l.debit || 0}" class="w-24 p-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-right text-slate-100"></td>
          <td class="p-1"><input data-line-credit="${i}" type="number" min="0" step="0.01" value="${l.credit || 0}" class="w-24 p-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-right text-slate-100"></td>
          <td class="p-1"><input data-line-concepto="${i}" type="text" value="${esc(l.concepto || '')}" class="w-full p-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100"></td>
          <td class="p-1 text-center"><button data-line-del="${i}" class="text-rose-400 hover:text-rose-300 font-bold px-1">✕</button></td>
        </tr>
      `).join('');

      tbody.querySelectorAll('[data-line-acc]').forEach(el => el.addEventListener('change', (e) => { lines[e.target.dataset.lineAcc].account_id = e.target.value; renderTotals(); }));
      tbody.querySelectorAll('[data-line-debit]').forEach(el => el.addEventListener('input', (e) => { lines[e.target.dataset.lineDebit].debit = num(e.target); if (num(e.target) > 0) lines[e.target.dataset.lineDebit].credit = 0; renderTotals(); }));
      tbody.querySelectorAll('[data-line-credit]').forEach(el => el.addEventListener('input', (e) => { lines[e.target.dataset.lineCredit].credit = num(e.target); if (num(e.target) > 0) lines[e.target.dataset.lineCredit].debit = 0; renderTotals(); }));
      tbody.querySelectorAll('[data-line-concepto]').forEach(el => el.addEventListener('input', (e) => { lines[e.target.dataset.lineConcepto].concepto = e.target.value; }));
      tbody.querySelectorAll('[data-line-del]').forEach(el => el.addEventListener('click', (e) => { lines.splice(Number(e.target.dataset.lineDel), 1); renderLines(); renderTotals(); }));
    };

    const renderTotals = () => {
      const t = totalsFor(lines);
      document.getElementById('entry-total-debit').textContent = `$${fmtNum(t.debit)}`;
      document.getElementById('entry-total-credit').textContent = `$${fmtNum(t.credit)}`;
      const diffEl = document.getElementById('entry-diff');
      diffEl.textContent = Math.abs(t.diff) < 0.01 ? '✓ Balanceado' : `Diferencia $${t.diff.toFixed(2)} (se ajusta sola con "Diferencias de Redondeo" si guardas)`;
      diffEl.className = Math.abs(t.diff) < 0.01 ? 'text-xs font-black text-emerald-400' : 'text-xs font-black text-amber-400';
    };

    const addLine = () => { lines.push({ account_id: '', debit: 0, credit: 0, concepto: '' }); renderLines(); renderTotals(); };

    const openForm = () => {
      lines = [{ account_id: '', debit: 0, credit: 0, concepto: '' }, { account_id: '', debit: 0, credit: 0, concepto: '' }];
      document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);
      document.getElementById('f-refdoc').value = `MAN-${Date.now().toString().slice(-6)}`;
      document.getElementById('journal-modal').classList.remove('hidden');
      renderLines();
      renderTotals();
    };

    const closeForm = () => document.getElementById('journal-modal').classList.add('hidden');

    const saveEntry = () => {
      const date = document.getElementById('f-date').value;
      const refDoc = document.getElementById('f-refdoc').value.trim();
      if (!date) { alert('La fecha es obligatoria.'); return; }

      const diffAccount = accounts.find(a => a.codigo === '6.9.01.01');
      const rawLines = lines
        .filter(l => l.account_id && (Number(l.debit) || Number(l.credit)))
        .map(l => {
          const acc = accounts.find(a => a.id === l.account_id);
          return { entry_date: date, codigo_cuenta: acc.codigo, cuenta_contable: acc.nombre, concepto: l.concepto, debit: l.debit, credit: l.credit, ref_doc: refDoc };
        });
      if (rawLines.length < 2) { alert('Se requieren al menos 2 líneas con cuenta y monto.'); return; }

      const finalLines = withRoundingPlug(rawLines, diffAccount, date, refDoc);
      Store.postJournalRows(finalLines, { source: 'manual' });
      closeForm();
      renderList();
    };

    const body = `
      <div class="${card}">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-3">
          <h2 class="text-sm font-black uppercase tracking-wide text-slate-300">Diario Contable <span class="text-slate-500" id="journal-count"></span></h2>
          <div class="flex items-center gap-2 flex-wrap">
            <input id="journal-search" type="text" placeholder="Buscar concepto o referencia…" class="${input}" style="width:220px">
            <select id="journal-account-filter" class="${input}" style="width:220px"></select>
            <button id="btn-new-entry" class="${btnPrimary}">+ Nuevo Asiento</button>
          </div>
        </div>
        <div class="flex gap-4 text-xs mb-2">
          <span>Debe: <span id="journal-total-debit" class="font-black text-blue-400"></span></span>
          <span>Haber: <span id="journal-total-credit" class="font-black text-emerald-400"></span></span>
        </div>
        <table class="w-full text-left text-xs">
          <thead><tr class="text-[9px] font-black text-slate-500 uppercase tracking-wider">
            <th class="py-1.5">Fecha</th><th class="py-1.5">Concepto</th><th class="py-1.5">Cuenta</th>
            <th class="py-1.5 text-right">Debe</th><th class="py-1.5 text-right">Haber</th><th class="py-1.5">Ref.</th>
          </tr></thead>
          <tbody id="journal-tbody"></tbody>
        </table>
        <p id="journal-footer-note" class="text-xs text-slate-500 mt-2"></p>
      </div>
    `;

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('journal'), body) + `
      <!-- Modal Asiento Manual -->
      <div id="journal-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto text-slate-100">
          <div class="flex justify-between items-center">
            <h3 class="text-sm font-black uppercase tracking-wide">Nuevo Asiento Manual</h3>
            <button id="journal-close" class="text-slate-500 hover:text-slate-300 text-xl font-bold leading-none">✕</button>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="${label}">Fecha *</label><input id="f-date" type="date" class="${input}"></div>
            <div><label class="${label}">Referencia</label><input id="f-refdoc" type="text" class="${input}"></div>
          </div>
          <table class="w-full text-left text-xs">
            <thead><tr class="text-[9px] font-black text-slate-500 uppercase tracking-wider">
              <th class="p-1">Cuenta</th><th class="p-1 text-right">Debe</th><th class="p-1 text-right">Haber</th><th class="p-1">Concepto</th><th class="p-1"></th>
            </tr></thead>
            <tbody id="lines-tbody"></tbody>
          </table>
          <button id="btn-add-line" class="${btnSecondary}">+ Agregar línea</button>
          <div class="flex justify-between items-center border-t border-slate-700/30 pt-3">
            <div class="text-xs">Debe: <span id="entry-total-debit" class="font-black"></span> &nbsp; Haber: <span id="entry-total-credit" class="font-black"></span></div>
            <span id="entry-diff" class="text-xs font-black"></span>
          </div>
          <div class="flex justify-end gap-2 pt-1">
            <button id="journal-cancel" class="${btnSecondary}">Cerrar</button>
            <button id="entry-save" class="${btnPrimary}">Registrar</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('journal-account-filter').innerHTML = accountOptionsForFilter();
    document.getElementById('journal-search').addEventListener('input', (e) => { query = e.target.value; renderList(); });
    document.getElementById('journal-account-filter').addEventListener('change', (e) => { accountFilter = e.target.value; renderList(); });
    document.getElementById('btn-new-entry').addEventListener('click', openForm);
    document.getElementById('btn-add-line').addEventListener('click', addLine);
    document.getElementById('entry-save').addEventListener('click', saveEntry);
    document.getElementById('journal-cancel').addEventListener('click', closeForm);
    document.getElementById('journal-close').addEventListener('click', closeForm);
    document.getElementById('journal-modal').addEventListener('click', (e) => { if (e.target.id === 'journal-modal') closeForm(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !document.getElementById('journal-modal').classList.contains('hidden')) closeForm();
    }, { signal });

    renderList();

    return () => destroy.abort();
  }
};

export default Journal;
