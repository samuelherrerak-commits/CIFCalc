import Store from '../store.js';
import { esc } from '../utils.js';
import { ACCOUNT_TYPES, natureForType, labelForType, SEED_ACCOUNTS, CLOSING_MAPPING_FIELDS } from '../accounting.js';
import AccountingTabs from '../components/accounting-tabs.js';

const Accounts = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    let accounts = Store.getAll('accounts');
    let editingId = null;
    let query = '';

    const activeAccounts = () => accounts.filter(a => a.is_active !== false);

    const hasMovements = (id) => Store.getAll('journal_lines').some(l => l.account_id === id);

    const filtered = () => {
      const q = query.trim().toLowerCase();
      const list = [...accounts].sort((a, b) => String(a.code).localeCompare(String(b.code)));
      if (!q) return list;
      return list.filter(a => [a.code, a.name, labelForType(a.type)].some(v => String(v || '').toLowerCase().includes(q)));
    };

    const renderTable = () => {
      const tbody = document.getElementById('accounts-tbody');
      const list = filtered();
      tbody.innerHTML = list.length === 0
        ? `<tr><td colspan="6" class="p-4 text-center text-slate-400">Sin cuentas. Crea una con "+ Nueva Cuenta" o carga el catálogo sugerido.</td></tr>`
        : list.map(a => `
          <tr class="border-b border-slate-100 hover:bg-slate-50 ${a.is_active === false ? 'opacity-50' : ''}">
            <td class="p-2 font-mono font-bold text-slate-700">${esc(a.code)}</td>
            <td class="p-2">${esc(a.name)}</td>
            <td class="p-2"><span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">${esc(labelForType(a.type))}</span></td>
            <td class="p-2 capitalize">${a.nature}</td>
            <td class="p-2">${a.is_active === false ? '<span class="text-slate-400">Inactiva</span>' : '<span class="text-emerald-600">Activa</span>'}</td>
            <td class="p-2 whitespace-nowrap">
              <button data-edit="${a.id}" class="text-blue-600 hover:text-blue-800 font-bold px-1" title="Editar">✎</button>
              <button data-del="${a.id}" class="text-red-500 hover:text-red-700 font-bold px-1" title="Eliminar / Desactivar">🗑</button>
            </td>
          </tr>
        `).join('');

      tbody.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => openForm(btn.dataset.edit)));
      tbody.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => removeAccount(btn.dataset.del)));
    };

    const openForm = (id = null) => {
      editingId = id;
      const a = id ? Store.getById('accounts', id) : { code: '', name: '', type: 'activo_circulante', is_active: true };
      document.getElementById('f-code').value = a.code || '';
      document.getElementById('f-name').value = a.name || '';
      document.getElementById('f-type').value = a.type || 'activo_circulante';
      document.getElementById('f-active').checked = a.is_active !== false;
      document.getElementById('f-bank').checked = a.is_bank_account === true;
      document.getElementById('f-nature-preview').textContent = natureForType(a.type || 'activo_circulante');
      document.getElementById('account-modal-title').textContent = id ? 'Editar Cuenta' : 'Nueva Cuenta';
      document.getElementById('account-modal').classList.remove('hidden');
      document.getElementById('f-code').focus();
    };

    const closeForm = () => {
      document.getElementById('account-modal').classList.add('hidden');
      editingId = null;
    };

    const saveAccount = () => {
      const code = document.getElementById('f-code').value.trim();
      const name = document.getElementById('f-name').value.trim();
      const type = document.getElementById('f-type').value;
      if (!code) { alert('El código es obligatorio.'); document.getElementById('f-code').focus(); return; }
      if (!Store.isAccountCodeUnique(code, editingId)) { alert('Ya existe una cuenta con ese código.'); document.getElementById('f-code').focus(); return; }
      if (!name) { alert('El nombre es obligatorio.'); document.getElementById('f-name').focus(); return; }
      const data = {
        code, name, type, nature: natureForType(type),
        is_active: document.getElementById('f-active').checked,
        is_bank_account: document.getElementById('f-bank').checked
      };
      if (editingId) {
        Store.update('accounts', { ...data, id: editingId });
      } else {
        Store.insert('accounts', data);
      }
      accounts = Store.getAll('accounts');
      closeForm();
      renderTable();
      renderMappingSelects();
    };

    const removeAccount = (id) => {
      if (hasMovements(id)) {
        if (!confirm('Esta cuenta ya tiene movimientos contables. No se puede eliminar, pero puedes desactivarla para que no aparezca en nuevos asientos. ¿Desactivarla?')) return;
        Store.update('accounts', { id, is_active: false });
      } else {
        if (!confirm('¿Eliminar esta cuenta del catálogo?')) return;
        Store.remove('accounts', id);
      }
      accounts = Store.getAll('accounts');
      renderTable();
      renderMappingSelects();
    };

    const loadSeed = () => {
      const existingCodes = new Set(accounts.map(a => String(a.code)));
      const toCreate = SEED_ACCOUNTS.filter(s => !existingCodes.has(s.code));
      if (toCreate.length === 0) {
        alert('El catálogo sugerido ya está cargado por completo.');
        return;
      }
      if (!confirm(`Se crearán ${toCreate.length} cuenta(s) sugerida(s). ¿Continuar?`)) return;
      for (const s of toCreate) {
        Store.insert('accounts', { code: s.code, name: s.name, type: s.type, nature: natureForType(s.type), is_active: true, is_bank_account: s.code === '1001' });
      }
      accounts = Store.getAll('accounts');
      renderTable();
      renderMappingSelects();
    };

    // Mapeo contable de cierre automático de contenedores
    const renderMappingSelects = () => {
      const mapping = Store.getAccountMapping() || {};
      const options = activeAccounts()
        .sort((a, b) => String(a.code).localeCompare(String(b.code)))
        .map(a => `<option value="${a.id}">${esc(a.code)} — ${esc(a.name)}</option>`).join('');
      const wrap = document.getElementById('mapping-fields');
      wrap.innerHTML = CLOSING_MAPPING_FIELDS.map(f => `
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">${esc(f.label)}</label>
          <select data-map="${f.key}" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            <option value="">— Sin asignar —</option>
            ${options}
          </select>
        </div>
      `).join('');
      for (const f of CLOSING_MAPPING_FIELDS) {
        const sel = wrap.querySelector(`[data-map="${f.key}"]`);
        if (sel && mapping[f.key]) sel.value = mapping[f.key];
      }
    };

    const saveMapping = () => {
      const wrap = document.getElementById('mapping-fields');
      const data = {};
      for (const f of CLOSING_MAPPING_FIELDS) {
        data[f.key] = wrap.querySelector(`[data-map="${f.key}"]`).value || null;
      }
      Store.saveAccountMapping(data);
      document.getElementById('mapping-saved').classList.remove('hidden');
      setTimeout(() => document.getElementById('mapping-saved').classList.add('hidden'), 1500);
    };

    app.innerHTML = `
      <header class="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h1 class="text-2xl font-bold text-slate-900">Contabilidad</h1>
        <p class="text-sm text-slate-500">Partida doble en USD, integrada con el Maestro de Costo</p>
      </header>

      ${AccountingTabs.render('accounts')}

      <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 px-4 py-3 border-b border-slate-200">
          <h2 class="font-bold text-slate-800">Plan de Cuentas</h2>
          <div class="flex items-center gap-2">
            <input id="accounts-search" type="text" placeholder="Buscar por código, nombre, tipo…"
                   class="w-64 p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            <button id="btn-seed" class="bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold py-2 px-4 rounded-lg shadow-sm transition whitespace-nowrap">Cargar catálogo sugerido</button>
            <button id="btn-new-account" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-4 rounded-lg shadow-sm transition whitespace-nowrap">+ Nueva Cuenta</button>
          </div>
        </div>
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-100 border-b border-slate-200 text-slate-700">
              <th class="p-2">Código</th>
              <th class="p-2">Nombre</th>
              <th class="p-2">Clasificación</th>
              <th class="p-2">Naturaleza</th>
              <th class="p-2">Estado</th>
              <th class="p-2 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody id="accounts-tbody"></tbody>
        </table>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div>
          <h2 class="font-bold text-slate-800">Mapeo Contable — Cierre de Contenedores</h2>
          <p class="text-xs text-slate-500">Define a qué cuenta va cada concepto del Maestro de Costo cuando completas un contenedor. Si falta algún campo, no se genera el asiento automático hasta que completes el mapeo.</p>
        </div>
        <div id="mapping-fields" class="grid grid-cols-1 sm:grid-cols-2 gap-3"></div>
        <div class="flex items-center gap-3">
          <button id="btn-save-mapping" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-4 rounded-lg transition">Guardar Mapeo</button>
          <span id="mapping-saved" class="hidden text-xs font-semibold text-emerald-600">✓ Guardado</span>
        </div>
      </div>

      <!-- Modal Cuenta -->
      <div id="account-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
          <div class="flex justify-between items-center">
            <h3 id="account-modal-title" class="text-lg font-bold text-slate-800">Nueva Cuenta</h3>
            <button id="acc-close" class="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none">✕</button>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Código *</label>
              <input id="f-code" type="text" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Naturaleza</label>
              <div id="f-nature-preview" class="w-full p-2 text-sm text-slate-500 capitalize"></div>
            </div>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Nombre *</label>
            <input id="f-name" type="text" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Clasificación *</label>
            <select id="f-type" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
              ${ACCOUNT_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
            </select>
          </div>
          <label class="flex items-center gap-2 text-sm text-slate-600">
            <input id="f-active" type="checkbox" class="accent-blue-600 w-4 h-4"> Cuenta activa
          </label>
          <label class="flex items-center gap-2 text-sm text-slate-600">
            <input id="f-bank" type="checkbox" class="accent-blue-600 w-4 h-4"> Es cuenta de banco/caja (aparece como destino de pago en Ventas y Gastos)
          </label>
          <div class="flex justify-end gap-2 pt-1">
            <button id="acc-cancel" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-2 px-4 rounded-lg transition">Cancelar</button>
            <button id="acc-save" class="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition">Guardar</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('accounts-search').addEventListener('input', (e) => { query = e.target.value; renderTable(); });
    document.getElementById('btn-new-account').addEventListener('click', () => openForm());
    document.getElementById('btn-seed').addEventListener('click', loadSeed);
    document.getElementById('acc-save').addEventListener('click', saveAccount);
    document.getElementById('acc-cancel').addEventListener('click', closeForm);
    document.getElementById('acc-close').addEventListener('click', closeForm);
    document.getElementById('account-modal').addEventListener('click', (e) => { if (e.target.id === 'account-modal') closeForm(); });
    document.getElementById('f-type').addEventListener('change', (e) => {
      document.getElementById('f-nature-preview').textContent = natureForType(e.target.value);
    });
    document.getElementById('btn-save-mapping').addEventListener('click', saveMapping);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !document.getElementById('account-modal').classList.contains('hidden')) closeForm();
    }, { signal });

    renderTable();
    renderMappingSelects();

    return () => destroy.abort();
  }
};

export default Accounts;
