import Store from './store.js';
import { einvoiceCall } from './sheets.js';
import { orderItems, orderTotals } from './orders.js';
import { ivaTipoOf } from './fiscal.js';

// Factura digital: la app arma la factura de la orden en un formato propio y
// el Apps Script la traduce a la API de Cachicamo (o la contesta su
// simulador mientras no haya cuenta). El token de Cachicamo vive solo en el
// Apps Script: esta página nunca lo ve.

// Tipo de IVA de la app → código del adaptador (G general, R reducida, E exento).
const IVA_CODE = { general: 'G', reducida: 'R', exento: 'E' };

// Factura de la orden: cada línea va con su base sin IVA (ya con el
// descuento), así el total que calcula la imprenta es el mismo de la orden.
export function einvoiceFromOrder(order) {
  const items = orderItems(order);
  const t = orderTotals(order, items);
  const contact = order.contact_id ? Store.getById('contacts', order.contact_id) : null;
  const products = new Map(Store.getAll('products').map(p => [p.id, p]));
  return {
    order_id: order.id,
    order_number: order.order_number,
    customer: {
      rif: contact ? contact.rif || '' : '', name: contact ? contact.name : order.contact_name || '',
      address: contact ? contact.address || '' : '', phone: contact ? contact.phone || '' : '', email: contact ? contact.email || '' : ''
    },
    lines: items.map((it, i) => {
      const qty = Number(it.qty) || 0;
      const tipo = it.ivaTipo || ivaTipoOf(products.get(it.productId));
      return {
        ref: `${order.order_number}-${i + 1}`, sku: it.sku || '', name: it.name || '', qty,
        unit_price: qty ? Math.round(t.lineBases[i] / qty * 10000) / 10000 : 0,
        iva: IVA_CODE[tipo] || 'G'
      };
    }),
    expected: { subtotal: t.subtotal, tax: t.tax, total: t.total }
  };
}

// Proveedor configurado en el Apps Script: { provider, simulated, missing }.
export function einvoiceInfo() {
  return einvoiceCall('einvoiceInfo');
}

// Emite la factura. Devuelve { number, control, issueDate, total, rate, uuid, provider, pdfUrl }.
export async function emitEinvoice(order) {
  const res = await einvoiceCall('einvoiceEmit', { invoice: einvoiceFromOrder(order) });
  return res.invoice;
}

export const isSimulated = (order) => order.einvoice_provider === 'simulador';
