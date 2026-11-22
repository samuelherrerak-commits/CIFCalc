import { priceFor } from './pricing.js';
import { baseCode, colorRank } from './catalog-pdf.js';

// Lista de precios en Excel, con foto. Un renglón por producto (cada acabado),
// con el precio del nivel elegido (ver pricing.js). Los productos
// sin costo salen "Consultar". Las fotos van cuadradas y centradas en su casilla;
// si un producto no tiene foto (o no se puede leer), la casilla queda vacía.
const EXCELJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
let loading = null;
function ensureExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = EXCELJS_CDN;
      s.onload = () => resolve(window.ExcelJS);
      s.onerror = () => { loading = null; reject(new Error('No se pudo cargar la librería de Excel. Revisa tu conexión.')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

const ORDER = ['Equinox', 'Eclipse', 'Selene', 'Callisto', 'Luna', 'Zenith', 'Triton', 'Tritón', 'Gravity', 'Accessories'];
const FORMAS = ['Redondo', 'Cuadrado', 'Mixto'];
const isSeries = (p) => { const c = String(p.collection || '').trim().toLowerCase(); return !!c && c !== 'genérico' && c !== 'generico'; };
const formaOf = (p) => FORMAS.find(f => f.toLowerCase() === String(p.forma || '').trim().toLowerCase()) || '';
// Series Briggs primero; después los genéricos por forma (Redondo, Cuadrado, Mixto) y, al final, los sin forma.
export const groupOf = (p) => (isSeries(p) ? String(p.collection).trim() : formaOf(p) ? `Genérico · ${formaOf(p)}` : `Genérico · ${String(p.category || '').trim() || 'Otros'}`);
export const rank = (p) => {
  if (isSeries(p)) { const i = ORDER.findIndex(o => o.toLowerCase() === String(p.collection).trim().toLowerCase()); return i < 0 ? 99 : i; }
  const f = formaOf(p);
  return f ? 1000 + FORMAS.indexOf(f) : 2000;
};

// Foto → PNG cuadrado (fondo blanco) en base64; null si no se puede leer.
async function squarePhoto(url, size = 240) {
  try {
    const abs = new URL(url, window.location.href).href;
    const res = await fetch(abs);
    if (!res.ok) return null;
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    const k = Math.min(size / bmp.width, size / bmp.height);
    const w = bmp.width * k, h = bmp.height * k;
    ctx.drawImage(bmp, (size - w) / 2, (size - h) / 2, w, h);
    return canvas.toDataURL('image/png').split(',')[1];
  } catch { return null; }
}

// Orden de la lista: series Briggs, luego genéricos por forma; dentro de cada modelo, Cromado → Steel Gray → Rose Gold.
export const sortForList = (products) => [...products].sort((a, b) =>
  rank(a) - rank(b) || groupOf(a).localeCompare(groupOf(b)) || (isSeries(a) ? 0 : String(a.category || '').localeCompare(String(b.category || ''))) ||
  baseCode(a.sku_briggs).localeCompare(baseCode(b.sku_briggs)) || colorRank(a.color) - colorRank(b.color));

const sheetName = (s) => String(s).replace(/[\[\]:*?/\\]/g, '').slice(0, 31) || 'Lista';

function buildSheet(wb, name, list, costOf, tier, tiers, photo, tick) {
  const ws = wb.addWorksheet(sheetName(name), { views: [{ state: 'frozen', ySplit: 4 }] });
  const SIDE = 100; // px de la casilla cuadrada
  ws.columns = [
    { header: 'Foto', key: 'foto', width: (SIDE - 5) / 7 },
    { header: 'Código', key: 'code', width: 22 },
    { header: 'Producto', key: 'name', width: 46 },
    { header: 'Serie / Genérico', key: 'group', width: 26 },
    { header: 'Categoría', key: 'cat', width: 26 },
    { header: 'Acabado', key: 'color', width: 14 },
    { header: 'Precio US$', key: 'price', width: 14 }
  ];
  ws.insertRow(1, [`BRIGGS — Lista de precios · ${tier.name}`]);
  ws.insertRow(2, [`Fecha: ${new Date().toLocaleDateString('es-VE')} · precios en US$`]);
  ws.insertRow(3, []);
  ws.mergeCells('A1:G1');
  ws.getCell('A1').font = { name: 'Calibri', size: 16, bold: true };
  ws.getCell('A2').font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF666666' } };
  const head = ws.getRow(4);
  head.height = 24;
  head.eachCell(c => {
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B365D' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  let r = 5;
  return (async () => {
    for (const p of list) {
      const price = priceFor(costOf(p), tier, tiers);
      const row = ws.getRow(r);
      row.values = [null, p.sku_briggs || '', p.name || '', groupOf(p), p.category || '', p.color || '', price > 0 ? price : 'Consultar'];
      row.height = SIDE * 0.75; // puntos: 100 px = 75 pt, casilla cuadrada
      row.eachCell({ includeEmpty: true }, c => {
        c.alignment = { vertical: 'middle', wrapText: true, horizontal: c.col === 7 ? 'right' : 'left' };
        c.border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
        c.font = { name: 'Calibri', size: 10 };
      });
      row.getCell(2).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1B365D' } };
      const pc = row.getCell(7);
      if (price > 0) { pc.numFmt = '"US$" #,##0.00'; pc.font = { name: 'Calibri', size: 11, bold: true }; } else pc.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF888888' } };
      if (p.foto_url) {
        const id = await photo(p.foto_url);
        if (id !== null) ws.addImage(id, { tl: { col: 0.06, row: r - 1 + 0.06 }, ext: { width: SIDE - 8, height: SIDE - 8 } });
      }
      tick();
      r++;
    }
    ws.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  })();
}

// Un libro con una pestaña por nivel de precio (tierList). Las fotos se leen una sola vez y se reutilizan.
// onProgress(hechas, total) mientras se arman las filas.
export async function exportPriceListsExcel(products, costOf, tierList, tiers, onProgress, consolidated = false) {
  const ExcelJS = await ensureExcelJS();
  const list = sortForList(products);
  const wb = new ExcelJS.Workbook();
  const ids = new Map(); // url → id de imagen del libro (o null si no se pudo leer)
  let missing = 0;
  const photo = async (url) => {
    if (!ids.has(url)) {
      const b64 = await squarePhoto(url);
      if (!b64) missing++;
      ids.set(url, b64 ? wb.addImage({ base64: b64, extension: 'png' }) : null);
    }
    return ids.get(url);
  };
  const total = list.length * tierList.length;
  let done = 0;
  const tick = () => { done++; if (onProgress) onProgress(done, total); };
  for (const tier of tierList) await buildSheet(wb, tier.name, list, costOf, tier, tiers, photo, tick);
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  const slug = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_');
  a.download = `Lista_de_precios_Briggs_${consolidated ? 'Consolidado' : slug(tierList[0].name)}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { rows: list.length, photosMissing: missing };
}
