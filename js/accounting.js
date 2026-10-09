// Motor de partida doble, estilo LegalYa: un solo catálogo de cuentas (códigos
// jerárquicos con punto, 6 tipos) y un diario plano (una fila = una línea de
// Debe o Haber, sin encabezado de asiento). Módulo puro, sin dependencia de Store.

// El tipo se infiere del primer dígito del código, igual que LegalYa.
export const ACCOUNT_TYPES = [
  { digit: '1', value: 'Activo', nature: 'Deudora' },
  { digit: '2', value: 'Pasivo', nature: 'Acreedora' },
  { digit: '3', value: 'Patrimonio', nature: 'Acreedora' },
  { digit: '4', value: 'Ingreso', nature: 'Acreedora' },
  { digit: '5', value: 'Costo', nature: 'Deudora' },
  { digit: '6', value: 'Gasto', nature: 'Deudora' }
];

export function inferirTipo(codigo) {
  const digit = String(codigo || '').charAt(0);
  const t = ACCOUNT_TYPES.find(t => t.digit === digit);
  return t ? t.value : 'Gasto';
}

export function naturalezaForTipo(tipo) {
  const t = ACCOUNT_TYPES.find(t => t.value === tipo);
  return t ? t.nature : 'Deudora';
}

// tipo_especifico: lo que usan Ingresos/Gastos/Ventas/Costos para filtrar qué
// cuentas mostrar en cada selector (cuentas de pago = Efectivo/Banco,
// por cobrar = Clientes, por pagar = Proveedores). El stock del inventario es
// solo de referencia (campo en products), no una cuenta contable.
export const TIPO_ESPECIFICO_OPTIONS = {
  Activo: ['Efectivo', 'Banco', 'Clientes', 'Otros'],
  Pasivo: ['Proveedores', 'Otros'],
  Patrimonio: ['Otros'],
  Ingreso: ['Otros'],
  Costo: ['Otros'],
  Gasto: ['Otros']
};

// Catálogo sugerido (semilla). Se siembra por acción explícita del usuario, no en el boot.
export const CHART_OF_ACCOUNTS = [
  { codigo: '1.1.01.01', nombre: 'Caja', tipo_especifico: 'Efectivo' },
  { codigo: '1.1.01.02', nombre: 'Bancos', tipo_especifico: 'Banco' },
  { codigo: '1.1.02.01', nombre: 'Cuentas por Cobrar Clientes', tipo_especifico: 'Clientes' },
  { codigo: '1.1.03.01', nombre: 'Anticipo a Proveedores', tipo_especifico: 'Otros' },
  { codigo: '2.1.01.01', nombre: 'Proveedores por Pagar', tipo_especifico: 'Proveedores' },
  { codigo: '2.1.02.01', nombre: 'Acreedores por Importación', tipo_especifico: 'Proveedores' },
  { codigo: '2.1.03.01', nombre: 'Préstamos por Pagar', tipo_especifico: 'Otros' },
  { codigo: '3.1.01.01', nombre: 'Capital Social', tipo_especifico: 'Otros' },
  { codigo: '3.1.02.01', nombre: 'Utilidades Retenidas', tipo_especifico: 'Otros' },
  { codigo: '4.1.01.01', nombre: 'Ingresos por Ventas', tipo_especifico: 'Otros' },
  { codigo: '4.1.02.01', nombre: 'Préstamos Recibidos', tipo_especifico: 'Otros' },
  { codigo: '4.1.03.01', nombre: 'Otros Ingresos', tipo_especifico: 'Otros' },
  { codigo: '5.1.01.01', nombre: 'Costo de Venta', tipo_especifico: 'Otros' },
  { codigo: '5.1.02.01', nombre: 'Costo de Producto', tipo_especifico: 'Otros' },
  { codigo: '5.1.03.01', nombre: 'Costo Logístico', tipo_especifico: 'Otros' },
  { codigo: '5.1.04.01', nombre: 'Otros Costos', tipo_especifico: 'Otros' },
  { codigo: '6.1.01.01', nombre: 'Gastos de Administración y Finanzas', tipo_especifico: 'Otros' },
  { codigo: '6.1.02.01', nombre: 'Gastos de Logística', tipo_especifico: 'Otros' },
  { codigo: '6.1.03.01', nombre: 'Gastos de Ventas', tipo_especifico: 'Otros' },
  { codigo: '6.9.01.01', nombre: 'Diferencias de Redondeo', tipo_especifico: 'Otros' }
];

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Suma Debe/Haber de un lote de líneas de diario.
export function totalsFor(lines) {
  const debit = round2((lines || []).reduce((s, l) => s + (Number(l.debit) || 0), 0));
  const credit = round2((lines || []).reduce((s, l) => s + (Number(l.credit) || 0), 0));
  return { debit, credit, diff: round2(debit - credit) };
}

// Si el lote no balancea por culpa de centavos de redondeo, agrega una línea
// contra "Diferencias de Redondeo" en vez de bloquear el guardado — mismo
// parche que el DIF_CAMB de LegalYa (sin el componente de tipo de cambio,
// porque aquí todo es USD).
export function withRoundingPlug(lines, diffAccount, entryDate, refDoc) {
  const { diff } = totalsFor(lines);
  if (Math.abs(diff) < 0.01) return lines;
  const plug = {
    entry_date: entryDate,
    codigo_cuenta: diffAccount ? diffAccount.codigo : '',
    cuenta_contable: diffAccount ? diffAccount.nombre : 'Diferencias de Redondeo',
    concepto: 'Ajuste por redondeo',
    debit: diff < 0 ? Math.abs(diff) : 0,
    credit: diff > 0 ? diff : 0,
    ref_doc: refDoc,
    cantidad: 0,
    unidad: 'monto',
    precio_venta: 0,
    codigo_barra: ''
  };
  return [...lines, plug];
}

// Conceptos del maestro de costos que se mapean a cuentas al cerrar un contenedor.
export const CLOSING_MAPPING_FIELDS = [
  { key: 'fob_account_id', label: 'FOB de mercancía' },
  { key: 'ocean_freight_account_id', label: 'Flete marítimo' },
  { key: 'insurance_account_id', label: 'Seguro' },
  { key: 'tariff_account_id', label: 'Arancel' },
  { key: 'port_fee_account_id', label: 'Tasa portuaria' },
  { key: 'customs_broker_account_id', label: 'Agente aduanal' },
  { key: 'other_account_id', label: 'Otros gastos (flete terrestre, aduana, operación)' },
  { key: 'vat_account_id', label: 'IVA de importación (acreditable)' },
  { key: 'payable_account_id', label: 'Contrapartida — Contenedores por Pagar' }
];

export function isClosingMappingComplete(mapping) {
  if (!mapping) return false;
  return CLOSING_MAPPING_FIELDS.every(f => mapping[f.key]);
}

// Construye las líneas del asiento de cierre de un contenedor. mapping = { campo: account_id },
// accountsById = Map<id, account> para resolver codigo_cuenta/cuenta_contable (texto, no FK).
export function buildContainerClosingLines(container, summary, mapping, accountsById) {
  const lines = [];
  const map = mapping || {};
  const entryDate = container.operation_date;
  const refDoc = `CIE-${String(container.bl_number || container.id).slice(-6)}`;

  const debit = (accountId, amount, concepto) => {
    const amt = round2(amount);
    const acc = accountsById.get(accountId);
    if (acc && amt > 0) {
      lines.push({ entry_date: entryDate, codigo_cuenta: acc.codigo, cuenta_contable: acc.nombre, concepto, debit: amt, credit: 0, ref_doc: refDoc });
    }
  };

  debit(map.fob_account_id, summary.fob, 'FOB mercancía importada');
  debit(map.ocean_freight_account_id, Number(container.ocean_freight) || 0, 'Flete marítimo');
  debit(map.insurance_account_id, summary.insurance, 'Seguro de la mercancía');
  debit(map.tariff_account_id, summary.tariff, 'Arancel de importación');
  debit(map.port_fee_account_id, summary.portFee, 'Tasa portuaria');
  debit(map.customs_broker_account_id, Number(container.customs_broker_fee) || 0, 'Honorarios agente aduanal');
  debit(map.other_account_id, summary.other, 'Flete terrestre, gastos aduanales y operativos');
  debit(map.vat_account_id, summary.vat, 'IVA acreditable de importación');

  // El crédito se fuerza a ser exactamente la suma de los débitos ya redondeados,
  // para blindar el asiento contra desajustes de centavos por redondeo independiente.
  const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const payableAcc = accountsById.get(map.payable_account_id);
  if (payableAcc && totalDebit > 0) {
    lines.push({ entry_date: entryDate, codigo_cuenta: payableAcc.codigo, cuenta_contable: payableAcc.nombre, concepto: 'Total por pagar — costeo de importación', debit: 0, credit: totalDebit, ref_doc: refDoc });
  }
  return lines;
}

// ============================================
// Ingresos, Gastos e Inventario — construcción de líneas de diario.
// Cada builder recibe las cuentas reales ya resueltas (objetos {id, codigo, nombre}),
// no solo sus ids, para poder escribir codigo_cuenta/cuenta_contable como texto.
// ============================================

// extra = { cantidad, unidad, precio_venta, codigo_barra } — columnas "anchas"
// estilo LegalYa (addTransaction); las líneas de pago/contrapartida van sin
// cantidad real (cantidad: 0, unidad: 'monto'), igual que allá.
function line(entryDate, account, debit, credit, concepto, refDoc, entidad, extra) {
  const ex = extra || {};
  return {
    entry_date: entryDate,
    codigo_cuenta: account ? account.codigo : '',
    cuenta_contable: account ? account.nombre : '',
    concepto,
    debit: round2(debit),
    credit: round2(credit),
    ref_doc: refDoc,
    entidad: entidad || '',
    cantidad: ex.cantidad != null ? ex.cantidad : 0,
    unidad: ex.unidad || 'monto',
    precio_venta: ex.precio_venta != null ? round2(ex.precio_venta) : 0,
    codigo_barra: ex.codigo_barra || ''
  };
}

// data = { date, total, concepto, entidad, refDoc, paymentAccount (Efectivo/Banco/Clientes), revenueAccount }
// Una venta SIEMPRE son solo estas 2 líneas — el inventario es de referencia
// (stock/avg_cost en products), nunca una cuenta de activo que se toque aquí.
// data.sale = { qty, unidad, unitPrice } solo aporta metadata (cantidad/precio)
// a la línea de ingreso, para "Top Vendidos" en el Resumen — no genera líneas.
export function buildIncomeLines(data) {
  return [
    line(data.date, data.paymentAccount, data.total, 0, data.concepto, data.refDoc, data.entidad),
    line(data.date, data.revenueAccount, 0, data.total, data.concepto, data.refDoc, data.entidad,
      data.sale ? { cantidad: data.sale.qty, unidad: data.sale.unidad || 'unidades', precio_venta: data.sale.unitPrice } : null)
  ];
}

// data = { date, total, concepto, entidad, refDoc, paymentAccount (Efectivo/Banco/Proveedores), expenseAccount }
export function buildExpenseLines(data) {
  return [
    line(data.date, data.expenseAccount, data.total, 0, data.concepto, data.refDoc, data.entidad),
    line(data.date, data.paymentAccount, 0, data.total, data.concepto, data.refDoc, data.entidad)
  ];
}

// Recepción de mercancía: debita una cuenta de Costo (el inventario físico es
// solo de referencia, no una cuenta de activo) y acredita la forma de pago.
// data = { date, total, concepto, entidad, refDoc, paymentAccount (Efectivo/Banco/Proveedores), costAccount, qty, unidad, codigo_barra }
export function buildReceptionLines(data) {
  const costExtra = { cantidad: data.qty || 0, unidad: data.unidad || 'unidades', codigo_barra: data.codigo_barra || '' };
  return [
    line(data.date, data.costAccount, data.total, 0, data.concepto, data.refDoc, data.entidad, costExtra),
    line(data.date, data.paymentAccount, 0, data.total, data.concepto, data.refDoc, data.entidad)
  ];
}

// Pago de un pasivo (p. ej. Contenedores por Pagar) contra Caja/Banco.
// data = { date, total, concepto, entidad, refDoc, payableAccount, paymentAccount }
export function buildPayableSettlementLines(data) {
  return [
    line(data.date, data.payableAccount, data.total, 0, data.concepto, data.refDoc, data.entidad),
    line(data.date, data.paymentAccount, 0, data.total, data.concepto, data.refDoc, data.entidad)
  ];
}

// Costo como movimiento propio (no ligado a una venta de inventario): debita
// la cuenta de costo elegida (uno de los 4 subtipos: Venta/Producto/Logístico/
// Otros), acredita una cuenta contrapartida cualquiera (Proveedores,
// Inventario, Caja/Banco si fue un gasto de costo pagado de inmediato, etc.).
// data = { date, total, concepto, entidad, refDoc, costAccount, counterAccount }
export function buildCostLines(data) {
  return [
    line(data.date, data.costAccount, data.total, 0, data.concepto, data.refDoc, data.entidad),
    line(data.date, data.counterAccount, 0, data.total, data.concepto, data.refDoc, data.entidad)
  ];
}
