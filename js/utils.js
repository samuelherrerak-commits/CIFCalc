export function fmtNum(val) {
  const n = Number(val) || 0;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtInt(val) {
  const n = Number(val) || 0;
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function num(el) {
  const v = parseFloat(el?.value);
  return isNaN(v) ? 0 : v;
}

// Motor de cálculo compartido (reglas confirmadas del spec)
export function computeContainer(container, items) {
  const capacity = Number(container?.container_capacity) || 0;
  const insuranceEnabled = !!container?.insurance_enabled;
  const insuranceRate = Number(container?.insurance_rate) || 0;
  const portFeeRate = Number(container?.port_fee_rate) || 0;
  const vatRate = Number(container?.vat_rate) || 0;
  const oceanFreight = Number(container?.ocean_freight) || 0;
  const inlandFreight = Number(container?.inland_freight) || 0;
  const customsExpenses = Number(container?.customs_expenses) || 0;
  const customsBrokerFee = Number(container?.customs_broker_fee) || 0;
  const opExpenses = Number(container?.op_expenses) || 0;

  // Volumen total ocupado
  let totalVolume = 0;
  const volumes = items.map(item => {
    const boxes = Number(item.units_per_box) > 0 ? (Number(item.qty) / Number(item.units_per_box)) : 0;
    const vol = boxes * (Number(item.box_volume) || 0);
    return vol;
  });
  totalVolume = volumes.reduce((a, b) => a + b, 0);

  const volumePercentage = capacity > 0 ? (totalVolume / capacity) * 100 : 0;
  const containersRequired = capacity > 0 ? (totalVolume / capacity) : 0;

  const calculated = items.map((item, idx) => {
    const qty = Number(item.qty) || 0;
    const boxes = Number(item.units_per_box) > 0 ? (qty / Number(item.units_per_box)) : 0;
    const volTotal = boxes * (Number(item.box_volume) || 0);
    const factor = totalVolume > 0 ? (volTotal / totalVolume) : 0;
    const unitsPerContainer = Number(item.box_volume) > 0 ? (capacity / Number(item.box_volume)) : 0;

    const fobTotal = qty * (Number(item.fob_unit) || 0);
    const oceanFreightAssigned = oceanFreight * factor;
    const insuranceAmount = insuranceEnabled ? (fobTotal * (insuranceRate / 100)) : 0;

    // CIF = FOB×qty + flete marítimo asignado + seguro (solo si habilitado)
    const cifTotal = fobTotal + oceanFreightAssigned + insuranceAmount;

    const tariffAmount = cifTotal * ((Number(item.tariff_rate) || 0) / 100);
    const portFeeAmount = cifTotal * (portFeeRate / 100);

    // IVA base = producto (FOB) + flete marítimo + seguro + arancel + tasa portuaria
    // (flete terrestre, gastos de aduana, agente aduanal y operativos NO entran al IVA)
    const vatAmount = (fobTotal + oceanFreightAssigned + insuranceAmount + tariffAmount + portFeeAmount) * (vatRate / 100);

    const customsBrokerAmount = customsBrokerFee * factor;
    const inlandAssigned = inlandFreight * factor;
    const customsAssigned = customsExpenses * factor;
    const opAssigned = opExpenses * factor;

    const otherExpenses = inlandAssigned + customsAssigned + opAssigned;

    const landedTotal = cifTotal + tariffAmount + portFeeAmount + customsBrokerAmount + otherExpenses + vatAmount;
    const unitLanded = qty > 0 ? (landedTotal / qty) : 0;

    // Costo unitario sin IVA = todo el landed salvo el IVA, por unidad
    const landedNoVat = landedTotal - vatAmount;
    const costNoVat = qty > 0 ? (landedNoVat / qty) : 0;
    const costWithVat = unitLanded;
    const ivPerUnit = qty > 0 ? (vatAmount / qty) : 0;

    // Precio de venta con margen sobre venta: costo ÷ (1 - margen/100)
    // El margen es el % del precio final; con margen >= 100% se evita división por cero/negativos.
    const gainMargin = Number(item.gain_margin) || 0;
    const marginDenom = gainMargin < 100 ? (1 - gainMargin / 100) : 0;
    const salePriceOnCost = costNoVat > 0 && marginDenom > 0 ? costNoVat / marginDenom : 0;
    const salePriceOnCostVat = costWithVat > 0 && marginDenom > 0 ? costWithVat / marginDenom : 0;

    return {
      item,
      qty,
      boxes,
      volTotal,
      factor,
      unitsPerContainer,
      fobTotal,
      oceanFreightAssigned,
      insuranceAmount,
      cifTotal,
      tariffAmount,
      vatAmount,
      portFeeAmount,
      customsBrokerAmount,
      inlandAssigned,
      customsAssigned,
      opAssigned,
      otherExpenses,
      landedTotal,
      unitLanded,
      landedNoVat,
      costNoVat,
      costWithVat,
      ivPerUnit,
      gainMargin,
      salePriceOnCost,
      salePriceOnCostVat
    };
  });

  const summary = calculated.reduce((acc, c) => {
    acc.fob += c.fobTotal;
    acc.insurance += c.insuranceAmount;
    acc.cif += c.cifTotal;
    acc.tariff += c.tariffAmount;
    acc.portFee += c.portFeeAmount;
    acc.customsBroker += c.customsBrokerAmount;
    acc.vat += c.vatAmount;
    acc.other += c.otherExpenses;
    acc.landed += c.landedTotal;
    acc.totalQty += c.qty;
    return acc;
  }, { fob: 0, insurance: 0, cif: 0, tariff: 0, portFee: 0, customsBroker: 0, vat: 0, other: 0, landed: 0, totalQty: 0 });

  return { totalVolume, volumePercentage, containersRequired, calculated, summary };
}
