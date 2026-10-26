import { CONFIG } from './config.js';
import { money } from './price.js';

export const waLink = (text) => `https://wa.me/${CONFIG.ADVISOR_WHATSAPP}?text=${encodeURIComponent(text)}`;

const fechaMeet = (iso) => {
  const d = new Date(iso);
  return d.toLocaleString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
};

// Resumen del pedido para el asesor. `lines` = [{ product, qty, unit }]
export function orderMessage({ number, lines, totals, customer, meetStart, meetLink }) {
  const rows = lines.map((l) => `• ${l.qty} × ${l.product.name} (${l.product.sku}) — ${money(l.unit * l.qty)}`);
  return [
    `Hola ${CONFIG.STORE_NAME}, quiero confirmar mi pedido ${number}:`,
    '',
    ...rows,
    '',
    `Total${totals.iva ? ' (IVA incluido)' : ''}: ${money(totals.total)}`,
    '',
    `Cliente: ${customer.name} · ${customer.phone}`,
    customer.email ? `Correo: ${customer.email}` : '',
    customer.address ? `Entrega: ${customer.address}` : '',
    customer.notes ? `Notas: ${customer.notes}` : '',
    meetStart ? `Reunión por Google Meet: ${fechaMeet(meetStart)}${meetLink ? ' · ' + meetLink : ''}` : ''
  ].filter((l, i, a) => l !== '' || (a[i - 1] !== '' && i > 0)).join('\n').trim();
}

export function productMessage(p) {
  return `Hola ${CONFIG.STORE_NAME}, me interesa ${p.name} (${p.sku}). ¿Me confirman precio y disponibilidad?`;
}
