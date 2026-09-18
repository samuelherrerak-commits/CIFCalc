import Store from '../store.js';
import { fmtNum, esc, num } from '../utils.js';
import { validateJournalBalance } from '../accounting.js';
import AccountingTabs from '../components/accounting-tabs.js';

const SOURCE_LABEL = { manual: 'Manual', container_close: 'Auto-Cierre' };
const STATUS_LABEL = { draft: 'Borrador', posted: 'Contabilizado' };
const STATUS_STYLE = { draft: 'bg-amber-100 text-amber-700', posted: 'bg-emerald-100 text-emerald-700' };

const Journal = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    let entries = Store.getAll('journal_entries');
    let accounts = Store.getAll('accounts');
    let editingId = null;
    let lines = [];
    let readOnly = false;

    const accountLabel = (id) => {
      const a = accounts.find(x => x.id === id);
      return a ? `${a.code} — ${a.name}` : '';
    };

    const sortedEntries = () => [...entries].sort((a, b) => new Date(b.entry_date || 0) - new Date(a.entry_date || 0));

    const totalsFor = (entryId) => {
      const ls = Store.getJournalLinesByEntry(entryId);
      return ls.reduce((acc, l) => ({ debit: acc.debit + (Number(l.debit) || 0), credit: acc.credit + (Number(l.credit) || 0) }), { debit: 0, credit: 0 });
    };

    const renderList = () => {
      const tbody = document.getElementById('journal-tbody');
      const list = sortedEntries();
      tbody.innerHTML = list.length === 0
        ? `<tr><td colspan="6" class="p-4 text-center text-slate-400">Sin pólizas. Crea una con "+ Nueva Póliza".</td></tr>`
        : list.map(e => {
          const t = totalsFor(e.id);
          return `
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="p-2">${esc(e.entry_date)}</td>
            <td class="p-2">${esc(e.description)}</td>
            <td class="p-2"><span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">${SOURCE_LABEL[e.source] || e.source}</span></td>
            <td class="p-2"><span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[e.status]}">${STATUS_LABEL[e.status] || e.status}</span></td>
            <td class="p-2 text-right font-mono">$${fmtNum(t.debit)} / $${fmtNum(t.credit)}</td>
            <td class="p-2 whitespace-nowrap">
              <button data-open="${e.id}" class="text-blue-600 hover:text-blue-800 font-bold px-1" title="Ver / Editar">✎</button>
              <button data-del="${e.id}" class="text-red-500 hover:text-red-700 font-bold px-1" title="Eliminar">🗑</button>
            </td>
          </tr>
        `;
        }).join('');

      tbody.querySelectorAll('[data-open]').forEach(btn => btn.addEventListener('click', () => openForm(btn.dataset.open)));
      tbody.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => removeEntry(btn.dataset.del)));
    };

    const accountOptions = (selected) => {
      const sorted = [...accounts].filter(a => a.is_active !== false).sort((a, b) => String(a.code).localeCompare(String(b.code)));
      return `<option value="">— Cuenta —</option>` + sorted.map(a =>
        `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.code)} — ${esc(a.name)}</option>`
      ).join('');
    };

    const renderLines = () => {
      const tbody = document.getElementById('lines-tbody');
      tbody.innerHTML = lines.map((l, i) => `
        <tr>
          <td class="p-1"><select data-line-acc="${i}" ${readOnly ? 'disabled' : ''} class="w-full p-1.5 border rounded text-xs bg-white">${accountOptions(l.account_id)}</select></td>
          <td class="p-1"><input data-line-debit="${i}" type="number" min="0" step="0.01" value="${l.debit || 0}" ${readOnly ? 'disabled' : ''} class="w-24 p-1.5 border rounded text-xs text-right"></td>
          <td class="p-1"><input data-line-credit="${i}" type="number" min="0" step="0.01" value="${l.credit || 0}" ${readOnly ? 'disabled' : ''} class="w-24 p-1.5 border rounded text-xs text-right"></td>
          <td class="p-1"><input data-line-memo="${i}" type="text" value="${esc(l.memo || '')}" ${readOnly ? 'disabled' : ''} class="w-full p-1.5 border rounded text-xs"></td>
          <td class="p-1 text-center">${readOnly ? '' : `<button data-line-del="${i}" class="text-red-500 hover:text-red-700 font-bold px-1">✕</button>`}</td>
        </tr>
      `).join('');

      tbody.querySelectorAll('[data-line-acc]').forEach(el => el.addEventListener('change', (e) => { lines[e.target.dataset.lineAcc].account_id = e.target.value; renderTotals(); }));
      tbody.querySelectorAll('[data-line-debit]').forEach(el => el.addEventListener('input', (e) => { lines[e.target.dataset.lineDebit].debit = num(e.target); if (num(e.target) > 0) lines[e.target.dataset.lineDebit].credit = 0; renderTotals(); }));
      tbody.querySelectorAll('[data-line-credit]').forEach(el => el.addEventListener('input', (e) => { lines[e.target.dataset.lineCredit].credit = num(e.target); if (num(e.target) > 0) lines[e.target.dataset.lineCredit].debit = 0; renderTotals(); }));
      tbody.querySelectorAll('[data-line-memo]').forEach(el => el.addEventListener('input', (e) => { lines[e.target.dataset.lineMemo].memo = e.target.value; }));
      tbody.querySelectorAll('[data-line-del]').forEach(el => el.addEventListener('click', (e) => { lines.splice(Number(e.target.dataset.lineDel), 1); renderLines(); renderTotals(); }));
    };

    const renderTotals = () => {
      const check = validateJournalBalance(lines);
      document.getElementById('total-debit').textContent = `$${fmtNum(check.totalDebit)}`;
      document.getElementById('total-credit').textContent = `$${fmtNum(check.totalCredit)}`;
      const diffEl = document.getElementById('total-diff');
      diffEl.textContent = check.balanced ? '✓ Balanceado' : (check.reason || '');
      diffEl.className = check.balanced ? 'text-xs font-semibold text-emerald-600' : 'text-xs font-semibold text-red-600';
      const postBtn = document.getElementById('entry-post');
      if (postBtn) postBtn.disabled = readOnly || !check.balanced;
    };

    const addLine = () => { lines.push({ account_id: '', debit: 0, credit: 0, memo: '' }); renderLines(); renderTotals(); };

    const openForm = (id = null) => {
      editingId = id;
      const e = id ? Store.getById('journal_entries', id) : { entry_date: new Date().toISOString().slice(0, 10), description: '', status: 'draft' };
      lines = id ? Store.getJournalLinesByEntry(id).sort((a, b) => (a.line_order || 0) - (b.line_order || 0)) : [{ account_id: '', debit: 0, credit: 0, memo: '' }, { account_id: '', debit: 0, credit: 0, memo: '' }];
      readOnly = e.status === 'posted';

      document.getElementById('f-date').value = e.entry_date || '';
      document.getElementById('f-desc').value = e.description || '';
      document.getElementById('f-date').disabled = readOnly;
      document.getElementById('f-desc').disabled = readOnly;
      document.getElementById('journal-modal-title').textContent = id ? (readOnly ? 'Póliza Contabilizada (solo lectura)' : 'Editar Póliza') : 'Nueva Póliza';
      document.getElementById('btn-add-line').classList.toggle('hidden', readOnly);
      document.getElementById('entry-save').classList.toggle('hidden', readOnly);
      document.getElementById('entry-post').classList.toggle('hidden', readOnly);
      document.getElementById('journal-modal').classList.remove('hidden');
      renderLines();
      renderTotals();
    };

    const closeForm = () => {
      document.getElementById('journal-modal').classList.add('hidden');
      editingId = null;
    };

    const gatherEntry = () => ({
      id: editingId,
      entry_date: document.getElementById('f-date').value,
      description: document.getElementById('f-desc').value.trim(),
      source: editingId ? (Store.getById('journal_entries', editingId) || {}).source || 'manual' : 'manual',
      status: 'draft'
    });

    const saveDraft = () => {
      const entry = gatherEntry();
      if (!entry.entry_date) { alert('La fecha es obligatoria.'); return; }
      if (!entry.description) { alert('La descripción es obligatoria.'); return; }
      Store.saveJournalEntryWithLines(entry, lines);
      entries = Store.getAll('journal_entries');
      closeForm();
      renderList();
    };

    const postEntry = () => {
      const entry = gatherEntry();
      if (!entry.entry_date) { alert('La fecha es obligatoria.'); return; }
      if (!entry.description) { alert('La descripción es obligatoria.'); return; }
      const check = validateJournalBalance(lines);
      if (!check.balanced) { alert(check.reason || 'La póliza no está balanceada.'); return; }
      const { entry: saved } = Store.saveJournalEntryWithLines(entry, lines);
      const result = Store.postJournalEntry(saved.id);
      if (!result.ok) { alert(result.error); return; }
      entries = Store.getAll('journal_entries');
      closeForm();
      renderList();
    };

    const removeEntry = (id) => {
      if (!confirm('¿Eliminar esta póliza?')) return;
      const result = Store.removeJournalEntry(id);
      if (!result.ok) { alert(result.error); return; }
      entries = Store.getAll('journal_entries');
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
          <button id="btn-new-entry" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-4 rounded-lg shadow-sm transition">+ Nueva Póliza</button>
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

      <!-- Modal Póliza -->
      <div id="journal-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
          <div class="flex justify-between items-center">
            <h3 id="journal-modal-title" class="text-lg font-bold text-slate-800">Nueva Póliza</h3>
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
            <button id="entry-save" class="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 px-4 rounded-lg transition">Guardar Borrador</button>
            <button id="entry-post" class="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed">Contabilizar</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-new-entry').addEventListener('click', () => openForm());
    document.getElementById('btn-add-line').addEventListener('click', addLine);
    document.getElementById('entry-save').addEventListener('click', saveDraft);
    document.getElementById('entry-post').addEventListener('click', postEntry);
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
