import Nav from './components/nav.js';
import Store from './store.js';

import Dashboard from './pages/dashboard.js';
import Calculator from './pages/calculator.js';
import CostAnalysis from './pages/cost-analysis.js';
import Catalog from './pages/catalog.js';
import Products from './pages/products.js';
import Accounts from './pages/accounts.js';
import AccountingDashboard from './pages/accounting-dashboard.js';
import Income from './pages/income.js';
import Costs from './pages/costs.js';
import Sales from './pages/sales.js';
import Expenses from './pages/expenses.js';
import ContainerPayments from './pages/container-payments.js';
import Inventory from './pages/inventory.js';
import Journal from './pages/journal.js';
import Ledger from './pages/ledger.js';
import Contacts from './pages/contacts.js';
import Quotes from './pages/quotes.js';
import Receivables from './pages/receivables.js';
import Payables from './pages/payables.js';
import Promotions from './pages/promotions.js';
import Reports from './pages/reports.js';
import FinancialStatements from './pages/financial-statements.js';
import Fiscal from './pages/fiscal.js';
import Orders from './pages/orders.js';
import { POS_ENABLED, PROMOTIONS_ENABLED, CONTAINER_PAYMENTS_ENABLED } from './features.js';
import Users from './pages/users.js';
import Auth from './auth.js';
import { ACCOUNTING_SECTIONS } from './components/accounting-tabs.js';

// Permiso que necesita cada pantalla (los módulos que se tildan en Usuarios).
const PERM = {
  dashboard: 'containers', calculator: 'containers', products: 'products',
  accountingDashboard: 'dashboard', accounts: 'accounts', income: 'income', costs: 'costs', sales: 'sales',
  quotes: 'quotes', expenses: 'expenses', payments: 'payments', costAnalysis: 'cost-analysis',
  receivables: 'receivables', payables: 'payables', inventory: 'inventory', catalog: 'catalog',
  contacts: 'contacts', promotions: 'promotions', reports: 'reports', financials: 'financials',
  fiscal: 'iva', orders: 'orders', journal: 'journal', ledger: 'ledger', users: 'users'
};

// Primera pantalla a la que el usuario sí tiene acceso.
export function firstAllowedPath() {
  if (Auth.can('containers')) return '#/';
  if (Auth.can('products')) return '#/productos';
  for (const s of ACCOUNTING_SECTIONS) for (const it of s.items) if (Auth.can(it.key)) return it.path;
  return null;
}

const routes = [
  { pattern: /^#\/?$/, handler: 'dashboard', key: 'dashboard' },
  { pattern: /^#\/contenedor\/(.+)$/, handler: 'calculator', key: 'calculator' },
  { pattern: /^#\/productos\/?$/, handler: 'products', key: 'products' },
  { pattern: /^#\/contabilidad\/resumen\/?$/, handler: 'accountingDashboard', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/cuentas\/?$/, handler: 'accounts', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/ingresos\/?$/, handler: 'income', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/costos\/?$/, handler: 'costs', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/ventas\/?$/, handler: 'sales', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/ventas\/([^/]+)$/, handler: 'sales', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/presupuestos\/?$/, handler: 'quotes', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/presupuestos\/([^/]+)$/, handler: 'quotes', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/gastos\/?$/, handler: 'expenses', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/pagos\/?$/, handler: 'payments', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/analisis-costos\/?$/, handler: 'costAnalysis', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/por-cobrar\/?$/, handler: 'receivables', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/por-pagar\/?$/, handler: 'payables', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/inventario\/?$/, handler: 'inventory', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/catalogo\/?$/, handler: 'catalog', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/contactos\/?$/, handler: 'contacts', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/contactos\/([^/]+)$/, handler: 'contacts', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/promociones\/?$/, handler: 'promotions', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/reportes\/?$/, handler: 'reports', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/estados\/?$/, handler: 'financials', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/fiscal\/?$/, handler: 'fiscal', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/ordenes\/?$/, handler: 'orders', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/ordenes\/([^/]+)$/, handler: 'orders', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/fiscal\/([^/]+)$/, handler: 'fiscal', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/reportes\/([^/]+)$/, handler: 'reports', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/diario\/?$/, handler: 'journal', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/mayor\/?$/, handler: 'ledger', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/usuarios\/?$/, handler: 'users', key: 'contabilidad' }
];

const pages = {
  dashboard: Dashboard,
  calculator: Calculator,
  costAnalysis: CostAnalysis,
  catalog: Catalog,
  products: Products,
  accounts: Accounts,
  accountingDashboard: AccountingDashboard,
  income: Income,
  costs: Costs,
  // Punto de venta apagado: su ruta lleva a Presupuestos.
  sales: POS_ENABLED ? Sales : { render() { location.replace('#/contabilidad/presupuestos'); } },
  expenses: Expenses,
  payments: CONTAINER_PAYMENTS_ENABLED ? ContainerPayments : { render() { location.replace('#/contabilidad/resumen'); } },
  inventory: Inventory,
  journal: Journal,
  ledger: Ledger,
  contacts: Contacts,
  quotes: Quotes,
  receivables: Receivables,
  payables: Payables,
  promotions: PROMOTIONS_ENABLED ? Promotions : { render() { location.replace('#/contabilidad/resumen'); } },
  reports: Reports,
  financials: FinancialStatements,
  fiscal: Fiscal,
  orders: Orders,
  users: Users
};

let currentCleanup = null;

function parseHash() {
  const hash = window.location.hash || '#/';
  for (const route of routes) {
    const match = hash.match(route.pattern);
    if (match) {
      return { handler: route.handler, key: route.key, params: match.slice(1) };
    }
  }
  return { handler: 'dashboard', key: 'dashboard', params: [] };
}

async function resolve() {
  await Store.seed();

  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }

  const { handler, key, params } = parseHash();
  // Sin permiso para esta pantalla: a la primera que sí pueda abrir.
  if (!Auth.can(PERM[handler])) {
    const to = firstAllowedPath();
    if (to && to !== (window.location.hash || '#/')) { location.replace(to); return; }
    Nav.render('');
    document.getElementById('app').innerHTML = '<div class="max-w-md mx-auto mt-20 text-center text-slate-500"><p class="font-semibold text-slate-800">Sin módulos asignados</p><p class="text-sm mt-1">Pide a un administrador que te dé acceso.</p></div>';
    return;
  }
  Nav.render(key);
  const app = document.getElementById('app');
  // Contabilidad ocupa todo el ancho (menú lateral pegado a la izquierda);
  // el resto de páginas, centradas.
  app.className = key === 'contabilidad' ? 'w-full' : 'max-w-7xl mx-auto space-y-5 p-4 md:p-8';
  app.innerHTML = '<div class="text-center py-20 text-slate-400">Cargando…</div>';

  const page = pages[handler];
  try {
    const cleanup = await page.render(app, params);
    if (typeof cleanup === 'function') {
      currentCleanup = cleanup;
    }
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
      <p class="font-bold">Error al cargar la página</p>
      <p class="text-sm">${err.message}</p>
    </div>`;
  }
}

function boot() {
  window.addEventListener('hashchange', resolve);
  // Cuando la sincronización inicial en segundo plano termina, refresca la
  // vista activa sola para mostrar los datos ya sincronizados.
  window.addEventListener('cif-data-updated', () => { resolve(); });
  resolve();
}

export { resolve, boot };
