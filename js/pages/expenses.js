import Store from '../store.js';
import { fmtNum, esc, num } from '../utils.js';
import { validateJournalBalance, buildExpenseLines } from '../accounting.js';
import AccountingTabs from '../components/accounting-tabs.js';

const MODULE_ID = 'expense_module';
const EXPENSE_TYPES = ['gasto_admin', 'gasto_logistica', 'gasto_ventas', 'gasto_otros'];

const Expenses = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    let accounts = Store.getAll('accounts');
    let categories = Store.getAll('expense_categories');
    let settings = Store.getModuleSettings(MODULE_ID) || { vat_rate: 16, vat_account_id: null };
    let editingCategoryId = null;

    const bankAccounts = () => accounts.filter(a => a.is_active !== false && a.is_bank_account);
    const expenseAccounts = () => accounts.filter(a => a.is_active !== false && EXPENSE_TYPES.includes(a.type));
    const activeCategories = () => categories.filter(c => c.is_active !== false);

    const expenseEntries = () => Store.getAll('journal_entries')
      .filter(e => e.source === 'expense_module')
      .sort((a, b) => new Date(b.entry_date || 0) - new Date(a.entry_date || 0));

    // --- Categorías de gasto ---
    const renderCategories = () => {
      const tbody = document.getElementById('categories-tbody');
      tbody.innerHTML = categories.length === 0
        ? `<tr><td colspan="3" class="p-3 text-center text-slate-400">Sin categorías. Agrega una, p. ej. "Renta de Oficina".</td></tr>`
        : categories.map(c => {
          const acc = accounts.find(a => a.id === c.account_id);
          return `
          <tr class="border-b border-slate-100 hover:bg-slate-50 ${c.is_active === false ? 'opacity-50' : ''}">
            <td class="p-2">${esc(c.name)}</td>
            <td class="p-2 text-xs text-slate-500">${acc ? esc(acc.code) + ' — ' + esc(acc.name) : '<span class="text-red-500">Sin cuenta</span>'}</td>
            <td class="p-2 whitespace-nowrap">
              <button data-edit="${c.id}" class="text-blue-600 hover:text-blue-800 font-bold px-1" title="Editar">✎</button>
              <button data-del="${c.id}" class="text-red-500 hover:text-red-700 font-bold px-1" title="Eliminar">🗑</button>
            </td>
          </tr>`;
        }).join('');
      tbody.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openCategoryForm(b.dataset.edit)));
      tbody.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => removeCategory(b.dataset.del)));
    };

    const openCategoryForm = (id = null) => {
      editingCategoryId = id;
      const c = id ? Store.getById('expense_categories', id) : { name: '', account_id: '', is_active: true };
      document.getElementById('cf-name').value = c.name || '';
      const sel = document.getElementById('cf-account');
      sel.innerHTML = `<option value="">— Cuenta de gasto —</option>` + expenseAccounts()
        .sort((a, b) => String(a.code).localeCompare(String(b.code)))
        .map(a => `<option value="${a.id}" ${a.id === c.account_id ? 'selected' : ''}>${esc(a.code)} — ${esc(a.name)}</option>`).join('');
      document.getElementById('category-modal-title').textContent = id ? 'Editar Categoría de Gasto' : 'Nueva Categoría de Gasto';
      document.getElementById('category-modal').classList.remove('hidden');
      document.getElementById('cf-name').focus();
    };

    const closeCategoryForm = () => document.getElementById('category-modal').classList.add('hidden');

    const saveCategory = () => {
      const name = document.getElementById('cf-name').value.trim();
      const account_id = document.getElementById('cf-account').value;
      if (!name) { alert('El nombre de la categoría es obligatorio.'); return; }
      if (!account_id) { alert('Selecciona la cuenta de gasto.'); return; }
      const data = { name, account_id, is_active: true };
      if (editingCategoryId) Store.update('expense_categories', { ...data, id: editingCategoryId });
      else Store.insert('expense_categories', data);
      categories = Store.getAll('expense_categories');
      closeCategoryForm();
      renderCategories();
      renderCaptureSelects();
    };

    const removeCategory = (id) => {
      if (!confirm('¿Eliminar esta categoría de gasto?')) return;
      Store.remove('expense_categories', id);
      categories = Store.getAll('expense_categories');
      renderCategories();
      renderCaptureSelects();
    };

    // --- Configuración del módulo ---
    const renderSettingsForm = () => {
      document.getElementById('cfg-vat-rate').value = settings.vat_rate != null ? settings.vat_rate : 16;
      const sel = document.getElementById('cfg-vat-account');
      sel.innerHTML = `<option value="">— Sin IVA Acreditable configurado —</option>` + accounts
        .filter(a => a.is_active !== false)
        .sort((a, b) => String(a.code).localeCompare(String(b.code)))
        .map(a => `<option value="${a.id}" ${a.id === settings.vat_account_id ? 'selected' : ''}>${esc(a.code)} — ${esc(a.name)}</option>`).join('');
    };

    const saveSettings = () => {
      settings = {
        vat_rate: num(document.getElementById('cfg-vat-rate')),
        vat_account_id: document.getElementById('cfg-vat-account').value || null
      };
      Store.saveModuleSettings(MODULE_ID, settings);
      document.getElementById('cfg-saved').classList.remove('hidden');
      setTimeout(() => document.getElementById('cfg-saved').classList.add('hidden'), 1500);
    };

    // --- Captura de gasto ---
    const renderCaptureSelects = () => {
      const catSel = document.getElementById('ef-category');
      catSel.innerHTML = `<option value="">— Categoría —</option>` + activeCategories()
        .map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
      const bankSel = document.getElementById('ef-bank');
      const banks = bankAccounts();
      bankSel.innerHTML = banks.length
        ? `<option value="">— Cuenta de banco/caja —</option>` + banks.map(a => `<option value="${a.id}">${esc(a.code)} — ${esc(a.name)}</option>`).join('')
        : `<option value="">— No hay cuentas de banco/caja marcadas —</option>`;
    };

    const recordExpense = () => {
      const categoryId = document.getElementById('ef-category').value;
      const bankId = document.getElementById('ef-bank').value;
      const total = num(document.getElementById('ef-total'));
      const includeVat = document.getElementById('ef-vat').checked;
      const date = document.getElementById('ef-date').value;
      const memo = document.getElementById('ef-desc').value.trim();

      if (!date) { alert('La fecha es obligatoria.'); return; }
      if (!categoryId) { alert('Selecciona una clasificación de gasto.'); return; }
      if (!bankId) { alert('Selecciona la cuenta de banco/caja de donde sale el dinero.'); return; }
      if (total <= 0) { alert('El monto debe ser mayor a 0.'); return; }
      if (!memo) { alert('La descripción es obligatoria.'); return; }
      if (includeVat && !settings.vat_account_id) { alert('Configura la cuenta de IVA Acreditable en "Configuración" antes de registrar gastos con IVA.'); return; }

      const category = Store.getById('expense_categories', categoryId);
      const lines = buildExpenseLines(
        { total, bank_account_id: bankId, include_vat: includeVat, memo },
        category,
        settings
      );
      const check = validateJournalBalance(lines);
      if (!check.balanced) { alert(check.reason || 'El asiento no está balanceado.'); return; }

      const { entry } = Store.saveJournalEntryWithLines({
        entry_date: date,
        description: `Gasto — ${category.name} — ${memo}`,
        source: 'expense_module',
        status: 'draft'
      }, lines);
      const result = Store.postJournalEntry(entry.id);
      if (!result.ok) { alert(result.error); return; }

      document.getElementById('ef-total').value = '';
      document.getElementById('ef-desc').value = '';
      renderExpensesList();
    };

    const renderExpensesList = () => {
      const tbody = document.getElementById('expenses-tbody');
      const list = expenseEntries();
      tbody.innerHTML = list.length === 0
        ? `<tr><td colspan="4" class="p-3 text-center text-slate-400">Sin gastos registrados todavía.</td></tr>`
        : list.map(e => {
          const total = Store.getJournalLinesByEntry(e.id).reduce((s, l) => s + (Number(l.credit) || 0), 0);
          return `
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="p-2">${esc(e.entry_date)}</td>
            <td class="p-2">${esc(e.description)}</td>
            <td class="p-2 text-right font-mono">$${fmtNum(total)}</td>
            <td class="p-2"><span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Contabilizado</span></td>
          </tr>`;
        }).join('');
    };

    app.innerHTML = `
      <header class="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h1 class="text-2xl font-bold text-slate-900">Contabilidad</h1>
        <p class="text-sm text-slate-500">Partida doble en USD, integrada con el Maestro de Costo</p>
      </header>

      ${AccountingTabs.render('expenses')}

      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <h2 class="font-bold text-slate-800">Registrar Gasto</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Fecha *</label>
            <input id="ef-date" type="date" value="${new Date().toISOString().slice(0, 10)}" class="w-full p-2 border rounded-lg text-sm bg-slate-50">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Clasificación *</label>
            <select id="ef-category" class="w-full p-2 border rounded-lg text-sm bg-slate-50"></select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Monto total *</label>
            <input id="ef-total" type="number" min="0" step="0.01" class="w-full p-2 border rounded-lg text-sm bg-slate-50">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Cuenta de banco/caja *</label>
            <select id="ef-bank" class="w-full p-2 border rounded-lg text-sm bg-slate-50"></select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Descripción *</label>
            <input id="ef-desc" type="text" class="w-full p-2 border rounded-lg text-sm bg-slate-50" placeholder="Ej. Renta de oficina — septiembre">
          </div>
        </div>
        <label class="flex items-center gap-2 text-sm text-slate-600">
          <input id="ef-vat" type="checkbox" checked class="accent-blue-600 w-4 h-4"> El monto incluye IVA
        </label>
        <button id="btn-record-expense" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-4 rounded-lg shadow-sm transition">Registrar Gasto</button>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
        <div class="px-4 py-3 border-b border-slate-200"><h2 class="font-bold text-slate-800">Gastos Registrados</h2></div>
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-100 border-b border-slate-200 text-slate-700">
              <th class="p-2">Fecha</th><th class="p-2">Descripción</th><th class="p-2 text-right">Monto</th><th class="p-2">Estado</th>
            </tr>
          </thead>
          <tbody id="expenses-tbody"></tbody>
        </table>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
        <div class="flex justify-between items-center px-4 py-3 border-b border-slate-200">
          <h2 class="font-bold text-slate-800">Categorías de Gasto</h2>
          <button id="btn-new-category" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-4 rounded-lg shadow-sm transition">+ Nueva Categoría</button>
        </div>
        <table class="w-full text-left border-collapse text-xs">
          <thead><tr class="bg-slate-100 border-b border-slate-200 text-slate-700"><th class="p-2">Nombre</th><th class="p-2">Cuenta de gasto</th><th class="p-2 text-center">Acciones</th></tr></thead>
          <tbody id="categories-tbody"></tbody>
        </table>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <h2 class="font-bold text-slate-800">Configuración del Módulo de Gastos</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Tasa de IVA (%)</label>
            <input id="cfg-vat-rate" type="number" min="0" step="0.1" class="w-full p-2 border rounded-lg text-sm bg-slate-50">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Cuenta de IVA Acreditable</label>
            <select id="cfg-vat-account" class="w-full p-2 border rounded-lg text-sm bg-slate-50"></select>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <button id="btn-save-settings" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-4 rounded-lg transition">Guardar Configuración</button>
          <span id="cfg-saved" class="hidden text-xs font-semibold text-emerald-600">✓ Guardado</span>
        </div>
      </div>

      <!-- Modal Categoría -->
      <div id="category-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
          <div class="flex justify-between items-center">
            <h3 id="category-modal-title" class="text-lg font-bold text-slate-800">Nueva Categoría de Gasto</h3>
            <button id="cf-close" class="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none">✕</button>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Nombre *</label>
            <input id="cf-name" type="text" class="w-full p-2 border rounded-lg text-sm bg-slate-50">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Cuenta de gasto *</label>
            <select id="cf-account" class="w-full p-2 border rounded-lg text-sm bg-slate-50"></select>
          </div>
          <div class="flex justify-end gap-2 pt-1">
            <button id="cf-cancel" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-2 px-4 rounded-lg transition">Cancelar</button>
            <button id="cf-save" class="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition">Guardar</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-new-category').addEventListener('click', () => openCategoryForm());
    document.getElementById('cf-save').addEventListener('click', saveCategory);
    document.getElementById('cf-cancel').addEventListener('click', closeCategoryForm);
    document.getElementById('cf-close').addEventListener('click', closeCategoryForm);
    document.getElementById('category-modal').addEventListener('click', (e) => { if (e.target.id === 'category-modal') closeCategoryForm(); });
    document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
    document.getElementById('btn-record-expense').addEventListener('click', recordExpense);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !document.getElementById('category-modal').classList.contains('hidden')) closeCategoryForm();
    }, { signal });

    renderCategories();
    renderSettingsForm();
    renderCaptureSelects();
    renderExpensesList();

    return () => destroy.abort();
  }
};

export default Expenses;
