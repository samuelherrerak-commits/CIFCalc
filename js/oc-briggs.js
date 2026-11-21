import Store from './store.js';
import { OC_BRIGGS_40FT } from './data/oc-briggs-40ft.js';
import { BRIGGS_PRODUCTS, BRIGGS_PHOTO_BASE } from './data/briggs-productos.js';

// Botón "Orden de compra Briggs" del Dashboard. Deja listo, sin pisar nada de lo
// que ya cargaste:
//   1. El contenedor de esa orden (si no existe, lo crea en Borrador con sus 43
//      productos y las 6 fábricas como proveedores).
//   2. Los productos de la plantilla (cada modelo en sus acabados: Cromado,
//      Steel Gray, Rose Gold…, con el mismo correlativo). Solo crea los que
//      faltan; no toca los que ya existen.
//   3. Vincula cada ítem del contenedor con su producto por el código de origen.
//   4. Para los acabados que no vinieron en la compra, agrega un ítem en el
//      contenedor con cantidad 0 y el mismo FOB y medidas del Cromado del modelo:
//      así se puede cambiar su FOB cuando llegue la cotización.
const COLOR_SUFFIX = /-(CR|SG|RG|NG|GL|BN|BB|GG)$/i;
const baseCode = (code) => String(code || '').replace(/-$/, '').replace(COLOR_SUFFIX, '');
const cleanSku = (s) => String(s || '').replace(/\*/g, '').trim().toLowerCase();

export async function openOrdenCompraBriggs() {
  const d = OC_BRIGGS_40FT;
  const summary = { products: 0, linked: 0, added: 0 };

  // Proveedores (por nombre).
  const supplierIds = {};
  for (const s of Store.getAll('suppliers')) supplierIds[String(s.name).trim().toUpperCase()] = s.id;
  const names = new Set([...d.items.map(i => i[0]), ...BRIGGS_PRODUCTS.map(p => p[0])]);
  for (const name of names) {
    if (!supplierIds[name.toUpperCase()]) supplierIds[name.toUpperCase()] = Store.insert('suppliers', { name, country: 'China', contact_email: '', contact_phone: '' }).id;
  }

  // 1. Contenedor.
  let container = Store.getAll('containers').find(c => String(c.bl_number).trim().toLowerCase() === d.name.toLowerCase());
  if (!container) {
    const draft = { ...Store.newContainer(), bl_number: d.name, ...d.container, status: 'draft' };
    const items = d.items.map(([sup, sku, name, hs, fob, qty, upb, cbm, kg, foto]) => ({
      supplier_id: supplierIds[sup.toUpperCase()] || null, origin_country: 'China', product_id: null, sku_briggs: '',
      sku, name, hs_code: hs, fob_unit: fob, qty, units_per_box: upb, box_volume: cbm, weight_kg: kg,
      tariff_rate: 0, gain_margin: 0, foto_url: foto ? d.photoBase + foto : '', foto_file_id: ''
    }));
    container = (await Store.saveContainerWithItems(draft, items)).container;
  }

  // 2. Productos de la plantilla que todavía no existen.
  const have = new Set(Store.getAll('products').map(p => String(p.sku_briggs || '').trim().toLowerCase()));
  const created = Store.insertMany('products', BRIGGS_PRODUCTS
    .filter(([, , , , , , code]) => !have.has(code.toLowerCase()))
    .map(([sup, sku, name, category, collection, color, code, foto]) => ({
      sku_briggs: code, sku, name, supplier_id: supplierIds[sup.toUpperCase()] || null, brand: 'BRG',
      origin_country: 'China', category, collection, color,
      foto_url: foto ? BRIGGS_PHOTO_BASE + foto : '', foto_file_id: '',
      units_per_box: 1, box_volume: 0, weight_kg: 0, hs_code: '', fob_unit: 0, tariff_rate: 0,
      stock: 0, avg_cost: 0, sale_price: 0
    })));
  summary.products = created.length;

  // 3. Vincular los ítems del contenedor con su producto (por código de origen).
  const products = Store.getAll('products');
  const byOrigin = new Map();
  for (const p of products) if (p.sku) byOrigin.set(cleanSku(p.sku), p);
  const items = Store.getItemsByContainer(container.id);
  const links = [];
  for (const it of items) {
    if (it.product_id) continue;
    const p = byOrigin.get(cleanSku(it.sku));
    if (p) { links.push({ id: it.id, product_id: p.id, sku_briggs: p.sku_briggs }); it.product_id = p.id; }
  }
  Store.updateMany('items', links);
  summary.linked = links.length;

  // 4. Acabados que no vinieron en la compra: ítem con cantidad 0 y el FOB del Cromado.
  const itemByProduct = new Map(items.filter(i => i.product_id).map(i => [i.product_id, i]));
  const bySibling = new Map(); // modelo → ítem de referencia (prefiere Cromado)
  for (const p of products) {
    const it = itemByProduct.get(p.id);
    if (!it) continue;
    const k = baseCode(p.sku_briggs);
    if (!bySibling.has(k) || /-CR$/i.test(String(p.sku_briggs || ''))) bySibling.set(k, it);
  }
  const extra = [];
  for (const p of products) {
    if (itemByProduct.has(p.id) || !BRIGGS_PRODUCTS.some(t => t[6] === p.sku_briggs)) continue;
    const ref = bySibling.get(baseCode(p.sku_briggs));
    if (!ref) continue;
    extra.push({
      container_id: container.id, product_id: p.id, supplier_id: p.supplier_id || ref.supplier_id, origin_country: ref.origin_country || 'China',
      sku: p.sku, sku_briggs: p.sku_briggs, name: p.name, qty: 0,
      units_per_box: ref.units_per_box, box_volume: ref.box_volume, weight_kg: ref.weight_kg, fob_unit: ref.fob_unit,
      hs_code: ref.hs_code, tariff_rate: ref.tariff_rate, gain_margin: ref.gain_margin || 0,
      foto_url: p.foto_url || ref.foto_url || '', foto_file_id: ''
    });
  }
  Store.insertMany('items', extra);
  summary.added = extra.length;

  if (summary.products || summary.linked || summary.added) {
    alert(`Orden de compra Briggs lista:\n• ${summary.products} productos creados\n• ${summary.linked} ítems vinculados a su producto\n• ${summary.added} ítems agregados (acabados sin compra, cantidad 0 y mismo FOB del Cromado)`);
  }
  window.location.hash = `#/contenedor/${container.id}`;
}
