import Store from '../store.js';
import { esc, num } from '../utils.js';
import { MOVEMENT_TYPES, subtypesForMovement } from '../accounting.js';
import AccountingTabs from '../components/accounting-tabs.js';

const AccountingConfig = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    const accounts = Store.getAll('accounts');
    let mapping = Store.getMovementSettings() || {};

    const activeAccounts = () => accounts
      .filter(a => a.is_active !== false)
      .sort((a, b) => String(a.code).localeCompare(String(b.code)));

    const accountOptions = (selected) => `<option value="">— Sin asignar —</option>` +
      activeAccounts().map(a => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.code)} — ${esc(a.name)}</option>`).join('');

    const renderMovementBlock = (movement) => {
      const subtypes = subtypesForMovement(movement.value);
      const vatBlock = movement.value !== 'costo' ? `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 mt-2">
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Tasa de IVA (%)</label>
            <input data-field="vat_rate_${movement.value}" type="number" min="0" step="0.1" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Cuenta de IVA ${movement.value === 'ingreso' ? 'por Pagar' : 'Acreditable'}</label>
            <select data-field="vat_account_id_${movement.value}" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"></select>
          </div>
        </div>
      ` : '';

      return `
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
          <div>
            <h2 class="font-bold text-slate-800">${movement.label}</h2>
            <p class="text-xs text-slate-500">Cuenta contable a la que se registra cada tipo de movimiento de ${movement.label.toLowerCase()}.</p>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            ${subtypes.map(s => `
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">${esc(s.label)}</label>
                <select data-field="${s.accountField}" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"></select>
              </div>
            `).join('')}
          </div>
          ${vatBlock}
        </div>
      `;
    };

    app.innerHTML = `
      <header class="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h1 class="text-2xl font-bold text-slate-900">Contabilidad</h1>
        <p class="text-sm text-slate-500">Partida doble en USD, integrada con el Maestro de Costo</p>
      </header>

      ${AccountingTabs.render('accounting-config')}

      <p class="text-sm text-slate-500">
        Define aquí, una sola vez, a qué cuenta del plan de cuentas va cada tipo de movimiento. Luego, en "Movimientos", solo eliges el tipo y el monto.
      </p>

      ${MOVEMENT_TYPES.map(renderMovementBlock).join('')}

      <div class="flex items-center gap-3">
        <button id="btn-save-movement-mapping" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-4 rounded-lg transition">Guardar Configuración</button>
        <span id="mapping-saved" class="hidden text-xs font-semibold text-emerald-600">✓ Guardado</span>
      </div>
    `;

    for (const movement of MOVEMENT_TYPES) {
      for (const s of subtypesForMovement(movement.value)) {
        const sel = document.querySelector(`[data-field="${s.accountField}"]`);
        sel.innerHTML = accountOptions(mapping[s.accountField]);
      }
      if (movement.value !== 'costo') {
        document.querySelector(`[data-field="vat_rate_${movement.value}"]`).value = mapping[`vat_rate_${movement.value}`] != null ? mapping[`vat_rate_${movement.value}`] : 16;
        const vatSel = document.querySelector(`[data-field="vat_account_id_${movement.value}"]`);
        vatSel.innerHTML = accountOptions(mapping[`vat_account_id_${movement.value}`]);
      }
    }

    document.getElementById('btn-save-movement-mapping').addEventListener('click', () => {
      const data = {};
      for (const movement of MOVEMENT_TYPES) {
        for (const s of subtypesForMovement(movement.value)) {
          data[s.accountField] = document.querySelector(`[data-field="${s.accountField}"]`).value || null;
        }
        if (movement.value !== 'costo') {
          data[`vat_rate_${movement.value}`] = num(document.querySelector(`[data-field="vat_rate_${movement.value}"]`));
          data[`vat_account_id_${movement.value}`] = document.querySelector(`[data-field="vat_account_id_${movement.value}"]`).value || null;
        }
      }
      mapping = Store.saveMovementSettings(data);
      document.getElementById('mapping-saved').classList.remove('hidden');
      setTimeout(() => {
        const el = document.getElementById('mapping-saved');
        if (el) el.classList.add('hidden');
      }, 1500);
    });

    return () => destroy.abort();
  }
};

export default AccountingConfig;
