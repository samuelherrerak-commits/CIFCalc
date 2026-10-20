import { boot } from './router.js';
import Store from './store.js';
import { ensureTodayRates } from './rates.js';

function syncBadge() {
  const el = document.getElementById('nav-respaldo');
  if (!el) return;
  el.classList.toggle('hidden', Store.isSheetsReachable());
}

window.addEventListener('cif-backend', syncBadge);
// El navbar se vuelve a pintar en cada cambio de ruta y tras cada sincronización
// (y el aviso vuelve a "hidden"), así que se reaplica después.
window.addEventListener('hashchange', () => setTimeout(syncBadge, 0));
window.addEventListener('cif-data-updated', () => setTimeout(syncBadge, 0));

// Franja fija de "Modo prueba" en toda la app.
if (Store.isSandbox()) {
  const bar = document.createElement('div');
  bar.id = 'sandbox-bar';
  bar.className = 'sticky top-0 z-[60] -mx-4 md:-mx-8 -mt-4 md:-mt-8 mb-4 bg-amber-400 text-amber-950 text-xs font-bold px-4 py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 shadow';
  bar.innerHTML = `
    <span>🧪 MODO PRUEBA — trabajas con una copia; nada se guarda en la base de datos</span>
    <span class="flex gap-1.5">
      <button data-sbx="reset" class="bg-white/70 hover:bg-white px-2 py-0.5 rounded-md">Reiniciar prueba</button>
      <button data-sbx="exit" class="bg-amber-900 text-white hover:bg-amber-950 px-2 py-0.5 rounded-md">Salir</button>
    </span>`;
  document.body.prepend(bar);
}

boot();
syncBadge();

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