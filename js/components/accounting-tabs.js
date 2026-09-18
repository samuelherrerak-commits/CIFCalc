// Tab-strip local para las 3 vistas del módulo de Contabilidad, mismo estilo que Nav.
const AccountingTabs = {
  render(active) {
    const tabs = [
      { path: '#/contabilidad/cuentas', key: 'accounts', label: 'Cuentas' },
      { path: '#/contabilidad/ventas', key: 'sales', label: 'Ventas' },
      { path: '#/contabilidad/gastos', key: 'expenses', label: 'Gastos' },
      { path: '#/contabilidad/diario', key: 'journal', label: 'Diario' },
      { path: '#/contabilidad/mayor', key: 'ledger', label: 'Mayor' }
    ];
    return `
      <div class="flex gap-2 border-b border-slate-200 mb-4">
        ${tabs.map(t => `
          <a href="${t.path}" class="px-4 py-2 text-sm font-semibold rounded-t-lg transition ${
            t.key === active
              ? 'bg-white text-blue-700 border border-slate-200 border-b-white -mb-px'
              : 'text-slate-500 hover:text-slate-700'
          }">${t.label}</a>
        `).join('')}
      </div>
    `;
  }
};

export default AccountingTabs;
