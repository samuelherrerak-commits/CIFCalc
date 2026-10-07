// Envoltorio de tema oscuro para el módulo de Contabilidad (estilo LegalYa).
// El resto de CIFCalc (Dashboard, Productos, Calculadora) se queda con el tema
// claro de siempre — este wrapper solo aplica dentro de las páginas de
// Contabilidad, que lo usan para envolver su contenido.

export const btnPrimary = 'bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-wide py-2.5 px-5 rounded-xl transition-all';
export const btnSecondary = 'bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-black uppercase tracking-wide py-2.5 px-5 rounded-xl transition-all border border-slate-700';
export const card = 'bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5';
export const input = 'w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 outline-none';
export const label = 'block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5';

export function badge(colorName, text) {
  return `<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide text-${colorName}-400 bg-${colorName}-500/10 border border-${colorName}-500/20">${text}</span>`;
}

const AccountingShell = {
  // tabs: HTML ya renderizado de AccountingTabs.render(active)
  wrap(tabsHtml, bodyHtml) {
    return `
      <div class="bg-slate-950 text-slate-100 rounded-2xl p-5 md:p-6 -mx-4 md:mx-0 min-h-[70vh]">
        <header class="mb-5">
          <h1 class="text-xl font-black uppercase tracking-wide">Contabilidad</h1>
          <p class="text-xs text-slate-500">Partida doble en USD, integrada con el Maestro de Costo</p>
        </header>
        ${tabsHtml}
        <div class="space-y-5">
          ${bodyHtml}
        </div>
      </div>
    `;
  }
};

export default AccountingShell;
