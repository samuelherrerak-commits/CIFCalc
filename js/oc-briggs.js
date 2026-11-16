import Store from './store.js';
import { OC_BRIGGS_40FT } from './data/oc-briggs-40ft.js';

// Botón "Orden de compra Briggs" del Dashboard: abre el contenedor de esa
// orden; si todavía no existe, lo crea (en Borrador) con sus 43 productos,
// las 6 fábricas como proveedores y las fotos de la app.
export async function openOrdenCompraBriggs() {
  const d = OC_BRIGGS_40FT;
  const existing = Store.getAll('containers').find(c => String(c.bl_number).trim().toLowerCase() === d.name.toLowerCase());
  if (existing) {
    window.location.hash = `#/contenedor/${existing.id}`;
    return;
  }

  const supplierIds = {};
  for (const s of Store.getAll('suppliers')) supplierIds[String(s.name).trim().toUpperCase()] = s.id;
  for (const name of [...new Set(d.items.map(i => i[0]))]) {
    if (!supplierIds[name.toUpperCase()]) supplierIds[name.toUpperCase()] = Store.insert('suppliers', { name, country: 'China', contact_email: '', contact_phone: '' }).id;
  }

  const container = { ...Store.newContainer(), bl_number: d.name, ...d.container, status: 'draft' };
  const items = d.items.map(([sup, sku, name, hs, fob, qty, upb, cbm, kg, foto]) => ({
    supplier_id: supplierIds[sup.toUpperCase()] || null, origin_country: 'China', product_id: null, sku_briggs: '',
    sku, name, hs_code: hs, fob_unit: fob, qty, units_per_box: upb, box_volume: cbm, weight_kg: kg,
    tariff_rate: 0, gain_margin: 0, foto_url: foto ? d.photoBase + foto : '', foto_file_id: ''
  }));
  const { container: c } = await Store.saveContainerWithItems(container, items);
  window.location.hash = `#/contenedor/${c.id}`;
}
