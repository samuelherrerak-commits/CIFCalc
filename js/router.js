import Nav from './components/nav.js';
import Store from './store.js';

import Dashboard from './pages/dashboard.js';
import Calculator from './pages/calculator.js';
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
  { pattern: /^#\/contabilidad\/por-cobrar\/?$/, handler: 'receivables', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/por-pagar\/?$/, handler: 'payables', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/inventario\/?$/, handler: 'inventory', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/contactos\/?$/, handler: 'contacts', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/diario\/?$/, handler: 'journal', key: 'contabilidad' },
  { pattern: /^#\/contabilidad\/mayor\/?$/, handler: 'ledger', key: 'contabilidad' }
];

const pages = {
  dashboard: Dashboard,
  calculator: Calculator,
  products: Products,
  accounts: Accounts,
  accountingDashboard: AccountingDashboard,
  income: Income,
  costs: Costs,
  sales: Sales,
  expenses: Expenses,
  payments: ContainerPayments,
  inventory: Inventory,
  journal: Journal,
  ledger: Ledger,
  contacts: Contacts,
  quotes: Quotes,
  receivables: Receivables,
  payables: Payables
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
  Nav.render(key);
  const app = document.getElementById('app');
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
