// Generador del código de producto (SKU BRIGGS), igual que el archivo
// "Maestro de Códigos": MARCA-CATEGORÍA-COLECCIÓN-[VÍAS]CORRELATIVO-COLOR.
//   • Colección: solo cuenta en Baño / Lavamanos (Grifería); el resto de las
//     categorías van como genéricas (EM).
//   • Vías: si el producto es de vías, el correlativo va precedido de 1V..4V.
//   • Correlativo: el siguiente número libre del grupo —
//       Baño/Lavamanos: por colección (sin importar el color);
//       con vías: por categoría + vías + color;
//       demás: por categoría + color.
//   • Color "No Aplica": el código termina en guion (BRG-VA-EM-2V01-).

export const CATEGORIES = [
  { name: 'Baño / Lavamanos (Grifería)', code: 'BL', usesCollection: true },
  { name: 'Cocina (Kitchen)', code: 'KC' },
  { name: 'Mezclador de Ducha', code: 'MD' },
  { name: 'Sistema de Ducha Integrado', code: 'SD' },
  { name: 'Regaderas / Cabezas de Ducha', code: 'RD' },
  { name: 'Brazos de Ducha', code: 'BD' },
  { name: 'Regadera de Mano', code: 'RM' },
  { name: 'Accesorios de Baño', code: 'AC' },
  { name: 'Sanitario', code: 'ST' },
  { name: 'Freestanding Griferia', code: 'FRG' },
  { name: 'Freestanding Bañera', code: 'FRB' },
  { name: 'Valvula', code: 'VA' },
  { name: 'Trim de Ducha', code: 'TD' }
];

export const COLORS = [
  { name: 'Cromado', code: 'CR' },
  { name: 'Steel Gray', code: 'SG' },
  { name: 'Negro', code: 'NG' },
  { name: 'Gold', code: 'GL' },
  { name: 'Brushed Nickel', code: 'BN' },
  { name: 'Rose Gold', code: 'RG' },
  { name: 'Brushed Black', code: 'BB' },
  { name: 'No Aplica', code: '' }
];

export const COLLECTIONS = [
  { name: 'Equinox', code: 'EQU' },
  { name: 'Eclipse', code: 'ECL' },
  { name: 'Selene', code: 'SEL' },
  { name: 'Callisto', code: 'CAL' },
  { name: 'Luna', code: 'LUN' },
  { name: 'Zenith', code: 'ZEN' },
  { name: 'Triton', code: 'TRI' },
  { name: 'Gravity', code: 'GRA' },
  { name: 'Accessories', code: 'ACC' }
];

export const VIAS = [
  { code: '', label: 'Sin vías' },
  { code: '1V', label: '1 Vía' },
  { code: '2V', label: '2 Vías' },
  { code: '3V', label: '3 Vías' },
  { code: '4V', label: '4 Vías' }
];

export const GENERIC_COLLECTION = 'EM';
const norm = (s) => String(s || '').trim().toLowerCase();

// Partes de un código existente: { brand, cat, col, via, nn, color }.
export function parseCode(sku) {
  const parts = String(sku || '').trim().split('-');
  if (parts.length < 4) return null;
  const [brand, cat, col, varPart, ...rest] = parts;
  const m = String(varPart || '').match(/^(\dV)?(\d+)$/i);
  if (!m) return null;
  return { brand, cat, col, via: (m[1] || '').toUpperCase(), nn: Number(m[2]), color: rest.join('-').trim() };
}

// Listas = tablas del Maestro + lo que ya existe en el catálogo (categorías,
// colecciones y colores nuevos que se hayan creado después).
export function codeTables(products) {
  const cats = CATEGORIES.map(c => ({ ...c }));
  const cols = COLLECTIONS.map(c => ({ ...c }));
  const colors = COLORS.map(c => ({ ...c }));
  for (const p of products) {
    const k = parseCode(p.sku_briggs);
    if (!k) continue;
    if (p.category && !cats.some(c => norm(c.name) === norm(p.category))) cats.push({ name: p.category.trim(), code: k.cat, usesCollection: k.col !== GENERIC_COLLECTION });
    if (p.color && !colors.some(c => norm(c.name) === norm(p.color))) colors.push({ name: p.color.trim(), code: k.color });
    if (p.collection && !cols.some(c => norm(c.name) === norm(p.collection))) {
      cols.push({ name: p.collection.trim(), code: k.col !== GENERIC_COLLECTION ? k.col : '' });
    }
  }
  return { cats, cols, colors };
}

export const findByName = (list, name) => list.find(x => norm(x.name) === norm(name)) || null;

export function buildCode({ brand, catCode, colCode, via, nn, colorCode }) {
  return `${String(brand || 'BRG').trim().toUpperCase()}-${catCode}-${colCode}-${via || ''}${String(nn).padStart(2, '0')}-${colorCode || ''}`;
}

// Segmento de colección que va en el código según la categoría.
export function collectionSegment(cat, collection) {
  if (!cat || !cat.usesCollection) return GENERIC_COLLECTION;
  return (collection && collection.code) || '';
}

// Siguiente correlativo libre para ese grupo, según las reglas del Maestro.
export function nextCorrelative(products, { brand, catCode, colCode, via, colorCode, usesCollection }) {
  let max = 0;
  for (const p of products) {
    const k = parseCode(p.sku_briggs);
    if (!k || norm(k.brand) !== norm(brand || 'BRG') || k.cat !== catCode) continue;
    if (usesCollection && !via) {
      if (k.col === colCode && !k.via) max = Math.max(max, k.nn);
    } else if (k.col === colCode && k.via === (via || '') && k.color === (colorCode || '')) {
      max = Math.max(max, k.nn);
    }
  }
  return max + 1;
}
