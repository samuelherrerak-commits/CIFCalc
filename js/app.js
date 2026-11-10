import { boot } from './router.js';
import Store from './store.js';
import Auth from './auth.js';
import { ensureTodayRates } from './rates.js';
import { showLogin, showChangePassword } from './pages/login.js';

function syncBadge() {
  const el = document.getElementById('nav-respaldo');
  if (!el) return;
  el.classList.toggle('hidden', Store.isSheetsReachable());
}

// Sesión vencida (o el servidor la rechazó): se pide entrar de nuevo. Los
// datos y los cambios pendientes por subir se conservan en este navegador.
let askedLogin = false;
window.addEventListener('cif-auth-required', () => {
  if (askedLogin) return;
  askedLogin = true;
  localStorage.removeItem('cif_session');
  showLogin('Tu sesión venció. Vuelve a entrar.');
});

function startApp() {
  window.addEventListener('cif-backend', syncBadge);
  // El navbar se vuelve a pintar en cada cambio de ruta y tras cada sincronización
  // (y el aviso vuelve a "hidden"), así que se reaplica después.
  window.addEventListener('hashchange', () => setTimeout(syncBadge, 0));
  window.addEventListener('cif-data-updated', () => setTimeout(syncBadge, 0));

  // Franja fija de "Modo prueba" en toda la app.
  if (Store.isSandbox()) {
    const bar = document.createElement('div');
    bar.id = 'sandbox-bar';
    bar.className = 'bg-amber-50 border-b border-amber-200 text-amber-900 text-xs px-4 py-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1';
    bar.innerHTML = `
      <span><strong class="font-semibold">Modo prueba</strong> · trabajas con una copia; nada se guarda en la base de datos</span>
      <span class="flex gap-3">
        <button data-sbx="reset" class="underline underline-offset-2 hover:text-amber-700">Reiniciar</button>
        <button data-sbx="exit" class="font-semibold underline underline-offset-2 hover:text-amber-700">Salir</button>
      </span>`;
    document.getElementById('topbar').prepend(bar);
  }

  // Alto real del encabezado fijo → --top (lo usan el menú lateral y el punto
  // de venta para ocupar exactamente el resto de la pantalla).
  const topbar = document.getElementById('topbar');
  const setTop = () => document.documentElement.style.setProperty('--top', `${topbar.offsetHeight}px`);
  setTop();
  new ResizeObserver(setTop).observe(topbar);

  boot();
  syncBadge();

  // Permisos al día (por si un administrador los cambió): si cambiaron, se
  // vuelve a pintar la pantalla actual con el menú nuevo.
  Auth.refresh().then(u => {
    if (u && JSON.stringify(u) !== JSON.stringify(window.__cifUser)) window.dispatchEvent(new HashChangeEvent('hashchange'));
    window.__cifUser = u;
  }).catch(() => { /* sin conexión: se sigue con los permisos guardados */ });
  window.__cifUser = Auth.user();

  setInterval(() => {
    Store.syncWithCloud().then(() => Store.processRetryQueue());
  }, 60000);

  // Tasas BCV/USDT del día: después de la primera sincronización (por si otro
  // equipo ya las guardó) y luego cada hora por si cambia el día.
  const refreshRates = () => ensureTodayRates(Store)
    .then(() => window.dispatchEvent(new CustomEvent('cif-rates-updated')))
    .catch(e => console.warn('Maestro de Costo: tasas no disponibles —', e.message));
  setTimeout(refreshRates, 5000);
  setInterval(refreshRates, 3600000);
}

const session = Auth.session();
if (!session || !session.token) showLogin();
else if (session.user && session.user.must_change) showChangePassword({ forced: true });
else startApp();
