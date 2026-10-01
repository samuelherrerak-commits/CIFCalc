import Store from '../store.js';
import { fmtNum, esc, num } from '../utils.js';
import { validateJournalBalance } from '../accounting.js';
import AccountingTabs from '../components/accounting-tabs.js';

const SOURCE_LABEL = { manual: 'Manual', container_close: 'Auto-Cierre', movement: 'Movimiento' };

const Journal = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    let accounts = Store.getAll('accounts');
    let lines = [];

    // Agrupa las filas planas de "movements" por document_number — cada grupo es un asiento.
    const documents = () => {
      const all = Store.getAll('movements');
      const byDoc = new Map();
      for (const m of all) {
        if (!byDoc.has(m.document_number)) byDoc.set(m.document_number, []);
        byDoc.get(m.document_number).push(m);
      }
      return [...byDoc.entries()]
        .map(([documentNumber, ls]) => ({ documentNumber, lines: ls }))
        .sort((a, b) => new Date(b.lines[0].entry_date || 0) - new Date(a.lines[0].entry_date || 0));
    };

    const renderList = () => {
      const tbody = document.getElementById('journal-tbody');
      const docs = documents();
      tbody.innerHTML = docs.length === 0
        ? `<tr><td colspan="6" class="p-4 text-center text-slate-400">Sin asientos. Crea uno con "+ Nuevo Asiento".</td></tr>`
        : docs.map(({ documentNumber, lines: ls }) => {
          const total = ls.reduce((acc, l) => ({ debit: acc.debit + (Number(l.debit) || 0), credit: acc.credit + (Number(l.credit) || 0) }), { debit: 0, credit: 0 });
          const main = ls.find(l => l.description) || ls[0];
          const source = main.source || 'manual';
          return `
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="p-2">${esc(main.entry_date)}</td>
            <td class="p-2">#${documentNumber} — ${esc(main.description)}</td>
            <td class="p-2"><span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">${SOURCE_LABEL[source] || source}</span></td>
            <td class="p-2"><span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Contabilizado</span></td>
            <td class="p-2 text-right font-mono">$${fmtNum(total.debit)} / $${fmtNum(total.credit)}</td>
            <td class="p-2 whitespace-nowrap">
              <button data-view="${documentNumber}" class="text-blue-600 hover:text-blue-800 font-bold px-1" title="Ver">👁</button>
              <button data-del="${documentNumber}" class="text-red-500 hover:text-red-700 font-bold px-1" title="Eliminar">🗑</button>
            </td>
          </tr>
        `;
        }).join('');

      tbody.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => viewDocument(Number(btn.dataset.view))));
      tbody.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => removeDocument(Number(btn.dataset.del))));
    };

    const accountOptions = (selected) => {
      const sorted = [...accounts].filter(a => a.is_active !== false).sort((a, b) => String(a.code).localeCompare(String(b.code)));
      return `<option value="">— Cuenta —</option>` + sorted.map(a =>
        `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.code)} — ${esc(a.name)}</option>`
      ).join('');
    };

    const renderLines = (readOnly) => {
      const tbody = document.getElementById('lines-tbody');
      tbody.innerHTML = lines.map((l, i) => `
        <tr>
          <td class="p-1"><select data-line-acc="${i}" ${readOnly ? 'disabled' : ''} class="w-full p-1.5 border rounded text-xs bg-white">${accountOptions(l.account_id)}</select></td>
          <td class="p-1"><input data-line-debit="${i}" type="number" min="0" step="0.01" value="${l.debit || 0}" ${readOnly ? 'disabled' : ''} class="w-24 p-1.5 border rounded text-xs text-right"></td>
          <td class="p-1"><input data-line-credit="${i}" type="number" min="0" step="0.01" value="${l.credit || 0}" ${readOnly ? 'disabled' : ''} class="w-24 p-1.5 border rounded text-xs text-right"></td>
          <td class="p-1"><input data-line-memo="${i}" type="text" value="${esc(l.description || '')}" ${readOnly ? 'disabled' : ''} class="w-full p-1.5 border rounded text-xs"></td>
          <td class="p-1 text-center">${readOnly ? '' : `<button data-line-del="${i}" class="text-red-500 hover:text-red-700 font-bold px-1">✕</button>`}</td>
        </tr>
      `).join('');

      if (readOnly) return;
      tbody.querySelectorAll('[data-line-acc]').forEach(el => el.addEventListener('change', (e) => { lines[e.target.dataset.lineAcc].account_id = e.target.value; renderTotals(); }));
      tbody.querySelectorAll('[data-line-debit]').forEach(el => el.addEventListener('input', (e) => { lines[e.target.dataset.lineDebit].debit = num(e.target); if (num(e.target) > 0) lines[e.target.dataset.lineDebit].credit = 0; renderTotals(); }));
      tbody.querySelectorAll('[data-line-credit]').forEach(el => el.addEventListener('input', (e) => { lines[e.target.dataset.lineCredit].credit = num(e.target); if (num(e.target) > 0) lines[e.target.dataset.lineCredit].debit = 0; renderTotals(); }));
      tbody.querySelectorAll('[data-line-memo]').forEach(el => el.addEventListener('input', (e) => { lines[e.target.dataset.lineMemo].description = e.target.value; }));
      tbody.querySelectorAll('[data-line-del]').forEach(el => el.addEventListener('click', (e) => { lines.splice(Number(e.target.dataset.lineDel), 1); renderLines(false); renderTotals(); }));
    };

    const renderTotals = () => {
      const check = validateJournalBalance(lines);
      document.getElementById('total-debit').textContent = `$${fmtNum(check.totalDebit)}`;
      document.getElementById('total-credit').textContent = `$${fmtNum(check.totalCredit)}`;
      const diffEl = document.getElementById('total-diff');
      diffEl.textContent = check.balanced ? '✓ Balanceado' : (check.reason || '');
      diffEl.className = check.balanced ? 'text-xs font-semibold text-emerald-600' : 'text-xs font-semibold text-red-600';
      const saveBtn = document.getElementById('entry-save');
      if (saveBtn) saveBtn.disabled = !check.balanced;
    };

    const addLine = () => { lines.push({ account_id: '', debit: 0, credit: 0, description: '' }); renderLines(false); renderTotals(); };

    const openForm = () => {
      lines = [{ account_id: '', debit: 0, credit: 0, description: '' }, { account_id: '', debit: 0, credit: 0, description: '' }];
      document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);
      document.getElementById('f-desc').value = '';
      document.getElementById('f-date').disabled = false;
      document.getElementById('f-desc').disabled = false;
      document.getElementById('journal-modal-title').textContent = 'Nuevo Asiento';
      document.getElementById('btn-add-line').classList.remove('hidden');
      document.getElementById('entry-save').classList.remove('hidden');
      document.getElementById('journal-modal').classList.remove('hidden');
      renderLines(false);
      renderTotals();
    };

    const viewDocument = (documentNumber) => {
      const ls = Store.getMovementLinesByDocument(documentNumber);
      lines = ls.map(l => ({ ...l }));
      const main = ls.find(l => l.description) || ls[0];
      document.getElementById('f-date').value = main.entry_date || '';
      document.getElementById('f-desc').value = main.description || '';
      document.getElementById('f-date').disabled = true;
      document.getElementById('f-desc').disabled = true;
      document.getElementById('journal-modal-title').textContent = `Asiento #${documentNumber} (solo lectura)`;
      document.getElementById('btn-add-line').classList.add('hidden');
      document.getElementById('entry-save').classList.add('hidden');
      document.getElementById('journal-modal').classList.remove('hidden');
      renderLines(true);
      renderTotals();
    };

    const closeForm = () => {
      document.getElementById('journal-modal').classList.add('hidden');
    };

    const saveEntry = () => {
      const date = document.getElementById('f-date').value;
      const description = document.getElementById('f-desc').value.trim();
      if (!date) { alert('La fecha es obligatoria.'); return; }
      if (!description) { alert('La descripción es obligatoria.'); return; }

      const check = validateJournalBalance(lines);
      if (!check.balanced) { alert(check.reason || 'El asiento no está balanceado.'); return; }

      const finalLines = lines
        .filter(l => l.account_id && (Number(l.debit) || Number(l.credit)))
        .map(l => ({ entry_date: date, movement_subtype: null, account_id: l.account_id, debit: l.debit, credit: l.credit, description: l.description || description }));

      const result = Store.saveMovement(finalLines, { source: 'manual' });
      if (!result.ok) { alert(result.error); return; }
      closeForm();
      renderList();
    };

    const removeDocument = (documentNumber) => {
      if (!confirm('¿Eliminar este asiento?')) return;
      Store.removeMovement(documentNumber);
      renderList();
    };

    app.innerHTML = `
      <header class="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h1 class="text-2xl font-bold text-slate-900">Contabilidad</h1>
        <p class="text-sm text-slate-500">Partida doble en USD, integrada con el Maestro de Costo</p>
      </header>

      ${AccountingTabs.render('journal')}

      <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
        <div class="flex justify-between items-center px-4 py-3 border-b border-slate-200">
          <h2 class="font-bold text-slate-800">Diario General</h2>
          <button id="btn-new-entry" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-4 rounded-lg shadow-sm transition">+ Nuevo Asiento</button>
        </div>
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-100 border-b border-slate-200 text-slate-700">
              <th class="p-2">Fecha</th>
              <th class="p-2">Descripción</th>
              <th class="p-2">Origen</th>
              <th class="p-2">Estado</th>
              <th class="p-2 text-right">Debe / Haber</th>
              <th class="p-2 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody id="journal-tbody"></tbody>
        </table>
      </div>

      <!-- Modal Asiento -->
      <div id="journal-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
          <div class="flex justify-between items-center">
            <h3 id="journal-modal-title" class="text-lg font-bold text-slate-800">Nuevo Asiento</h3>
            <button id="journal-close" class="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none">✕</button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Fecha *</label>
              <input id="f-date" type="date" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Descripción *</label>
              <input id="f-desc" type="text" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            </div>
          </div>
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="bg-slate-100 text-slate-700">
                <th class="p-1">Cuenta</th>
                <th class="p-1 text-right">Debe</th>
                <th class="p-1 text-right">Haber</th>
                <th class="p-1">Concepto</th>
                <th class="p-1"></th>
              </tr>
            </thead>
            <tbody id="lines-tbody"></tbody>
          </table>
          <button id="btn-add-line" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-1.5 px-3 rounded-lg transition">+ Agregar línea</button>
          <div class="flex justify-between items-center border-t border-slate-200 pt-3">
            <div class="text-xs">Debe: <span id="total-debit" class="font-bold"></span> &nbsp; Haber: <span id="total-credit" class="font-bold"></span></div>
            <span id="total-diff" class="text-xs font-semibold"></span>
          </div>
          <div class="flex justify-end gap-2 pt-1">
            <button id="journal-cancel" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-2 px-4 rounded-lg transition">Cerrar</button>
            <button id="entry-save" class="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed">Registrar</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-new-entry').addEventListener('click', () => openForm());
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
