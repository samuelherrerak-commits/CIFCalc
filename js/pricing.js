// Precios de venta del catálogo por nivel. Cada nivel tiene un margen sobre la venta
// (precio = base ÷ (1 − %)) y una base:
//   • 'cost'  → el costo estimado del contenedor.
//   • 'first' → el precio del PRIMER nivel (Distribuidor), ya redondeado a centavos.
// Ejemplo por defecto: Distribuidor 35 % sobre el costo; Retail 35 % y Máximo
// ponderado 40 %, ambos sobre el precio de Distribuidor.
export const DEFAULT_TIERS = [
  { name: 'Distribuidor', pct: 35, base: 'cost' },
  { name: 'Retail', pct: 35, base: 'first' },
  { name: 'Máximo ponderado', pct: 40, base: 'first' }
];

const r2 = (n) => Math.round(n * 100) / 100;

export function priceFor(cost, tier, tiers) {
  if (!(cost > 0)) return 0;
  const first = tiers && tiers[0];
  let base = cost;
  if (tier.base === 'first' && first && first !== tier && first.base !== 'first') base = r2(cost / (1 - first.pct / 100));
  return r2(base / (1 - tier.pct / 100));
}
