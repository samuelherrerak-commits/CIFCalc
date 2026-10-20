// Envoltorio de estilo para el módulo de Contabilidad — mismo tema claro y
// colorido que el resto de CIFCalc (Dashboard, Productos, Calculadora), no un
// tema oscuro aparte.

export const btnPrimary = 'bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-4 rounded-lg shadow-sm transition';
export const btnSecondary = 'bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold py-2 px-4 rounded-lg border border-slate-200 transition';
export const card = 'bg-white border border-slate-200 rounded-xl shadow-sm p-4';
export const input = 'w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none';
export const label = 'block text-xs font-semibold text-slate-600 mb-1';

export function badge(colorName, text) {
  return `<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold text-${colorName}-700 bg-${colorName}-100">${text}</span>`;
}

const AccountingShell = {
  // tabs: HTML de AccountingTabs.render(active) — menú lateral + barra móvil.
  wrap(tabsHtml, bodyHtml) {
    return `
      <div class="flex gap-5 items-start pb-20 md:pb-0">
        ${tabsHtml}
        <div class="flex-1 min-w-0 space-y-5">
          ${bodyHtml}
        </div>
      </div>
    `;
  }
};

export default AccountingShell;
