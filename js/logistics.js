import Store from './store.js';
import { logisticPct } from './utils.js';

// Cada ítem de un contenedor no completo toma del producto su FOB y su % logístico (por defecto 6 %).
// El % logístico se calcula aparte (suma a "Otros gastos"; no afecta seguro ni arancel). Los contenedores abiertos
// lo toman al abrirse (calculadora) y también aquí, para que el Catálogo y los costos estimados lo vean sin abrir
// cada contenedor. Los contenedores completos no se tocan. Devuelve cuántos ítems se actualizaron.
export function syncOpenContainersFob() {
  const closed = new Set(Store.getAll('containers').filter(c => c.status === 'closed').map(c => c.id));
  const products = new Map(Store.getAll('products').map(p => [p.id, p]));
  const fix = [];
  for (const it of Store.getAll('items')) {
    if (!it.product_id || closed.has(it.container_id)) continue;
    const p = products.get(it.product_id);
    if (!p) continue;
    const fob = Number(p.fob_unit) || 0;
    const lp = logisticPct(p);
    if ((fob > 0 && Math.abs(fob - (Number(it.fob_unit) || 0)) > 0.00005) || (Number(it.logistic_pct) || 0) !== lp) {
      fix.push({ id: it.id, ...(fob > 0 ? { fob_unit: fob } : {}), logistic_pct: lp });
    }
  }
  if (fix.length) Store.updateMany('items', fix);
  return fix.length;
}
