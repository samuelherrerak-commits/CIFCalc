import Store from '../store.js';
import { esc } from '../utils.js';
import { ACCOUNT_TYPES, naturalezaForTipo, inferirTipo, TIPO_ESPECIFICO_OPTIONS, CHART_OF_ACCOUNTS, CLOSING_MAPPING_FIELDS } from '../accounting.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { btnPrimary, btnSecondary, card, input, label } from '../components/accounting-shell.js';

const Accounts = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    let accounts = Store.getAll('accounts');
    let activeType = '';

    const activeAccounts = () => accounts.filter(a => a.is_active !== false);
    const hasMovements = (id) => {
      const acc = accounts.find(a => a.id === id);
      return acc && Store.getAll('movements').some(m => m.codigo_cuenta === acc.codigo);
    };

    const renderFilterPills = () => {
      const wrap = document.getElementById('type-pills');
      const tipos = ['', ...ACCOUNT_TYPES.map(t => t.value)];
      wrap.innerHTML = tipos.map(t => `
        <button data-type="${t}" class="px-3 py-1.5 text-[10px] font-black uppercase tracking-wide rounded-full transition-all ${
          activeType === t ? 'bg-blue-600 text-white' : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'
        }">${t || 'Todos'}</button>
      `).join('');
      wrap.querySelectorAll('[data-type]').forEach(btn => btn.addEventListener('click', () => {
        activeType = btn.dataset.type;
        renderFilterPills();
        renderGroups();
      }));
    };

    const renderGroups = () => {
      const wrap = document.getElementById('accounts-groups');
      const list = [...accounts]
        .filter(a => !activeType || a.tipo === activeType)
        .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));

      if (list.length === 0) {
        wrap.innerHTML = `<div class="${card} text-center text-slate-500 text-sm">Sin cuentas. Crea una con "+ Nueva Cuenta" o carga el catálogo sugerido.</div>`;
        return;
      }

      const byTipo = new Map();
      for (const a of list) {
        if (!byTipo.has(a.tipo)) byTipo.set(a.tipo, []);
        byTipo.get(a.tipo).push(a);
      }

      wrap.innerHTML = [...byTipo.entries()].map(([tipo, accs]) => `
        <div class="${card}">
          <h3 class="text-sm font-black uppercase tracking-wide text-slate-300 mb-3">${esc(tipo)} <span class="text-slate-500">(${accs.length})</span></h3>
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="text-[9px] font-black text-slate-500 uppercase tracking-wider">
                <th class="py-1.5 pr-2">Código</th>
                <th class="py-1.5 pr-2">Nombre</th>
                <th class="py-1.5 pr-2">Tipo Específico</th>
                <th class="py-1.5 pr-2">Naturaleza</th>
                <th class="py-1.5 pr-2">Estado</th>
                <th class="py-1.5 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${accs.map(a => `
                <tr class="border-t border-slate-700/30 hover:bg-slate-800/30 ${a.is_active === false ? 'opacity-40' : ''}">
                  <td class="py-1.5 pr-2 font-mono text-slate-300">${esc(a.codigo)}</td>
                  <td class="py-1.5 pr-2 text-slate-200">${esc(a.nombre)}</td>
                  <td class="py-1.5 pr-2 text-slate-400">${esc(a.tipo_especifico || 'Otros')}</td>
                  <td class="py-1.5 pr-2 text-slate-400">${esc(a.naturaleza)}</td>
                  <td class="py-1.5 pr-2">${a.is_active === false ? '<span class="text-slate-500">Inactiva</span>' : '<span class="text-emerald-400">Activa</span>'}</td>
                  <td class="py-1.5 text-center whitespace-nowrap">
                    <button data-del="${a.id}" class="text-rose-400 hover:text-rose-300 font-bold px-1" title="Eliminar / Desactivar">🗑</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `).join('');

      wrap.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => removeAccount(btn.dataset.del)));
    };

    const openForm = () => {
      document.getElementById('f-codigo').value = '';
      document.getElementById('f-nombre').value = '';
      document.getElementById('f-tipo').value = 'Activo';
      refreshTipoEspecifico('Activo');
      document.getElementById('account-modal').classList.remove('hidden');
      document.getElementById('f-codigo').focus();
    };

    const closeForm = () => document.getElementById('account-modal').classList.add('hidden');

    const refreshTipoEspecifico = (tipo) => {
      const sel = document.getElementById('f-tipo-especifico');
      const opts = TIPO_ESPECIFICO_OPTIONS[tipo] || ['Otros'];
      sel.innerHTML = opts.map(o => `<option value="${o}">${o}</option>`).join('');
    };

    const saveAccount = () => {
      const codigo = document.getElementById('f-codigo').value.trim();
      const nombre = document.getElementById('f-nombre').value.trim();
      const tipo = document.getElementById('f-tipo').value;
      const tipoEspecifico = document.getElementById('f-tipo-especifico').value;
      if (!codigo) { alert('El código es obligatorio.'); document.getElementById('f-codigo').focus(); return; }
      if (!Store.isAccountCodigoUnique(codigo)) { alert('Ya existe una cuenta con ese código.'); document.getElementById('f-codigo').focus(); return; }
      if (!nombre) { alert('El nombre es obligatorio.'); document.getElementById('f-nombre').focus(); return; }
      Store.insert('accounts', {
        codigo, nombre, tipo, tipo_especifico: tipoEspecifico,
        naturaleza: naturalezaForTipo(tipo), is_active: true
      });
      accounts = Store.getAll('accounts');
      closeForm();
      renderGroups();
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
      renderGroups();
      renderMappingSelects();
    };

    const loadSeed = () => {
      const existingCodes = new Set(accounts.map(a => String(a.codigo)));
      const toCreate = CHART_OF_ACCOUNTS.filter(s => !existingCodes.has(s.codigo));
      if (toCreate.length === 0) {
        alert('El catálogo sugerido ya está cargado por completo.');
        return;
      }
      if (!confirm(`Se crearán ${toCreate.length} cuenta(s) sugerida(s). ¿Continuar?`)) return;
      for (const s of toCreate) {
        const tipo = inferirTipo(s.codigo);
        Store.insert('accounts', {
          codigo: s.codigo, nombre: s.nombre, tipo, tipo_especifico: s.tipo_especifico,
          naturaleza: naturalezaForTipo(tipo), is_active: true
        });
      }
      accounts = Store.getAll('accounts');
      renderGroups();
      renderMappingSelects();
    };

    // Mapeo contable de cierre automático de contenedores
    const renderMappingSelects = () => {
      const mapping = Store.getAccountMapping() || {};
      const options = activeAccounts()
        .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)))
        .map(a => `<option value="${a.id}">${esc(a.codigo)} — ${esc(a.nombre)}</option>`).join('');
      const wrap = document.getElementById('mapping-fields');
      wrap.innerHTML = CLOSING_MAPPING_FIELDS.map(f => `
        <div>
          <label class="${label}">${esc(f.label)}</label>
          <select data-map="${f.key}" class="${input}">
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

    const body = `
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <h2 class="text-sm font-black uppercase tracking-wide text-slate-300">Plan de Cuentas</h2>
        <div class="flex items-center gap-2">
          <button id="btn-seed" class="${btnSecondary}">Cargar catálogo sugerido</button>
          <button id="btn-new-account" class="${btnPrimary}">+ Nueva Cuenta</button>
        </div>
      </div>
      <div id="type-pills" class="flex gap-2 flex-wrap"></div>
      <div id="accounts-groups" class="space-y-4"></div>

      <div class="${card} space-y-3">
        <div>
          <h2 class="text-sm font-black uppercase tracking-wide text-slate-300">Mapeo Contable — Cierre de Contenedores</h2>
          <p class="text-xs text-slate-500">Define a qué cuenta va cada concepto del Maestro de Costo cuando completas un contenedor. Si falta algún campo, no se genera el asiento automático hasta que completes el mapeo.</p>
        </div>
        <div id="mapping-fields" class="grid grid-cols-1 sm:grid-cols-2 gap-3"></div>
        <div class="flex items-center gap-3">
          <button id="btn-save-mapping" class="${btnPrimary}">Guardar Mapeo</button>
          <span id="mapping-saved" class="hidden text-xs font-black text-emerald-400">✓ Guardado</span>
        </div>
      </div>
    `;

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('accounts'), body) + `
      <!-- Modal Cuenta -->
      <div id="account-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 text-slate-100">
          <div class="flex justify-between items-center">
            <h3 class="text-sm font-black uppercase tracking-wide">Nueva Cuenta</h3>
            <button id="acc-close" class="text-slate-500 hover:text-slate-300 text-xl font-bold leading-none">✕</button>
          </div>
          <div>
            <label class="${label}">Código *</label>
            <input id="f-codigo" type="text" placeholder="1.1.01.01" class="${input}">
          </div>
          <div>
            <label class="${label}">Nombre *</label>
            <input id="f-nombre" type="text" class="${input}">
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="${label}">Tipo</label>
              <select id="f-tipo" class="${input}">
                ${ACCOUNT_TYPES.map(t => `<option value="${t.value}">${t.value}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="${label}">Tipo Específico</label>
              <select id="f-tipo-especifico" class="${input}"></select>
            </div>
          </div>
          <div class="flex justify-end gap-2 pt-1">
            <button id="acc-cancel" class="${btnSecondary}">Cancelar</button>
            <button id="acc-save" class="${btnPrimary}">Guardar</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-new-account').addEventListener('click', openForm);
    document.getElementById('btn-seed').addEventListener('click', loadSeed);
    document.getElementById('acc-save').addEventListener('click', saveAccount);
    document.getElementById('acc-cancel').addEventListener('click', closeForm);
    document.getElementById('acc-close').addEventListener('click', closeForm);
    document.getElementById('account-modal').addEventListener('click', (e) => { if (e.target.id === 'account-modal') closeForm(); });
    document.getElementById('f-tipo').addEventListener('change', (e) => refreshTipoEspecifico(e.target.value));
    document.getElementById('btn-save-mapping').addEventListener('click', saveMapping);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !document.getElementById('account-modal').classList.contains('hidden')) closeForm();
    }, { signal });

    renderFilterPills();
    renderGroups();
    renderMappingSelects();

    return () => destroy.abort();
  }
};

export default Accounts;
