import Store from './store.js';
import { computeTax, ivaTipoOf, taxSummaryRows } from './fiscal.js';
import { upsert as sheetsUpsert, uploadFoto } from './sheets.js';

// Ciclo de venta de una importadora (venta a distribuidores):
//   Presupuesto → Orden de venta → anticipos → despachos → factura → cobros.
// • Anticipo: Debe Caja/Banco / Haber Anticipos de Clientes (pasivo).
// • Despacho: solo baja la existencia del inventario (no toca el diario).
// • Factura: Debe Anticipos (lo ya pagado) + Retención IVA + CxC (el resto)
//            / Haber Ingresos por Ventas + IVA Débito Fiscal.
// • Cobro posterior: Debe Caja/Banco / Haber Cuentas por Cobrar.

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

export const ORDER_STATUS = {
  abierta: { label: 'Abierta', tone: 'bg-sky-50 text-sky-700' },
  facturada: { label: 'Facturada', tone: 'bg-emerald-50 text-emerald-700' },
  anulada: { label: 'Anulada', tone: 'bg-slate-100 text-slate-500' }
};

export const PAY_METHODS = [
  { key: 'efectivo', label: 'Efectivo', te: 'Efectivo', codigo: '1.1.01.01' },
  { key: 'banco', label: 'Banco', te: 'Banco', codigo: '1.1.01.02' }
];

export function orderItems(order) {
  try {
    const parsed = JSON.parse(order.items || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const isFiscal = (order) => order.fiscal === true || String(order.fiscal) === 'true';

// Totales con IVA según el tipo de cada producto (sin factura: sin IVA).
export function orderTotals(order, items = orderItems(order)) {
  const fs = Store.getFiscalSettings();
  const products = new Map(Store.getAll('products').map(p => [p.id, p]));
  const t = computeTax(items.map(it => ({ amount: Number(it.qty) * Number(it.unitPrice), tipo: it.ivaTipo || ivaTipoOf(products.get(it.productId)) })), { ...fs, ivaEnabled: fs.ivaEnabled && isFiscal(order) });
  return t;
}

export const orderPayments = (orderId) => Store.getAll('order_payments')
  .filter(p => p.order_id === orderId)
  .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.created_at).localeCompare(String(b.created_at)));

export const orderDispatches = (orderId) => Store.getAll('dispatches')
  .filter(d => d.order_id === orderId)
  .sort((a, b) => String(a.date).localeCompare(String(b.date)));

export function dispatchItems(d) {
  try { return JSON.parse(d.items || '[]'); } catch { return []; }
}

// Resumen de dinero de una orden.
export function orderMoney(order) {
  const t = orderTotals(order);
  const pays = orderPayments(order.id);
  const advances = r2(pays.filter(p => p.kind === 'anticipo').reduce((s, p) => s + Number(p.amount || 0), 0));
  const collections = r2(pays.filter(p => p.kind === 'cobro').reduce((s, p) => s + Number(p.amount || 0), 0));
  const contact = order.contact_id ? Store.getById('contacts', order.contact_id) : null;
  const retPct = Number((contact || {}).iva_retention_pct) || 0;
  const withheld = isFiscal(order) && retPct > 0 ? r2(t.tax * retPct / 100) : 0;
  const paid = r2(advances + collections + withheld);
  return { ...t, advances, collections, withheld, paid, balance: r2(t.total - paid), retPct };
}

// Unidades pedidas, despachadas y pendientes por línea.
export function dispatchStatus(order) {
  const items = orderItems(order);
  const pending = items.reduce((s, it) => s + Math.max(0, Number(it.qty) - (Number(it.dispatched) || 0)), 0);
  const total = items.reduce((s, it) => s + Number(it.qty), 0);
  return { total, dispatched: total - pending, pending, complete: pending === 0 && total > 0 };
}

// Siguiente número de documento del año: OV-2026-0001, DSP-2026-0001…
function nextNumber(table, field, prefix, date) {
  const year = String(date || today()).slice(0, 4);
  const head = `${prefix}-${year}-`;
  let max = 0;
  for (const r of Store.getAll(table)) {
    const v = String(r[field] || '');
    if (v.startsWith(head)) max = Math.max(max, Number(v.slice(head.length)) || 0);
  }
  return `${head}${String(max + 1).padStart(4, '0')}`;
}

const account = (codigo) => Store.getAll('accounts').find(a => a.codigo === codigo && a.is_active !== false) || Store.ensureCatalogAccount(codigo);

// Cuenta de la forma de pago (Efectivo/Banco); si hay varias, la elegida.
export function paymentAccount(methodKey, accountId) {
  const m = PAY_METHODS.find(x => x.key === methodKey);
  if (!m) return null;
  const list = Store.getAll('accounts').filter(a => a.tipo_especifico === m.te && a.is_active !== false).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
  return list.find(a => a.id === accountId) || list[0] || Store.ensureCatalogAccount(m.codigo);
}

const line = (date, acc, debit, credit, concepto, refDoc, entidad) => ({
  entry_date: date, codigo_cuenta: acc.codigo, cuenta_contable: acc.nombre, concepto,
  debit: r2(debit), credit: r2(credit), ref_doc: refDoc, entidad: entidad || ''
});

// Carrito del punto de venta / presupuesto → líneas de la orden.
export function itemsFromCart(cart) {
  return cart.map(l => ({
    productId: l.product.id, name: l.product.name, sku: l.product.sku_briggs || '',
    qty: Number(l.qty), listPrice: r2(l.listPrice || l.unitPrice), discountPct: r2(l.discountPct || 0),
    unitPrice: r2(l.unitPrice), ivaTipo: ivaTipoOf(l.product), dispatched: 0
  }));
}

export function createOrder({ date, contact, items, fiscal = true, notes = '', quoteId = '' }) {
  const order = {
    order_number: nextNumber('sales_orders', 'order_number', 'OV', date),
    date: date || today(), quote_id: quoteId,
    contact_id: contact ? contact.id : '', contact_name: contact ? contact.name : '',
    items: JSON.stringify(items), fiscal: !!fiscal, status: 'abierta', notes,
    invoice_ref: '', invoice_number: '', control_number: '', invoice_date: ''
  };
  const t = orderTotals(order, items);
  return Store.insert('sales_orders', { ...order, subtotal: t.subtotal, tax: t.tax, total: t.total });
}

// Imagen del comprobante → JPEG reducido (máx. 1600 px) en base64.
export function compressImage(file, maxSide = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('El archivo no es una imagen válida.'));
      img.onload = () => {
        const k = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Sube el comprobante a Drive (carpeta comprobantes_pagos) y guarda el
// enlace en el pago. En modo prueba (sin nube) se guarda la imagen local.
export async function attachProof(payment, file) {
  if (Store.isSandbox()) {
    Store.update('order_payments', { id: payment.id, foto_url: await compressImage(file, 900, 0.7) });
    return;
  }
  const dataUrl = await compressImage(file);
  const row = Store.getById('order_payments', payment.id);
  await sheetsUpsert('order_payments', [row]); // la fila debe existir en la hoja antes de subir
  const res = await uploadFoto(payment.id, `comprobante-${payment.ref_doc || payment.id}.jpg`, 'image/jpeg', dataUrl, 'order_payments');
  Store.update('order_payments', { id: payment.id, foto_url: res.foto_url, foto_file_id: res.foto_file_id });
}

// Anticipo (antes de facturar) o cobro (después).
export function registerPayment(order, { date, amount, method, accountId, reference = '', notes = '' }) {
  const kind = order.status === 'facturada' ? 'cobro' : 'anticipo';
  const pay = paymentAccount(method, accountId);
  const counter = kind === 'anticipo' ? account('2.1.05.01') : account('1.1.02.01');
  const refDoc = `${kind === 'anticipo' ? 'ANT' : 'COB'}-${Date.now().toString().slice(-6)}`;
  const concepto = `${kind === 'anticipo' ? 'Anticipo' : 'Cobro'} ${order.order_number}${reference ? ' · ' + reference : ''}`;
  Store.postJournalRows([
    line(date, pay, amount, 0, concepto, refDoc, order.contact_name),
    line(date, counter, 0, amount, concepto, refDoc, order.contact_name)
  ], { source: kind === 'anticipo' ? 'order_advance' : 'receivable_collection', sourceRef: order.id });
  return Store.insert('order_payments', {
    order_id: order.id, contact_id: order.contact_id, kind, date, amount: r2(amount), method,
    account_codigo: pay.codigo, ref_doc: refDoc, reference, notes, foto_url: '', foto_file_id: ''
  });
}

// Despacho (parcial o total): baja el inventario de lo que sale.
export function registerDispatch(order, { date, qtyByProduct, notes = '' }) {
  const items = orderItems(order);
  const out = [];
  for (const it of items) {
    const want = Math.floor(Number(qtyByProduct[it.productId]) || 0);
    const pend = Math.max(0, Number(it.qty) - (Number(it.dispatched) || 0));
    const q = Math.min(want, pend);
    if (q > 0) { it.dispatched = (Number(it.dispatched) || 0) + q; out.push({ productId: it.productId, name: it.name, qty: q }); }
  }
  if (!out.length) return null;
  const d = Store.insert('dispatches', {
    order_id: order.id, dispatch_number: nextNumber('dispatches', 'dispatch_number', 'DSP', date),
    date, items: JSON.stringify(out), notes
  });
  for (const o of out) {
    const p = Store.getById('products', o.productId);
    if (p) Store.update('products', { id: p.id, stock: (Number(p.stock) || 0) - o.qty });
  }
  Store.update('sales_orders', { id: order.id, items: JSON.stringify(items) });
  return d;
}

// Factura de la orden: un solo asiento consolidado. payNow = { method,
// accountId } para la venta de contado del punto de venta (lo que no cubren
// anticipos ni retención se cobra en el acto en vez de ir a CxC).
export function invoiceOrder(order, { date, invoiceNumber = '', controlNumber = '', payNow = null }) {
  const fiscal = isFiscal(order);
  const items = orderItems(order);
  const t = orderTotals(order, items);
  const m = orderMoney(order);
  const refDoc = `${fiscal ? 'VTA' : 'NE'}-${order.order_number.replace(/^OV-/, '')}`;
  const ent = order.contact_name || 'Consumidor final';
  const concepto = `${fiscal ? 'Factura' : 'Nota de entrega'} ${order.order_number}`;

  const due = r2(t.total - m.withheld);
  const applied = r2(Math.min(m.advances, due));
  const restAfter = r2(due - applied);
  const lines = [];
  if (applied > 0) lines.push(line(date, account('2.1.05.01'), applied, 0, concepto, refDoc, ent));
  if (payNow && restAfter > 0) lines.push(line(date, paymentAccount(payNow.method, payNow.accountId), restAfter, 0, concepto, refDoc, ent));
  if (m.withheld > 0) lines.push(line(date, account('1.1.03.02'), m.withheld, 0, concepto, refDoc, ent));
  if (!payNow && restAfter > 0) lines.push(line(date, account('1.1.02.01'), restAfter, 0, concepto, refDoc, ent));
  lines.push(line(date, account('4.1.01.01'), 0, t.subtotal, concepto, refDoc, ent));
  if (t.tax > 0) lines.push(line(date, account('2.1.04.01'), 0, t.tax, concepto, refDoc, ent));
  Store.postJournalRows(lines, { source: 'sale', sourceRef: order.id });

  // Base y costo por línea al momento de facturar (margen en Reportes).
  const finalItems = items.map((it, i) => {
    const p = Store.getById('products', it.productId);
    return { ...it, base: t.lineBases[i], unitCost: r2(p ? p.avg_cost : 0) };
  });
  Store.update('sales_orders', {
    id: order.id, status: 'facturada', items: JSON.stringify(finalItems), invoice_ref: refDoc,
    invoice_number: invoiceNumber, control_number: controlNumber, invoice_date: date,
    subtotal: t.subtotal, tax: t.tax, total: t.total
  });
  if (fiscal) {
    const contact = order.contact_id ? Store.getById('contacts', order.contact_id) : null;
    Store.insert('fiscal_docs', Store.newFiscalDoc({
      book: 'ventas', date, doc_type: 'factura', invoice_number: invoiceNumber, control_number: controlNumber,
      rif: contact ? contact.rif || '' : '', name: ent,
      total: t.total, exempt: t.exempt, base_general: t.base_general, tax_general: t.tax_general,
      base_reducida: t.base_reducida, tax_reducida: t.tax_reducida,
      withheld: m.withheld, withholding_date: m.withheld > 0 ? date : '',
      ref_doc: refDoc, source_ref: order.id, tasa_bcv: Store.usdRateFor(date)
    }));
  }
  if (payNow && restAfter > 0) {
    const acc = paymentAccount(payNow.method, payNow.accountId);
    Store.insert('order_payments', {
      order_id: order.id, contact_id: order.contact_id, kind: 'cobro', date, amount: restAfter,
      method: payNow.method, account_codigo: acc.codigo, ref_doc: refDoc, reference: 'Contado', notes: '', foto_url: '', foto_file_id: ''
    });
  }
  return { refDoc, applied, receivable: payNow ? 0 : restAfter };
}

// Documento imprimible: orden de venta, o nota de venta/entrega si ya se facturó.
export function orderDocument(order) {
  const m = orderMoney(order);
  const contact = order.contact_id ? Store.getById('contacts', order.contact_id) : null;
  const fs = Store.getFiscalSettings();
  const invoiced = order.status === 'facturada';
  return {
    kind: 'sale',
    title: invoiced ? (isFiscal(order) ? 'Nota de venta' : 'Nota de entrega') : 'Orden de venta',
    number: invoiced ? order.invoice_ref : order.order_number,
    date: invoiced ? order.invoice_date : order.date,
    client: contact ? { name: contact.name, rif: contact.rif, address: contact.address, phone: contact.phone, email: contact.email } : { name: order.contact_name },
    items: orderItems(order).map(it => ({ name: it.name, sku: it.sku, qty: it.qty, unit: 'unidad', unitPrice: it.unitPrice, listPrice: it.listPrice, discountPct: it.discountPct })),
    notes: order.notes,
    fiscal: {
      rows: taxSummaryRows(m, { ...fs, ivaEnabled: isFiscal(order) })
        .concat(m.advances > 0 ? [['Anticipos recibidos', -m.advances]] : [])
        .concat(m.withheld > 0 ? [['IVA retenido por el cliente', -m.withheld]] : []),
      total: m.total, rate: Store.usdRateFor(invoiced ? order.invoice_date : order.date),
      invoice: order.invoice_number, control: order.control_number
    },
    terms: Store.getBusinessProfile().terms
  };
}
