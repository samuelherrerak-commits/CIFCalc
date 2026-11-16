import { ensureXlsx, ensureJSZip } from './utils.js';

// Importador de "orden de compra" (plantilla de compras FOB → CIF en Excel)
// para crear un contenedor de una vez: lee la tabla de productos, los
// parámetros del embarque (flete, seguro, capacidad) y las fotos pegadas en
// el Excel. No crea productos del catálogo.
//
// La tabla se encuentra por sus encabezados (no por posición): basta con que
// la fila de títulos tenga "SKU" y "FOB". Cantidad = piezas pedidas (las que
// se pagan); el volumen usa las cajas de la plantilla, para que el flete se
// reparta igual que en el Excel.

const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const numOf = (v) => {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

// Columnas de la tabla: cada una se reconoce por palabras de su encabezado.
const COLUMNS = {
  supplier: [['fabrica'], ['proveedor']],
  serie: [['coleccion'], ['serie']],
  sku: [['codigo', 'sku'], ['sku']],
  desc: [['descripcion']],
  hs: [['arancel'], ['hs code']],
  estado: [['estado']],
  fob: [['precio', 'fob'], ['fob', 'unit']],
  pcsCtn: [['pcs', 'ctn'], ['unid', 'caja']],
  qty: [['solicitada'], ['cant']],
  ctn: [['cajas'], ['ctn']],
  len: [['largo']], wid: [['ancho']], hei: [['alto']],
  cbm: [['cbm', 'caja']],
  kgCtn: [['peso bruto', 'caja']]
};

function findHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, 60); r++) {
    const cells = (rows[r] || []).map(norm);
    if (cells.some(c => c.includes('sku')) && cells.some(c => c.includes('fob'))) return r;
  }
  return -1;
}

function mapColumns(header) {
  const cells = header.map(norm);
  const used = new Set();
  const col = {};
  for (const [key, options] of Object.entries(COLUMNS)) {
    for (const words of options) {
      const i = cells.findIndex((c, idx) => !used.has(idx) && c && words.every(w => c.includes(w)) &&
        // "Total FOB" no es el precio unitario; "Cant. Real" no es la pedida.
        !(key === 'fob' && c.includes('total')) && !(key === 'qty' && c.includes('real')) &&
        !(key === 'ctn' && (c.includes('pcs /') || c.includes('cbm') || c.includes('peso'))) &&
        !(key === 'cbm' && c.includes('total')));
      if (i >= 0) { col[key] = i; used.add(i); break; }
    }
  }
  return col;
}

// Valor a la derecha de una etiqueta ("Flete Marítimo Internacional ($ USD):").
function paramValue(rows, headerRow, words) {
  for (let r = 0; r < headerRow; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const t = norm(row[c]);
      if (t && words.every(w => t.includes(w))) {
        for (let k = c + 1; k < Math.min(row.length, c + 4); k++) {
          if (row[k] !== '' && row[k] != null) return row[k];
        }
      }
    }
  }
  return null;
}

// Fotos: imágenes ancladas a celdas (drawing) e imágenes "en celda" (richData).
// Devuelve { fila0: { base64, mimeType, filename } } con filas desde 0.
async function extractImages(zip, sheetPath) {
  const parser = new DOMParser();
  const xml = async (p) => { const f = zip.file(p); return f ? parser.parseFromString(await f.async('text'), 'application/xml') : null; };
  const relsOf = async (p) => {
    const dir = p.slice(0, p.lastIndexOf('/'));
    const doc = await xml(`${dir}/_rels/${p.slice(p.lastIndexOf('/') + 1)}.rels`);
    const map = {};
    if (doc) for (const r of Array.from(doc.getElementsByTagName('Relationship'))) {
      const t = r.getAttribute('Target') || '';
      map[r.getAttribute('Id')] = t.startsWith('/') ? t.slice(1) : new URL(t, `http://x/${dir}/`).pathname.slice(1);
    }
    return map;
  };
  const byRow = {};
  const put = (row, path, preferNext) => {
    if (!path) return;
    if (byRow[row] === undefined) byRow[row] = path;
    // Dos fotos ancladas en la misma fila: la segunda suele ser de la fila de abajo.
    else if (preferNext && byRow[row + 1] === undefined) byRow[row + 1] = path;
  };

  // 1) Imágenes flotantes del dibujo de la hoja.
  const sheetRels = await relsOf(sheetPath);
  const drawingPath = Object.values(sheetRels).find(p => p.includes('drawings/drawing'));
  if (drawingPath) {
    const doc = await xml(drawingPath);
    const rels = await relsOf(drawingPath);
    const anchors = doc ? [...Array.from(doc.getElementsByTagName('xdr:twoCellAnchor')), ...Array.from(doc.getElementsByTagName('xdr:oneCellAnchor'))] : [];
    const list = anchors.map(a => {
      const from = a.getElementsByTagName('xdr:from')[0];
      const rowEl = from && from.getElementsByTagName('xdr:row')[0];
      const offEl = from && from.getElementsByTagName('xdr:rowOff')[0];
      const blip = a.getElementsByTagName('a:blip')[0];
      return rowEl && blip ? { row: parseInt(rowEl.textContent, 10), off: offEl ? parseInt(offEl.textContent, 10) || 0 : 0, path: rels[blip.getAttribute('r:embed')] } : null;
    }).filter(Boolean).sort((x, y) => (x.row - y.row) || (x.off - y.off)); // la más baja en la celda va después
    for (const a of list) put(a.row, a.path, true);
  }

  // 2) Imágenes dentro de la celda (Excel 365): la celda lleva vm="N".
  const sheetDoc = await xml(sheetPath);
  const rvDoc = await xml('xl/richData/rdrichvalue.xml');
  const relDoc = await xml('xl/richData/richValueRel.xml');
  if (sheetDoc && rvDoc && relDoc) {
    const rvRels = await relsOf('xl/richData/richValueRel.xml');
    const relIds = Array.from(relDoc.getElementsByTagName('rel')).map(r => r.getAttribute('r:id'));
    const values = Array.from(rvDoc.getElementsByTagName('rv')).map(rv => {
      const v = rv.getElementsByTagName('v')[0];
      return v ? parseInt(v.textContent, 10) : -1;
    });
    for (const c of Array.from(sheetDoc.getElementsByTagName('c'))) {
      const vm = c.getAttribute('vm');
      if (!vm) continue;
      const relIdx = values[parseInt(vm, 10) - 1];
      const path = rvRels[relIds[relIdx]];
      const m = /(\d+)$/.exec(c.getAttribute('r') || '');
      if (m && path) put(parseInt(m[1], 10) - 1, path, false);
    }
  }

  const out = {};
  for (const [row, path] of Object.entries(byRow)) {
    const ext = path.split('.').pop().toLowerCase();
    const mimeType = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[ext];
    const f = zip.file(path);
    if (!mimeType || !f) continue; // WMF/EMF: no se pueden mostrar en la web
    out[row] = { base64: await f.async('base64'), mimeType, filename: path.split('/').pop() };
  }
  return out;
}

// Lee el archivo y devuelve { name, container, items, warnings }.
export async function readPurchaseOrder(file) {
  const [XLSX, JSZip] = await Promise.all([ensureXlsx(), ensureJSZip()]);
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });

  let sheetName = null, rows = null, headerRow = -1, rowOffset = 0;
  for (const n of wb.SheetNames) {
    const ws = wb.Sheets[n];
    const r = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: true });
    const h = findHeader(r);
    if (h >= 0) { sheetName = n; rows = r; headerRow = h; rowOffset = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).s.r : 0; break; }
  }
  if (!rows) throw new Error('No encontré la tabla de productos: debe tener una fila de títulos con "Código SKU" y "Precio Unit. FOB".');
  const col = mapColumns(rows[headerRow]);
  for (const k of ['sku', 'fob', 'qty']) {
    if (col[k] === undefined) throw new Error(`No encontré la columna de ${{ sku: 'código SKU', fob: 'precio unitario FOB', qty: 'cantidad solicitada' }[k]}.`);
  }

  // Ruta de la hoja dentro del .xlsx (para las fotos).
  const zip = await JSZip.loadAsync(buf);
  const wbDoc = new DOMParser().parseFromString(await zip.file('xl/workbook.xml').async('text'), 'application/xml');
  const wbRels = new DOMParser().parseFromString(await zip.file('xl/_rels/workbook.xml.rels').async('text'), 'application/xml');
  const sheetEl = Array.from(wbDoc.getElementsByTagName('sheet')).find(s => s.getAttribute('name') === sheetName);
  const relEl = sheetEl && Array.from(wbRels.getElementsByTagName('Relationship')).find(r => r.getAttribute('Id') === sheetEl.getAttribute('r:id'));
  const sheetPath = relEl ? 'xl/' + relEl.getAttribute('Target').replace(/^\/?xl\//, '') : 'xl/worksheets/sheet1.xml';
  const images = await extractImages(zip, sheetPath).catch(() => ({}));

  const cell = (r, k) => (col[k] === undefined ? '' : rows[r][col[k]]);
  const warnings = [];
  const items = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const sku = String(cell(r, 'sku') || '').trim();
    const fob = numOf(cell(r, 'fob'));
    const qty = Math.round(numOf(cell(r, 'qty')));
    if (!sku || /total/i.test(String(rows[r][0] || '')) || /sku/i.test(sku) && !fob) continue;
    if (!(qty > 0)) { warnings.push(`${sku}: sin cantidad, no se importó.`); continue; }
    const pcsCtn = numOf(cell(r, 'pcsCtn')) || 1;
    let ctn = numOf(cell(r, 'ctn'));
    if (!(ctn > 0)) ctn = Math.ceil(qty / pcsCtn);
    let cbm = numOf(cell(r, 'cbm'));
    if (!(cbm > 0)) {
      const [l, w, h] = ['len', 'wid', 'hei'].map(k => numOf(cell(r, k)));
      cbm = l && w && h ? (l * w * h) / 1e6 : 0;
    }
    const serie = String(cell(r, 'serie') || '').trim();
    const desc = String(cell(r, 'desc') || '').replace(/\s+/g, ' ').trim();
    const estado = String(cell(r, 'estado') || '').trim();
    if (!cbm) warnings.push(`${sku}: sin medidas de caja (no recibe flete).`);
    if (/valid|estimad|falta/i.test(estado)) warnings.push(`${sku}: ${estado}.`);
    items.push({
      supplier: String(cell(r, 'supplier') || '').trim(),
      sku, name: serie ? `${serie} — ${desc}` : (desc || sku),
      hs_code: String(cell(r, 'hs') || '').trim(),
      fob_unit: Math.round(fob * 10000) / 10000, qty,
      // Unid./caja efectiva = piezas ÷ cajas de la plantilla (así el volumen
      // y el flete quedan como en el Excel, aun con cajas incompletas).
      units_per_box: Math.round((qty / ctn) * 1e6) / 1e6, box_volume: Math.round(cbm * 1e6) / 1e6,
      weight_kg: numOf(cell(r, 'kgCtn')), boxes: ctn,
      photo: images[r + rowOffset] || null
    });
  }
  if (!items.length) throw new Error('La tabla no tiene productos con código y cantidad.');
  const noPhoto = items.filter(i => !i.photo).map(i => i.sku);
  if (noPhoto.length) warnings.push(`Sin foto: ${noPhoto.join(', ')}.`);

  // Parámetros del embarque.
  const freight = numOf(paramValue(rows, headerRow, ['flete', 'maritimo'])) + numOf(paramValue(rows, headerRow, ['gastos', 'origen']));
  const insLabelRow = rows.slice(0, headerRow).flat().map(norm).find(t => t.includes('seguro') && (t.includes('tasa') || t.includes('%')));
  let insRate = numOf(paramValue(rows, headerRow, ['tasa', 'seguro']));
  if (insRate > 0 && insRate < 1) insRate *= 100; // 0,01 → 1 %
  const capacity = numOf(paramValue(rows, headerRow, ['capacidad'])) || 0;
  const type = String(paramValue(rows, headerRow, ['tipo', 'contenedor']) || '');

  return {
    name: file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' '),
    container: {
      ocean_freight: Math.round(freight * 100) / 100,
      insurance_enabled: insRate > 0, insurance_rate: insRate,
      insurance_basis: insLabelRow && insLabelRow.includes('110') ? 'cfr110' : 'fob',
      container_capacity: capacity || (/40/.test(type) && /h/i.test(type) ? 68 : /40/.test(type) ? 58 : /20/.test(type) ? 28 : 0),
      container_type: type
    },
    items, warnings
  };
}
