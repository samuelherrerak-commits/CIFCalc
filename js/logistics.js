import Store from './store.js';
import { fobWithLogistics, logisticPct } from './utils.js';

// El FOB unitario de un ítem de contenedor = FOB del producto + su % logístico (por defecto 6 %).
// Los contenedores abiertos toman ese valor al abrirse (calculadora) y también aquí, para que el Catálogo
// y los costos estimados lo vean sin tener que abrir cada contenedor. Los contenedores completos no se tocan.
// Devuelve cuántos ítems se actualizaron.
export function syncOpenContainersFob() {
  const closed = new Set(Store.getAll('containers').filter(c => c.status === 'closed').map(c => c.id));
  const products = new Map(Store.getAll('products').map(p => [p.id, p]));
  const fix = [];
  for (const it of Store.getAll('items')) {
    if (!it.product_id || closed.has(it.container_id)) continue;
    const p = products.get(it.product_id);
    if (!p) continue;
    const fob = fobWithLogistics(p);
    const lp = logisticPct(p);
    if (fob > 0 && (Math.abs(fob - (Number(it.fob_unit) || 0)) > 0.00005 || (Number(it.logistic_pct) || 0) !== lp)) fix.push({ id: it.id, fob_unit: fob, logistic_pct: lp });
  }
  if (fix.length) Store.updateMany('items', fix);
  return fix.length;
}
