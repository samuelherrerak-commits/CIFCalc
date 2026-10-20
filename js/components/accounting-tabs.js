import Store from '../store.js';

// Navegación del módulo de Contabilidad al estilo LegalYa: menú lateral por
// secciones con íconos (en escritorio) y barra inferior + panel "Más" (en el
// teléfono). Tema claro, igual que el resto de CIFCalc.
// Secciones según la naturaleza contable: lo que entra (Ingresos), lo que sale
// (Costos y Gastos), lo que te deben (Activo) y lo que debes (Pasivo) nunca se
// mezclan en un mismo grupo. Inventario y Contactos son de apoyo (el
// inventario es de referencia, no una cuenta contable).
export const ACCOUNTING_SECTIONS = [
  { title: 'Inicio', items: [
    { key: 'dashboard', path: '#/contabilidad/resumen', label: 'Resumen', icon: '🏠', color: 'blue' }
  ] },
  { title: 'Ingresos', tag: 'Lo que entra', tagColor: 'emerald', items: [
    { key: 'sales', path: '#/contabilidad/ventas', label: 'Ventas', icon: '🛒', color: 'emerald' },
    { key: 'quotes', path: '#/contabilidad/presupuestos', label: 'Presupuestos', icon: '📄', color: 'emerald' },
    { key: 'promotions', path: '#/contabilidad/promociones', label: 'Promociones', icon: '🎁', color: 'emerald' },
    { key: 'income', path: '#/contabilidad/ingresos', label: 'Otros Ingresos', icon: '➕', color: 'emerald' }
  ] },
  { title: 'Costos y Gastos', tag: 'Lo que sale', tagColor: 'rose', items: [
    { key: 'costs', path: '#/contabilidad/costos', label: 'Costos', icon: '🏷️', color: 'rose' },
    { key: 'expenses', path: '#/contabilidad/gastos', label: 'Gastos', icon: '💸', color: 'rose' }
  ] },
  { title: 'Activo', tag: 'Te deben', tagColor: 'sky', items: [
    { key: 'receivables', path: '#/contabilidad/por-cobrar', label: 'Cuentas por Cobrar', icon: '💵', color: 'sky' }
  ] },
  { title: 'Pasivo', tag: 'Debes', tagColor: 'orange', items: [
    { key: 'payments', path: '#/contabilidad/pagos', label: 'Contenedores por Pagar', icon: '🚢', color: 'orange' },
    { key: 'payables', path: '#/contabilidad/por-pagar', label: 'Proveedores por Pagar', icon: '🧾', color: 'orange' }
  ] },
  { title: 'Clientes', tag: 'CRM', tagColor: 'violet', items: [
    { key: 'contacts', path: '#/contabilidad/contactos', label: 'Clientes y Contactos', icon: '👥', color: 'violet' }
  ] },
  { title: 'Análisis', tag: 'Reportes', tagColor: 'blue', items: [
    { key: 'reports', path: '#/contabilidad/reportes', label: 'Reportes', icon: '📈', color: 'blue' }
  ] },
  { title: 'Apoyo', tag: 'Referencia', tagColor: 'slate', items: [
    { key: 'inventory', path: '#/contabilidad/inventario', label: 'Inventario', icon: '📦', color: 'slate' }
  ] },
  { title: 'Libros contables', items: [
    { key: 'accounts', path: '#/contabilidad/cuentas', label: 'Plan de Cuentas', icon: '📚', color: 'slate' },
    { key: 'journal', path: '#/contabilidad/diario', label: 'Libro Diario', icon: '📓', color: 'slate' },
    { key: 'ledger', path: '#/contabilidad/mayor', label: 'Libro Mayor', icon: '📊', color: 'slate' }
  ] }
];

const sectionTitle = (s, extra = '') => `
  <p class="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-slate-400 ${extra}">
    <span>${s.title}</span>
    ${s.tag ? `<span class="normal-case tracking-normal font-bold text-[9px] px-1.5 py-0.5 rounded-full text-${s.tagColor}-700 bg-${s.tagColor}-50">${s.tag}</span>` : ''}
  </p>`;

const ALL_ITEMS = ACCOUNTING_SECTIONS.flatMap(s => s.items);
const MOBILE_KEYS = ['dashboard', 'sales', 'inventory', 'expenses'];

function sandboxCard() {
  return Store.isSandbox()
    ? `<div class="rounded-xl border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-800 space-y-2">
         <p class="font-bold">🧪 Estás en modo prueba</p>
         <p>Nada se guarda en la base de datos.</p>
         <div class="flex gap-1.5">
           <button data-sbx="reset" class="flex-1 bg-white border border-amber-300 hover:bg-amber-100 font-semibold rounded-lg py-1.5">Reiniciar</button>
           <button data-sbx="exit" class="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg py-1.5">Salir</button>
         </div>
       </div>`
    : `<button data-sbx="enter" class="w-full flex items-center gap-2 rounded-xl border border-dashed border-slate-300 hover:border-amber-400 hover:bg-amber-50 px-2.5 py-1.5 text-left transition">
         <span>🧪</span>
         <span class="text-[11px] font-bold text-slate-600">Entrar al modo prueba</span>
       </button>`;
}

const AccountingTabs = {
  render(active) {
    const link = (it) => `
      <a href="${it.path}" class="group flex items-center gap-2.5 px-2 py-1.5 rounded-xl text-[13px] font-semibold transition ${
        it.key === active ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }">
        <span class="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0 ${
          it.key === active ? 'bg-white/20' : `bg-${it.color}-50 group-hover:bg-white`
        }">${it.icon}</span>
        <span class="truncate">${it.label}</span>
      </a>`;

    const sidebar = `
      <aside class="hidden md:flex md:flex-col w-60 shrink-0">
        <div class="sticky top-4 bg-white border border-slate-200 rounded-2xl shadow-sm p-3 flex flex-col gap-2.5 max-h-[calc(100vh-2rem)] overflow-y-auto">
          <div class="px-2 pt-1">
            <p class="text-lg font-black tracking-tight text-slate-900 leading-none">Contabilidad</p>
            <p class="text-[10px] font-bold uppercase tracking-widest text-blue-600 mt-1">Maestro de Costo</p>
          </div>
          ${sandboxCard()}
          <nav class="space-y-2.5">
            ${ACCOUNTING_SECTIONS.map(s => `
              <div>
                ${sectionTitle(s, 'px-2.5 mb-1')}
                <div class="space-y-0.5">${s.items.map(link).join('')}</div>
              </div>`).join('')}
          </nav>
        </div>
      </aside>`;

    const mobileBar = `
      <nav class="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 shadow-2xl flex">
        ${MOBILE_KEYS.map(k => ALL_ITEMS.find(i => i.key === k)).map(it => `
          <a href="${it.path}" class="flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold ${it.key === active ? 'text-blue-600' : 'text-slate-400'}">
            <span class="text-lg leading-none">${it.icon}</span>${it.label}
          </a>`).join('')}
        <button data-acc-more class="flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold ${MOBILE_KEYS.includes(active) ? 'text-slate-400' : 'text-blue-600'}">
          <span class="text-lg leading-none">☰</span>Más
        </button>
      </nav>
      <div id="acc-more" class="hidden md:hidden fixed inset-0 z-50 bg-black/40" data-acc-more-close>
        <div class="absolute bottom-0 inset-x-0 bg-white rounded-t-3xl p-4 max-h-[80vh] overflow-y-auto space-y-4">
          <div class="flex justify-between items-center">
            <p class="font-black text-slate-900">Contabilidad</p>
            <button data-acc-more-close class="text-slate-400 text-xl leading-none">✕</button>
          </div>
          ${ACCOUNTING_SECTIONS.map(s => `
            <div>
              ${sectionTitle(s, 'mb-1.5')}
              <div class="grid grid-cols-3 gap-2">
                ${s.items.map(it => `
                  <a href="${it.path}" class="flex flex-col items-center gap-1 p-2.5 rounded-2xl text-center text-[10px] font-bold ${it.key === active ? 'bg-blue-600 text-white' : `bg-${it.color}-50 text-slate-700`}">
                    <span class="text-xl leading-none">${it.icon}</span>${it.label}
                  </a>`).join('')}
              </div>
            </div>`).join('')}
          ${sandboxCard()}
        </div>
      </div>`;

    return sidebar + mobileBar;
  }
};

// Un solo juego de listeners para todo el módulo (el HTML se repinta en cada vista).
document.addEventListener('click', (e) => {
  const more = document.getElementById('acc-more');
  if (e.target.closest('[data-acc-more]')) { if (more) more.classList.remove('hidden'); return; }
  if (more && (e.target.closest('[data-acc-more-close]') === e.target || e.target.closest('button[data-acc-more-close]') || e.target.closest('#acc-more a'))) {
    more.classList.add('hidden');
  }
  const sbx = e.target.closest('[data-sbx]');
  if (!sbx) return;
  const action = sbx.dataset.sbx;
  if (action === 'enter') {
    if (confirm('🧪 Modo prueba\n\nLa app va a trabajar con una COPIA de tus datos guardada solo en este navegador. Puedes vender, completar contenedores, registrar pagos, etc. sin que nada llegue a la base de datos (Google Sheets).\n\nUna franja amarilla arriba te recordará que estás en modo prueba. ¿Entrar?')) {
      Store.enterSandbox();
    }
  } else if (action === 'reset') {
    if (confirm('¿Borrar todo lo que hiciste en el modo prueba y empezar de nuevo con una copia de tus datos reales?')) Store.resetSandbox();
  } else if (action === 'exit') {
    if (confirm('¿Salir del modo prueba? Volverás a tus datos reales. Lo que hiciste en la prueba no se aplica a la base de datos.')) Store.exitSandbox();
  }
});

export default AccountingTabs;
