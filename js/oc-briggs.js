import Store from './store.js';
import { OC_BRIGGS_40FT } from './data/oc-briggs-40ft.js';
import { BRIGGS_PLANTILLA, BRIGGS_PHOTO_BASE } from './data/briggs-plantilla.js';

// Botón "Orden de compra Briggs" del Dashboard. Crea UN CONTENEDOR NUEVO (no toca el de la
// orden anterior) y deja el contenedor de esa orden
// igual a la plantilla Plantilla_CIF_Definitiva.xlsx, para que la calculadora
// (CIF, costo y precios) trabaje con los mismos datos:
//   1. Abre el contenedor nuevo (si no existe, lo crea en Borrador, con los gastos copiados del
//      contenedor anterior de la orden; después se editan por separado).
//   2. Crea los productos de la plantilla que falten (con su código BRG).
//   3. Por cada fila de la plantilla, actualiza el ítem del contenedor (por
//      producto o por código de origen) con cantidad, FOB, unidades por caja,
//      volumen y peso de la caja, arancel 16 % y margen 30 %; si no existe, lo crea.
//   4. Si el contenedor tiene ítems que ya no están en la plantilla, pregunta si se quitan.
// Los gastos del contenedor (flete, aduana, etc.) no se tocan.
const TARIFF = 16;
const MARGIN = 30;
const NEW_NAME = 'Orden de compra Briggs 40ft · Plantilla CIF';
const COPY_FIELDS = ['company_id', 'container_capacity', 'container_max_weight', 'ocean_freight', 'inland_freight', 'customs_expenses', 'customs_broker_fee', 'op_expenses', 'insurance_enabled', 'insurance_rate', 'insurance_basis', 'port_fee_rate', 'vat_rate'];
const cleanSku = (s) => String(s || '').replace(/\*/g, '').trim().toLowerCase();

// Crea (o completa con volumen) los productos de la plantilla y sus proveedores.
// Devuelve { supplierIds, created }. No borra nada.
export function ensureBriggsProducts() {
  const T = BRIGGS_PLANTILLA;
  // Proveedores (por nombre).
  const supplierIds = {};
  for (const s of Store.getAll('suppliers')) supplierIds[String(s.name).trim().toUpperCase()] = s.id;
  for (const name of new Set(T.map(t => t[0]))) {
    if (!supplierIds[name.toUpperCase()]) supplierIds[name.toUpperCase()] = Store.insert('suppliers', { name, country: 'China', contact_email: '', contact_phone: '' }).id;
  }

  // 2. Productos que todavía no existen.
  const have = new Set(Store.getAll('products').map(p => String(p.sku_briggs || '').trim().toLowerCase()));
  const created = Store.insertMany('products', T
    .filter(t => !have.has(t[4].toLowerCase()))
    .map(([sup, sku, name, hs, code, color, category, collection, fob, , upb, cbm, kg, foto]) => ({
      sku_briggs: code, sku, name, supplier_id: supplierIds[sup.toUpperCase()] || null, brand: 'BRG',
      origin_country: 'China', category, collection, color,
      foto_url: foto ? BRIGGS_PHOTO_BASE + foto : '', foto_file_id: '',
      units_per_box: upb, box_volume: cbm, weight_kg: kg, hs_code: hs, fob_unit: fob, tariff_rate: TARIFF,
      stock: 0, avg_cost: 0, sale_price: 0
    })));
  // Productos de la plantilla que ya existían sin volumen: se completan (todos deben tener volumen).
  const fix = [];
  for (const p of Store.getAll('products')) {
    const t = T.find(x => x[4].toLowerCase() === String(p.sku_briggs || '').trim().toLowerCase());
    if (t && !(Number(p.box_volume) > 0)) fix.push({ id: p.id, units_per_box: t[10], box_volume: t[11], weight_kg: t[12], fob_unit: t[8], hs_code: p.hs_code || t[3], tariff_rate: TARIFF });
  }
  Store.updateMany('products', fix);

  return { supplierIds, created };
}

export async function openOrdenCompraBriggs() {
  const d = OC_BRIGGS_40FT;
  const T = BRIGGS_PLANTILLA;
  const summary = { products: 0, updated: 0, added: 0, removed: 0 };

  // Seguridad: si ya hay productos con el mismo código BRG pero OTRO producto (catálogo viejo), no se
  // importa: los ítems quedarían enlazados a productos que no son los de la plantilla.
  const clash = Store.getAll('products').filter(p => {
    const t = T.find(x => x[4].toLowerCase() === String(p.sku_briggs || '').trim().toLowerCase());
    return t && String(p.sku || '').trim().toLowerCase() !== t[1].toLowerCase();
  });
  if (clash.length) {
    alert(`Hay ${clash.length} productos del catálogo viejo con los mismos códigos BRG que la plantilla (por ejemplo ${clash[0].sku_briggs} = ${clash[0].sku}).\n\nPrimero usa "Dejar solo catálogo Briggs" en Productos y después vuelve a pulsar este botón.`);
    return;
  }

  const { supplierIds, created } = ensureBriggsProducts();
  summary.products = created.length;

  // 1. Contenedor.
  const all = Store.getAll('containers');
  let container = all.find(c => String(c.bl_number).trim().toLowerCase() === NEW_NAME.toLowerCase());
  if (!container) {
    // Los gastos (flete, aduana, agente…) se copian del contenedor anterior de la orden, si existe.
    const old = all.find(c => String(c.bl_number).trim().toLowerCase() === d.name.toLowerCase());
    const base = { container_capacity: 68, container_max_weight: 26500, ocean_freight: 11000, inland_freight: 480, customs_expenses: 635.25,
      customs_broker_fee: 400, op_expenses: 1375.3, insurance_enabled: true, insurance_rate: 1, insurance_basis: 'cfr110', port_fee_rate: 1, vat_rate: 16 };
    if (old) for (const k of COPY_FIELDS) if (old[k] !== undefined && old[k] !== '') base[k] = old[k];
    const draft = { ...Store.newContainer(), ...base, bl_number: NEW_NAME, status: 'draft' };
    container = (await Store.saveContainerWithItems(draft, [])).container;
  }

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

  alert(`Contenedor nuevo "${NEW_NAME}" sincronizado con la plantilla:\n• ${summary.products} productos creados\n• ${summary.updated} ítems actualizados\n• ${summary.added} ítems agregados\n• ${summary.removed} ítems quitados`);
  window.location.hash = `#/contenedor/${container.id}`;
}

// Deja el catálogo de Productos SOLO con los de la plantilla: elimina los demás
// (desvinculando los ítems de contenedor que los usaban) y crea los de la plantilla.
// Devuelve { removed, created } o null si se cancela.
export async function replaceCatalogWithBriggs(onProgress) {
  // Un producto actual solo se conserva si es EXACTAMENTE el de la plantilla (mismo código BRG y mismo
  // código de origen): los códigos se regeneraron desde cero, así que un mismo código puede ser otro producto.
  const keep = new Set(BRIGGS_PLANTILLA.map(t => `${t[4]}|${t[1]}`.toLowerCase()));
  const old = Store.getAll('products').filter(p => !keep.has(`${String(p.sku_briggs || '').trim()}|${String(p.sku || '').trim()}`.toLowerCase()));
  const oldIds = new Set(old.map(p => p.id));
  const linked = Store.getAll('items').filter(i => oldIds.has(i.product_id));
  const quotes = Store.getAll('quotes').filter(q => { try { return JSON.parse(q.items || '[]').some(i => oldIds.has(i.productId)); } catch { return false; } });
  const orders = Store.getAll('sales_orders').filter(o => { try { return JSON.parse(o.items || '[]').some(i => oldIds.has(i.productId)); } catch { return false; } });
  const msg = `Vas a dejar el catálogo solo con los ${BRIGGS_PLANTILLA.length} productos de la plantilla Briggs.\n\n` +
    `• Se ELIMINAN ${old.length} productos actuales\n` +
    `• ${linked.length} ítems de contenedores quedarán sin producto vinculado\n` +
    `• ${quotes.length} presupuestos y ${orders.length} órdenes de venta usan esos productos\n` +
    `• Las fotos en Drive no se borran\n\nNo se puede deshacer (hay respaldo de la hoja en Drive).\n\nEscribe ELIMINAR para continuar:`;
  if (prompt(msg) !== 'ELIMINAR') return null;
  Store.updateMany('items', linked.map(i => ({ id: i.id, product_id: null })));
  await Store.removeMany('products', old.map(p => p.id), onProgress);
  const { created } = ensureBriggsProducts();
  return { removed: old.length, created: created.length };
}
