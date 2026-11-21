import Store from './store.js';
import { OC_BRIGGS_40FT } from './data/oc-briggs-40ft.js';
import { BRIGGS_PLANTILLA, BRIGGS_PHOTO_BASE } from './data/briggs-plantilla.js';

// Botón "Orden de compra Briggs" del Dashboard. Deja el contenedor de esa orden
// igual a la plantilla Plantilla_CIF_Definitiva.xlsx, para que la calculadora
// (CIF, costo y precios) trabaje con los mismos datos:
//   1. Abre el contenedor (si no existe, lo crea en Borrador).
//   2. Crea los productos de la plantilla que falten (con su código BRG).
//   3. Por cada fila de la plantilla, actualiza el ítem del contenedor (por
//      producto o por código de origen) con cantidad, FOB, unidades por caja,
//      volumen y peso de la caja, arancel 16 % y margen 30 %; si no existe, lo crea.
//   4. Si el contenedor tiene ítems que ya no están en la plantilla, pregunta si se quitan.
// Los gastos del contenedor (flete, aduana, etc.) no se tocan.
const TARIFF = 16;
const MARGIN = 30;
const cleanSku = (s) => String(s || '').replace(/\*/g, '').trim().toLowerCase();

export async function openOrdenCompraBriggs() {
  const d = OC_BRIGGS_40FT;
  const T = BRIGGS_PLANTILLA;
  const summary = { products: 0, updated: 0, added: 0, removed: 0 };

  // Proveedores (por nombre).
  const supplierIds = {};
  for (const s of Store.getAll('suppliers')) supplierIds[String(s.name).trim().toUpperCase()] = s.id;
  for (const name of new Set(T.map(t => t[0]))) {
    if (!supplierIds[name.toUpperCase()]) supplierIds[name.toUpperCase()] = Store.insert('suppliers', { name, country: 'China', contact_email: '', contact_phone: '' }).id;
  }

  // 1. Contenedor.
  let container = Store.getAll('containers').find(c => String(c.bl_number).trim().toLowerCase() === d.name.toLowerCase());
  if (!container) {
    const draft = { ...Store.newContainer(), bl_number: d.name, ...d.container, status: 'draft' };
    container = (await Store.saveContainerWithItems(draft, [])).container;
  }

  // 2. Productos que todavía no existen.
  const have = new Set(Store.getAll('products').map(p => String(p.sku_briggs || '').trim().toLowerCase()));
  const created = Store.insertMany('products', T
    .filter(t => !have.has(t[4].toLowerCase()))
    .map(([sup, sku, name, hs, code, color, category, collection, fob, , , , , foto]) => ({
      sku_briggs: code, sku, name, supplier_id: supplierIds[sup.toUpperCase()] || null, brand: 'BRG',
      origin_country: 'China', category, collection, color,
      foto_url: foto ? BRIGGS_PHOTO_BASE + foto : '', foto_file_id: '',
      units_per_box: 1, box_volume: 0, weight_kg: 0, hs_code: hs, fob_unit: 0, tariff_rate: TARIFF,
      stock: 0, avg_cost: 0, sale_price: 0
    })));
  summary.products = created.length;

  // 3. Ítems del contenedor = filas de la plantilla.
  const products = Store.getAll('products');
  const productByCode = new Map(products.map(p => [String(p.sku_briggs || '').trim().toLowerCase(), p]));
  const items = Store.getItemsByContainer(container.id);
  const byProduct = new Map(items.filter(i => i.product_id).map(i => [i.product_id, i]));
  const byOrigin = new Map(items.map(i => [cleanSku(i.sku), i]));
  const used = new Set();
  const updates = [];
  const news = [];
  for (const [sup, sku, name, hs, code, , , , fob, qty, upb, cbm, kg, foto] of T) {
    const p = productByCode.get(code.toLowerCase());
    if (!p) continue;
    const it = byProduct.get(p.id) || byOrigin.get(cleanSku(sku));
    const fields = {
      product_id: p.id, sku_briggs: code, sku, supplier_id: p.supplier_id || supplierIds[sup.toUpperCase()] || null, origin_country: 'China',
      qty, fob_unit: fob, units_per_box: upb, box_volume: cbm, weight_kg: kg, hs_code: hs || (it && it.hs_code) || '',
      tariff_rate: TARIFF, gain_margin: MARGIN
    };
    if (it && !used.has(it.id)) {
      used.add(it.id);
      updates.push({ id: it.id, ...fields, name: it.name || name });
    } else {
      news.push({ container_id: container.id, name, ...fields, foto_url: p.foto_url || (foto ? BRIGGS_PHOTO_BASE + foto : ''), foto_file_id: '' });
    }
  }
  Store.updateMany('items', updates);
  Store.insertMany('items', news);
  summary.updated = updates.length;
  summary.added = news.length;

  // 4. Ítems del contenedor que no están en la plantilla.
  const leftovers = items.filter(i => !used.has(i.id));
  if (leftovers.length) {
    const list = leftovers.slice(0, 12).map(i => `• ${i.sku} (${i.qty} pzas)`).join('\n') + (leftovers.length > 12 ? `\n… y ${leftovers.length - 12} más` : '');
    if (confirm(`El contenedor tiene ${leftovers.length} ítems que no están en la plantilla:\n\n${list}\n\n¿Quitarlos del contenedor? (Si los dejas, siguen sumando al CIF.)`)) {
      await Store.removeMany('items', leftovers.map(i => i.id));
      summary.removed = leftovers.length;
    }
  }

  alert(`Orden de compra Briggs sincronizada con la plantilla:\n• ${summary.products} productos creados\n• ${summary.updated} ítems actualizados\n• ${summary.added} ítems agregados\n• ${summary.removed} ítems quitados`);
  window.location.hash = `#/contenedor/${container.id}`;
}
