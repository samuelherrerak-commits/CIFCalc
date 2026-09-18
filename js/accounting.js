// Motor de partida doble: validación de balance y construcción de pólizas automáticas.
// Módulo puro, sin dependencia de Store, para poder probarlo y reutilizarlo desde la UI y desde el hook automático.

export const ACCOUNT_TYPES = [
  { value: 'activo_circulante', label: 'Activo Circulante', group: 'Activo', nature: 'deudora' },
  { value: 'activo_fijo', label: 'Activo Fijo', group: 'Activo', nature: 'deudora' },
  { value: 'pasivo_circulante', label: 'Pasivo Circulante', group: 'Pasivo', nature: 'acreedora' },
  { value: 'pasivo_fijo', label: 'Pasivo Fijo', group: 'Pasivo', nature: 'acreedora' },
  { value: 'capital', label: 'Capital', group: 'Capital', nature: 'acreedora' },
  { value: 'ingreso_ventas', label: 'Ingresos por Ventas', group: 'Ingresos', nature: 'acreedora' },
  { value: 'ingreso_otros', label: 'Otros Ingresos', group: 'Ingresos', nature: 'acreedora' },
  { value: 'gasto_logistica', label: 'Gastos de Logística', group: 'Gastos', nature: 'deudora' },
  { value: 'gasto_ventas', label: 'Gastos de Ventas', group: 'Gastos', nature: 'deudora' },
  { value: 'gasto_admin', label: 'Gastos de Administración y Finanzas', group: 'Gastos', nature: 'deudora' },
  { value: 'gasto_otros', label: 'Otros Gastos', group: 'Gastos', nature: 'deudora' }
];

export function natureForType(type) {
  const t = ACCOUNT_TYPES.find(t => t.value === type);
  return t ? t.nature : 'deudora';
}

export function labelForType(type) {
  const t = ACCOUNT_TYPES.find(t => t.value === type);
  return t ? t.label : type;
}

// Catálogo de cuentas sugerido (semilla). Se siembra por acción explícita del usuario, no en el boot.
export const SEED_ACCOUNTS = [
  { code: '1001', name: 'Caja y Bancos', type: 'activo_circulante' },
  { code: '1002', name: 'Clientes / Cuentas por Cobrar', type: 'activo_circulante' },
  { code: '1003', name: 'IVA Acreditable', type: 'activo_circulante' },
  { code: '1004', name: 'Inventario de Mercancías en Tránsito (Importaciones)', type: 'activo_circulante' },
  { code: '1005', name: 'Inventario de Mercancías Disponibles para la Venta', type: 'activo_circulante' },
  { code: '1006', name: 'Anticipo a Proveedores', type: 'activo_circulante' },
  { code: '1007', name: 'Préstamos Otorgados (por Cobrar)', type: 'activo_circulante' },
  { code: '1501', name: 'Mobiliario y Equipo de Oficina', type: 'activo_fijo' },
  { code: '1502', name: 'Equipo de Transporte', type: 'activo_fijo' },
  { code: '1503', name: 'Equipo de Cómputo', type: 'activo_fijo' },
  { code: '2001', name: 'Proveedores Nacionales', type: 'pasivo_circulante' },
  { code: '2002', name: 'Acreedores por Importación', type: 'pasivo_circulante' },
  { code: '2003', name: 'IVA por Pagar (ventas locales)', type: 'pasivo_circulante' },
  { code: '2004', name: 'Impuestos por Pagar', type: 'pasivo_circulante' },
  { code: '2005', name: 'Préstamos por Pagar — Corto Plazo', type: 'pasivo_circulante' },
  { code: '2501', name: 'Préstamos por Pagar — Largo Plazo', type: 'pasivo_fijo' },
  { code: '3001', name: 'Capital Social', type: 'capital' },
  { code: '3002', name: 'Utilidades Retenidas', type: 'capital' },
  { code: '3003', name: 'Resultado del Ejercicio', type: 'capital' },
  { code: '4001', name: 'Ventas Nacionales', type: 'ingreso_ventas' },
  { code: '4002', name: 'Ventas de Exportación', type: 'ingreso_ventas' },
  { code: '4501', name: 'Otros Ingresos', type: 'ingreso_otros' },
  { code: '4502', name: 'Ingresos por Intereses (Préstamos Otorgados)', type: 'ingreso_otros' },
  { code: '5001', name: 'Fletes y Distribución Nacional', type: 'gasto_logistica' },
  { code: '5002', name: 'Almacenaje y Bodega', type: 'gasto_logistica' },
  { code: '5003', name: 'Mermas y Faltantes de Inventario', type: 'gasto_logistica' },
  { code: '5501', name: 'Comisiones sobre Ventas', type: 'gasto_ventas' },
  { code: '5502', name: 'Publicidad y Marketing', type: 'gasto_ventas' },
  { code: '5503', name: 'Fletes sobre Ventas', type: 'gasto_ventas' },
  { code: '6001', name: 'Sueldos y Salarios Administrativos', type: 'gasto_admin' },
  { code: '6002', name: 'Renta de Oficina', type: 'gasto_admin' },
  { code: '6003', name: 'Honorarios Profesionales', type: 'gasto_admin' },
  { code: '6004', name: 'Comisiones y Gastos Bancarios', type: 'gasto_admin' },
  { code: '6005', name: 'Intereses Pagados', type: 'gasto_admin' },
  { code: '6501', name: 'Otros Gastos', type: 'gasto_otros' }
];

// Conceptos del maestro de costos que se mapean a cuentas configurables al cerrar un contenedor.
export const CLOSING_MAPPING_FIELDS = [
  { key: 'fob_account_id', label: 'FOB de mercancía' },
  { key: 'ocean_freight_account_id', label: 'Flete marítimo' },
  { key: 'insurance_account_id', label: 'Seguro' },
  { key: 'tariff_account_id', label: 'Arancel' },
  { key: 'port_fee_account_id', label: 'Tasa portuaria' },
  { key: 'customs_broker_account_id', label: 'Agente aduanal' },
  { key: 'other_account_id', label: 'Otros gastos (flete terrestre, aduana, operación)' },
  { key: 'vat_account_id', label: 'IVA de importación (acreditable)' },
  { key: 'payable_account_id', label: 'Contrapartida — Acreedores por Importación' }
];

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Valida partida doble: al menos 2 líneas con cuenta y monto, ninguna línea con Debe y Haber a la vez,
// y que la suma del Debe sea igual a la suma del Haber (tolerancia de un centavo).
export function validateJournalBalance(lines) {
  const active = (lines || []).filter(l => l.account_id && (round2(l.debit) + round2(l.credit)) > 0);

  if (active.length < 2) {
    return { balanced: false, totalDebit: 0, totalCredit: 0, diff: 0, reason: 'Se requieren al menos 2 líneas con cuenta y monto.' };
  }
  for (const l of active) {
    if (round2(l.debit) > 0 && round2(l.credit) > 0) {
      return { balanced: false, totalDebit: 0, totalCredit: 0, diff: 0, reason: 'Una línea no puede tener Debe y Haber al mismo tiempo.' };
    }
  }
  const totalDebit = round2(active.reduce((s, l) => s + round2(l.debit), 0));
  const totalCredit = round2(active.reduce((s, l) => s + round2(l.credit), 0));
  const diff = round2(totalDebit - totalCredit);
  return {
    balanced: Math.abs(diff) < 0.01,
    totalDebit,
    totalCredit,
    diff,
    reason: Math.abs(diff) < 0.01 ? null : `Diferencia de $${diff.toFixed(2)} entre Debe y Haber.`
  };
}

// Construye las líneas de la póliza de cierre de un contenedor a partir del resumen de computeContainer()
// y el mapeo configurable de cuentas. No depende de Store ni de IDs de cuenta hardcodeados.
export function buildContainerClosingLines(container, summary, mapping) {
  const lines = [];
  const map = mapping || {};

  const debit = (accountId, amount, memo) => {
    const amt = round2(amount);
    if (accountId && amt > 0) lines.push({ account_id: accountId, debit: amt, credit: 0, memo });
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
  // para blindar la póliza contra desajustes de centavos por redondeo independiente.
  const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  if (map.payable_account_id && totalDebit > 0) {
    lines.push({ account_id: map.payable_account_id, debit: 0, credit: totalDebit, memo: 'Total por pagar — costeo de importación' });
  }
  return lines;
}

export function isClosingMappingComplete(mapping) {
  if (!mapping) return false;
  return CLOSING_MAPPING_FIELDS.every(f => mapping[f.key]);
}
