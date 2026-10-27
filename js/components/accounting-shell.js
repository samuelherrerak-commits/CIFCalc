// Envoltorio de estilo para el módulo de Contabilidad — mismo tema claro y
// colorido que el resto de CIFCalc (Dashboard, Productos, Calculadora), no un
// tema oscuro aparte.

export const btnPrimary = 'bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 px-4 rounded-lg transition';
export const btnSecondary = 'bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium py-2 px-4 rounded-lg border border-slate-200 transition';
export const card = 'bg-white border border-slate-200/70 rounded-xl shadow-sm p-4';
export const input = 'w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none';
export const label = 'block text-xs font-medium text-slate-500 mb-1';

export function badge(colorName, text) {
  return `<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold text-${colorName}-700 bg-${colorName}-100">${text}</span>`;
}

const AccountingShell = {
  // tabs: HTML de AccountingTabs.render(active) — menú lateral + barra móvil.
  // Menú lateral a toda la altura, pegado a la izquierda; el contenido usa el
  // resto del ancho. En el teléfono, barra inferior (de ahí el pb-24).
  wrap(tabsHtml, bodyHtml) {
    return `
      <div class="flex items-start">
        ${tabsHtml}
        <div class="flex-1 min-w-0 p-3 sm:p-4 lg:p-5 pb-24 md:pb-5 space-y-4">
          ${bodyHtml}
        </div>
      </div>
    `;
  }
};

export default AccountingShell;
