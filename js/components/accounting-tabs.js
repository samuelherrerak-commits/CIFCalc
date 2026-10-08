// Tab-strip oscuro (estilo LegalYa) para las vistas del módulo de Contabilidad.
const AccountingTabs = {
  render(active) {
    const tabs = [
      { path: '#/contabilidad/resumen', key: 'dashboard', label: 'Resumen' },
      { path: '#/contabilidad/cuentas', key: 'accounts', label: 'Cuentas' },
      { path: '#/contabilidad/ingresos', key: 'income', label: 'Ingresos' },
      { path: '#/contabilidad/costos', key: 'costs', label: 'Costos' },
      { path: '#/contabilidad/gastos', key: 'expenses', label: 'Gastos' },
      { path: '#/contabilidad/inventario', key: 'inventory', label: 'Inventario' },
      { path: '#/contabilidad/diario', key: 'journal', label: 'Diario' },
      { path: '#/contabilidad/mayor', key: 'ledger', label: 'Mayor' }
    ];
    return `
      <div class="flex gap-2 flex-wrap mb-5">
        ${tabs.map(t => `
          <a href="${t.path}" class="px-4 py-2 text-xs font-black uppercase tracking-wide rounded-xl transition-all ${
            t.key === active
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800/50 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }">${t.label}</a>
        `).join('')}
      </div>
    `;
  }
};

export default AccountingTabs;
