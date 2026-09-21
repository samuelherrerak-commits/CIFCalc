import { boot } from './router.js';
import Store from './store.js';

function syncBadge() {
  const el = document.getElementById('nav-respaldo');
  if (!el) return;
  const active = Store.getBackend() === 'sheets';
  el.classList.toggle('hidden', !active);
}

window.addEventListener('cif-backend', syncBadge);

boot();
syncBadge();

setInterval(() => {
  Store.syncWithCloud().then(() => Store.processRetryQueue());
}, 30000);