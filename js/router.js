import Nav from './components/nav.js';
import Store from './store.js';

import Dashboard from './pages/dashboard.js';
import Calculator from './pages/calculator.js';

const routes = [
  { pattern: /^#\/?$/, handler: 'dashboard', key: 'dashboard' },
  { pattern: /^#\/contenedor\/(.+)$/, handler: 'calculator', key: 'calculator' }
];

const pages = {
  dashboard: Dashboard,
  calculator: Calculator
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
  resolve();
}

export { resolve, boot };
