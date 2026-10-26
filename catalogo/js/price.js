// Precios con IVA — misma fórmula que js/fiscal.js (computeTax) de la app interna.
// En la tienda el resultado es informativo: el servidor recalcula el pedido.
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const fmt = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n) => '$' + fmt.format(r2(n));
export const bs = (n) => 'Bs ' + fmt.format(r2(n));

export function fiscalOf(store = {}) {
  return {
    ivaEnabled: store.iva_enabled !== false,
    rateGeneral: Number(store.iva_rate_general) > 0 ? Number(store.iva_rate_general) : 16,
    rateReducida: Number(store.iva_rate_reducida) > 0 ? Number(store.iva_rate_reducida) : 8,
    pricesIncludeIva: store.prices_include_iva === true
  };
}

export const ivaTipoOf = (p) => (p.ivaTipo === 'reducida' || p.ivaTipo === 'exento' ? p.ivaTipo : 'general');

// Mejor promoción vigente (se aplica la mayor, nunca se suman) — igual que Store.bestPromotionFor.
export function unitPrice(p, promos = []) {
  const list = Number(p.price) || 0;
  const today = new Date().toISOString().slice(0, 10);
  const best = promos
    .filter((x) => x.active !== false && String(x.active) !== 'false' && Number(x.discount_pct) > 0 &&
      (!x.start_date || x.start_date <= today) && (!x.end_date || x.end_date >= today) &&
      (x.scope === 'todos' || (x.scope === 'producto' && x.target === p.id) || (x.scope === 'categoria' && x.target === p.category)))
    .sort((a, b) => Number(b.discount_pct) - Number(a.discount_pct))[0];
  const pct = best ? Number(best.discount_pct) : 0;
  return { list, pct, unit: r2(list * (1 - pct / 100)), promo: best ? best.name || '' : '' };
}

// lines = [{ amount, tipo }] → totales como computeTax.
export function computeTax(lines, fs) {
  const rates = { general: fs.rateGeneral / 100, reducida: fs.rateReducida / 100 };
  const o = { exempt: 0, base_general: 0, base_reducida: 0 };
  for (const l of lines) {
    const amount = Number(l.amount) || 0;
    const tipo = fs.ivaEnabled ? (l.tipo || 'general') : 'exento';
    if (tipo === 'exento') { o.exempt += amount; continue; }
    o['base_' + tipo] += r2(fs.pricesIncludeIva ? amount / (1 + rates[tipo]) : amount);
  }
  o.exempt = r2(o.exempt); o.base_general = r2(o.base_general); o.base_reducida = r2(o.base_reducida);
  o.tax_general = r2(o.base_general * rates.general);
  o.tax_reducida = r2(o.base_reducida * rates.reducida);
  o.subtotal = r2(o.exempt + o.base_general + o.base_reducida);
  o.tax = r2(o.tax_general + o.tax_reducida);
  o.total = r2(o.subtotal + o.tax);
  return o;
}

// Precio unitario que ve el cliente, IVA incluido (o exento).
export function shownUnit(p, ctx) {
  const u = unitPrice(p, ctx.promos);
  const tipo = ctx.fs.ivaEnabled ? ivaTipoOf(p) : 'exento';
  const rate = tipo === 'exento' ? 0 : (tipo === 'reducida' ? ctx.fs.rateReducida : ctx.fs.rateGeneral) / 100;
  const withIva = (v) => r2(ctx.fs.pricesIncludeIva ? v : v * (1 + rate));
  return { ...u, shown: withIva(u.unit), shownList: withIva(u.list), exento: tipo === 'exento', rate };
}
