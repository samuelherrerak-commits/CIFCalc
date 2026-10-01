// Motor de partida doble: validación de balance y construcción de asientos automáticos.
// Módulo puro, sin dependencia de Store, para poder probarlo y reutilizarlo desde la UI y desde el hook automático.

// Cuentas contables REALES (de balance). Las cuentas nominales (ingreso/costo/gasto)
// ya no viven aquí — las cubren los tipos de movimiento (ver MOVEMENT_SUBTYPES más abajo).
export const ACCOUNT_TYPES = [
  { value: 'activo', label: 'Activo', group: 'Activo', nature: 'deudora' },
  { value: 'pasivo', label: 'Pasivo', group: 'Pasivo', nature: 'acreedora' },
  { value: 'capital', label: 'Capital', group: 'Capital', nature: 'acreedora' }
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
// Solo cuentas de balance — las de ingreso/costo/gasto ya no aplican (ver MOVEMENT_SUBTYPES).
export const SEED_ACCOUNTS = [
  { code: '1001', name: 'Caja y Bancos', type: 'activo' },
  { code: '1002', name: 'Clientes / Cuentas por Cobrar', type: 'activo' },
  { code: '1003', name: 'IVA Acreditable', type: 'activo' },
  { code: '1004', name: 'Inventario de Mercancías en Tránsito (Importaciones)', type: 'activo' },
  { code: '1005', name: 'Inventario de Mercancías Disponibles para la Venta', type: 'activo' },
  { code: '1006', name: 'Anticipo a Proveedores', type: 'activo' },
  { code: '1007', name: 'Préstamos Otorgados (por Cobrar)', type: 'activo' },
  { code: '2001', name: 'Proveedores Nacionales', type: 'pasivo' },
  { code: '2002', name: 'Acreedores por Importación', type: 'pasivo' },
  { code: '2003', name: 'IVA por Pagar (ventas locales)', type: 'pasivo' },
  { code: '2004', name: 'Impuestos por Pagar', type: 'pasivo' },
  { code: '2005', name: 'Préstamos por Pagar', type: 'pasivo' },
  { code: '3001', name: 'Capital Social', type: 'capital' },
  { code: '3002', name: 'Utilidades Retenidas', type: 'capital' },
  { code: '3003', name: 'Resultado del Ejercicio', type: 'capital' }
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
  // Una línea es válida si toca una cuenta real (account_id) o una cuenta nominal
  // (movement_subtype) — un movimiento de Ingreso/Costo/Gasto no tiene cuenta real en su lado nominal.
  const active = (lines || []).filter(l => (l.account_id || l.movement_subtype) && (round2(l.debit) + round2(l.credit)) > 0);

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

// Construye las líneas del asiento de cierre de un contenedor a partir del resumen de computeContainer()
// y el mapeo configurable de cuentas. No depende de Store ni de IDs de cuenta hardcodeados.
export function buildContainerClosingLines(container, summary, mapping) {
  const lines = [];
  const map = mapping || {};
  const entryDate = container.operation_date;

  const debit = (accountId, amount, description) => {
    const amt = round2(amount);
    if (accountId && amt > 0) lines.push({ entry_date: entryDate, movement_subtype: null, account_id: accountId, debit: amt, credit: 0, description });
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
  if (map.payable_account_id && totalDebit > 0) {
    lines.push({ entry_date: entryDate, movement_subtype: null, account_id: map.payable_account_id, debit: 0, credit: totalDebit, description: 'Total por pagar — costeo de importación' });
  }
  return lines;
}

export function isClosingMappingComplete(mapping) {
  if (!mapping) return false;
  return CLOSING_MAPPING_FIELDS.every(f => mapping[f.key]);
}

// Separa un monto total (con IVA incluido) en neto + IVA, dada una tasa en porcentaje.
export function splitVat(total, vatRate) {
  const net = round2(Number(total) / (1 + (Number(vatRate) || 0) / 100));
  return { net, vat: round2(Number(total) - net) };
}

// ============================================
// Módulo de Movimientos (Ingreso / Costo / Gasto)
// Plan de cuentas simplificado: un tipo de movimiento con una lista fija de
// subtipos, cada uno mapeado a una cuenta contable en Configuración.
// ============================================
export const MOVEMENT_TYPES = [
  { value: 'ingreso', label: 'Ingreso' },
  { value: 'costo', label: 'Costo' },
  { value: 'gasto', label: 'Gasto' }
];

// Estas SON las cuentas nominales: no se mapean a una cuenta contable aparte,
// la línea del movimiento lleva directamente la clave del subtipo (movement_subtype).
export const MOVEMENT_SUBTYPES = [
  { key: 'ingreso_ventas', movement: 'ingreso', label: 'Ingresos de Ventas' },
  { key: 'ingreso_prestamo', movement: 'ingreso', label: 'Préstamo' },
  { key: 'ingreso_otros', movement: 'ingreso', label: 'Otros Ingresos' },

  { key: 'costo_venta', movement: 'costo', label: 'Costo de Venta' },
  { key: 'costo_producto', movement: 'costo', label: 'Costo de Producto' },
  { key: 'costo_logistico', movement: 'costo', label: 'Costo Logístico' },
  { key: 'costo_otros', movement: 'costo', label: 'Otros Costos' },

  { key: 'gasto_admin', movement: 'gasto', label: 'Gastos de Administración y Finanzas' },
  { key: 'gasto_logistica', movement: 'gasto', label: 'Gastos de Logística' },
  { key: 'gasto_ventas', movement: 'gasto', label: 'Gastos de Ventas' }
];

export function subtypesForMovement(movement) {
  return MOVEMENT_SUBTYPES.filter(s => s.movement === movement);
}

export function labelForSubtype(key) {
  const s = MOVEMENT_SUBTYPES.find(s => s.key === key);
  return s ? s.label : key;
}

// mapping = movement_settings: solo tasas/cuentas de IVA (vat_rate_ingreso, vat_account_id_ingreso,
// vat_rate_gasto, vat_account_id_gasto) — ya no hay cuenta por subtipo, el subtipo mismo es la cuenta nominal.
//
// data = { subtype, total, date, memo, bank_account_id (ingreso/gasto), counterpart_account_id (costo), include_vat (ingreso/gasto) }
//
// Cada línea del resultado lleva movement_subtype (todas las líneas del mismo movimiento comparten
// el mismo subtipo, para poder filtrarlas juntas) y account_id (cuenta real; null en el lado nominal).
//
// Ingreso: Debe Banco (real), Haber el subtipo (nominal) [+ Haber IVA por pagar (real)].
// Gasto:   Debe el subtipo (nominal) [+ Debe IVA acreditable (real)], Haber Banco (real).
// Costo:   Debe el subtipo (nominal), Haber cuenta contrapartida elegida (real, sin IVA, sin banco).
export function buildMovementLines(movement, data, mapping) {
  const subtype = MOVEMENT_SUBTYPES.find(s => s.key === data.subtype);
  if (!subtype) throw new Error('Tipo de movimiento inválido.');
  const map = mapping || {};

  const total = round2(data.total);
  const memo = data.memo || subtype.label;
  const line = (accountId, debit, credit, lineMemo) => ({
    entry_date: data.date, movement_subtype: subtype.key, account_id: accountId || null,
    debit, credit, description: lineMemo
  });

  if (movement === 'ingreso') {
    const lines = [line(data.bank_account_id, total, 0, memo)];
    if (data.include_vat) {
      const { net, vat } = splitVat(total, map.vat_rate_ingreso);
      lines.push(line(null, 0, net, memo));
      if (map.vat_account_id_ingreso && vat > 0) {
        lines.push(line(map.vat_account_id_ingreso, 0, vat, 'IVA por pagar'));
      }
    } else {
      lines.push(line(null, 0, total, memo));
    }
    return lines;
  }

  if (movement === 'gasto') {
    const lines = [];
    if (data.include_vat) {
      const { net, vat } = splitVat(total, map.vat_rate_gasto);
      lines.push(line(null, net, 0, memo));
      if (map.vat_account_id_gasto && vat > 0) {
        lines.push(line(map.vat_account_id_gasto, vat, 0, 'IVA acreditable'));
      }
    } else {
      lines.push(line(null, total, 0, memo));
    }
    lines.push(line(data.bank_account_id, 0, total, memo));
    return lines;
  }

  // costo
  return [
    line(null, total, 0, memo),
    line(data.counterpart_account_id, 0, total, memo)
  ];
}
