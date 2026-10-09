// Tab-strip claro (mismo estilo del resto de CIFCalc) para las vistas del módulo de Contabilidad.
const AccountingTabs = {
  render(active) {
    const tabs = [
      { path: '#/contabilidad/resumen', key: 'dashboard', label: 'Resumen' },
      { path: '#/contabilidad/cuentas', key: 'accounts', label: 'Cuentas' },
      { path: '#/contabilidad/ingresos', key: 'income', label: 'Ingresos' },
      { path: '#/contabilidad/costos', key: 'costs', label: 'Costos' },
      { path: '#/contabilidad/ventas', key: 'sales', label: 'Ventas' },
      { path: '#/contabilidad/gastos', key: 'expenses', label: 'Gastos' },
      { path: '#/contabilidad/pagos', key: 'payments', label: 'Pagos' },
      { path: '#/contabilidad/inventario', key: 'inventory', label: 'Inventario' },
      { path: '#/contabilidad/diario', key: 'journal', label: 'Diario' },
      { path: '#/contabilidad/mayor', key: 'ledger', label: 'Mayor' }
    ];
    return `
      <div class="flex gap-2 flex-wrap">
        ${tabs.map(t => `
          <a href="${t.path}" class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
            t.key === active
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }">${t.label}</a>
        `).join('')}
      </div>
    `;
  }
};

export default AccountingTabs;
