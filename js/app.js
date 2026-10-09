import { boot } from './router.js';
import Store from './store.js';

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

boot();
syncBadge();

setInterval(() => {
  Store.syncWithCloud().then(() => Store.processRetryQueue());
}, 60000);