// Ejercicio de prueba: 3 meses de operación de una importadora (agosto a
// octubre 2026) cargados en MODO PRUEBA con las mismas funciones que usan las
// pantallas. Sirve para revisar que todo se registre bien: asientos, libros
// de IVA, inventario, órdenes, costos de contenedores y estados financieros.
// Nunca corre fuera del modo prueba.
import Store from './store.js';
import { CHART_OF_ACCOUNTS, buildCostLines, buildExpenseLines, buildIncomeLines, buildTwoLineEntry } from './accounting.js';
import { computeTax, ivaTipoOf } from './fiscal.js';
import { createOrder, registerPayment, registerDispatch, invoiceOrder, orderMoney } from './orders.js';
import { liquidateIva, payIva } from './iva.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
// Tablas que se vacían antes de cargar el ejercicio (se conserva el plan de
// cuentas y la configuración de la empresa).
const WIPE = ['products', 'contacts', 'containers', 'items', 'movements', 'quotes', 'sales_orders', 'order_payments',
  'dispatches', 'stock_moves', 'fiscal_docs', 'exchange_rates', 'crm_activities', 'promotions'];

export function runDemoExercise() {
  if (!Store.isSandbox()) throw new Error('El ejercicio solo se puede cargar en modo prueba.');
  Store.wipeSandbox(WIPE);
  for (const a of CHART_OF_ACCOUNTS) Store.ensureCatalogAccount(a.codigo);
  const fs = Store.getFiscalSettings();
  const log = [];
  const op = (date, modulo, detalle) => log.push({ n: log.length + 1, date, modulo, detalle });
  const acc = (c) => Store.getAll('accounts').find(a => a.codigo === c) || Store.ensureCatalogAccount(c);
  const BANK = () => acc('1.1.01.02');
  const CASH = () => acc('1.1.01.01');
  const PAY = { banco: BANK, efectivo: CASH, credito: () => acc('2.1.02.01') };

  // ---------- Tasas BCV (diarias, de 420 a 780 Bs/USD) ----------
  const days = [];
  for (let d = new Date(Date.UTC(2026, 7, 1)); d <= new Date(Date.UTC(2026, 9, 31)); d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
  days.forEach((d, i) => { const usd = r2(420 + (360 * i) / (days.length - 1)); Store.saveRates(d, { usd_bcv: usd, eur_bcv: r2(usd * 1.08), usdt: r2(usd * 1.12) }); });

  // ---------- Catálogo ----------
  const P = {};
  const product = (key, sku, name, category, collection, color, price, fob) => {
    P[key] = Store.insert('products', { sku_briggs: sku, name, category, collection, color, sale_price: price, avg_cost: 0, stock: 0, iva_tipo: 'general', fob_unit: fob, units_per_box: 10, box_volume: 0.05, weight_kg: 1, tariff_rate: 15 });
  };
  product('p1', 'BRG-BL-EQU-01-CR', 'Grifo lavamanos Equinox cromado', 'Baño / Lavamanos (Grifería)', 'Equinox', 'Cromado', 109, 38);
  product('p2', 'BRG-BL-ECL-01-NG', 'Grifo lavamanos Eclipse negro', 'Baño / Lavamanos (Grifería)', 'Eclipse', 'Negro', 129, 45);
  product('p3', 'BRG-KC-EM-01-CR', 'Grifo de cocina extraíble cromado', 'Cocina (Kitchen)', '', 'Cromado', 149, 52);
  product('p4', 'BRG-SD-EM-01-GL', 'Sistema de ducha integrado gold', 'Sistema de Ducha Integrado', '', 'Gold', 349, 120);
  product('p5', 'BRG-RD-EM-01-CR', 'Regadera cuadrada 30 cm cromada', 'Regaderas / Cabezas de Ducha', '', 'Cromado', 69, 22);
  product('p6', 'BRG-AC-EM-01-BN', 'Set de accesorios de baño níquel', 'Accesorios de Baño', '', 'Brushed Nickel', 89, 30);
  op('2026-08-01', 'Catálogo', '6 productos con precio de venta');

  // ---------- Contactos ----------
  const C = {};
  const contact = (key, name, rif, type, ret = 0) => { C[key] = Store.insert('contacts', { name, rif, type, iva_retention_pct: ret, phone: '', email: '', address: 'Caracas' }); };
  contact('k1', 'Distribuidora El Constructor C.A.', 'J-30111222-3', 'cliente', 75);
  contact('k2', 'Comercializadora Grifos del Centro C.A.', 'J-40222333-4', 'cliente');
  contact('k3', 'Ferretería La Llave C.A.', 'J-29333444-5', 'cliente');
  contact('k4', 'Inversiones Baños Modernos C.A.', 'J-31444555-6', 'cliente', 75);
  contact('s1', 'Ningbo Sanitary Co. Ltd.', 'EXT-0001', 'proveedor');
  contact('s2', 'Naviera Atlántico C.A.', 'J-50111000-1', 'proveedor');
  contact('s3', 'Agencia Aduanal Rápida C.A.', 'J-50222000-2', 'proveedor');
  contact('s4', 'Inmobiliaria Centro Plaza C.A.', 'J-50333000-3', 'proveedor');
  contact('s5', 'Agencia Creativa Digital C.A.', 'J-50444000-4', 'proveedor');
  op('2026-08-01', 'Clientes', '4 clientes (2 contribuyentes especiales con retención 75%) y 5 proveedores');

  // ---------- Helpers: cada uno replica lo que hace su pantalla ----------
  let invSeq = 500;
  const purchaseDoc = (date, supplier, net, tax, refDoc, concepto) => {
    invSeq++;
    Store.insert('fiscal_docs', Store.newFiscalDoc({
      book: 'compras', date, doc_type: 'factura', invoice_number: `A-${invSeq}`, control_number: `00-${String(invSeq).padStart(6, '0')}`,
      rif: supplier.rif, name: supplier.name, total: r2(net + tax), exempt: 0, base_general: r2(net), tax_general: r2(tax),
      base_reducida: 0, tax_reducida: 0, ref_doc: refDoc, tasa_bcv: Store.usdRateFor(date), notes: concepto
    }));
  };
  const cost = (date, code, amount, concepto, supplier, container, withIva = false) => {
    const refDoc = Store.uniqueRef('COS');
    let lines = buildCostLines({ date, total: amount, concepto, entidad: supplier.name, refDoc, costAccount: acc(code), counterAccount: BANK() });
    const tax = withIva ? r2(amount * 0.16) : 0;
    if (tax) lines = lines.concat(buildTwoLineEntry({ date, total: tax, concepto: `${concepto} | IVA crédito fiscal`, entidad: supplier.name, refDoc, debitAccount: acc('1.1.03.01'), creditAccount: BANK() }));
    Store.postJournalRows(lines, { source: 'cost', sourceRef: container ? container.id : null });
    if (tax) purchaseDoc(date, supplier, amount, tax, refDoc, concepto);
    if (container) Store.applyRealCosts();
    op(date, 'Costos', `${concepto} $${amount}${tax ? ' + IVA' : ''}${container ? ' → ' + container.bl_number : ''}`);
  };
  const expense = (date, code, amount, concepto, supplier, pay, withIva = false) => {
    const refDoc = Store.uniqueRef('GST');
    const payAcc = PAY[pay]();
    let lines = buildExpenseLines({ date, total: amount, concepto, entidad: supplier ? supplier.name : '', refDoc, paymentAccount: payAcc, expenseAccount: acc(code) });
    const tax = withIva ? r2(amount * 0.16) : 0;
    if (tax) lines = lines.concat(buildTwoLineEntry({ date, total: tax, concepto: `${concepto} | IVA crédito fiscal`, entidad: supplier.name, refDoc, debitAccount: acc('1.1.03.01'), creditAccount: payAcc }));
    Store.postJournalRows(lines, { source: 'expense' });
    if (tax) purchaseDoc(date, supplier, amount, tax, refDoc, concepto);
    op(date, 'Gastos', `${concepto} $${amount}${tax ? ' + IVA' : ''} (${pay})`);
  };
  const payable = (date, supplier, amount) => {
    const refDoc = Store.uniqueRef('ABP');
    Store.postJournalRows(buildTwoLineEntry({ date, total: amount, concepto: `Abono a ${supplier.name}`, entidad: supplier.name, refDoc, debitAccount: acc('2.1.02.01'), creditAccount: BANK() }), { source: 'payable_settlement' });
    op(date, 'Proveedores por pagar', `Abono a ${supplier.name} $${amount}`);
  };
  const otherIncome = (date, amount, concepto, pay) => {
    const refDoc = Store.uniqueRef('ING');
    Store.postJournalRows(buildIncomeLines({ date, total: amount, concepto, entidad: '', refDoc, paymentAccount: PAY[pay](), revenueAccount: acc('4.1.02.01') }), { source: 'income' });
    op(date, 'Otros ingresos', `${concepto} $${amount}`);
  };
  const manual = (date, concepto, debitCode, creditCode, amount) => {
    const refDoc = Store.uniqueRef('MAN');
    Store.postJournalRows(buildTwoLineEntry({ date, total: amount, concepto, entidad: '', refDoc, debitAccount: acc(debitCode), creditAccount: acc(creditCode) }), { source: 'manual' });
    op(date, 'Libro diario', `Asiento manual: ${concepto} $${amount}`);
  };
  const container = async (bl, date, cfg, lines) => {
    const items = lines.map(([k, qty]) => {
      const p = P[k];
      return { product_id: p.id, name: p.name, sku_briggs: p.sku_briggs, qty, units_per_box: 10, box_volume: 0.05, weight_kg: 1, fob_unit: p.fob_unit, tariff_rate: 15, gain_margin: 0 };
    });
    const { container: c, items: saved } = await Store.saveContainerWithItems({ bl_number: bl, operation_date: date, status: 'draft', container_capacity: 67, vat_rate: 16, insurance_enabled: true, insurance_rate: 0.5, port_fee_rate: 1, ...cfg }, items);
    op(date, 'Contenedores', `${bl}: estimado con ${lines.length} productos`);
    return { c, saved };
  };
  const setStatus = async (ct, status, date) => {
    const fresh = Store.getById('containers', ct.c.id);
    await Store.saveContainerWithItems({ ...fresh, status }, Store.getItemsByContainer(ct.c.id));
    op(date, 'Contenedores', `${ct.c.bl_number}: ${status === 'in_transit' ? 'en proceso' : 'completado (compra)'}`);
  };
  const reception = (date, ct, ref) => {
    const items = Store.getItemsByContainer(ct.c.id).map(it => ({ productId: it.product_id, name: it.name, sku: it.sku_briggs, qty: Number(it.qty) }));
    const mv = Store.registerStockMove({ kind: 'recepcion', date, containerId: ct.c.id, reference: ref, items });
    op(date, 'Existencias', `Recepción ${mv.move_number} de ${ct.c.bl_number} (${items.reduce((s, i) => s + i.qty, 0)} unid.)`);
  };
  const quoteLines = (lines) => lines.map(([k, qty, disc = 0]) => {
    const p = P[k];
    return { productId: p.id, name: p.name, sku_briggs: p.sku_briggs, foto_url: '', qty, listPrice: p.sale_price, discountPct: disc, unitPrice: r2(p.sale_price * (1 - disc / 100)) };
  });
  const quote = (date, client, lines, concepto) => {
    const items = quoteLines(lines);
    const t = computeTax(items.map(it => ({ amount: it.qty * it.unitPrice, tipo: 'general' })), fs);
    const q = Store.insert('quotes', Store.newQuote({ date, valid_until: date, contact_id: C[client].id, contact_name: C[client].name, concepto, items: JSON.stringify(items), total: t.total }));
    op(date, 'Presupuestos', `${q.quote_number} a ${C[client].name}: $${t.total}`);
    return q;
  };
  // Igual que "Convertir en orden" en Presupuestos.
  const convert = (q, date, fiscal = true) => {
    const items = Store.getQuoteItems(q).map(it => ({
      productId: it.productId, name: it.name, sku: it.sku_briggs || '', qty: Number(it.qty),
      listPrice: Number(it.listPrice), discountPct: Number(it.discountPct) || 0, unitPrice: Number(it.unitPrice),
      ivaTipo: ivaTipoOf(Store.getById('products', it.productId)), dispatched: 0
    }));
    const contactRec = Store.getById('contacts', q.contact_id);
    Store.update('quotes', { id: q.id, status: 'aprobado' });
    const o = createOrder({ date, contact: contactRec, items, fiscal, notes: q.concepto || '', quoteId: q.id });
    Store.update('quotes', { id: q.id, status: 'convertido', converted_ref: o.order_number });
    op(date, 'Órdenes de venta', `${o.order_number} desde ${q.quote_number}${fiscal ? '' : ' (sin factura)'}`);
    return o;
  };
  const O = (o) => Store.getById('sales_orders', o.id);
  const pay = (o, date, amount, method, reference) => {
    const p = registerPayment(O(o), { date, amount: r2(amount), method, reference });
    op(date, 'Órdenes de venta', `${p.kind === 'anticipo' ? 'Anticipo' : 'Cobro'} ${O(o).order_number} $${r2(amount)} (${method})`);
  };
  const dispatch = (o, date, qty) => {
    const map = {};
    for (const [k, q] of qty) map[P[k].id] = q;
    const d = registerDispatch(O(o), { date, qtyByProduct: map, notes: 'Transporte propio' });
    op(date, 'Despachos', `${d.dispatch_number} de ${O(o).order_number} (${qty.reduce((s, x) => s + x[1], 0)} unid.)`);
  };
  let saleInv = 100;
  const invoice = (o, date) => {
    const fiscal = O(o).fiscal !== false && String(O(o).fiscal) !== 'false';
    saleInv++;
    const res = invoiceOrder(O(o), { date, invoiceNumber: fiscal ? String(saleInv).padStart(8, '0') : '', controlNumber: fiscal ? `00-${String(saleInv).padStart(6, '0')}` : '' });
    op(date, 'Facturación', `${fiscal ? 'Factura' : 'Nota de entrega'} ${O(o).order_number} → por cobrar $${res.receivable}`);
  };
  const balance = (o) => orderMoney(O(o)).balance;
  const liquidate = (month, date) => { const d = liquidateIva(month); op(date, 'IVA', `Liquidación ${month}: a pagar $${d ? d.c90 : 0}`); };
  const payTax = (month, date) => { const v = payIva(month, date); op(date, 'IVA', `Pago al SENIAT ${month} $${v || 0}`); };

  return (async () => {
    // ===================== AGOSTO =====================
    manual('2026-08-01', 'Aporte de capital de los socios', '1.1.01.02', '3.1.01.01', 200000);
    const c1 = await container('MSKU-1001', '2026-08-03', { ocean_freight: 4500, inland_freight: 600, customs_expenses: 400, customs_broker_fee: 800, op_expenses: 200 },
      [['p1', 300], ['p2', 200], ['p3', 150], ['p4', 60], ['p5', 400]]);
    await setStatus(c1, 'in_transit', '2026-08-03');
    cost('2026-08-04', '5.1.01.01', 13260, 'Anticipo 30% FOB MSKU-1001', C.s1, c1.c);
    cost('2026-08-05', '5.1.03.01', 221, 'Póliza de seguro MSKU-1001', C.s2, c1.c);
    expense('2026-08-05', '6.1.01.01', 1500, 'Alquiler de oficina agosto', C.s4, 'banco', true);
    expense('2026-08-06', '6.1.03.01', 400, 'Publicidad en redes agosto', C.s5, 'credito', true);
    const q1 = quote('2026-08-10', 'k1', [['p1', 100, 5], ['p3', 50, 5]], 'Pedido apertura de tienda');
    const o1 = convert(q1, '2026-08-12');
    pay(o1, '2026-08-13', 0.5 * O(o1).total, 'banco', 'TRF 10023');
    const q2 = quote('2026-08-15', 'k2', [['p2', 80], ['p5', 150]], 'Reposición de inventario');
    const o2 = convert(q2, '2026-08-18');
    pay(o2, '2026-08-19', 0.3 * O(o2).total, 'banco', 'TRF 55120');
    const q3 = quote('2026-08-20', 'k3', [['p4', 10]], 'Cotización sistemas de ducha');
    cost('2026-08-20', '5.1.01.01', 30940, 'Saldo 70% FOB MSKU-1001', C.s1, c1.c);
    cost('2026-08-21', '5.1.02.01', 4700, 'Flete marítimo MSKU-1001', C.s2, c1.c);
    cost('2026-08-24', '5.1.04.01', 6800, 'Arancel de importación MSKU-1001', C.s3, c1.c);
    cost('2026-08-24', '5.1.05.01', 520, 'Tasa portuaria MSKU-1001', C.s3, c1.c);
    cost('2026-08-25', '5.1.06.01', 800, 'Honorarios agente aduanal MSKU-1001', C.s3, c1.c, true);
    await setStatus(c1, 'closed', '2026-08-25');
    cost('2026-08-26', '5.1.07.01', 1150, 'Flete terrestre y gastos de aduana MSKU-1001', C.s3, c1.c);
    reception('2026-08-26', c1, 'Guía de despacho 4410');
    dispatch(o1, '2026-08-27', [['p1', 100], ['p3', 30]]);
    invoice(o1, '2026-08-28');
    Store.update('quotes', { id: q3.id, status: 'rechazado' }); op('2026-08-28', 'Presupuestos', `${q3.quote_number} rechazado por el cliente`);
    dispatch(o2, '2026-08-29', [['p2', 80], ['p5', 150]]);
    expense('2026-08-30', '6.1.01.01', 4200, 'Nómina agosto', null, 'banco');
    expense('2026-08-31', '6.1.01.01', 280, 'Servicios (luz, agua, internet) agosto', null, 'efectivo');
    invoice(o2, '2026-08-31');
    liquidate('2026-08', '2026-08-31');

    // ===================== SEPTIEMBRE =====================
    const q4 = quote('2026-09-03', 'k4', [['p4', 30, 3], ['p1', 50, 3]], 'Proyecto residencial Los Robles');
    const o3 = convert(q4, '2026-09-05');
    pay(o1, '2026-09-05', balance(o1), 'banco', 'TRF 10087');
    pay(o3, '2026-09-06', 0.4 * O(o3).total, 'banco', 'TRF 77001');
    dispatch(o1, '2026-09-06', [['p3', 20]]);
    expense('2026-09-05', '6.1.01.01', 1500, 'Alquiler de oficina septiembre', C.s4, 'banco', true);
    const c2 = await container('MSKU-1002', '2026-09-08', { ocean_freight: 4200, inland_freight: 500, customs_expenses: 300, customs_broker_fee: 800, op_expenses: 150 },
      [['p1', 200], ['p3', 200], ['p4', 80], ['p6', 300]]);
    await setStatus(c2, 'in_transit', '2026-09-08');
    cost('2026-09-09', '5.1.01.01', 36600, 'Pago FOB MSKU-1002', C.s1, c2.c);
    dispatch(o3, '2026-09-10', [['p1', 50]]);
    pay(o2, '2026-09-12', 0.5 * balance(o2), 'banco', 'TRF 55301');
    const q5 = quote('2026-09-14', 'k2', [['p5', 100]], 'Venta sin factura');
    payable('2026-09-15', C.s5, 464);
    payTax('2026-08', '2026-09-15');
    const o4 = convert(q5, '2026-09-16', false);
    pay(o4, '2026-09-16', O(o4).total, 'efectivo', 'Efectivo');
    dispatch(o4, '2026-09-17', [['p5', 100]]);
    invoice(o4, '2026-09-17');
    cost('2026-09-18', '5.1.02.01', 4300, 'Flete marítimo MSKU-1002', C.s2, c2.c);
    const q6 = quote('2026-09-20', 'k3', [['p6', 100], ['p3', 60]], 'Pedido temporada');
    Store.registerStockMove({ kind: 'ajuste', date: '2026-09-22', reference: 'Avería en almacén', items: [{ productId: P.p5.id, name: P.p5.name, sku: P.p5.sku_briggs, qty: -2 }] });
    op('2026-09-22', 'Existencias', 'Ajuste −2 regaderas por avería');
    expense('2026-09-24', '6.1.02.01', 350, 'Transporte de mercancía a clientes', null, 'efectivo');
    pay(o2, '2026-09-26', balance(o2), 'banco', 'TRF 55399');
    cost('2026-09-27', '5.1.04.01', 5900, 'Arancel de importación MSKU-1002', C.s3, c2.c);
    cost('2026-09-27', '5.1.05.01', 450, 'Tasa portuaria MSKU-1002', C.s3, c2.c);
    cost('2026-09-28', '5.1.06.01', 800, 'Honorarios agente aduanal MSKU-1002', C.s3, c2.c, true);
    await setStatus(c2, 'closed', '2026-09-29');
    cost('2026-09-29', '5.1.07.01', 900, 'Flete terrestre y gastos de aduana MSKU-1002', C.s3, c2.c);
    reception('2026-09-30', c2, 'Guía de despacho 4588');
    dispatch(o3, '2026-09-30', [['p4', 30]]);
    invoice(o3, '2026-09-30');
    expense('2026-09-30', '6.1.01.01', 4200, 'Nómina septiembre', null, 'banco');
    expense('2026-09-30', '6.1.01.01', 290, 'Servicios (luz, agua, internet) septiembre', null, 'efectivo');
    otherIncome('2026-09-30', 45, 'Intereses de cuenta bancaria', 'banco');
    liquidate('2026-09', '2026-09-30');

    // ===================== OCTUBRE =====================
    manual('2026-10-01', 'Préstamo bancario a 12 meses', '1.1.01.02', '2.1.03.01', 20000);
    const q7 = quote('2026-10-02', 'k1', [['p6', 120, 5], ['p4', 20, 5], ['p1', 40, 5]], 'Segundo pedido');
    const o5 = convert(q7, '2026-10-03');
    pay(o5, '2026-10-04', 0.5 * O(o5).total, 'banco', 'TRF 10240');
    expense('2026-10-05', '6.1.01.01', 1500, 'Alquiler de oficina octubre', C.s4, 'banco', true);
    expense('2026-10-05', '6.1.03.01', 600, 'Campaña de publicidad octubre', C.s5, 'credito', true);
    pay(o3, '2026-10-08', balance(o3), 'banco', 'TRF 77140');
    dispatch(o5, '2026-10-10', [['p6', 120], ['p1', 40]]);
    const q8 = quote('2026-10-12', 'k4', [['p3', 80]], 'Pedido grifos de cocina');
    const o6 = convert(q8, '2026-10-13');
    pay(o6, '2026-10-14', 0.2 * O(o6).total, 'banco', 'TRF 77310');
    payTax('2026-09', '2026-10-15');
    const c3 = await container('MSKU-1003', '2026-10-15', { ocean_freight: 4000, inland_freight: 500, customs_expenses: 300, customs_broker_fee: 800, op_expenses: 150 },
      [['p2', 300], ['p5', 500], ['p6', 200]]);
    await setStatus(c3, 'in_transit', '2026-10-15');
    cost('2026-10-16', '5.1.01.01', 9150, 'Anticipo 30% FOB MSKU-1003', C.s1, c3.c);
    dispatch(o5, '2026-10-18', [['p4', 20]]);
    invoice(o5, '2026-10-20');
    const q9 = quote('2026-10-22', 'k2', [['p2', 50]], 'Grifos Eclipse (llegan en MSKU-1003)');
    otherIncome('2026-10-25', 120, 'Venta de cajas y material de empaque', 'efectivo');
    payable('2026-10-28', C.s5, 300);
    pay(o5, '2026-10-30', 0.5 * balance(o5), 'banco', 'TRF 10301');
    expense('2026-10-31', '6.1.01.01', 4200, 'Nómina octubre', null, 'banco');
    expense('2026-10-31', '6.1.01.01', 300, 'Servicios (luz, agua, internet) octubre', null, 'efectivo');
    liquidate('2026-10', '2026-10-31');
    void q6; void q9;
    return log;
  })();
}
