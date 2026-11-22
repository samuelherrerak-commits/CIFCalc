import { esc, fmtNum } from './utils.js';
import { priceFor } from './pricing.js';

// PDF del catálogo (estilo del catálogo Briggs): portada, y por cada colección
// una hoja con la página oscura de presentación y la lista de productos con foto,
// código, acabados y el precio del nivel elegido. Se abre en una ventana lista
// para imprimir; en "Destino" se elige "Guardar como PDF".
const ORDER = ['Equinox', 'Eclipse', 'Selene', 'Callisto', 'Luna', 'Zenith', 'Triton', 'Tritón', 'Gravity', 'Accessories'];
const PER_PAGE = 5;
const DESCRIPTIONS = {
  Equinox: 'Inspirada en el momento en que el día y la noche alcanzan la misma duración, Equinox combina líneas limpias y proporciones armoniosas para crear espacios modernos, elegantes y atemporales.',
  Eclipse: 'Con una silueta arquitectónica y un carácter definido, Eclipse está diseñada para convertirse en el punto focal del ambiente. Sus formas geométricas crean un contraste sofisticado.'
};

// Con colección real → "Serie X". Los genéricos (sin colección propia) se
// agrupan por su categoría → "Categoría X".
const collectionOf = (p) => {
  const c = String(p.collection || '').trim();
  return c && c.toLowerCase() !== 'genérico' && c.toLowerCase() !== 'generico'
    ? { name: c, series: true }
    : { name: String(p.category || '').trim() || 'Otros productos', series: false };
};
// BRG-BL-GRA-01-CR → BRG-BL-GRA-01 (el color es lo único que cambia).
const baseCode = (sku) => String(sku || '').replace(/-(CR|SG|RG|NG|GL|BN|BB|GG)$/i, '').replace(/-$/, '');

// products: filas de Store; costOf(p) → costo estimado; tier = { name, pct }
export function buildCatalogModels(products, costOf, tier, tiers) {
  const groups = new Map(); // colección → Map(base → modelo)
  for (const p of products) {
    const { name: col, series } = collectionOf(p);
    const key = (series ? 's:' : 'c:') + col;
    const base = baseCode(p.sku_briggs) || p.id;
    if (!groups.has(key)) groups.set(key, { name: col, series, map: new Map() });
    const g = groups.get(key).map;
    if (!g.has(base)) g.set(base, { code: base, name: p.name, category: p.category, colors: [], variants: [], foto: '' });
    const m = g.get(base);
    if (p.color && !m.colors.includes(p.color)) m.colors.push(p.color);
    if (!m.foto && p.foto_url) m.foto = new URL(p.foto_url, window.location.href).href; // la ventana del PDF no resuelve rutas relativas
    m.variants.push({ color: p.color || '', cost: costOf(p) });
  }
  const rank = (c) => { const i = ORDER.findIndex(o => o.toLowerCase() === c.toLowerCase()); return i < 0 ? 99 : i; };
  // Primero las series (en el orden del índice) y después las categorías.
  return [...groups.values()]
    .sort((a, b) => (b.series - a.series) || rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
    .map(({ name, series, map }) => ({
      name, series,
      models: [...map.values()].sort((a, b) => a.code.localeCompare(b.code)).map(m => ({
        ...m, variants: m.variants.map(v => ({ color: v.color, price: priceFor(v.cost, tier, tiers) }))
      }))
    }));
}

// Un solo precio si todos los acabados cuestan igual; si no, uno por acabado
// (los que no tienen costo salen "Consultar").
const priceHtml = (m) => {
  const money = (v) => (v ? 'US$ ' + fmtNum(v) : 'Consultar');
  const prices = m.variants.map(v => v.price);
  if (prices.every(x => x === prices[0])) return `<div class="pr">${money(prices[0])}</div>`;
  return m.variants.map(v => `<div class="pr2"><span>${esc(v.color)}</span> <b>${money(v.price)}</b></div>`).join('');
};

const item = (m) => `
  <div class="it">
    <div class="ph">${m.foto ? `<img src="${esc(m.foto)}" alt="">` : ''}</div>
    <div class="tx">
      <div class="code">${esc(m.code)}</div>
      <div class="nm">${esc(m.name)}</div>
      ${m.colors.length ? `<div class="fin">Acabados: ${m.colors.map(esc).join(', ')}</div>` : ''}
      ${priceHtml(m)}
    </div>
  </div>`;

const list = (models, label, page) => `<div class="half list"><div class="lab">${esc(label)}</div>${models.map(item).join('')}<div class="foot"><span class="pg">${page}</span><span class="wm">BRIGGS</span></div></div>`;

export function openCatalogPdf(products, costOf, tier, tiers) {
  const cols = buildCatalogModels(products, costOf, tier, tiers);
  let page = 2;
  const sheets = [`<section class="sheet cover"><div class="logo">BRIGGS<small>THE PREMIUM BATH COLLECTION</small></div></section>`];
  for (const col of cols) {
    const chunks = [];
    for (let i = 0; i < col.models.length; i += PER_PAGE) chunks.push(col.models.slice(i, i + PER_PAGE));
    if (!chunks.length) continue;
    const kind = col.series ? 'SERIE' : 'CATEGORÍA';
    const label = `${kind} ${col.name.toUpperCase()}`;
    sheets.push(`<section class="sheet"><div class="half hero"><div class="serie">${kind}</div><div class="cname">${esc(col.name)}</div>${DESCRIPTIONS[col.name] ? `<p>${esc(DESCRIPTIONS[col.name])}</p>` : ''}</div>${list(chunks[0], label, ++page)}</section>`);
    for (let i = 1; i < chunks.length; i += 2) {
      sheets.push(`<section class="sheet">${list(chunks[i], label, ++page)}${chunks[i + 1] ? list(chunks[i + 1], label, ++page) : '<div class="half hero tail"></div>'}</section>`);
    }
  }
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Catálogo Briggs</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
@page{size:297mm 210mm;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-family:Inter,Helvetica,Arial,sans-serif;color:#111}
.sheet{width:297mm;height:210mm;display:flex;page-break-after:always;break-after:page;overflow:hidden;position:relative}
.half{width:148.5mm;height:210mm;position:relative;padding:12mm 11mm}
.cover{background:radial-gradient(ellipse at 50% 30%,#2a3340 0,#0b0f16 70%);align-items:flex-end;padding:18mm}
.logo{color:#fff;font:600 40pt Georgia,'Times New Roman',serif;letter-spacing:.02em;line-height:1}
.logo small{display:block;font:400 9pt Inter,sans-serif;letter-spacing:.18em;margin-top:3mm}
.hero{background:linear-gradient(160deg,#1b222c 0,#0a0d12 100%);color:#fff;display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:30mm}
.hero.tail{background:#fff}
.serie{font-size:10pt;margin-bottom:2mm}
.cname{font:italic 700 40pt 'Playfair Display',Georgia,serif;line-height:1.05;margin-bottom:8mm}
.hero p{font-size:10.5pt;line-height:1.5;max-width:120mm}
.lab{position:absolute;top:9mm;right:11mm;font-size:9.5pt;color:#9aa1ab}
.list{padding-top:18mm;padding-bottom:20mm;display:flex;flex-direction:column}
.it{flex:1;display:flex;align-items:center;gap:6mm;border-bottom:.3mm solid #cfd3d8;min-height:0}
.it:last-of-type{border-bottom:0}
.ph{width:44mm;height:28mm;display:flex;align-items:center;justify-content:center;flex:none}
.ph img{max-width:100%;max-height:100%;object-fit:contain}
.tx{flex:1;min-width:0}
.code{font-weight:600;font-size:11pt}
.nm{font-size:10.5pt;margin-top:.8mm;line-height:1.25}
.fin{font-size:8.5pt;color:#555;margin-top:1.2mm}
.pr{font-weight:600;font-size:12pt;margin-top:2mm}
.pr2{font-size:9pt;margin-top:.6mm;color:#444}.pr2 b{color:#111;margin-left:1.5mm}
.foot{position:absolute;left:11mm;right:11mm;bottom:9mm;display:flex;justify-content:space-between;align-items:flex-end}
.pg{font-size:8.5pt;color:#aab0b8}
.wm{font:600 18pt Georgia,serif;letter-spacing:.02em}
@media screen{body{background:#555}.sheet{margin:8mm auto;background:#fff;box-shadow:0 2px 12px #0008}.cover{background:#0b0f16}}
</style></head><body>${sheets.join('')}</body></html>`;
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open(); w.document.write(html); w.document.close();
  const go = () => setTimeout(() => { try { w.focus(); w.print(); } catch { /* el usuario puede imprimir manualmente */ } }, 400);
  w.addEventListener('load', () => {
    const imgs = [...w.document.images].filter(i => !i.complete);
    Promise.all(imgs.map(i => new Promise(r => { i.onload = i.onerror = r; })))
      .then(() => (w.document.fonts ? w.document.fonts.ready : null)).then(go, go);
  });
  return true;
}
