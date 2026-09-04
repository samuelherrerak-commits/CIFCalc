import { boot } from './router.js';
import Store from './store.js';

boot();

setInterval(() => {
  Store.syncWithCloud().then(() => Store.processRetryQueue());
}, 30000);
