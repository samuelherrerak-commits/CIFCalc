import Store from '../store.js';
import { ensureTodayRates } from '../rates.js';
import { icon } from './icons.js';

// Navegación del módulo de Contabilidad, organizada por flujo de trabajo
// como los ERP modernos (Odoo, Fina): Ventas (todo lo del cliente, hasta lo
// que te deben), Compras (todo lo del proveedor, hasta lo que debes),
// Inventario, Contabilidad (libros), Impuestos e Informes. Así cuentas por
// cobrar (activo) y por pagar (pasivo) siguen en grupos distintos.
// Menú lateral azul oscuro para separarlo del área de trabajo; en el
// teléfono, barra inferior + panel "Más".
export const ACCOUNTING_SECTIONS = [
  { title: '', items: [
    { key: 'dashboard', path: '#/contabilidad/resumen', label: 'Resumen', icon: 'home' }
  ] },
  { title: 'Ventas', items: [
    { key: 'sales', path: '#/contabilidad/ventas', label: 'Punto de venta', short: 'Ventas', icon: 'cart' },
    { key: 'quotes', path: '#/contabilidad/presupuestos', label: 'Presupuestos', icon: 'file' },
    { key: 'contacts', path: '#/contabilidad/contactos', label: 'Clientes', icon: 'users' },
    { key: 'receivables', path: '#/contabilidad/por-cobrar', label: 'Cuentas por cobrar', icon: 'inbox' },
    { key: 'promotions', path: '#/contabilidad/promociones', label: 'Promociones', icon: 'gift' }
  ] },
  { title: 'Compras', items: [
    { key: 'expenses', path: '#/contabilidad/gastos', label: 'Gastos', icon: 'wallet' },
    { key: 'costs', path: '#/contabilidad/costos', label: 'Costos', icon: 'tag' },
    { key: 'payments', path: '#/contabilidad/pagos', label: 'Contenedores por pagar', icon: 'ship' },
    { key: 'payables', path: '#/contabilidad/por-pagar', label: 'Proveedores por pagar', icon: 'receipt' }
  ] },
  { title: 'Inventario', items: [
    { key: 'inventory', path: '#/contabilidad/inventario', label: 'Existencias', short: 'Inventario', icon: 'box' }
  ] },
  { title: 'Contabilidad', items: [
    { key: 'income', path: '#/contabilidad/ingresos', label: 'Otros ingresos', icon: 'plus' },
    { key: 'journal', path: '#/contabilidad/diario', label: 'Libro diario', icon: 'journal' },
    { key: 'ledger', path: '#/contabilidad/mayor', label: 'Libro mayor', icon: 'table' },
    { key: 'accounts', path: '#/contabilidad/cuentas', label: 'Plan de cuentas', icon: 'list' }
  ] },
  { title: 'Impuestos', items: [
    { key: 'fiscal-books', path: '#/contabilidad/fiscal/ventas', label: 'Libros de IVA', icon: 'book' },
    { key: 'fiscal-decl', path: '#/contabilidad/fiscal/declaracion', label: 'Declaración IVA', icon: 'calculator' },
    { key: 'fiscal-rates', path: '#/contabilidad/fiscal/tasas', label: 'Tasas BCV', icon: 'exchange' }
  ] },
  { title: 'Informes', items: [
    { key: 'reports', path: '#/contabilidad/reportes', label: 'Reportes', icon: 'chart' },
    { key: 'financials', path: '#/contabilidad/estados', label: 'Estados financieros', icon: 'landmark' }
  ] }
];

const sectionTitle = (s, extra = '') => s.title
  ? `<p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400 ${extra}">${s.title}</p>`
  : '';

const ALL_ITEMS = ACCOUNTING_SECTIONS.flatMap(s => s.items);
const MOBILE_KEYS = ['dashboard', 'sales', 'inventory', 'expenses'];

// Tasas del día en el menú: dólar y euro BCV y USDT (Bs por unidad).
const fmtRate = (v) => Number(v) > 0 ? Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
function ratesCardInner(dark) {
  const r = Store.ratesFor(new Date().toISOString().slice(0, 10));
  const row = (k, v) => `<div class="flex justify-between"><span class="${dark ? 'text-slate-400' : 'text-slate-400'}">${k}</span><span class="font-mono ${dark ? 'text-white' : 'text-slate-700'}">${fmtRate(v)}</span></div>`;
  return `
    <div class="flex items-center justify-between mb-1.5">
      <a href="#/contabilidad/fiscal/tasas" class="text-[10px] font-semibold uppercase tracking-wider ${dark ? 'text-blue-200/60 hover:text-white' : 'text-slate-400 hover:text-slate-600'}">Tasas${r ? ' · ' + r.date.slice(8, 10) + '/' + r.date.slice(5, 7) : ''}</a>
      <button data-rates-refresh title="Actualizar tasas" class="${dark ? 'text-slate-500 hover:text-white' : 'text-slate-300 hover:text-slate-600'}">${icon('refresh', 'w-3.5 h-3.5')}</button>
    </div>
    <div class="space-y-0.5 text-[11px]">${row('USD BCV', r && r.usd_bcv)}${row('EUR BCV', r && r.eur_bcv)}${row('USDT', r && r.usdt)}</div>`;
}
function ratesCard(dark = false) {
  return `<div data-rates-card data-dark="${dark ? 1 : ''}" class="${dark ? 'rounded-lg bg-white/5 px-2.5 py-2' : 'px-2'}">${ratesCardInner(dark)}</div>`;
}
const repaintRates = () => document.querySelectorAll('[data-rates-card]').forEach(el => { el.innerHTML = ratesCardInner(!!el.dataset.dark); });
window.addEventListener('cif-rates-updated', repaintRates);

const AccountingTabs = {
  render(active) {
    // Menú lateral pegado a la izquierda, a toda la altura bajo el encabezado
    // (--top). De md a xl es un riel de solo íconos (con el nombre al pasar el
    // mouse) para dejarle el ancho al contenido; desde xl, completo.
    const link = (it) => `
      <a href="${it.path}" title="${it.label}" class="relative flex items-center justify-center xl:justify-start gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] transition ${
        it.key === active ? 'bg-blue-500/20 text-white font-medium' : 'text-slate-300/80 hover:bg-white/5 hover:text-white'
      }">
        ${it.key === active ? '<span class="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-blue-400"></span>' : ''}
        <span class="${it.key === active ? 'text-blue-300' : 'text-slate-400'}">${icon(it.icon)}</span>
        <span class="truncate hidden xl:inline">${it.label}</span>
      </a>`;
    const biz = Store.getBusinessProfile().name;

    const sidebar = `
      <aside class="hidden md:flex flex-col shrink-0 w-[3.75rem] xl:w-60 sticky top-[var(--top,3rem)] h-[calc(100vh-var(--top,3rem))] bg-[#0f1d3a] text-slate-300">
        <div class="hidden xl:flex items-center gap-2.5 px-4 pt-4 pb-3 shrink-0">
          <span class="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-300 flex items-center justify-center">${icon('book', 'w-4 h-4')}</span>
          <div class="min-w-0">
            <p class="text-sm font-semibold text-white leading-tight">Contabilidad</p>
            <p class="text-[11px] text-slate-400 truncate">${biz ? biz.replace(/[<>&"]/g, '') : 'Maestro de Costo'}</p>
          </div>
        </div>
        <nav class="flex-1 min-h-0 overflow-y-auto dark-scroll px-2 xl:px-3 pt-3 xl:pt-1 pb-2 space-y-4">
          ${ACCOUNTING_SECTIONS.map((s, i) => `
            <div>
              ${s.title ? `<p class="hidden xl:block px-2.5 mb-1 text-[10px] font-semibold uppercase tracking-wider text-blue-200/50">${s.title}</p>` : ''}
              ${i ? '<div class="xl:hidden border-t border-white/10 mx-1 mb-2"></div>' : ''}
              <div class="space-y-0.5">${s.items.map(link).join('')}</div>
            </div>`).join('')}
        </nav>
        <div class="shrink-0 border-t border-white/10 px-2 xl:px-3 py-3 space-y-2">
          <div class="hidden xl:block">${ratesCard(true)}</div>
          <a href="#/contabilidad/fiscal/tasas" title="Tasas del día" class="xl:hidden flex justify-center text-slate-400 hover:text-white">${icon('exchange')}</a>
          ${Store.isSandbox() ? '' : `
          <button data-sbx="enter" title="Modo prueba: trabaja con una copia sin tocar la base de datos" class="w-full flex items-center justify-center xl:justify-start gap-2 px-2.5 py-1.5 rounded-lg text-[12px] text-slate-400 hover:text-white hover:bg-white/5 transition">
            ${icon('flask', 'w-4 h-4')}<span class="hidden xl:inline">Modo prueba</span>
          </button>`}
        </div>
      </aside>`;

    const mobileBar = `
      <nav class="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 flex">
        ${MOBILE_KEYS.map(k => ALL_ITEMS.find(i => i.key === k)).map(it => `
          <a href="${it.path}" class="flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${it.key === active ? 'text-blue-600' : 'text-slate-400'}">
            ${icon(it.icon, 'w-5 h-5')}${it.short || it.label}
          </a>`).join('')}
        <button data-acc-more class="flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${MOBILE_KEYS.includes(active) ? 'text-slate-400' : 'text-blue-600'}">
          ${icon('menu', 'w-5 h-5')}Más
        </button>
      </nav>
      <div id="acc-more" class="hidden md:hidden fixed inset-0 z-50 bg-black/30" data-acc-more-close>
        <div class="absolute bottom-0 inset-x-0 bg-white rounded-t-2xl p-4 max-h-[80vh] overflow-y-auto space-y-4">
          <div class="flex justify-between items-center">
            <p class="font-semibold text-slate-900">Contabilidad</p>
            <button data-acc-more-close class="text-slate-400 text-xl leading-none">✕</button>
          </div>
          ${ACCOUNTING_SECTIONS.map(s => `
            <div>
              ${sectionTitle(s, 'mb-1.5')}
              <div class="grid grid-cols-3 gap-1.5">
                ${s.items.map(it => `
                  <a href="${it.path}" class="flex flex-col items-center gap-1 p-2.5 rounded-xl text-center text-[10px] font-medium ${it.key === active ? 'bg-slate-100 text-blue-600' : 'text-slate-600 border border-slate-100'}">
                    ${icon(it.icon, 'w-5 h-5')}${it.label}
                  </a>`).join('')}
              </div>
            </div>`).join('')}
          ${ratesCard()}
          ${Store.isSandbox() ? '' : `<button data-sbx="enter" class="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-slate-200 text-xs text-slate-500">${icon('flask', 'w-4 h-4')} Modo prueba</button>`}
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
  const rr = e.target.closest('[data-rates-refresh]');
  if (rr) {
    rr.classList.add('animate-spin');
    ensureTodayRates(Store, { force: true })
      .then(() => window.dispatchEvent(new CustomEvent('cif-rates-updated')))
      .catch(err => alert(`No se pudieron consultar las tasas: ${err.message}`))
      .finally(() => { repaintRates(); });
    return;
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
