// Rellena en la hoja `products` los prompts para generar las fotos de cada producto con
// Nano Banana (Gemini): prompt_foto_1 = primer plano, prompt_foto_2 = producto en uso.
// Para cada producto solo cambian tres datos: nombre (inglés), acabado y la toma "en uso"
// según la categoría. Se copia la celda y se pega en Gemini junto con la foto del producto.
//
// Uso (desde la raíz del repo, Node 22+):
//   NODE_USE_ENV_PROXY=1 node catalogo/tools/prompts-fotos.mjs            → simulación: no escribe nada
//   NODE_USE_ENV_PROXY=1 node catalogo/tools/prompts-fotos.mjs --write    → escribe los que estén vacíos
//   NODE_USE_ENV_PROXY=1 node catalogo/tools/prompts-fotos.mjs --write --force   → reescribe también los llenos
//
// Requiere que el Apps Script publicado ya tenga las columnas prompt_foto_1/2 (pegar apps-script/Code.gs
// y publicar una nueva versión). Solo toca esas dos columnas: el resto de la fila se conserva.
// El token interno de js/sheets-config.js se usa solo en la máquina donde se ejecuta.
import { SHEETS_URL, SHEETS_TOKEN } from '../../js/sheets-config.js';
import { normalizeProduct, cleanName } from '../js/normalize.js';

const WRITE = process.argv.includes('--write');
const FORCE = process.argv.includes('--force');

const HERO = 'Hero close-up. The product centered and filling about 70% of the frame, same viewing angle as the reference, standing on a dark slate surface with a soft contact shadow and a gentle reflection, dark gradient background.';
const SAME = 'same product design as the reference.';
const SHOWER_WALL = 'installed on a dark slate wall tile, with a rain shower head above in the background releasing water, light steam, the control clearly in focus in the foreground,';

// Toma "en uso" según la categoría de la tienda (normalize.js → categoryKey).
const USE = {
  'lavamanos': `The faucet installed on a dark stone vanity beside a white ceramic basin, water flowing from the spout into the basin with crisp, realistic water motion, dark textured wall behind, ${SAME}`,
  'mezcladores-de-ducha': `The control ${SHOWER_WALL} ${SAME}`,
  'trim-de-ducha': `The control ${SHOWER_WALL} ${SAME}`,
  'sistemas-de-ducha': `The complete shower set installed on a dark stone shower wall, water falling in fine streams from the shower head, light steam, ${SAME}`,
  'cabezales-de-ducha': `The shower head mounted above in a dark stone shower, rain-like water falling in fine streams toward the camera, backlit droplets, ${SAME}`,
  'brazos-de-ducha': `The shower arm installed on a dark stone wall with its shower head attached, water falling in fine streams, ${SAME}`,
  'regaderas-de-mano': `The hand shower held in its wall holder on a dark stone wall, spraying water in a fine fan with droplets frozen in the light, ${SAME}`,
  'accesorios-de-bano': `The accessory installed on a dark slate wall in a bathroom, in use with a single suitable item (a folded charcoal towel, a bar of soap, a glass or a toilet roll, as appropriate), minimal and uncluttered, ${SAME}`,
  'griferia-de-piso': `The floor-mounted mixer standing beside a freestanding bathtub on dark stone flooring, water flowing from the spout into the tub, ${SAME}`,
  'valvulas': `No in-use scene for this part: a technical detail shot instead, the valve body at a three-quarter angle on a dark neutral surface with crisp edge lighting, ${SAME}`
};
const FINISH_EN = { 'Cromado': 'chrome', 'Steel Grey': 'steel grey', 'Negro cepillado': 'brushed black', 'Oro rosa': 'rose gold' };

// Una sola línea (sin saltos): se copia y pega igual desde Sheets en cualquier cuadro de texto.
const master = (en, finish, shot) => [
  'Use the attached photo as the exact reference of the product. Reproduce THIS product faithfully: same shape, proportions, handle or lever, spout, buttons, plates and finish. Do not redesign it, do not add, remove or change parts, and do not invent logos, engravings or text.',
  `Product: ${en}. Finish: keep it exactly as in the attached photo${finish ? ` (the catalogue lists it as ${finish})` : ''}.`,
  'Style: premium bathroom brand catalogue photography for Briggs. Deep blue-black slate stone and matte charcoal surfaces, moody dramatic studio lighting with a soft rim light, subtle realistic reflections, photorealistic, sharp focus on the product, rich contrast, palette of near-black navy, graphite and steel highlights. Square 1:1 composition.',
  `Shot: ${shot}`,
  'Avoid: text, watermarks, logos, people, hands, extra faucets or unrelated objects, clutter, cartoon or 3D-render look.'
].join(' ');

export function promptsFor(row) {
  const p = normalizeProduct(row);
  const en = cleanName(row.name).replace(/[（(].*?[)）]/g, '').trim() || p.name;
  const finish = FINISH_EN[p.finish] || '';
  const use = USE[p.categoryKey] || USE['accesorios-de-bano'];
  return { prompt_foto_1: master(en, finish, HERO), prompt_foto_2: master(en, finish, use) };
}

async function call(method, query, body) {
  const url = `${SHEETS_URL}?${new URLSearchParams(query || {})}`;
  const res = await fetch(url, method === 'POST' ? { method, headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) } : undefined);
  const d = await res.json();
  if (!d.ok) throw new Error(d.error || `HTTP ${res.status}`);
  return d;
}
const readProducts = async () => (await call('GET', { table: 'products', pt: SHEETS_TOKEN })).data;

// Solo se ejecuta como script (no al importarlo desde otra herramienta o prueba).
if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = await readProducts();
  if (!rows.length) throw new Error('La hoja products está vacía.');
  if (!('prompt_foto_1' in rows[0])) {
    console.error('El Apps Script publicado todavía NO tiene las columnas prompt_foto_1 / prompt_foto_2.\n' +
      'Pega apps-script/Code.gs en el editor de Apps Script y publica una nueva versión (Implementar → Administrar implementaciones → Nueva versión). No se escribió nada.');
    process.exit(2);
  }
  const todo = rows.filter((r) => FORCE || !String(r.prompt_foto_1 || '').trim() || !String(r.prompt_foto_2 || '').trim());
  console.log(`${rows.length} productos · ${todo.length} por rellenar${FORCE ? ' (--force)' : ''}`);
  const payload = todo.map((r) => ({ id: r.id, ...promptsFor(r) }));
  if (payload[0]) console.log(`\nEjemplo (${todo[0].sku_briggs}):\n${payload[0].prompt_foto_2}\n`);
  if (!WRITE) { console.log('Simulación: no se escribió nada. Agrega --write para guardar.'); process.exit(0); }
  for (let i = 0; i < payload.length; i += 100) {
    await call('POST', null, { action: 'upsert', table: 'products', rows: payload.slice(i, i + 100), pt: SHEETS_TOKEN });
  }
  const after = new Map((await readProducts()).map((r) => [r.id, r]));
  const bad = payload.filter((p) => (after.get(p.id) || {}).prompt_foto_1 !== p.prompt_foto_1 || (after.get(p.id) || {}).prompt_foto_2 !== p.prompt_foto_2);
  console.log(bad.length ? `ATENCIÓN: ${bad.length} filas no quedaron como se esperaba.` : `Listo: ${payload.length} productos actualizados y verificados.`);
  process.exit(bad.length ? 1 : 0);
}
