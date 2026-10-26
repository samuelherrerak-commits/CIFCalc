// Normaliza una fila cruda de `products` (hoja de Sheets o Modo prueba) a lo que
// muestra la tienda. La hoja hoy no trae category/collection/color, así que se
// derivan del SKU: BRG-<tipo>-<serie>-<nn>-<acabado>. Si la hoja ya trae esas
// columnas, mandan ellas.

const TIPOS = {
  BL: 'Lavamanos',
  MD: 'Duchas y tinas', VA: 'Duchas y tinas', TD: 'Duchas y tinas',
  SD: 'Duchas y tinas', FRG: 'Duchas y tinas',
  RD: 'Cabezales y regaderas', BD: 'Cabezales y regaderas', RM: 'Cabezales y regaderas',
  AC: 'Accesorios de baño'
};

// Series del catálogo impreso. EM agrupa duchas y accesorios que el catálogo
// presenta dentro de Equinox. GRA no figura en el PDF: se muestra tal cual.
const SERIES = {
  EQU: 'Equinox', EM: 'Equinox', ECL: 'Eclipse', SEL: 'Selene', CAL: 'Callisto',
  LUN: 'Luna', ZEN: 'Zenith', TRI: 'Tritón', GRA: 'GRA'
};

const ACABADOS = { CR: 'Cromado', SG: 'Steel Grey', BB: 'Negro', RG: 'Oro rosa' };

export const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const strip = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function parseSku(sku) {
  const parts = String(sku || '').trim().split('-');
  const last = parts[parts.length - 1];
  const finishCode = ACABADOS[last] ? last : '';
  const core = finishCode ? parts.slice(0, -1) : parts.filter((p, i) => !(i === parts.length - 1 && p === ''));
  return { type: core[1] || '', series: core[2] || '', model: core.slice(3).join('-'), finishCode, family: core.join('-') };
}

// Nombre del proveedor (inglés, a veces con saltos de línea o caracteres chinos) → español.
const REGLAS = [
  [/thermostatic bath\/shower mixer floor-?mounted/i, () => 'Mezclador termostático de piso para tina y ducha'],
  [/thermostatic concealed mixer with (\d)-way diverter/i, (m) => `Mezclador termostático empotrado con desviador de ${m[1]} vías`],
  [/thermostatic (?:concealed )?mixer with (\d) go ?slide/i, (m) => `Mezclador termostático empotrado con ${m[1]} controles deslizantes`],
  [/thermostatic (?:bath\/)?shower mixer with (\d) go ?slide/i, (m) => `Ducha termostática con ${m[1]} controles deslizantes`],
  [/thermostatic (?:concealed )?shower mixer/i, () => 'Mezclador termostático de ducha'],
  [/thermostatic bath\/shower mixer/i, () => 'Mezclador termostático para tina y ducha'],
  [/single lever concealed (\d)-?way\s*bath\/shower mixer/i, (m) => `Monomando empotrado de ${m[1]} vías para tina y ducha`],
  [/single lever concealed mixer with 2 go ?click/i, () => 'Monomando empotrado con 2 botones de apertura y cierre'],
  [/single lever concealed mixer with 2 go ?slide/i, () => 'Monomando empotrado con 2 controles deslizantes'],
  [/single lever concealed basin mixer/i, () => 'Monomando empotrado para lavamanos'],
  [/single lever concealed bath mixer/i, () => 'Monomando empotrado para tina'],
  [/single lever concealed shower mixer/i, () => 'Monomando empotrado para ducha'],
  [/single lever shower mixer/i, () => 'Monomando de ducha'],
  [/single lever basin mixer/i, () => 'Monomando para lavamanos'],
  [/single handle bain mixer without pop-?up/i, () => 'Monomando para lavamanos, sin desagüe'],
  [/shower set/i, () => 'Set de ducha'],
  [/shower arm and rain shower/i, () => 'Brazo y cabezal de ducha de pared'],
  [/shower arm/i, () => 'Brazo de ducha para pared'],
  [/(\d+)"\s*brass rain shower/i, (m) => `Cabezal de ducha cuadrado de ${m[1]}” en latón`],
  [/brass dripfree rainshower/i, () => 'Cabezal de ducha DripFree en latón'],
  [/brass rain shower head/i, () => 'Cabezal de ducha en latón'],
  [/3-function plastic handshower/i, () => 'Regadera de mano de 3 funciones'],
  [/brass hand ?shower|handshower/i, () => 'Regadera de mano'],
  [/rob(?:e)? hook/i, () => 'Gancho para bata'],
  [/guest towel holder/i, () => 'Toallero de cortesía'],
  [/guest towel ring/i, () => 'Argolla de cortesía'],
  [/double towel bar/i, () => 'Barra toallera doble'],
  [/single towel bar/i, () => 'Barra toallera sencilla'],
  [/towel shelf/i, () => 'Repisa para toallas'],
  [/towel holder/i, () => 'Toallero'],
  [/soap dish/i, () => 'Jabonera'],
  [/toilet roll holder/i, () => 'Portarrollos'],
  [/u?mbler holder/i, () => 'Portavasos con vaso'],
  [/toilet brush/i, () => 'Escobillón con soporte'],
  [/shelf/i, () => 'Repisa']
];

export function cleanName(raw) {
  return String(raw || '')
    .replace(/[　-鿿＀-￯]+/g, ' ')   // caracteres chinos
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .replace(/\(\s*FH[^)]*\)/gi, '')                  // códigos del proveedor
    .replace(/\bFH[A-Z0-9]*[\/-][A-Z0-9\/-]+/gi, '')
    .replace(/\s{2,}/g, ' ').trim();
}

function nombreEs(raw) {
  const limpio = cleanName(raw);
  for (const [re, fn] of REGLAS) {
    const m = limpio.match(re);
    if (m) return fn(m);
  }
  return limpio ? limpio.charAt(0).toUpperCase() + limpio.slice(1) : 'Producto Briggs';
}

function medidas(raw) {
  const t = String(raw || '');
  const xy = t.match(/(\d{2,4})\s*[x×]\s*(\d{2,4})\s*mm/i);
  if (xy) return `${xy[1]} × ${xy[2]} mm`;
  const mm = t.match(/Size[:：]\s*(\d{2,4})\s*mm/i) || t.match(/\((\d{2,4})\s*mm\)/i);
  if (mm) return `${mm[1]} mm`;
  return '';
}

const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

function parseWebSpecs(text) {
  return String(text || '').split(';').map((s) => s.split(':')).filter((p) => p.length >= 2 && p[0].trim())
    .map((p) => [p[0].trim(), p.slice(1).join(':').trim()]);
}

export function normalizeProduct(p) {
  const s = parseSku(p.sku_briggs || p.sku);
  const category = p.category || TIPOS[s.type] || 'Otros';
  const series = p.collection || (s.type === 'AC' ? 'Accesorios' : (SERIES[s.series] || (s.series || 'Briggs')));
  const finish = p.color || ACABADOS[s.finishCode] || '';
  const raw = cleanName(p.name);
  const name = nombreEs(p.name);
  const med = medidas(p.name);
  const specs = [['Código', p.sku_briggs || p.sku || '—'], ['Serie', series], ['Categoría', category]];
  if (finish) specs.push(['Acabado', finish]);
  if (/brass/i.test(raw)) specs.push(['Material', 'Latón']);
  if (s.type === 'BL') specs.push(['Conexión', '1/2” · incluye mangueras flexibles de 40 cm']);
  if (['RD', 'BD', 'RM'].includes(s.type)) specs.push(['Conexión', '1/2”']);
  if (/smartbox/i.test(raw)) specs.push(['Incluye', 'SmartBOX']);
  if (med) specs.push(['Medidas', med]);
  if (num(p.weight_kg) > 0) specs.push(['Peso', `${num(p.weight_kg)} kg`]);
  if (num(p.units_per_box) > 1) specs.push(['Unidades por caja', String(num(p.units_per_box))]);
  parseWebSpecs(p.web_specs).forEach((r) => specs.push(r));
  if (raw) specs.push(['Descripción del fabricante', raw]);
  return {
    id: String(p.id), sku: p.sku_briggs || p.sku || '', name, series, seriesKey: slug(series),
    category, categoryKey: slug(category), finish, finishKey: slug(finish),
    family: s.family, type: s.type, brand: p.brand || 'Briggs',
    stock: num(p.stock), price: num(p.sale_price), ivaTipo: String(p.iva_tipo || '').toLowerCase(),
    foto: p.foto_url || '', description: p.web_description || '', specs,
    search: strip([p.sku_briggs, name, series, category, finish, raw].join(' '))
  };
}

export const searchKey = strip;

// Regla de inventario: solo se muestra lo que tiene existencia.
export const enInventario = (p) => p.stock > 0;
