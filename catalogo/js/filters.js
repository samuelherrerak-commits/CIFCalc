// Filtros, búsqueda y orden de la página de catálogo. Funciones puras (sin DOM):
// el estado vive en la URL (#/catalogo?cat=…&serie=a,b&acab=…&min=…&max=…&orden=…&p=2).
import { searchKey } from './normalize.js';

export const SORTS = [
  ['relevancia', 'Más relevantes'],
  ['precio-asc', 'Precio: menor a mayor'],
  ['precio-desc', 'Precio: mayor a menor'],
  ['nombre', 'Nombre: A–Z']
];
export const PAGE_SIZE = 24;

const num = (v) => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const list = (params, k) => (params.get(k) || '').split(',').map((s) => s.trim()).filter(Boolean);

export function parseFilters(params) {
  const orden = params.get('orden');
  return {
    q: (params.get('q') || '').trim(),
    cat: params.get('cat') || '',
    serie: list(params, 'serie'),
    acab: list(params, 'acab'),
    min: num(params.get('min')),
    max: num(params.get('max')),
    orden: SORTS.some(([k]) => k === orden) ? orden : 'relevancia',
    p: Math.max(1, parseInt(params.get('p'), 10) || 1)
  };
}

export function toQuery(f) {
  const q = new URLSearchParams();
  if (f.q) q.set('q', f.q);
  if (f.cat) q.set('cat', f.cat);
  if (f.serie.length) q.set('serie', f.serie.join(','));
  if (f.acab.length) q.set('acab', f.acab.join(','));
  if (f.min !== null) q.set('min', String(f.min));
  if (f.max !== null) q.set('max', String(f.max));
  if (f.orden !== 'relevancia') q.set('orden', f.orden);
  if (f.p > 1) q.set('p', String(f.p));
  const s = q.toString().replace(/%2C/g, ',');
  return s ? '?' + s : '';
}

export const tokensOf = (q) => searchKey(q).split(/\s+/).filter(Boolean);

// Evalúa por separado cada criterio para poder calcular las cuentas de cada filtro
// "como si ese filtro no estuviera aplicado" (como hacen Amazon o Mercado Libre).
function checks(p, f, tokens, priceOf) {
  const price = priceOf(p);
  return {
    q: tokens.every((t) => p.search.includes(t)),
    cat: !f.cat || p.categoryKey === f.cat,
    serie: !f.serie.length || f.serie.includes(p.seriesKey),
    acab: !f.acab.length || f.acab.includes(p.finishKey),
    precio: (f.min === null && f.max === null) || (price > 0 && (f.min === null || price >= f.min) && (f.max === null || price <= f.max))
  };
}

export function filterProducts(products, f, priceOf) {
  const tokens = tokensOf(f.q);
  return products.filter((p) => { const c = checks(p, f, tokens, priceOf); return c.q && c.cat && c.serie && c.acab && c.precio; });
}

export function facetCounts(products, f, priceOf) {
  const tokens = tokensOf(f.q);
  const out = { cat: new Map(), serie: new Map(), acab: new Map() };
  const bump = (m, k) => { if (k) m.set(k, (m.get(k) || 0) + 1); };
  for (const p of products) {
    const c = checks(p, f, tokens, priceOf);
    if (c.q && c.serie && c.acab && c.precio) bump(out.cat, p.categoryKey);
    if (c.q && c.cat && c.acab && c.precio) bump(out.serie, p.seriesKey);
    if (c.q && c.cat && c.serie && c.precio) bump(out.acab, p.finishKey);
  }
  return out;
}

export function relevance(p, tokens) {
  const sku = searchKey(p.sku), name = searchKey(p.name);
  let s = 0;
  for (const t of tokens) s += sku.includes(t) ? 3 : name.includes(t) ? 2 : 1;
  return s;
}

const byCode = (a, b) => a.series.localeCompare(b.series) || a.sku.localeCompare(b.sku, undefined, { numeric: true });

export function sortProducts(items, orden, priceOf, q = '') {
  const tokens = tokensOf(q);
  const out = items.slice();
  if (orden === 'precio-asc') return out.sort((a, b) => (priceOf(a) || 1e12) - (priceOf(b) || 1e12) || byCode(a, b));
  if (orden === 'precio-desc') return out.sort((a, b) => priceOf(b) - priceOf(a) || byCode(a, b));
  if (orden === 'nombre') return out.sort((a, b) => a.name.localeCompare(b.name) || byCode(a, b));
  return tokens.length ? out.sort((a, b) => relevance(b, tokens) - relevance(a, tokens) || byCode(a, b)) : out.sort(byCode);
}

export function paginate(items, page, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(1, page), pages);
  return { page: p, pages, items: items.slice((p - 1) * size, p * size), from: items.length ? (p - 1) * size + 1 : 0, to: Math.min(p * size, items.length) };
}

// Páginas a mostrar en el paginador: 1 … 4 5 6 … 12
export function pageWindow(page, pages) {
  const set = new Set([1, pages, page - 1, page, page + 1]);
  const nums = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => { if (i && n - nums[i - 1] > 1) out.push('…'); out.push(n); });
  return out;
}
