import Store from '../store.js';
import { fmtNum, fmtInt, esc, num } from '../utils.js';

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
      btn.textContent = n > 0 ? `Importar (${n})` : 'Importar';
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
        ? `<tr><td colspan="11" class="p-4 text-center text-slate-400">Sin productos. Crea uno con "+ Nuevo Producto".</td></tr>`
        : list.map(p => `
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="p-2 font-bold text-blue-800">${esc(p.sku_briggs)}</td>
            <td class="p-2">${esc(p.sku)}</td>
            <td class="p-2">${esc(p.name)}</td>
            <td class="p-2">${esc(supplierName(p.supplier_id)) || '<span class="text-slate-400">—</span>'}</td>
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
          <button id="btn-import" class="bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold py-2 px-4 rounded-lg shadow-sm transition whitespace-nowrap">Importar</button>
          <button id="btn-new-product" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-4 rounded-lg shadow-sm transition whitespace-nowrap">
            + Nuevo Producto
          </button>
        </div>
      </header>

      <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
        <div class="flex items-center justify-between px-4 py-2 border-b border-slate-200 text-xs text-slate-500">
          <span id="products-count"></span>
        </div>
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-100 border-b border-slate-200 text-slate-700">
              <th class="p-2">SKU BRIGGS</th>
              <th class="p-2">SKU</th>
              <th class="p-2">Nombre</th>
              <th class="p-2">Proveedor</th>
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

    // Búsqueda
    document.getElementById('products-search').addEventListener('input', (e) => {
      query = e.target.value;
      renderCount();
      renderTable();
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