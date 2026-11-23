import Store from './store.js';
import { computeContainer } from './utils.js';
import { priceFor } from './pricing.js';

// Producto de un ítem del contenedor: el vinculado (product_id) o, si no está vinculado
// todavía, el que tenga el mismo código de origen (SKU de la fábrica) en Productos.
// Así el catálogo toma los costos aunque el contenedor se haya preparado antes de vincular.
function productResolver() {
  const clean = (s) => String(s || '').replace(/\*/g, '').trim().toLowerCase();
  const products = Store.getAll('products');
  const ids = new Set(products.map(p => p.id));
  const byOrigin = new Map();
  for (const p of products) {
    const k = clean(p.sku);
    if (!k) continue;
    if (!byOrigin.has(k)) byOrigin.set(k, []);
    byOrigin.get(k).push(p);
  }
  return (item) => {
    if (item.product_id && ids.has(item.product_id)) return item.product_id;
    const cand = byOrigin.get(clean(item.sku)) || [];
    const p = cand.length === 1 ? cand[0]
      : cand.find(x => String(x.sku_briggs || '').trim().toLowerCase() === String(item.sku_briggs || '').trim().toLowerCase());
    return p ? p.id : null;
  };
}

export function latestEstimates() {
  const map = new Map(); // productId → { cost, suggested, bl, status, date }
  const resolve = productResolver();
  const seen = new Set();
  const containers = Store.getAll('containers')
    .filter(c => !seen.has(c.id) && seen.add(c.id))
    .sort((a, b) => String(b.operation_date || b.updated_at || '').localeCompare(String(a.operation_date || a.updated_at || '')));
  for (const c of containers) {
    const items = Store.getItemsByContainer(c.id);
    if (!items.length) continue;
    for (const calc of computeContainer(c, items).calculated) {
      const pid = resolve(calc.item);
      if (!pid || map.has(pid) || !(calc.qty > 0)) continue;
      map.set(pid, { cost: calc.costNoVat, suggested: calc.salePriceOnCost, bl: c.bl_number || 'Sin BL', status: c.status, date: c.operation_date });
    }
  }
  return map;
}


// Costo estimado de un producto: el del contenedor más reciente donde viene o, si no, el costo promedio.
export const costOfProduct = (est, p) => (est.get(p.id) || {}).cost || Number(p.avg_cost) || 0;

// Precio de venta de un producto en un nivel (nombre) del catálogo; 0 si no tiene costo.
export function tierPriceOf(p, tierName, tiers, est) {
  const tier = tiers.find(t => t.name === tierName);
  return tier ? priceFor(costOfProduct(est, p), tier, tiers) : 0;
}
