import Store from './store.js';
import { einvoiceCall } from './sheets.js';
import { isSandbox } from './sandbox.js';
import { orderItems, orderTotals, orderMoney } from './orders.js';
import Auth from './auth.js';
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
  const m = orderMoney(order);
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
    expected: { subtotal: t.subtotal, tax: t.tax, total: t.total },
    // Datos para la representación impresa.
    rate_bcv: Store.usdRateFor(new Date().toISOString().slice(0, 10)) || 0,
    retention_pct: m.withheld > 0 ? m.retPct : 0,
    conditions: m.advances >= t.total - m.withheld - 0.005 ? 'CONTADO' : 'CRÉDITO',
    credit_days: 0,
    seller: (Auth.user() || {}).name || ''
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

// Envía la factura por correo (PDF adjunto) desde la cuenta de Google del Apps Script.
export function sendEinvoiceEmail(order, to) {
  return einvoiceCall('einvoiceSend', { order_id: order.id, to, ...sandboxInvoice(order) });
}

// En modo prueba el servidor no guarda la factura, así que se le mandan sus datos.
function sandboxInvoice(order) {
  if (!isSandbox()) return {};
  const inv = einvoiceFromOrder(order);
  return {
    invoice: {
      order_id: order.id, order_number: order.order_number, number: order.invoice_number, control: order.control_number,
      issue_date: order.invoice_date, customer: inv.customer, lines: inv.lines,
      subtotal: inv.expected.subtotal, tax: inv.expected.tax, total: inv.expected.total,
      rate_bcv: inv.rate_bcv, retention_pct: inv.retention_pct, conditions: inv.conditions, credit_days: inv.credit_days, seller: inv.seller
    }
  };
}

// Enlace público al PDF, para mandarlo por WhatsApp.
export async function einvoicePdfLink(order) {
  const res = await einvoiceCall('einvoiceLink', { order_id: order.id, ...sandboxInvoice(order) });
  return res.url;
}

// Mensaje de WhatsApp con los datos de la factura y el enlace al PDF.
export function whatsappText(order, url) {
  const fmt = (n) => '$' + (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sim = isSimulated(order) ? ' (PRUEBA: factura simulada, sin validez fiscal)' : '';
  return `Hola ${order.contact_name || ''}, le enviamos su factura N.º ${order.invoice_number} (control ${order.control_number}) por ${fmt(order.total)}${sim}.\n\nPDF: ${url}`;
}

// Enlace de WhatsApp (número venezolano local 0414… → 58414…).
export const waLink = (phone, text = '') => {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '58' + digits.slice(1);
  return digits ? `https://wa.me/${digits}${text ? '?text=' + encodeURIComponent(text) : ''}` : '';
};
