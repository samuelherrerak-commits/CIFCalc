import Store from '../store.js';
import { fmtNum, fmtInt, esc, num, ensureXlsx, ensureJSZip } from '../utils.js';
import { uploadFoto, upsert as sheetsUpsert } from '../sheets.js';

const Products = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    let products = Store.getAll('products');
    let suppliers = Store.getAll('suppliers');
    let query = '';
    let editingId = null;
    let selectedSupplierId = null;
    let importCandidates = [];
    let excelCandidates = [];

    const supplierName = (id) => {
      const s = suppliers.find(x => x.id === id);
      return s ? s.name : '';
    };

    const filtered = () => {
      const q = query.trim().toLowerCase();
      if (!q) return products;
      return products.filter(p => {
        const sup = supplierName(p.supplier_id);
        return [p.sku_briggs, p.sku, p.name, p.origin_country, sup]
          .some(v => String(v || '').toLowerCase().includes(q));
      });
    };

    const renderCount = () => {
      const el = document.getElementById('products-count');
      if (el) el.textContent = `${filtered().length} / ${products.length}`;
    };

    const renderImportBtn = () => {
      const btn = document.getElementById('btn-import');
      const n = buildImportCandidates().length;
      btn.textContent = n > 0 ? `Importar de Contenedores (${n})` : 'Importar de Contenedores';
    };

    const uniqueBriggsName = (sku) => {
      const base = `Briggs-${sku}`;
      let name = base;
      let n = 2;
      while (!Store.isSkuBriggsUnique(name)) {
        name = `${base}-${n++}`;
      }
      return name;
    };

    const buildImportCandidates = () => {
      const productSkus = new Set(products.map(p => String(p.sku || '').trim().toLowerCase()));
      const groups = new Map();
      for (const it of Store.getAll('items')) {
        if (it.product_id) continue;
        const sku = String(it.sku || '').trim();
        if (!sku) continue;
        if (productSkus.has(sku.toLowerCase())) continue;
        if (!groups.has(sku)) groups.set(sku, []);
        groups.get(sku).push(it);
      }
      const list = [];
      for (const [sku, items] of groups) {
        items.sort((a, b) =>
          new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)
        );
        const src = items[0];
        list.push({
          sku,
          sku_briggs: uniqueBriggsName(sku),
          name: src.name || '',
          supplier_id: src.supplier_id,
          origin_country: src.origin_country || '',
          units_per_box: Number(src.units_per_box) || 1,
          box_volume: Number(src.box_volume) || 0,
          weight_kg: Number(src.weight_kg) || 0,
          hs_code: src.hs_code || '',
          fob_unit: Number(src.fob_unit) || 0,
          tariff_rate: Number(src.tariff_rate) || 0,
          itemIds: items.map(i => i.id)
        });
      }
      list.sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
      return list;
    };

    const renderTable = () => {
      const tbody = document.getElementById('products-tbody');
      const list = filtered();
      tbody.innerHTML = list.length === 0
        ? `<tr><td colspan="16" class="p-4 text-center text-slate-400">Sin productos. Crea uno con "+ Nuevo Producto".</td></tr>`
        : list.map(p => `
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="p-2">${p.foto_url ? `<img src="${esc(p.foto_url)}" loading="lazy" decoding="async" class="w-8 h-8 object-cover rounded border border-slate-200" alt="">` : '<span class="text-slate-300">—</span>'}</td>
            <td class="p-2 font-bold text-blue-800">${esc(p.sku_briggs)}</td>
            <td class="p-2">${esc(p.sku)}</td>
            <td class="p-2">${esc(p.name)}</td>
            <td class="p-2">${esc(supplierName(p.supplier_id)) || '<span class="text-slate-400">—</span>'}</td>
            <td class="p-2">${esc(p.brand) || '<span class="text-slate-400">—</span>'}</td>
            <td class="p-2">${esc(p.category) || '<span class="text-slate-400">—</span>'}</td>
            <td class="p-2">${esc(p.collection) || '<span class="text-slate-400">—</span>'}</td>
            <td class="p-2">${esc(p.color) || '<span class="text-slate-400">—</span>'}</td>
            <td class="p-2">${esc(p.origin_country)}</td>
            <td class="p-2 text-right">${fmtInt(p.units_per_box)}</td>
            <td class="p-2 text-right">${Number(p.box_volume) || 0}</td>
            <td class="p-2 text-right">${fmtNum(p.weight_kg)}</td>
            <td class="p-2 text-right">$${fmtNum(p.fob_unit)}</td>
            <td class="p-2 text-right">${Number(p.tariff_rate) || 0}%</td>
            <td class="p-2 whitespace-nowrap">
              <button data-edit="${p.id}" class="text-blue-600 hover:text-blue-800 font-bold px-1" title="Editar">✎</button>
              <button data-del="${p.id}" class="text-red-500 hover:text-red-700 font-bold px-1" title="Eliminar">🗑</button>
            </td>
          </tr>
        `).join('');

      tbody.querySelectorAll('[data-edit]').forEach(btn => {
        btn.addEventListener('click', () => openForm(btn.dataset.edit));
      });
      tbody.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', () => removeProduct(btn.dataset.del));
      });
    };

    const renderSupplierSelect = () => {
      const sel = document.getElementById('f-sup');
      sel.innerHTML = `
        <option value="">— Proveedor —</option>
        ${suppliers.map(s => `<option value="${s.id}" ${s.id === selectedSupplierId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
        <option value="__new__">+ Nuevo proveedor</option>
      `;
    };

    const openForm = (id = null) => {
      editingId = id;
      const p = id ? Store.getById('products', id) : Store.newProduct();
      document.getElementById('f-briggs').value = p.sku_briggs || '';
      document.getElementById('f-sku').value = p.sku || '';
      document.getElementById('f-name').value = p.name || '';
      document.getElementById('f-country').value = p.origin_country || '';
      document.getElementById('f-brand').value = p.brand || '';
      document.getElementById('f-category').value = p.category || '';
      document.getElementById('f-collection').value = p.collection || '';
      document.getElementById('f-color').value = p.color || '';
      document.getElementById('f-photo').value = p.foto_url || '';
      document.getElementById('f-upb').value = p.units_per_box != null ? p.units_per_box : 1;
      document.getElementById('f-vol').value = p.box_volume != null ? p.box_volume : 0;
      document.getElementById('f-kg').value = p.weight_kg != null ? p.weight_kg : 0;
      document.getElementById('f-hs').value = p.hs_code || '';
      document.getElementById('f-fob').value = p.fob_unit != null ? p.fob_unit : 0;
      document.getElementById('f-tariff').value = p.tariff_rate != null ? p.tariff_rate : 0;
      selectedSupplierId = p.supplier_id || null;
      renderSupplierSelect();
      document.getElementById('product-modal-title').textContent = id ? 'Editar Producto' : 'Nuevo Producto';
      document.getElementById('product-modal').classList.remove('hidden');
      document.getElementById('f-briggs').focus();
    };

    const closeForm = () => {
      document.getElementById('product-modal').classList.add('hidden');
      editingId = null;
    };

    const saveProduct = () => {
      const skuBriggs = document.getElementById('f-briggs').value.trim();
      if (!skuBriggs) {
        alert('El SKU BRIGGS es obligatorio.');
        document.getElementById('f-briggs').focus();
        return;
      }
      if (!Store.isSkuBriggsUnique(skuBriggs, editingId)) {
        alert('Ya existe un producto con ese SKU BRIGGS.');
        document.getElementById('f-briggs').focus();
        return;
      }
      if (!document.getElementById('f-sku').value.trim()) {
        alert('El SKU es obligatorio.');
        document.getElementById('f-sku').focus();
        return;
      }
      if (!document.getElementById('f-name').value.trim()) {
        alert('El nombre del producto es obligatorio.');
        document.getElementById('f-name').focus();
        return;
      }
      if (!selectedSupplierId) {
        alert('Debes seleccionar un proveedor (o crear uno nuevo).');
        document.getElementById('f-sup').focus();
        return;
      }
      if (!document.getElementById('f-country').value.trim()) {
        alert('El país de origen es obligatorio.');
        document.getElementById('f-country').focus();
        return;
      }
      if (num(document.getElementById('f-upb')) <= 0) {
        alert('Las unidades por caja son obligatorias (mayor a 0).');
        document.getElementById('f-upb').focus();
        return;
      }
      if (num(document.getElementById('f-vol')) <= 0) {
        alert('El volumen de caja es obligatorio (mayor a 0).');
        document.getElementById('f-vol').focus();
        return;
      }
      if (num(document.getElementById('f-kg')) <= 0) {
        alert('El peso en kg es obligatorio (mayor a 0).');
        document.getElementById('f-kg').focus();
        return;
      }
      const data = {
        sku_briggs: skuBriggs,
        sku: document.getElementById('f-sku').value.trim(),
        name: document.getElementById('f-name').value.trim(),
        supplier_id: selectedSupplierId,
        origin_country: document.getElementById('f-country').value.trim(),
        brand: document.getElementById('f-brand').value.trim(),
        category: document.getElementById('f-category').value.trim(),
        collection: document.getElementById('f-collection').value.trim(),
        color: document.getElementById('f-color').value.trim(),
        foto_url: document.getElementById('f-photo').value.trim(),
        units_per_box: num(document.getElementById('f-upb')),
        box_volume: num(document.getElementById('f-vol')),
        weight_kg: num(document.getElementById('f-kg')),
        hs_code: document.getElementById('f-hs').value.trim(),
        fob_unit: num(document.getElementById('f-fob')),
        tariff_rate: num(document.getElementById('f-tariff'))
      };
      if (editingId) {
        Store.update('products', { ...data, id: editingId });
      } else {
        Store.insert('products', data);
      }
      products = Store.getAll('products');
      closeForm();
      renderCount();
      renderTable();
    };

    const removeProduct = (id) => {
      if (!confirm('¿Eliminar este producto del catálogo?')) return;
      Store.remove('products', id);
      products = Store.getAll('products');
      renderCount();
      renderTable();
    };

    const renderImportRows = () => {
      importCandidates = buildImportCandidates();
      const tbody = document.getElementById('import-tbody');
      const countEl = document.getElementById('import-count');
      const itemsEl = document.getElementById('import-items-count');
      const okBtn = document.getElementById('import-ok');
      if (importCandidates.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="p-4 text-center text-slate-400">No hay items de contenedores sin producto vinculado.</td></tr>';
        countEl.textContent = '0 productos';
        itemsEl.textContent = 'no hay items por vincular';
        okBtn.disabled = true;
        okBtn.textContent = 'Importar';
        return;
      }
      const totalItems = importCandidates.reduce((n, c) => n + c.itemIds.length, 0);
      tbody.innerHTML = importCandidates.map((c, i) => `
        <tr class="border-b border-slate-100">
          <td class="p-2"><input data-ck="${i}" type="checkbox" checked class="accent-blue-600 w-4 h-4"></td>
          <td class="p-2"><input data-briggs="${i}" value="${esc(c.sku_briggs)}" class="w-full p-1 border rounded bg-white text-xs font-bold text-blue-800"></td>
          <td class="p-2 font-mono text-xs">${esc(c.sku)}</td>
          <td class="p-2"><input data-name="${i}" value="${esc(c.name)}" class="w-full p-1 border rounded bg-white text-xs"></td>
          <td class="p-2 text-xs">${esc(supplierName(c.supplier_id)) || '<span class="text-slate-400">—</span>'}</td>
          <td class="p-2 text-right text-xs">${esc(c.origin_country)}</td>
          <td class="p-2 text-right text-xs">${Number(c.box_volume) || 0}</td>
          <td class="p-2 text-right"><input data-kg="${i}" type="number" min="0" step="0.01" value="${Number(c.weight_kg) || 0}" class="w-20 p-1 border rounded bg-white text-xs text-right"></td>
          <td class="p-2 text-right"><input data-fob="${i}" type="number" min="0" step="0.01" value="${Number(c.fob_unit) || 0}" class="w-20 p-1 border rounded bg-white text-xs text-right"></td>
          <td class="p-2 text-right"><input data-tariff="${i}" type="number" min="0" step="0.1" value="${Number(c.tariff_rate) || 0}" class="w-16 p-1 border rounded bg-white text-xs text-right"></td>
          <td class="p-2 text-center text-xs">${c.itemIds.length}</td>
        </tr>
      `).join('');
      countEl.textContent = `${importCandidates.length} producto${importCandidates.length === 1 ? '' : 's'}`;
      itemsEl.textContent = `vinculará ${totalItems} ${totalItems === 1 ? 'item' : 'items'} de contenedores`;
      okBtn.disabled = false;
      okBtn.textContent = `Importar (${importCandidates.length})`;
      tbody.addEventListener('change', (e) => {
        if (e.target.matches('[data-ck]')) {
          const checked = tbody.querySelectorAll('input[data-ck]:checked').length;
          okBtn.disabled = checked === 0;
          okBtn.textContent = `Importar (${checked})`;
        }
      });
    };

    const openImport = () => {
      renderImportRows();
      document.getElementById('import-modal').classList.remove('hidden');
    };

    const closeImport = () => {
      document.getElementById('import-modal').classList.add('hidden');
    };

    const runImport = () => {
      const rows = importCandidates.map((c, i) => {
        const ck = document.querySelector(`#import-tbody input[data-ck="${i}"]`);
        if (!ck || !ck.checked) return null;
        return {
          ...c,
          sku_briggs: document.querySelector(`#import-tbody input[data-briggs="${i}"]`).value.trim(),
          name: document.querySelector(`#import-tbody input[data-name="${i}"]`).value.trim(),
          weight_kg: num(document.querySelector(`#import-tbody input[data-kg="${i}"]`)),
          fob_unit: num(document.querySelector(`#import-tbody input[data-fob="${i}"]`)),
          tariff_rate: num(document.querySelector(`#import-tbody input[data-tariff="${i}"]`))
        };
      }).filter(Boolean);

      if (rows.length === 0) {
        alert('Selecciona al menos un producto para importar.');
        return;
      }

      let created = 0;
      let linked = 0;
      for (const c of rows) {
        if (!c.sku_briggs) continue;
        if (!c.name) c.name = c.sku;
        let briggs = c.sku_briggs;
        let n = 2;
        while (!Store.isSkuBriggsUnique(briggs)) briggs = `${c.sku_briggs}-${n++}`;
        const p = Store.insert('products', {
          sku_briggs: briggs,
          sku: c.sku,
          name: c.name,
          supplier_id: c.supplier_id,
          origin_country: c.origin_country,
          units_per_box: c.units_per_box,
          box_volume: c.box_volume,
          weight_kg: c.weight_kg,
          hs_code: c.hs_code,
          fob_unit: c.fob_unit,
          tariff_rate: c.tariff_rate
        });
        created++;
        for (const itemId of c.itemIds) {
          Store.update('items', { id: itemId, product_id: p.id });
          linked++;
        }
      }
      products = Store.getAll('products');
      renderImportBtn();
      renderCount();
      renderTable();
      closeImport();
      alert(`Importados ${created} producto${created === 1 ? '' : 's'} en el catálogo y vinculados ${linked} ${linked === 1 ? 'item' : 'items'} de contenedores.`);
    };

    // --- Importar desde Excel (Maestro de Códigos) ---
    const normalizeHeader = (s) => String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim();

    const findColumn = (headerRow, candidates) => {
      const normalized = headerRow.map(normalizeHeader);
      for (const candidate of candidates) {
        const idx = normalized.findIndex(h => h.includes(candidate));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const uniqueBriggsExact = (code, usedInBatch) => {
      const base = String(code || '').trim();
      let candidate = base;
      let n = 2;
      while (!Store.isSkuBriggsUnique(candidate) || usedInBatch.has(candidate.toLowerCase())) {
        candidate = `${base}-${n++}`;
      }
      usedInBatch.add(candidate.toLowerCase());
      return candidate;
    };

    // Las fotos del Maestro de Códigos son imágenes flotantes ancladas a celdas, no datos
    // de celda: SheetJS no las lee. El .xlsx es un ZIP, así que se extraen directamente
    // de xl/drawings/drawing1.xml (posición) + xl/media/* (contenido) usando JSZip.
    const extractImagesFromXlsx = async (zip) => {
      const drawingFile = zip.file('xl/drawings/drawing1.xml');
      const relsFile = zip.file('xl/drawings/_rels/drawing1.xml.rels');
      if (!drawingFile || !relsFile) return {};

      const [drawingXml, relsXml] = await Promise.all([drawingFile.async('text'), relsFile.async('text')]);
      const parser = new DOMParser();

      const relsDoc = parser.parseFromString(relsXml, 'application/xml');
      const relMap = {};
      Array.from(relsDoc.getElementsByTagName('Relationship')).forEach(r => {
        const id = r.getAttribute('Id');
        const target = r.getAttribute('Target') || '';
        relMap[id] = target.replace(/^\.\.\//, 'xl/');
      });

      const drawingDoc = parser.parseFromString(drawingXml, 'application/xml');
      const anchors = Array.from(drawingDoc.getElementsByTagName('xdr:twoCellAnchor'));
      const rowToPath = {};
      for (const anchor of anchors) {
        const fromEl = anchor.getElementsByTagName('xdr:from')[0];
        const rowEl = fromEl ? fromEl.getElementsByTagName('xdr:row')[0] : null;
        const blipEl = anchor.getElementsByTagName('a:blip')[0];
        if (!rowEl || !blipEl) continue;
        const fromRow = parseInt(rowEl.textContent, 10);
        const rId = blipEl.getAttribute('r:embed');
        const path = rId && relMap[rId];
        if (Number.isInteger(fromRow) && path) rowToPath[fromRow] = path;
      }

      const images = {};
      for (const [row, path] of Object.entries(rowToPath)) {
        const mediaFile = zip.file(path);
        if (!mediaFile) continue;
        const base64 = await mediaFile.async('base64');
        const ext = path.split('.').pop().toLowerCase();
        const mimeType = ext === 'png' ? 'image/png' : (ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : '');
        if (!mimeType) continue;
        images[row] = { base64, mimeType, filename: path.split('/').pop() };
      }
      return images;
    };

    const buildExcelCandidatesFromRows = (rows, images) => {
      if (!rows || rows.length === 0) return [];
      const header = rows[0].map(h => (h == null ? '' : h));
      const col = {
        proveedor: findColumn(header, ['proveedor']),
        marca: findColumn(header, ['marca']),
        colGenerador: findColumn(header, ['coleccion (generador)', 'coleccion generador']),
        colCatalogo: findColumn(header, ['coleccion (catalogo)', 'coleccion catalogo']),
        origen: findColumn(header, ['codigo origen']),
        descripcion: findColumn(header, ['descripcion']),
        categoria: findColumn(header, ['categoria']),
        color: findColumn(header, ['color']),
        briggs: findColumn(header, ['codigo de producto generado'])
      };
      if (col.proveedor === -1 || col.briggs === -1) {
        alert('No se reconocen las columnas "Proveedor" y/o "CÓDIGO DE PRODUCTO GENERADO" en la hoja. Revisa el archivo.');
        return [];
      }

      const usedInBatch = new Set();
      const candidates = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const proveedor = row[col.proveedor];
        const briggsRaw = col.briggs !== -1 ? row[col.briggs] : null;
        // Descarta filas separadoras de bloque (proveedor vacío/0) y filas sin código generado
        if (!proveedor || proveedor === 0 || String(proveedor).trim() === '') continue;
        if (!briggsRaw || String(briggsRaw).trim() === '') continue;

        const sku_briggs = uniqueBriggsExact(String(briggsRaw).trim(), usedInBatch);
        candidates.push({
          sku_briggs,
          sku: col.origen !== -1 ? String(row[col.origen] || '').trim() : '',
          name: col.descripcion !== -1 ? String(row[col.descripcion] || '').trim() : '',
          supplier_name: String(proveedor).trim(),
          brand: col.marca !== -1 ? String(row[col.marca] || '').trim() : '',
          category: col.categoria !== -1 ? String(row[col.categoria] || '').trim() : '',
          collection: (col.colGenerador !== -1 && row[col.colGenerador]) ? String(row[col.colGenerador]).trim()
            : (col.colCatalogo !== -1 ? String(row[col.colCatalogo] || '').trim() : ''),
          color: col.color !== -1 ? String(row[col.color] || '').trim() : '',
          photo: (images && images[i]) || null,
          origin_country: '',
          units_per_box: 1,
          box_volume: 0,
          weight_kg: 0,
          fob_unit: 0,
          tariff_rate: 0,
          hs_code: ''
        });
      }
      return candidates;
    };

    const renderExcelImportRows = () => {
      const tbody = document.getElementById('excel-import-tbody');
      const countEl = document.getElementById('excel-import-count');
      const okBtn = document.getElementById('excel-import-ok');
      if (excelCandidates.length === 0) {
        tbody.innerHTML = '<tr><td colspan="16" class="p-4 text-center text-slate-400">No se detectaron productos válidos en el archivo.</td></tr>';
        countEl.textContent = '0 productos';
        okBtn.disabled = true;
        okBtn.textContent = 'Importar';
        return;
      }
      tbody.innerHTML = excelCandidates.map((c, i) => `
        <tr class="border-b border-slate-100">
          <td class="p-2"><input data-ck="${i}" type="checkbox" checked class="accent-emerald-600 w-4 h-4"></td>
          <td class="p-2">${c.photo ? `<img src="data:${c.photo.mimeType};base64,${c.photo.base64}" class="w-8 h-8 object-cover rounded border border-slate-200" alt="">` : '<span class="text-slate-300">—</span>'}</td>
          <td class="p-2"><input data-briggs="${i}" value="${esc(c.sku_briggs)}" class="w-32 p-1 border rounded bg-white text-xs font-bold text-blue-800"></td>
          <td class="p-2 font-mono text-xs">${esc(c.sku)}</td>
          <td class="p-2"><input data-name="${i}" value="${esc(c.name)}" class="w-48 p-1 border rounded bg-white text-xs"></td>
          <td class="p-2 text-xs">${esc(c.supplier_name)}</td>
          <td class="p-2 text-xs">${esc(c.brand)}</td>
          <td class="p-2 text-xs">${esc(c.category)}</td>
          <td class="p-2 text-xs">${esc(c.collection)}</td>
          <td class="p-2 text-xs">${esc(c.color)}</td>
          <td class="p-2"><input data-country="${i}" value="${esc(c.origin_country)}" class="w-20 p-1 border rounded bg-white text-xs"></td>
          <td class="p-2 text-right"><input data-upb="${i}" type="number" min="0" step="1" value="${c.units_per_box}" class="w-16 p-1 border rounded bg-white text-xs text-right"></td>
          <td class="p-2 text-right"><input data-vol="${i}" type="number" min="0" step="0.001" value="${c.box_volume}" class="w-20 p-1 border rounded bg-white text-xs text-right"></td>
          <td class="p-2 text-right"><input data-kg="${i}" type="number" min="0" step="0.01" value="${c.weight_kg}" class="w-20 p-1 border rounded bg-white text-xs text-right"></td>
          <td class="p-2 text-right"><input data-fob="${i}" type="number" min="0" step="0.01" value="${c.fob_unit}" class="w-20 p-1 border rounded bg-white text-xs text-right"></td>
          <td class="p-2 text-right"><input data-tariff="${i}" type="number" min="0" step="0.1" value="${c.tariff_rate}" class="w-16 p-1 border rounded bg-white text-xs text-right"></td>
        </tr>
      `).join('');
      countEl.textContent = `${excelCandidates.length} producto${excelCandidates.length === 1 ? '' : 's'}`;
      okBtn.disabled = false;
      okBtn.textContent = `Importar (${excelCandidates.length})`;
      const withPhoto = excelCandidates.filter(c => c.photo).length;
      const photoStatusEl = document.getElementById('excel-photo-status');
      photoStatusEl.classList.remove('hidden');
      photoStatusEl.textContent = withPhoto > 0
        ? `${withPhoto} de ${excelCandidates.length} productos traen foto — se subirán a Google Drive al importar.`
        : 'No se detectaron fotos en el archivo (o el navegador no pudo leerlas).';
      tbody.addEventListener('change', (e) => {
        if (e.target.matches('[data-ck]')) {
          const checked = tbody.querySelectorAll('input[data-ck]:checked').length;
          okBtn.disabled = checked === 0;
          okBtn.textContent = `Importar (${checked})`;
        }
      });
    };

    const openExcelImport = () => {
      document.getElementById('excel-file-input').click();
    };

    const closeExcelImport = () => {
      document.getElementById('excel-import-modal').classList.add('hidden');
    };

    const handleExcelFile = async (file) => {
      try {
        await ensureXlsx();
      } catch (e) {
        alert(e.message);
        return;
      }
      if (!window.XLSX) {
        alert('La librería de Excel no está disponible. Revisa tu conexión.');
        return;
      }
      const buffer = await file.arrayBuffer();
      const wb = window.XLSX.read(buffer, { type: 'array' });
      const sheetName = wb.SheetNames.includes('Maestro') ? 'Maestro' : wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

      // Las fotos son un extra: si JSZip falla o el archivo no trae dibujos, se importa igual sin fotos.
      let images = {};
      try {
        await ensureJSZip();
        const zip = await window.JSZip.loadAsync(buffer);
        images = await extractImagesFromXlsx(zip);
      } catch (e) {
        console.warn('Maestro de Costo: no se pudieron leer las fotos del Excel.', e);
      }

      excelCandidates = buildExcelCandidatesFromRows(rows, images);
      renderExcelImportRows();
      document.getElementById('excel-import-modal').classList.remove('hidden');
    };

    // Sube una foto con reintentos: una llamada que falla por un hipo transitorio
    // de Apps Script/Drive (cuota, timeout, red) ya no se pierde en el primer intento.
    const uploadFotoWithRetry = async (id, filename, mimeType, base64, attempts = 3) => {
      let lastErr;
      for (let i = 0; i < attempts; i++) {
        try {
          return await uploadFoto(id, filename, mimeType, base64);
        } catch (e) {
          lastErr = e;
          if (i < attempts - 1) await new Promise(r => setTimeout(r, 800 * (i + 1)));
        }
      }
      throw lastErr;
    };

    const runExcelImport = async () => {
      const tbody = document.getElementById('excel-import-tbody');
      const rows = excelCandidates.map((c, i) => {
        const ck = tbody.querySelector(`input[data-ck="${i}"]`);
        if (!ck || !ck.checked) return null;
        return {
          ...c,
          sku_briggs: tbody.querySelector(`input[data-briggs="${i}"]`).value.trim(),
          name: tbody.querySelector(`input[data-name="${i}"]`).value.trim(),
          origin_country: tbody.querySelector(`input[data-country="${i}"]`).value.trim(),
          units_per_box: num(tbody.querySelector(`input[data-upb="${i}"]`)),
          box_volume: num(tbody.querySelector(`input[data-vol="${i}"]`)),
          weight_kg: num(tbody.querySelector(`input[data-kg="${i}"]`)),
          fob_unit: num(tbody.querySelector(`input[data-fob="${i}"]`)),
          tariff_rate: num(tbody.querySelector(`input[data-tariff="${i}"]`))
        };
      }).filter(Boolean);

      if (rows.length === 0) {
        alert('Selecciona al menos un producto para importar.');
        return;
      }

      // uploadFoto busca la fila por id EN LA HOJA DE SHEETS, así que el producto debe
      // existir ya (creado y escrito en Sheets) antes de pedirle al Apps Script la foto.
      const rowsWithPhoto = rows.filter(c => c.photo);
      let uploadFailures = 0;
      let done = 0;
      const progressWrap = document.getElementById('excel-upload-progress');
      const progressBar = document.getElementById('excel-upload-progress-bar');
      const progressText = document.getElementById('excel-upload-progress-text');
      if (rowsWithPhoto.length > 0) {
        document.getElementById('excel-import-ok').disabled = true;
        document.getElementById('excel-import-cancel').disabled = true;
        progressWrap.classList.remove('hidden');
      }

      let createdProducts = 0;
      let createdSuppliers = 0;
      for (const c of rows) {
        if (!c.sku_briggs) continue;
        if (!Store.isSkuBriggsUnique(c.sku_briggs)) continue; // ya se resolvió al construir el lote, pero se revalida por seguridad

        let supplier = suppliers.find(s => s.name.trim().toLowerCase() === c.supplier_name.trim().toLowerCase());
        if (!supplier && c.supplier_name) {
          supplier = Store.insert('suppliers', { name: c.supplier_name, country: '', contact_email: '', contact_phone: '' });
          suppliers = Store.getAll('suppliers');
          createdSuppliers++;
        }

        const product = Store.insert('products', {
          sku_briggs: c.sku_briggs,
          sku: c.sku,
          name: c.name || c.sku,
          supplier_id: supplier ? supplier.id : null,
          origin_country: c.origin_country,
          brand: c.brand,
          category: c.category,
          collection: c.collection,
          color: c.color,
          foto_url: '',
          foto_file_id: '',
          units_per_box: c.units_per_box,
          box_volume: c.box_volume,
          weight_kg: c.weight_kg,
          hs_code: c.hs_code,
          fob_unit: c.fob_unit,
          tariff_rate: c.tariff_rate
        });
        createdProducts++;

        if (c.photo) {
          progressText.textContent = `Subiendo fotos… ${done + 1}/${rowsWithPhoto.length} (${c.sku_briggs})`;
          try {
            await sheetsUpsert('products', [product]); // asegura que la fila ya exista en Sheets
            const result = await uploadFotoWithRetry(product.id, c.photo.filename, c.photo.mimeType, c.photo.base64);
            Store.update('products', { id: product.id, foto_url: result.foto_url, foto_file_id: result.foto_file_id });
          } catch (e) {
            console.warn('Maestro de Costo: no se pudo subir la foto de', c.sku_briggs, e);
            uploadFailures++;
          }
          done++;
          progressBar.style.width = `${Math.round((done / rowsWithPhoto.length) * 100)}%`;
        }
      }

      if (rowsWithPhoto.length > 0) {
        progressWrap.classList.add('hidden');
        document.getElementById('excel-import-ok').disabled = false;
        document.getElementById('excel-import-cancel').disabled = false;
      }

      products = Store.getAll('products');
      renderCount();
      renderTable();
      closeExcelImport();
      const photoNote = rowsWithPhoto.length > 0
        ? (uploadFailures > 0
          ? ` ${rowsWithPhoto.length - uploadFailures} de ${rowsWithPhoto.length} fotos subidas (${uploadFailures} fallaron — revisa tu configuración de Apps Script/Drive).`
          : ` ${rowsWithPhoto.length} foto${rowsWithPhoto.length === 1 ? '' : 's'} subida${rowsWithPhoto.length === 1 ? '' : 's'} a Drive.`)
        : '';
      alert(`Importados ${createdProducts} producto${createdProducts === 1 ? '' : 's'} (${createdSuppliers} proveedor${createdSuppliers === 1 ? '' : 'es'} nuevo${createdSuppliers === 1 ? '' : 's'} creado${createdSuppliers === 1 ? '' : 's'}).${photoNote}`);
    };

    // Reintentar fotos faltantes: reusa el mismo Excel del Maestro de Códigos, pero
    // en vez de crear productos, solo completa la foto de los que ya existen y quedaron
    // sin foto_file_id (falló su subida en la importación original).
    const handleRetryPhotosFile = async (file) => {
      try {
        await ensureXlsx();
      } catch (e) {
        alert(e.message);
        return;
      }
      if (!window.XLSX) {
        alert('La librería de Excel no está disponible. Revisa tu conexión.');
        return;
      }

      const buffer = await file.arrayBuffer();
      const wb = window.XLSX.read(buffer, { type: 'array' });
      const sheetName = wb.SheetNames.includes('Maestro') ? 'Maestro' : wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

      let images = {};
      try {
        await ensureJSZip();
        const zip = await window.JSZip.loadAsync(buffer);
        images = await extractImagesFromXlsx(zip);
      } catch (e) {
        console.warn('Maestro de Costo: no se pudieron leer las fotos del Excel.', e);
      }

      const candidates = buildExcelCandidatesFromRows(rows, images).filter(c => c.photo);
      if (candidates.length === 0) {
        alert('No se encontraron filas con foto en el archivo.');
        return;
      }

      const norm = (s) => String(s || '').trim().toLowerCase();
      let uploaded = 0, alreadyHadPhoto = 0, notFound = 0, failed = 0;
      const progressWrap = document.getElementById('retry-photos-progress');
      const progressBar = document.getElementById('retry-photos-progress-bar');
      const progressText = document.getElementById('retry-photos-progress-text');
      const btn = document.getElementById('btn-retry-photos');
      btn.disabled = true;
      progressWrap.classList.remove('hidden');

      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        progressText.textContent = `Revisando fotos… ${i + 1}/${candidates.length} (${c.sku_briggs})`;
        progressBar.style.width = `${Math.round(((i + 1) / candidates.length) * 100)}%`;

        const product = products.find(p => norm(p.sku_briggs) === norm(c.sku_briggs));
        if (!product) { notFound++; continue; }
        if (product.foto_file_id) { alreadyHadPhoto++; continue; }

        try {
          const result = await uploadFotoWithRetry(product.id, c.photo.filename, c.photo.mimeType, c.photo.base64);
          Store.update('products', { id: product.id, foto_url: result.foto_url, foto_file_id: result.foto_file_id });
          uploaded++;
        } catch (e) {
          console.warn('Maestro de Costo: no se pudo subir la foto de', c.sku_briggs, e);
          failed++;
        }
      }

      progressWrap.classList.add('hidden');
      btn.disabled = false;
      products = Store.getAll('products');
      renderCount();
      renderTable();

      alert(
        `Fotos subidas: ${uploaded}.\n` +
        `Ya tenían foto (omitidas): ${alreadyHadPhoto}.\n` +
        `Filas sin producto correspondiente en el catálogo: ${notFound}.\n` +
        (failed > 0 ? `Fallaron incluso con reintentos: ${failed} (revisa tu Apps Script/Drive).` : 'Sin fallos.')
      );
    };

    const openSupplierForm = () => {
      document.getElementById('f-sup-name').value = '';
      document.getElementById('f-sup-country').value = '';
      document.getElementById('f-sup-email').value = '';
      document.getElementById('f-sup-phone').value = '';
      document.getElementById('supplier-modal').classList.remove('hidden');
      document.getElementById('f-sup-name').focus();
    };

    const closeSupplierForm = () => {
      document.getElementById('supplier-modal').classList.add('hidden');
    };

    const saveSupplierForm = () => {
      const name = document.getElementById('f-sup-name').value.trim();
      if (!name) { document.getElementById('f-sup-name').focus(); return; }
      const data = {
        name,
        country: document.getElementById('f-sup-country').value.trim(),
        contact_email: document.getElementById('f-sup-email').value.trim(),
        contact_phone: document.getElementById('f-sup-phone').value.trim()
      };
      const sup = Store.insert('suppliers', data);
      suppliers = Store.getAll('suppliers');
      closeSupplierForm();
      selectedSupplierId = sup.id;
      renderSupplierSelect();
    };

    app.innerHTML = `
      <header class="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-xl shadow-sm border border-slate-200 gap-4">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">Maestro de Costo — Catálogo de Productos</h1>
          <p class="text-sm text-slate-500">Base de datos maestra de productos para tus contenedores</p>
        </div>
        <div class="flex items-center gap-2">
          <input id="products-search" type="text" placeholder="Buscar por SKU, SKU BRIGGS, nombre, proveedor…"
                 class="w-72 p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
          <button id="btn-import" class="bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold py-2 px-4 rounded-lg shadow-sm transition whitespace-nowrap">Importar de Contenedores</button>
          <button id="btn-import-excel" class="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold py-2 px-4 rounded-lg shadow-sm transition whitespace-nowrap">Importar Excel</button>
          <input id="excel-file-input" type="file" accept=".xlsx,.xls" class="hidden">
          <button id="btn-retry-photos" class="bg-slate-600 hover:bg-slate-700 text-white text-sm font-bold py-2 px-4 rounded-lg shadow-sm transition whitespace-nowrap">Reintentar fotos faltantes</button>
          <input id="retry-photos-file-input" type="file" accept=".xlsx,.xls" class="hidden">
          <button id="btn-new-product" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-4 rounded-lg shadow-sm transition whitespace-nowrap">
            + Nuevo Producto
          </button>
        </div>
      </header>

      <div id="retry-photos-progress" class="hidden bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
          <div id="retry-photos-progress-bar" class="h-full bg-emerald-500 transition-all duration-150" style="width:0%"></div>
        </div>
        <p id="retry-photos-progress-text" class="text-xs text-slate-500 mt-1"></p>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
        <div class="flex items-center justify-between px-4 py-2 border-b border-slate-200 text-xs text-slate-500">
          <span id="products-count"></span>
        </div>
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-100 border-b border-slate-200 text-slate-700">
              <th class="p-2">Foto</th>
              <th class="p-2">SKU BRIGGS</th>
              <th class="p-2">SKU</th>
              <th class="p-2">Nombre</th>
              <th class="p-2">Proveedor</th>
              <th class="p-2">Marca</th>
              <th class="p-2">Categoría</th>
              <th class="p-2">Colección</th>
              <th class="p-2">Color</th>
              <th class="p-2">País</th>
              <th class="p-2 text-right">Unid/Caja</th>
              <th class="p-2 text-right">Vol. Caja (m³)</th>
              <th class="p-2 text-right">Peso (kg)</th>
              <th class="p-2 text-right">FOB Unit ($)</th>
              <th class="p-2 text-right">% Arancel</th>
              <th class="p-2 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody id="products-tbody"></tbody>
        </table>
      </div>

      <!-- Modal Producto -->
      <div id="product-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
          <div class="flex justify-between items-center">
            <h3 id="product-modal-title" class="text-lg font-bold text-slate-800">Nuevo Producto</h3>
            <button id="prod-close" class="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none">✕</button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">SKU BRIGGS *</label>
              <input id="f-briggs" type="text" required class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Denominación interna (única)">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">SKU *</label>
              <input id="f-sku" type="text" required class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Nombre *</label>
              <input id="f-name" type="text" required class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Proveedor *</label>
              <select id="f-sup" required class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"></select>
            </div>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">País Origen *</label>
            <input id="f-country" type="text" required class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Marca</label>
              <input id="f-brand" type="text" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Categoría</label>
              <input id="f-category" type="text" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Colección</label>
              <input id="f-collection" type="text" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Color</label>
              <input id="f-color" type="text" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            </div>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Foto (enlace de Google Drive)</label>
            <input id="f-photo" type="text" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="https://drive.google.com/uc?export=view&id=...">
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Unid/Caja *</label>
              <input id="f-upb" type="number" min="0" step="1" required class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Vol. Caja (m³) *</label>
              <input id="f-vol" type="number" min="0" step="0.001" required class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Cód. Arancel</label>
              <input id="f-hs" type="text" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Peso (kg) *</label>
              <input id="f-kg" type="number" min="0" step="0.01" required class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">FOB Unit ($)</label>
              <input id="f-fob" type="number" min="0" step="0.01" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            </div>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">% Arancel</label>
            <input id="f-tariff" type="number" min="0" step="0.1" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
          </div>
          <div class="flex justify-end gap-2 pt-1">
            <button id="prod-cancel" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-2 px-4 rounded-lg transition">Cancelar</button>
            <button id="prod-save" class="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition">Guardar</button>
          </div>
        </div>
      </div>

      <!-- Modal Importar desde contenedores -->
      <div id="import-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-5xl p-5 space-y-4 max-h-[90vh] flex flex-col">
          <div class="flex justify-between items-center">
            <h3 class="text-lg font-bold text-slate-800">Importar Productos desde Contenedores</h3>
            <button id="import-close" class="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none">✕</button>
          </div>
          <p class="text-xs text-slate-500">
            Se crearán <span id="import-count" class="font-bold text-slate-700"></span> en el catálogo y <span id="import-items-count" class="font-bold text-slate-700"></span>. Los items legacy tienen peso 0 kg; complétalo luego en cada ficha o contenedor.
          </p>
          <div class="overflow-y-auto border border-slate-200 rounded-lg">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-slate-100 border-b border-slate-200 text-slate-700">
                  <th class="p-2"></th>
                  <th class="p-2">SKU BRIGGS</th>
                  <th class="p-2">SKU</th>
                  <th class="p-2">Nombre</th>
                  <th class="p-2">Proveedor</th>
                  <th class="p-2">País</th>
                  <th class="p-2 text-right">Vol. Caja (m³)</th>
                  <th class="p-2 text-right">Peso (kg)</th>
                  <th class="p-2 text-right">FOB $</th>
                  <th class="p-2 text-right">% Arancel</th>
                  <th class="p-2 text-center">Cont.</th>
                </tr>
              </thead>
              <tbody id="import-tbody"></tbody>
            </table>
          </div>
          <div class="flex justify-end gap-2 pt-1">
            <button id="import-cancel" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-2 px-4 rounded-lg transition">Cancelar</button>
            <button id="import-ok" class="text-xs bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 px-4 rounded-lg transition">Importar</button>
          </div>
        </div>
      </div>

      <!-- Modal Importar desde Excel (Maestro de Códigos) -->
      <div id="excel-import-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-6xl p-5 space-y-4 max-h-[90vh] flex flex-col">
          <div class="flex justify-between items-center">
            <h3 class="text-lg font-bold text-slate-800">Importar desde Excel (Maestro de Códigos)</h3>
            <button id="excel-import-close" class="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none">✕</button>
          </div>
          <p class="text-xs text-slate-500">
            Se detectaron <span id="excel-import-count" class="font-bold text-slate-700"></span>. El archivo no trae país, peso, volumen ni FOB — se cargan con valores por defecto que puedes editar aquí antes de importar, o después en cada ficha.
          </p>
          <p id="excel-photo-status" class="text-xs text-slate-500 hidden"></p>
          <div id="excel-upload-progress" class="hidden">
            <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div id="excel-upload-progress-bar" class="h-full bg-emerald-500 transition-all duration-150" style="width:0%"></div>
            </div>
            <p id="excel-upload-progress-text" class="text-xs text-slate-500 mt-1"></p>
          </div>
          <div class="overflow-y-auto border border-slate-200 rounded-lg">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-slate-100 border-b border-slate-200 text-slate-700">
                  <th class="p-2"></th>
                  <th class="p-2">Foto</th>
                  <th class="p-2">SKU BRIGGS</th>
                  <th class="p-2">SKU Origen</th>
                  <th class="p-2">Nombre</th>
                  <th class="p-2">Proveedor</th>
                  <th class="p-2">Marca</th>
                  <th class="p-2">Categoría</th>
                  <th class="p-2">Colección</th>
                  <th class="p-2">Color</th>
                  <th class="p-2">País</th>
                  <th class="p-2 text-right">Unid/Caja</th>
                  <th class="p-2 text-right">Vol. (m³)</th>
                  <th class="p-2 text-right">Peso (kg)</th>
                  <th class="p-2 text-right">FOB $</th>
                  <th class="p-2 text-right">% Arancel</th>
                </tr>
              </thead>
              <tbody id="excel-import-tbody"></tbody>
            </table>
          </div>
          <div class="flex justify-end gap-2 pt-1">
            <button id="excel-import-cancel" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-2 px-4 rounded-lg transition">Cancelar</button>
            <button id="excel-import-ok" class="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg transition">Importar</button>
          </div>
        </div>
      </div>

      <!-- Modal Proveedor -->
      <div id="supplier-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
          <div class="flex justify-between items-center">
            <h3 class="text-lg font-bold text-slate-800">Nuevo Proveedor</h3>
            <button id="sup-close" class="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none">✕</button>
          </div>
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Nombre *</label>
              <input id="f-sup-name" type="text" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">País</label>
              <input id="f-sup-country" type="text" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Email</label>
                <input id="f-sup-email" type="email" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Teléfono</label>
                <input id="f-sup-phone" type="text" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
              </div>
            </div>
          </div>
          <div class="flex justify-end gap-2 pt-1">
            <button id="sup-cancel" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-2 px-4 rounded-lg transition">Cancelar</button>
            <button id="sup-save" class="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition">Guardar</button>
          </div>
        </div>
      </div>
    `;

    // Búsqueda (con debounce para no re-renderizar la tabla en cada tecla)
    let searchDebounce = null;
    document.getElementById('products-search').addEventListener('input', (e) => {
      query = e.target.value;
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        renderCount();
        renderTable();
      }, 200);
    });

    // Botón nuevo producto
    document.getElementById('btn-new-product').addEventListener('click', () => openForm());

    // Botón importar
    document.getElementById('btn-import').addEventListener('click', openImport);

    // Modal importar
    document.getElementById('import-ok').addEventListener('click', runImport);
    document.getElementById('import-cancel').addEventListener('click', closeImport);
    document.getElementById('import-close').addEventListener('click', closeImport);
    document.getElementById('import-modal').addEventListener('click', (e) => {
      if (e.target.id === 'import-modal') closeImport();
    });

    // Botón importar Excel
    document.getElementById('btn-import-excel').addEventListener('click', openExcelImport);
    document.getElementById('excel-file-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) handleExcelFile(file);
    });
    document.getElementById('btn-retry-photos').addEventListener('click', () => {
      document.getElementById('retry-photos-file-input').click();
    });
    document.getElementById('retry-photos-file-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) handleRetryPhotosFile(file);
    });
    document.getElementById('excel-import-ok').addEventListener('click', runExcelImport);
    document.getElementById('excel-import-cancel').addEventListener('click', closeExcelImport);
    document.getElementById('excel-import-close').addEventListener('click', closeExcelImport);
    document.getElementById('excel-import-modal').addEventListener('click', (e) => {
      if (e.target.id === 'excel-import-modal') closeExcelImport();
    });

    // Modal producto
    document.getElementById('prod-save').addEventListener('click', saveProduct);
    document.getElementById('prod-cancel').addEventListener('click', closeForm);
    document.getElementById('prod-close').addEventListener('click', closeForm);
    document.getElementById('product-modal').addEventListener('click', (e) => {
      if (e.target.id === 'product-modal') closeForm();
    });
    document.getElementById('f-sup').addEventListener('change', (e) => {
      if (e.target.value === '__new__') {
        openSupplierForm();
      } else {
        selectedSupplierId = e.target.value || null;
      }
    });
    document.getElementById('product-modal').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'number') {
        saveProduct();
      }
    }, { signal });

    // Modal proveedor
    document.getElementById('sup-save').addEventListener('click', saveSupplierForm);
    document.getElementById('sup-cancel').addEventListener('click', closeSupplierForm);
    document.getElementById('sup-close').addEventListener('click', closeSupplierForm);
    document.getElementById('supplier-modal').addEventListener('click', (e) => {
      if (e.target.id === 'supplier-modal') closeSupplierForm();
    });
    document.getElementById('supplier-modal').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
        saveSupplierForm();
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        closeSupplierForm();
      }
    }, { signal });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!document.getElementById('supplier-modal').classList.contains('hidden')) {
          closeSupplierForm();
        } else if (!document.getElementById('import-modal').classList.contains('hidden')) {
          closeImport();
        } else if (!document.getElementById('excel-import-modal').classList.contains('hidden')) {
          closeExcelImport();
        } else if (!document.getElementById('product-modal').classList.contains('hidden')) {
          closeForm();
        }
      }
    }, { signal });

    renderCount();
    renderTable();
    renderImportBtn();

    return () => destroy.abort();
  }
};

export default Products;