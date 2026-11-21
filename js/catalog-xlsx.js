import { fmtNum } from './utils.js';

// Lista de precios en Excel, con foto. Un renglón por producto (cada acabado),
// con el precio del nivel elegido: precio = costo ÷ (1 − margen). Los productos
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
const isSeries = (p) => { const c = String(p.collection || '').trim().toLowerCase(); return !!c && c !== 'genérico' && c !== 'generico'; };
const groupOf = (p) => (isSeries(p) ? String(p.collection).trim() : (String(p.category || '').trim() || 'Otros productos'));
const rank = (p) => { if (!isSeries(p)) return 1000; const i = ORDER.findIndex(o => o.toLowerCase() === String(p.collection).trim().toLowerCase()); return i < 0 ? 99 : i; };

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

// onProgress(hechas, total) mientras se leen las fotos.
export async function exportCatalogExcel(products, costOf, tier, onProgress) {
  const ExcelJS = await ensureExcelJS();
  const list = [...products].sort((a, b) =>
    rank(a) - rank(b) || groupOf(a).localeCompare(groupOf(b)) || String(a.sku_briggs).localeCompare(String(b.sku_briggs)));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Lista de precios', { views: [{ state: 'frozen', ySplit: 4 }] });
  const SIDE = 100; // px de la casilla cuadrada
  ws.columns = [
    { header: 'Foto', key: 'foto', width: (SIDE - 5) / 7 },
    { header: 'Código', key: 'code', width: 22 },
    { header: 'Producto', key: 'name', width: 46 },
    { header: 'Serie / Categoría', key: 'group', width: 26 },
    { header: 'Acabado', key: 'color', width: 14 },
    { header: 'Precio US$', key: 'price', width: 14 }
  ];
  // Título y encabezado
  ws.insertRow(1, ['BRIGGS — Lista de precios']);
  ws.insertRow(2, [`Fecha: ${new Date().toLocaleDateString('es-VE')} · precios en US$`]);
  ws.insertRow(3, []);
  ws.mergeCells('A1:F1');
  ws.getCell('A1').font = { name: 'Calibri', size: 16, bold: true };
  ws.getCell('A2').font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF666666' } };
  const head = ws.getRow(4);
  head.height = 24;
  head.eachCell(c => {
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B365D' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  let missing = 0;
  let r = 5;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const cost = costOf(p);
    const price = cost > 0 ? Math.round(cost / (1 - tier.pct / 100) * 100) / 100 : 0;
    const row = ws.getRow(r);
    row.values = [null, p.sku_briggs || '', p.name || '', groupOf(p), p.color || '', price > 0 ? price : 'Consultar'];
    row.height = SIDE * 0.75; // puntos: 100 px = 75 pt, casilla cuadrada
    row.eachCell({ includeEmpty: true }, c => {
      c.alignment = { vertical: 'middle', wrapText: true, horizontal: c.col === 6 ? 'right' : 'left' };
      c.border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
      c.font = { name: 'Calibri', size: 10 };
    });
    row.getCell(2).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1B365D' } };
    const pc = row.getCell(6);
    if (price > 0) { pc.numFmt = '"US$" #,##0.00'; pc.font = { name: 'Calibri', size: 11, bold: true }; } else pc.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF888888' } };
    if (p.foto_url) {
      const b64 = await squarePhoto(p.foto_url);
      if (b64) {
        const id = wb.addImage({ base64: b64, extension: 'png' });
        ws.addImage(id, { tl: { col: 0.06, row: r - 1 + 0.06 }, ext: { width: SIDE - 8, height: SIDE - 8 } });
      } else missing++;
    }
    if (onProgress) onProgress(i + 1, list.length);
    r++;
  }
  ws.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `Lista_de_precios_Briggs_${tier.name.replace(/[^\w]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { rows: list.length, photosMissing: missing };
}
