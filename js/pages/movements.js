import Store from '../store.js';
import { fmtNum, esc, num } from '../utils.js';
import { MOVEMENT_TYPES, subtypesForMovement, buildMovementLines, validateJournalBalance } from '../accounting.js';
import AccountingTabs from '../components/accounting-tabs.js';

const CARD_STYLE = {
  ingreso: { icon: '💰', color: 'bg-emerald-600 hover:bg-emerald-700' },
  costo: { icon: '📦', color: 'bg-amber-600 hover:bg-amber-700' },
  gasto: { icon: '💸', color: 'bg-rose-600 hover:bg-rose-700' }
};

const Movements = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    const accounts = Store.getAll('accounts');
    let mapping = Store.getMovementSettings() || {};
    let activeMovement = null;

    const activeAccounts = () => accounts.filter(a => a.is_active !== false).sort((a, b) => String(a.code).localeCompare(String(b.code)));
    const bankAccounts = () => activeAccounts().filter(a => a.is_bank_account);

    // Agrupa las líneas de "movements" (source: 'movement') por document_number para mostrar
    // un renglón por movimiento registrado desde esta pantalla.
    const recentMovements = () => {
      const bySource = Store.getAll('movements').filter(m => m.source === 'movement');
      const byDoc = new Map();
      for (const m of bySource) {
        if (!byDoc.has(m.document_number)) byDoc.set(m.document_number, []);
        byDoc.get(m.document_number).push(m);
      }
      return [...byDoc.values()]
        .sort((a, b) => new Date(b[0].entry_date || 0) - new Date(a[0].entry_date || 0))
        .slice(0, 30);
    };

    const renderList = () => {
      const tbody = document.getElementById('movements-tbody');
      const list = recentMovements();
      tbody.innerHTML = list.length === 0
        ? `<tr><td colspan="4" class="p-3 text-center text-slate-400">Sin movimientos registrados todavía.</td></tr>`
        : list.map(lines => {
          const main = lines.find(l => l.description) || lines[0];
          const total = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
          return `
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="p-2">${esc(main.entry_date)}</td>
            <td class="p-2">${esc(main.description)}</td>
            <td class="p-2 text-right font-mono">$${fmtNum(total)}</td>
            <td class="p-2"><span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Contabilizado</span></td>
          </tr>`;
        }).join('');
    };

    const subtypeOptions = (movement) => subtypesForMovement(movement)
      .map(s => `<option value="${s.key}">${esc(s.label)}</option>`).join('');

    const accountOptions = (list) => list.map(a => `<option value="${a.id}">${esc(a.code)} — ${esc(a.name)}</option>`).join('');

    const openModal = (movement) => {
      activeMovement = movement;
      const type = MOVEMENT_TYPES.find(m => m.value === movement);
      document.getElementById('mv-modal-title').textContent = `Registrar ${type.label}`;
      document.getElementById('mv-date').value = new Date().toISOString().slice(0, 10);
      document.getElementById('mv-total').value = '';
      document.getElementById('mv-desc').value = '';
      document.getElementById('mv-subtype').innerHTML = subtypeOptions(movement);

      const vatRow = document.getElementById('mv-vat-row');
      const bankRow = document.getElementById('mv-bank-row');
      const counterpartRow = document.getElementById('mv-counterpart-row');

      if (movement === 'costo') {
        bankRow.classList.add('hidden');
        vatRow.classList.add('hidden');
        counterpartRow.classList.remove('hidden');
        document.getElementById('mv-counterpart').innerHTML = `<option value="">— Cuenta contrapartida —</option>` + accountOptions(activeAccounts());
      } else {
        counterpartRow.classList.add('hidden');
        vatRow.classList.remove('hidden');
        bankRow.classList.remove('hidden');
        const banks = bankAccounts();
        document.getElementById('mv-bank').innerHTML = banks.length
          ? `<option value="">— Cuenta de banco/caja —</option>` + accountOptions(banks)
          : `<option value="">— No hay cuentas de banco/caja marcadas —</option>`;
        document.getElementById('mv-vat').checked = true;
      }

      document.getElementById('movement-modal').classList.remove('hidden');
    };

    const closeModal = () => {
      document.getElementById('movement-modal').classList.add('hidden');
      activeMovement = null;
    };

    const saveMovement = () => {
      const subtype = document.getElementById('mv-subtype').value;
      const date = document.getElementById('mv-date').value;
      const total = num(document.getElementById('mv-total'));
      const memoInput = document.getElementById('mv-desc').value.trim();

      if (!date) { alert('La fecha es obligatoria.'); return; }
      if (!subtype) { alert('Selecciona el tipo de movimiento.'); return; }
      if (total <= 0) { alert('El monto debe ser mayor a 0.'); return; }

      const data = { subtype, total, date, memo: memoInput };

      if (activeMovement === 'costo') {
        const counterpartId = document.getElementById('mv-counterpart').value;
        if (!counterpartId) { alert('Selecciona la cuenta contrapartida.'); return; }
        data.counterpart_account_id = counterpartId;
      } else {
        const bankId = document.getElementById('mv-bank').value;
        if (!bankId) { alert('Selecciona la cuenta de banco/caja.'); return; }
        data.bank_account_id = bankId;
        data.include_vat = document.getElementById('mv-vat').checked;
      }

      let lines;
      try {
        lines = buildMovementLines(activeMovement, data, mapping);
      } catch (e) {
        alert(e.message);
        return;
      }

      const check = validateJournalBalance(lines);
      if (!check.balanced) { alert(check.reason || 'El asiento no está balanceado.'); return; }

      const result = Store.saveMovement(lines, { source: 'movement' });
      if (!result.ok) { alert(result.error); return; }

      closeModal();
      renderList();
    };

    app.innerHTML = `
      <header class="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h1 class="text-2xl font-bold text-slate-900">Contabilidad</h1>
        <p class="text-sm text-slate-500">Partida doble en USD, integrada con el Maestro de Costo</p>
      </header>

      ${AccountingTabs.render('movements')}

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        ${MOVEMENT_TYPES.map(m => `
          <button data-card="${m.value}" class="${CARD_STYLE[m.value].color} text-white rounded-xl shadow-sm p-6 text-left transition">
            <div class="text-3xl mb-2">${CARD_STYLE[m.value].icon}</div>
            <div class="text-lg font-bold">${m.label}</div>
            <div class="text-xs opacity-90 mt-1">Registrar un movimiento de ${m.label.toLowerCase()}</div>
          </button>
        `).join('')}
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
        <div class="px-4 py-3 border-b border-slate-200"><h2 class="font-bold text-slate-800">Últimos Movimientos</h2></div>
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-100 border-b border-slate-200 text-slate-700">
              <th class="p-2">Fecha</th><th class="p-2">Descripción</th><th class="p-2 text-right">Monto</th><th class="p-2">Estado</th>
            </tr>
          </thead>
          <tbody id="movements-tbody"></tbody>
        </table>
      </div>

      <!-- Modal Registrar Movimiento -->
      <div id="movement-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5 space-y-4">
          <div class="flex justify-between items-center">
            <h3 id="mv-modal-title" class="text-lg font-bold text-slate-800">Registrar Movimiento</h3>
            <button id="mv-close" class="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none">✕</button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Fecha *</label>
              <input id="mv-date" type="date" class="w-full p-2 border rounded-lg text-sm bg-slate-50">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Tipo de movimiento *</label>
              <select id="mv-subtype" class="w-full p-2 border rounded-lg text-sm bg-slate-50"></select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Monto total *</label>
              <input id="mv-total" type="number" min="0" step="0.01" class="w-full p-2 border rounded-lg text-sm bg-slate-50">
            </div>
            <div id="mv-bank-row">
              <label class="block text-xs font-semibold text-slate-600 mb-1">Cuenta de banco/caja *</label>
              <select id="mv-bank" class="w-full p-2 border rounded-lg text-sm bg-slate-50"></select>
            </div>
            <div id="mv-counterpart-row" class="hidden sm:col-span-2">
              <label class="block text-xs font-semibold text-slate-600 mb-1">Cuenta contrapartida *</label>
              <select id="mv-counterpart" class="w-full p-2 border rounded-lg text-sm bg-slate-50"></select>
            </div>
            <div class="sm:col-span-2">
              <label class="block text-xs font-semibold text-slate-600 mb-1">Descripción</label>
              <input id="mv-desc" type="text" class="w-full p-2 border rounded-lg text-sm bg-slate-50">
            </div>
          </div>
          <label id="mv-vat-row" class="flex items-center gap-2 text-sm text-slate-600">
            <input id="mv-vat" type="checkbox" checked class="accent-blue-600 w-4 h-4"> El monto incluye IVA
          </label>
          <div class="flex justify-end gap-2 pt-1">
            <button id="mv-cancel" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-2 px-4 rounded-lg transition">Cancelar</button>
            <button id="mv-save" class="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition">Registrar</button>
          </div>
        </div>
      </div>
    `;

    document.querySelectorAll('[data-card]').forEach(btn => btn.addEventListener('click', () => openModal(btn.dataset.card)));
    document.getElementById('mv-save').addEventListener('click', saveMovement);
    document.getElementById('mv-cancel').addEventListener('click', closeModal);
    document.getElementById('mv-close').addEventListener('click', closeModal);
    document.getElementById('movement-modal').addEventListener('click', (e) => { if (e.target.id === 'movement-modal') closeModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !document.getElementById('movement-modal').classList.contains('hidden')) closeModal();
    }, { signal });

    renderList();

    return () => destroy.abort();
  }
};

export default Movements;
