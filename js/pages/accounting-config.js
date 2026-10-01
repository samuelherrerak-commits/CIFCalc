import Store from '../store.js';
import { esc, num } from '../utils.js';
import AccountingTabs from '../components/accounting-tabs.js';

const VAT_BLOCKS = [
  { movement: 'ingreso', label: 'IVA de Ingresos', accountLabel: 'Cuenta de IVA por Pagar' },
  { movement: 'gasto', label: 'IVA de Gastos', accountLabel: 'Cuenta de IVA Acreditable' }
];

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

    const renderVatBlock = (block) => `
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <h2 class="font-bold text-slate-800">${block.label}</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Tasa de IVA (%)</label>
            <input data-field="vat_rate_${block.movement}" type="number" min="0" step="0.1" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">${block.accountLabel}</label>
            <select data-field="vat_account_id_${block.movement}" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"></select>
          </div>
        </div>
      </div>
    `;

    app.innerHTML = `
      <header class="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h1 class="text-2xl font-bold text-slate-900">Contabilidad</h1>
        <p class="text-sm text-slate-500">Partida doble en USD, integrada con el Maestro de Costo</p>
      </header>

      ${AccountingTabs.render('accounting-config')}

      <p class="text-sm text-slate-500">
        Los tipos de movimiento (Ingresos de Ventas, Costo de Producto, Gastos de Logística, etc.) ya son las cuentas nominales — no hace falta mapearlas a una cuenta. Aquí solo se configura el IVA que aplica a Ingresos y a Gastos.
      </p>

      ${VAT_BLOCKS.map(renderVatBlock).join('')}

      <div class="flex items-center gap-3">
        <button id="btn-save-movement-mapping" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-4 rounded-lg transition">Guardar Configuración</button>
        <span id="mapping-saved" class="hidden text-xs font-semibold text-emerald-600">✓ Guardado</span>
      </div>
    `;

    for (const block of VAT_BLOCKS) {
      document.querySelector(`[data-field="vat_rate_${block.movement}"]`).value = mapping[`vat_rate_${block.movement}`] != null ? mapping[`vat_rate_${block.movement}`] : 16;
      const vatSel = document.querySelector(`[data-field="vat_account_id_${block.movement}"]`);
      vatSel.innerHTML = accountOptions(mapping[`vat_account_id_${block.movement}`]);
    }

    document.getElementById('btn-save-movement-mapping').addEventListener('click', () => {
      const data = {};
      for (const block of VAT_BLOCKS) {
        data[`vat_rate_${block.movement}`] = num(document.querySelector(`[data-field="vat_rate_${block.movement}"]`));
        data[`vat_account_id_${block.movement}`] = document.querySelector(`[data-field="vat_account_id_${block.movement}"]`).value || null;
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
