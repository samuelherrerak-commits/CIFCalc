import Store from './store.js';
import { inferirTipo } from './accounting.js';

// Filas planas para el CRM y los Reportes, armadas desde el diario
// (movements). Cada venta tiene una línea de Ingresos por Ventas por producto
// (cantidad, precio_venta, SKU en codigo_barra, costo_unitario y precio_lista)
// y una línea de cobro (Caja/Banco/Cuentas por Cobrar) con el mismo ref_doc.

const PAY_LABEL = { Efectivo: 'Efectivo', Banco: 'Banco', Clientes: 'Crédito' };
const SOURCE_LABEL = {
  expense: 'Gasto', cost: 'Costo', container_close: 'Cierre de contenedor', manual: 'Asiento manual',
  sale: 'Venta', income: 'Ingreso', container_payment: 'Pago de contenedor'
};

export const isSaleItemLine = (m) => m.source === 'sale' && Number(m.cantidad) > 0 && Number(m.precio_venta) > 0 && Number(m.credit) > 0;

export function salesLines() {
  const movements = Store.getAll('movements');
  const products = Store.getAll('products');
  const contacts = Store.getAll('contacts');
  const accounts = Store.getAll('accounts');
  const accByCode = new Map(accounts.map(a => [a.codigo, a]));
  const bySku = new Map(products.filter(p => p.sku_briggs).map(p => [String(p.sku_briggs), p]));
  const byName = new Map();
  for (const p of products) { const k = String(p.name || '').trim(); if (!byName.has(k)) byName.set(k, p); }
  const contactByName = new Map(contacts.map(c => [String(c.name || '').trim(), c]));

  // Forma de pago de cada venta: la línea al debe del mismo ref_doc.
  const payByRef = new Map();
  for (const m of movements) {
    if (m.source !== 'sale' || !(Number(m.debit) > 0) || payByRef.has(m.ref_doc)) continue;
    const acc = accByCode.get(m.codigo_cuenta);
    payByRef.set(m.ref_doc, PAY_LABEL[acc && acc.tipo_especifico] || (acc ? acc.nombre : m.cuenta_contable) || 'Otro');
  }

  return movements.filter(isSaleItemLine).map(m => {
    const name = (String(m.concepto || '').split('|')[1] || '').trim();
    const product = (m.codigo_barra && bySku.get(String(m.codigo_barra))) || byName.get(name) || null;
    const qty = Number(m.cantidad);
    const revenue = Number(m.credit);
    const savedCost = Number(m.costo_unitario) || 0;
    const unitCost = savedCost > 0 ? savedCost : (product ? Number(product.avg_cost) || 0 : 0);
    const unitPrice = Number(m.precio_venta);
    const listPrice = Number(m.precio_lista) > 0 ? Number(m.precio_lista) : unitPrice;
    const contact = contactByName.get(String(m.entidad || '').trim()) || null;
    const date = String(m.entry_date || '').slice(0, 10);
    return {
      refDoc: m.ref_doc, date, month: date.slice(0, 7),
      entidad: m.entidad || 'Sin cliente', contactId: contact ? contact.id : '',
      productId: product ? product.id : '', productName: product ? product.name : (name || 'Producto'),
      sku: product ? product.sku_briggs : (m.codigo_barra || ''),
      category: (product && product.category) || 'Sin categoría',
      collection: (product && product.collection) || 'Sin colección',
      brand: (product && product.brand) || '—',
      foto: product ? product.foto_url : '',
      payment: payByRef.get(m.ref_doc) || 'Otro',
      qty, unitPrice, listPrice, revenue,
      unitCost, cost: qty * unitCost, margin: revenue - qty * unitCost,
      costEstimated: !(savedCost > 0),
      discount: Math.max(0, (listPrice - unitPrice) * qty)
    };
  });
}

// Gastos y costos: cada línea al debe de una cuenta tipo Gasto o Costo.
export function expenseLines() {
  const movements = Store.getAll('movements');
  const accounts = Store.getAll('accounts');
  const accByCode = new Map(accounts.map(a => [a.codigo, a]));
  // Contrapartida (cómo se pagó / a qué se cargó): primera línea al haber del mismo ref_doc.
  const creditByRef = new Map();
  for (const m of movements) {
    if (!(Number(m.credit) > 0) || creditByRef.has(m.ref_doc)) continue;
    const acc = accByCode.get(m.codigo_cuenta);
    creditByRef.set(m.ref_doc, acc ? acc.nombre : (m.cuenta_contable || 'Otro'));
  }
  return movements
    .filter(m => Number(m.debit) > 0)
    .map(m => {
      const acc = accByCode.get(m.codigo_cuenta);
      const tipo = (acc && acc.tipo) || inferirTipo(m.codigo_cuenta);
      return { m, acc, tipo };
    })
    .filter(x => x.tipo === 'Gasto' || x.tipo === 'Costo')
    .map(({ m, acc, tipo }) => {
      const date = String(m.entry_date || '').slice(0, 10);
      return {
        refDoc: m.ref_doc, date, month: date.slice(0, 7), tipo,
        account: acc ? acc.nombre : (m.cuenta_contable || m.codigo_cuenta),
        codigo: m.codigo_cuenta,
        entidad: m.entidad || 'Sin beneficiario',
        concepto: String(m.concepto || '').split('|')[0].trim() || '—',
        origin: SOURCE_LABEL[m.source] || m.source || 'Otro',
        payment: creditByRef.get(m.ref_doc) || '—',
        amount: Number(m.debit)
      };
    });
}

// Resumen por cliente (para la lista del CRM y la ficha).
export function customerStats(lines = salesLines()) {
  const map = new Map();
  for (const l of lines) {
    const key = l.contactId || 'name:' + l.entidad;
    const s = map.get(key) || { revenue: 0, margin: 0, qty: 0, refs: new Set(), last: '', first: '' };
    s.revenue += l.revenue; s.margin += l.margin; s.qty += l.qty; s.refs.add(l.refDoc);
    if (!s.last || l.date > s.last) s.last = l.date;
    if (!s.first || l.date < s.first) s.first = l.date;
    map.set(key, s);
  }
  for (const s of map.values()) { s.orders = s.refs.size; s.avgTicket = s.orders ? s.revenue / s.orders : 0; }
  return map;
}

export function receivableByEntidad() {
  const accounts = Store.getAll('accounts');
  const cxc = new Set(accounts.filter(a => a.tipo_especifico === 'Clientes').map(a => a.codigo));
  const map = new Map();
  for (const m of Store.getAll('movements')) {
    if (!cxc.has(m.codigo_cuenta)) continue;
    const k = String(m.entidad || '').trim();
    map.set(k, (map.get(k) || 0) + (Number(m.debit) || 0) - (Number(m.credit) || 0));
  }
  return map;
}

export const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
