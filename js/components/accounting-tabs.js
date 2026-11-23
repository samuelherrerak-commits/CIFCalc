import Store from '../store.js';
import { ensureTodayRates } from '../rates.js';
import { icon } from './icons.js';
import { POS_ENABLED, PROMOTIONS_ENABLED, CONTAINER_PAYMENTS_ENABLED } from '../features.js';
import Auth from '../auth.js';

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
  { title: 'Ingresos', items: [
    { key: 'sales', path: '#/contabilidad/ventas', label: 'Punto de venta', short: 'Ventas', icon: 'cart', off: !POS_ENABLED },
    { key: 'quotes', path: '#/contabilidad/presupuestos', label: 'Presupuestos', short: 'Presupuestos', icon: 'file' },
    { key: 'orders', path: '#/contabilidad/ordenes', label: 'Órdenes de venta', short: 'Órdenes', icon: 'clipboard' },
    { key: 'contacts', path: '#/contabilidad/contactos', label: 'Clientes', icon: 'users' },
    { key: 'receivables', path: '#/contabilidad/por-cobrar', label: 'Cuentas por cobrar', icon: 'inbox' },
    { key: 'income', path: '#/contabilidad/ingresos', label: 'Otros ingresos', icon: 'plus' },
    { key: 'promotions', path: '#/contabilidad/promociones', label: 'Promociones', icon: 'gift', off: !PROMOTIONS_ENABLED }
  ] },
  { title: 'Gastos', items: [
    { key: 'expenses', path: '#/contabilidad/gastos', label: 'Gastos', icon: 'wallet' },
    { key: 'payables', path: '#/contabilidad/por-pagar', label: 'Proveedores por pagar', icon: 'receipt' }
  ] },
  { title: 'Costos', items: [
    { key: 'costs', path: '#/contabilidad/costos', label: 'Costos de importación', short: 'Costos', icon: 'tag' },
    { key: 'cost-analysis', path: '#/contabilidad/analisis-costos', label: 'Análisis de costos', icon: 'chart' },
    { key: 'payments', path: '#/contabilidad/pagos', label: 'Contenedores por pagar', icon: 'ship', off: !CONTAINER_PAYMENTS_ENABLED }
  ] },
  { title: 'Inventario', items: [
    { key: 'catalog', path: '#/contabilidad/catalogo', label: 'Catálogo', icon: 'tag' },
    { key: 'inventory', path: '#/contabilidad/inventario', label: 'Existencias', short: 'Existencias', icon: 'box' }
  ] },
  { title: 'Impuestos', items: [
    { key: 'iva', path: '#/contabilidad/fiscal/ventas', label: 'IVA', icon: 'book' }
  ] },
  { title: 'Contabilidad', items: [
    { key: 'accounts', path: '#/contabilidad/cuentas', label: 'Plan de cuentas', icon: 'list' },
    { key: 'journal', path: '#/contabilidad/diario', label: 'Libro diario', icon: 'journal' },
    { key: 'ledger', path: '#/contabilidad/mayor', label: 'Libro mayor', icon: 'table' },
    { key: 'financials', path: '#/contabilidad/estados', label: 'Estados financieros', icon: 'landmark' },
    { key: 'reports', path: '#/contabilidad/reportes', label: 'Reportes', icon: 'chart' }
  ] },
  { title: 'Administración', items: [
    { key: 'users', path: '#/contabilidad/usuarios', label: 'Usuarios', icon: 'users' }
  ] }
];

// Solo lo que el usuario puede abrir (los módulos tildados en Usuarios).
const visibleSections = () => ACCOUNTING_SECTIONS
  .map(s => ({ ...s, items: s.items.filter(it => Auth.can(it.key)) }))
  .filter(s => s.items.length);

const sectionTitle = (s, extra = '') => s.title
  ? `<p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400 ${extra}">${s.title}</p>`
  : '';

// Los módulos apagados (features.js) no aparecen en el menú.
for (const s of ACCOUNTING_SECTIONS) s.items = s.items.filter(it => !it.off);
const ALL_ITEMS = ACCOUNTING_SECTIONS.flatMap(s => s.items);
const MOBILE_KEYS = ['dashboard', POS_ENABLED ? 'sales' : 'quotes', 'orders', 'expenses'];

// Tasas del día en el menú: dólar y euro BCV y USDT (Bs por unidad).
const fmtRate = (v) => Number(v) > 0 ? Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
function ratesCardInner(dark) {
  const r = Store.ratesFor(new Date().toISOString().slice(0, 10));
  const cell = (k, v) => `<div class="min-w-0"><div class="text-[9px] uppercase tracking-wide text-slate-400">${k}</div><div class="font-mono tabular-nums truncate ${dark ? 'text-slate-100' : 'text-slate-700'}">${fmtRate(v)}</div></div>`;
  return `
    <div class="flex items-center justify-between mb-1">
      <a href="#/contabilidad/fiscal/tasas" class="text-[10px] font-semibold uppercase tracking-wider ${dark ? 'text-blue-200/60 hover:text-white' : 'text-slate-400 hover:text-slate-600'}">Tasas${r ? ' · ' + r.date.slice(8, 10) + '/' + r.date.slice(5, 7) : ''}</a>
      <button data-rates-refresh title="Actualizar tasas" class="${dark ? 'text-slate-500 hover:text-white' : 'text-slate-300 hover:text-slate-600'}">${icon('refresh', 'w-3.5 h-3.5')}</button>
    </div>
    <div class="grid grid-cols-3 gap-1.5 text-[11px]">${cell('USD', r && r.usd_bcv)}${cell('EUR', r && r.eur_bcv)}${cell('USDT', r && r.usdt)}</div>`;
}
function ratesCard(dark = false) {
  return `<div data-rates-card data-dark="${dark ? 1 : ''}" class="${dark ? 'px-2.5' : 'px-2'}">${ratesCardInner(dark)}</div>`;
}
const repaintRates = () => document.querySelectorAll('[data-rates-card]').forEach(el => { el.innerHTML = ratesCardInner(!!el.dataset.dark); });
window.addEventListener('cif-rates-updated', repaintRates);

// Buscador del menú: encuentra módulos por nombre, sección o palabras parecidas (sin acentos).
// ALIASES solo son sinónimos para encontrar rápido el módulo; no agregan funciones.
const ALIASES = {
  dashboard: 'inicio panel resumen general',
  sales: 'venta ventas caja pos vender cobrar',
  quotes: 'presupuesto cotizacion cotizar oferta proforma',
  orders: 'orden ordenes pedido pedidos venta despacho',
  contacts: 'cliente clientes contacto crm proveedor directorio',
  receivables: 'cobrar cobranza deuda clientes me deben',
  income: 'ingreso ingresos otros ingresos',
  promotions: 'promocion promociones descuento oferta',
  expenses: 'gasto gastos egreso pago factura',
  payables: 'pagar proveedores deuda debo cuentas por pagar',
  costs: 'costo costos importacion contenedor cif',
  'cost-analysis': 'analisis costos margen',
  payments: 'pagos contenedores fabrica anticipo',
  catalog: 'catalogo precios lista de precios nivel distribuidor retail',
  inventory: 'inventario existencias stock almacen',
  iva: 'iva impuesto fiscal retencion libro de ventas compras tasas',
  accounts: 'cuentas plan de cuentas contable',
  journal: 'diario asiento asientos',
  ledger: 'mayor libro mayor',
  financials: 'estados financieros balance resultados',
  reports: 'reporte reportes informe informes',
  users: 'usuario usuarios permisos acceso'
};
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// Fuentes extra de búsqueda (vacío: el buscador del menú solo muestra módulos).
const extraSources = [];
export const registerSearchSource = (fn) => { extraSources.push(fn); };
function searchItems(q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const pool = [
    ...visibleSections().flatMap(s => s.items.map(it => ({ key: it.key, label: it.label, section: s.title || 'General', path: it.path, icon: it.icon, text: `${it.label} ${s.title} ${ALIASES[it.key] || ''}`, kind: 'modulo' }))),
    ...extraSources.flatMap(fn => { try { return fn() || []; } catch { return []; } })
  ];
  const scored = [];
  for (const it of pool) {
    const hay = norm(it.text || it.label), lab = norm(it.label);
    if (!words.every(w => hay.includes(w))) continue;
    // más arriba: coincide al inicio del nombre > en el nombre > en alias/sección
    const score = words.reduce((s, w) => s + (lab.startsWith(w) ? 3 : lab.includes(w) ? 2 : 1), 0) + (it.kind === 'modulo' ? 10 : 0);
    scored.push({ it, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 12).map(x => x.it);
}
const resultHtml = (list, q) => list.length
  ? list.map((it, i) => `<a href="${it.path}" data-nav-hit data-i="${i}" class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] text-slate-200 hover:bg-white/10 focus:bg-white/10 focus:outline-none">
      <span class="text-slate-400">${icon(it.icon || 'file')}</span>
      <span class="min-w-0"><span class="block truncate">${it.label}</span><span class="block text-[10px] text-slate-400 truncate">${it.section}</span></span></a>`).join('')
  : `<p class="px-2.5 py-2 text-[12px] text-slate-400">Nada con "${String(q).replace(/[<>&"]/g, '')}". Prueba con otra palabra.</p>`;

const searchBox = `
  <div data-nav-search-box class="hidden xl:block px-3 pb-2 shrink-0">
    <div class="relative">
      <svg class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input data-nav-search type="search" autocomplete="off" placeholder="Buscar… (Ctrl+K)" class="w-full pl-8 pr-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[12px] text-white placeholder-slate-500 focus:bg-white/10 focus:border-blue-400/60 focus:outline-none">
    </div>
  </div>`;

// Secciones del menú plegables: por defecto solo se abren Ventas y la sección
// donde estás; lo que el usuario abra o cierre se recuerda en este navegador.
const NAV_KEY = 'acc_nav_open';
const navState = () => { try { return JSON.parse(localStorage.getItem(NAV_KEY) || '{}') || {}; } catch { return {}; } };
const isOpen = (s, active) => {
  if (!s.title || s.items.some(it => it.key === active)) return true;
  const st = navState();
  return st[s.title] != null ? !!st[s.title] : s.title === 'Ingresos';
};

// Menú que se esconde solo (por defecto): en escritorio no ocupa ancho; al
// llevar el mouse al borde izquierdo aparece encima del contenido y, al elegir
// un módulo, se vuelve a esconder. Con el pin queda fijo como antes.
const PIN_KEY = 'acc_nav_pinned';
const isPinned = () => { try { return localStorage.getItem(PIN_KEY) === '1'; } catch { return false; } };
let closedUntilLeave = false;
// En modo flotante el menú siempre se ve completo (no el riel de íconos):
// se quitan los cortes por tamaño de pantalla (xl:).
const AUTO_CLASSES = [
  ['w-[3.75rem] xl:w-60', 'w-60'], ['hidden xl:flex', 'flex'], ['hidden xl:block', 'block'],
  ['hidden xl:inline', 'inline'], ['justify-center xl:justify-start', 'justify-start'],
  ['px-2 xl:px-3', 'px-3'], ['pt-3 xl:pt-1', 'pt-1'], ['space-y-4 xl:space-y-2', 'space-y-2'],
  ['xl:hidden', 'hidden']
];
const pinBtn = (pinned) => `
  <button data-nav-mode="${pinned ? 'auto' : 'fijo'}" title="${pinned ? 'Esconder el menú automáticamente' : 'Dejar el menú fijo'}" class="xl:hidden w-full flex items-center justify-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] text-slate-400 hover:text-white hover:bg-white/5 transition">
    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${pinned
      ? '<path d="M15 6l-6 6 6 6"/><path d="M20 4v16"/>'
      : '<path d="M12 17v5"/><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/>'}</svg>
    <span class="hidden xl:inline">${pinned ? 'Esconder menú' : 'Fijar menú'}</span>
  </button>`;

const modeSwitch = (pinned) => {
  const opt = (val, label, on) => `<button data-nav-mode="${val}" class="flex-1 py-1 rounded-md text-[11px] transition ${on ? 'bg-white/15 text-white font-medium' : 'text-slate-400 hover:text-white'}">${label}</button>`;
  return `
  <div class="hidden xl:block px-4 pb-3 shrink-0">
    <p class="text-[10px] text-slate-500 mb-1">Menú</p>
    <div class="flex gap-0.5 p-0.5 rounded-lg bg-white/5">${opt('fijo', 'Fijo', pinned)}${opt('auto', 'Entra y sale', !pinned)}</div>
  </div>`;
};

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

    const pinned = isPinned();
    let sidebar = `
      <aside data-nav-root class="hidden md:flex flex-col shrink-0 w-[3.75rem] xl:w-60 sticky top-[var(--top,3rem)] h-[calc(100vh-var(--top,3rem))] bg-[#0f1d3a] text-slate-300">
        <div class="hidden xl:flex items-center gap-2.5 px-4 pt-4 pb-3 shrink-0">
          <span class="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-300 flex items-center justify-center">${icon('book', 'w-4 h-4')}</span>
          <div class="min-w-0">
            <p class="text-sm font-semibold text-white leading-tight">Gestión financiera</p>
            <p class="text-[11px] text-slate-400 truncate">${biz ? biz.replace(/[<>&"]/g, '') : 'Maestro de Costo'}</p>
          </div>
        </div>
        ${modeSwitch(pinned)}
        ${searchBox}
        <div data-nav-results class="hidden flex-1 min-h-0 overflow-y-auto dark-scroll px-3 pb-2 space-y-0.5"></div>
        <nav data-nav-list class="flex-1 min-h-0 overflow-y-auto dark-scroll px-2 xl:px-3 pt-3 xl:pt-1 pb-2 space-y-4 xl:space-y-2">
          ${visibleSections().map((s, i) => { const open = isOpen(s, active); return `
            <div>
              ${s.title ? `<button data-nav-sec="${s.title}" class="hidden xl:flex w-full items-center justify-between px-2.5 py-1 mb-0.5 rounded text-[10px] font-semibold uppercase tracking-wider text-blue-200/50 hover:text-blue-100">
                <span>${s.title}</span><svg class="w-3 h-3 transition ${open ? 'rotate-90' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>
              </button>` : ''}
              ${i ? '<div class="xl:hidden border-t border-white/10 mx-1 mb-2"></div>' : ''}
              <div class="space-y-0.5 ${open ? '' : 'xl:hidden'}">${s.items.map(link).join('')}</div>
            </div>`; }).join('')}
        </nav>
        <div class="shrink-0 border-t border-white/10 px-2 xl:px-3 py-3 space-y-2">
          <div class="hidden xl:block">${ratesCard(true)}</div>
          <a href="#/contabilidad/fiscal/tasas" title="Tasas del día" class="xl:hidden flex justify-center text-slate-400 hover:text-white">${icon('exchange')}</a>
          <a href="#/contabilidad/ayuda" title="Manual de uso" class="flex items-center justify-center xl:justify-start gap-2 px-2.5 py-1.5 rounded-lg text-[12px] ${active === 'help' ? 'bg-blue-500/20 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'} transition">${icon('book', 'w-4 h-4')}<span class="hidden xl:inline">Manual de uso</span></a>
          ${pinBtn(pinned)}
          ${Store.isSandbox() ? '' : `
          <button data-sbx="enter" title="Modo prueba: trabaja con una copia sin tocar la base de datos" class="w-full flex items-center justify-center xl:justify-start gap-2 px-2.5 py-1.5 rounded-lg text-[12px] text-slate-400 hover:text-white hover:bg-white/5 transition">
            ${icon('flask', 'w-4 h-4')}<span class="hidden xl:inline">Modo prueba</span>
          </button>`}
        </div>
      </aside>`;

    if (!pinned) {
      for (const [a, b] of AUTO_CLASSES) sidebar = sidebar.split(a).join(b);
      sidebar = sidebar
        .replace('<aside data-nav-root class="hidden md:flex flex-col shrink-0 w-60 sticky top-[var(--top,3rem)] h-[calc(100vh-var(--top,3rem))]',
          '<aside data-nav-root class="absolute inset-y-0 left-0 flex flex-col w-60 shadow-2xl -translate-x-full group-hover/nav:translate-x-0 group-data-[closed]/nav:!-translate-x-full transition-transform duration-200')
      sidebar = `
      <div data-nav-auto ${closedUntilLeave ? 'data-closed' : ''} class="group/nav hidden md:block fixed left-0 top-[var(--top,3rem)] bottom-0 z-40 w-3">
        <div class="absolute inset-y-0 left-0 w-1 bg-[#0f1d3a]/70 group-hover/nav:opacity-0 transition-opacity"></div>
        ${sidebar}
      </div>`;
    }

    const mobileBar = `
      <nav class="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 flex">
        ${MOBILE_KEYS.filter(k => Auth.can(k)).map(k => ALL_ITEMS.find(i => i.key === k)).map(it => `
          <a href="${it.path}" class="flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${it.key === active ? 'text-blue-600' : 'text-slate-400'}">
            ${icon(it.icon, 'w-5 h-5')}${it.short || it.label}
          </a>`).join('')}
        <button data-acc-more class="flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${MOBILE_KEYS.includes(active) ? 'text-slate-400' : 'text-blue-600'}">
          ${icon('menu', 'w-5 h-5')}Más
        </button>
      </nav>
      <div id="acc-more" class="hidden md:hidden fixed inset-0 z-50 bg-black/30" data-acc-more-close>
        <div data-nav-root class="absolute bottom-0 inset-x-0 bg-white rounded-t-2xl p-4 max-h-[80vh] overflow-y-auto space-y-4">
          <div class="flex justify-between items-center">
            <p class="font-semibold text-slate-900">Gestión financiera</p>
            <button data-acc-more-close class="text-slate-400 text-xl leading-none">✕</button>
          </div>
          <input data-nav-search type="search" autocomplete="off" placeholder="Buscar un módulo…" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400">
          <div data-nav-results data-light="1" class="hidden space-y-1"></div>
          <div data-nav-list class="space-y-4">
          ${visibleSections().map(s => `
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
          <a href="#/contabilidad/ayuda" class="flex items-center justify-center gap-2 py-2 rounded-xl border border-slate-200 text-xs text-slate-600">${icon('book', 'w-4 h-4')} Manual de uso</a>
          ${Store.isSandbox() ? '' : `<button data-sbx="enter" class="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-slate-200 text-xs text-slate-500">${icon('flask', 'w-4 h-4')} Modo prueba</button>`}
          </div>
        </div>
      </div>`;

    return sidebar + mobileBar;
  }
};

document.addEventListener('mouseover', (e) => {
  if (!closedUntilLeave || e.target.closest('[data-nav-auto]')) return;
  closedUntilLeave = false;
  document.querySelectorAll('[data-nav-auto][data-closed]').forEach(el => el.removeAttribute('data-closed'));
});

// Buscador: filtra mientras escribes; Enter abre el primero; ↑/↓ recorren; Esc limpia.
document.addEventListener('input', (e) => {
  const inp = e.target.closest && e.target.closest('[data-nav-search]');
  if (!inp) return;
  const root = inp.closest('[data-nav-root]');
  const res = root.querySelector('[data-nav-results]'), list = root.querySelector('[data-nav-list]');
  const q = inp.value.trim();
  if (!q) { res.classList.add('hidden'); list.classList.remove('hidden'); return; }
  const hits = searchItems(q);
  let html = resultHtml(hits, q);
  if (res.dataset.light) html = html.replace(/text-slate-200 hover:bg-white\/10 focus:bg-white\/10/g, 'text-slate-700 border border-slate-100 hover:bg-slate-50 focus:bg-slate-50').replace(/text-slate-400/g, 'text-slate-500');
  res.innerHTML = html;
  list.classList.add('hidden'); res.classList.remove('hidden');
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    const inp = [...document.querySelectorAll('[data-nav-search]')].find(i => i.offsetParent !== null || i.closest('[data-nav-auto]'));
    if (inp) {
      e.preventDefault();
      const aside = inp.closest('aside');
      if (aside && inp.closest('[data-nav-auto]')) { aside.classList.add('!translate-x-0'); inp.addEventListener('blur', () => aside.classList.remove('!translate-x-0'), { once: true }); }
      inp.focus(); inp.select();
    }
    return;
  }
  const inp = e.target.closest && e.target.closest('[data-nav-search]');
  const hit = e.target.closest && e.target.closest('[data-nav-hit]');
  if (!inp && !hit) return;
  const root = (inp || hit).closest('[data-nav-root]');
  const hits = [...root.querySelectorAll('[data-nav-hit]')];
  if (e.key === 'Escape') { if (inp) { inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.blur(); } else root.querySelector('[data-nav-search]').focus(); }
  else if (e.key === 'Enter' && inp && hits[0]) { e.preventDefault(); hits[0].click(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); const i = hit ? hits.indexOf(hit) + 1 : 0; if (hits[i]) hits[i].focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); const i = hit ? hits.indexOf(hit) - 1 : -1; if (i >= 0) hits[i].focus(); else if (inp == null) root.querySelector('[data-nav-search]').focus(); }
});

// Un solo juego de listeners para todo el módulo (el HTML se repinta en cada vista).
document.addEventListener('click', (e) => {
  const more = document.getElementById('acc-more');
  if (e.target.closest('[data-acc-more]')) { if (more) more.classList.remove('hidden'); return; }
  if (more && (e.target.closest('[data-acc-more-close]') === e.target || e.target.closest('button[data-acc-more-close]') || e.target.closest('#acc-more a'))) {
    more.classList.add('hidden');
  }
  const mode = e.target.closest('[data-nav-mode]');
  if (mode) {
    const pin = mode.dataset.navMode === 'fijo';
    if (pin === isPinned()) return;
    try { localStorage.setItem(PIN_KEY, pin ? '1' : '0'); } catch { /* sin almacenamiento */ }
    closedUntilLeave = !isPinned();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  // Menú flotante: al elegir un módulo se esconde hasta que el mouse salga.
  const auto = e.target.closest('[data-nav-auto]');
  if (auto && e.target.closest('a')) { closedUntilLeave = true; auto.setAttribute('data-closed', ''); }
  const sec = e.target.closest('[data-nav-sec]');
  if (sec) {
    const list = sec.parentElement.querySelector('.space-y-0\\.5');
    const hideCls = sec.closest('[data-nav-auto]') ? 'hidden' : 'xl:hidden';
    const nowOpen = list.classList.toggle(hideCls) === false;
    sec.querySelector('svg').classList.toggle('rotate-90', nowOpen);
    const st = navState(); st[sec.dataset.navSec] = nowOpen;
    try { localStorage.setItem(NAV_KEY, JSON.stringify(st)); } catch { /* sin almacenamiento */ }
    return;
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
