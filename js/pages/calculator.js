import Store from '../store.js';
import { fmtNum, fmtInt, esc, num, computeContainer } from '../utils.js';

const Calculator = {
  async render(app, params) {
    const containerId = params[0];
    if (!containerId) {
      app.innerHTML = '<div class="text-red-600">ID de contenedor inválido</div>';
      return;
    }

    let container = Store.getById('containers', containerId);
    if (!container) {
      app.innerHTML = `
        <div class="bg-white p-10 rounded-xl border border-slate-200 text-center">
          <p class="text-lg text-slate-600 mb-4">El contenedor no existe o fue eliminado.</p>
          <a href="#/" class="text-blue-600 font-semibold">← Volver al Dashboard</a>
        </div>
      `;
      return;
    }

    let items = Store.getItemsByContainer(containerId);

    // --- Helper de actualización de UI ---
    const refreshResults = () => {
      const res = computeContainer(container, items);

      // Barra de ocupación
      const bar = document.getElementById('vol-bar');
      const barText = document.getElementById('vol-text');
      const occText = document.getElementById('vol-occ');
      const reqText = document.getElementById('vol-req');
      if (bar && barText) {
        const occ = res.volumePercentage;
        bar.style.width = Math.min(occ, 100) + '%';
        bar.className = `h-full transition-all duration-300 ${occ > 100 ? 'bg-red-500' : 'bg-blue-600'}`;
        barText.textContent = `${res.totalVolume.toFixed(2)} / ${Number(container.container_capacity) || 0} m³`;
        occText.textContent = occ.toFixed(1) + '% Ocupado';
        occText.className = occ > 100 ? 'text-red-600 font-bold text-xs' : 'text-slate-600 text-xs font-semibold';
        reqText.textContent = res.containersRequired.toFixed(2) + ' FCL';
      }

      // Tabla de resultados
      const tbody = document.getElementById('results-tbody');
      const tfoot = document.getElementById('results-tfoot');
      if (!tbody) return;

      if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="18" class="p-4 text-center text-slate-400">Sin productos. Agrega un SKU para calcular.</td></tr>`;
        tfoot.innerHTML = '';
      } else {
        tbody.innerHTML = res.calculated.map(c => `
          <tr class="border-b border-slate-200 hover:bg-slate-50">
            <td class="p-2 font-bold text-slate-700">${esc(c.item.sku) || '—'}</td>
            <td class="p-2">${c.volTotal.toFixed(3)} m³</td>
            <td class="p-2">${(c.factor * 100).toFixed(2)}%</td>
            <td class="p-2 font-bold text-blue-800 bg-slate-50">${fmtInt(c.unitsPerContainer)}</td>
            <td class="p-2">$${fmtNum(c.fobTotal)}</td>
            <td class="p-2">$${fmtNum(c.oceanFreightAssigned)}</td>
            <td class="p-2 text-blue-700 font-medium">$${fmtNum(c.insuranceAmount)}</td>
            <td class="p-2 font-bold text-slate-900 bg-blue-50/50">$${fmtNum(c.cifTotal)}</td>
            <td class="p-2 text-amber-800 font-medium">$${fmtNum(c.tariffAmount)}</td>
            <td class="p-2 text-teal-700 font-medium">$${fmtNum(c.portFeeAmount)}</td>
            <td class="p-2 text-amber-700 font-medium">$${fmtNum(c.customsBrokerAmount)}</td>
            <td class="p-2 text-purple-700 font-medium">$${fmtNum(c.vatAmount)}</td>
            <td class="p-2">$${fmtNum(c.otherExpenses)}</td>
            <td class="p-2 font-bold text-slate-900">$${fmtNum(c.landedTotal)}</td>
            <td class="p-2 bg-slate-50 font-semibold text-slate-700">$${fmtNum(c.costNoVat)}</td>
            <td class="p-2 bg-blue-100 font-extrabold text-blue-900 text-sm">$${fmtNum(c.costWithVat)}</td>
            <td class="p-2 text-emerald-700 font-semibold">$${fmtNum(c.salePriceOnCost)}</td>
            <td class="p-2 font-bold text-emerald-900">$${fmtNum(c.salePriceOnCostVat)}</td>
          </tr>
        `).join('');

        const s = res.summary;
        tfoot.innerHTML = `
          <tr>
            <td class="p-2">TOTALES</td>
            <td class="p-2">${res.totalVolume.toFixed(3)} m³</td>
            <td class="p-2">100.00%</td>
            <td class="p-2 bg-slate-200">-</td>
            <td class="p-2">$${fmtNum(s.fob)}</td>
            <td class="p-2">$${fmtNum(Number(container.ocean_freight) || 0)}</td>
            <td class="p-2 text-blue-800">$${fmtNum(s.insurance)}</td>
            <td class="p-2 font-extrabold text-slate-900">$${fmtNum(s.cif)}</td>
            <td class="p-2 text-amber-800">$${fmtNum(s.tariff)}</td>
            <td class="p-2 text-teal-800">$${fmtNum(s.portFee)}</td>
            <td class="p-2 text-amber-700">$${fmtNum(Number(container.customs_broker_fee) || 0)}</td>
            <td class="p-2 text-purple-800">$${fmtNum(s.vat)}</td>
            <td class="p-2">$${fmtNum(s.other)}</td>
            <td class="p-2 font-black text-slate-900">$${fmtNum(s.landed)}</td>
            <td class="p-2 bg-slate-200">-</td>
            <td class="p-2 bg-blue-200 text-blue-900">-</td>
            <td class="p-2">-</td>
            <td class="p-2">-</td>
          </tr>
        `;
      }

      // Guardado con debounce
      scheduleSave();
    };

    // Autosave con debounce
    let saveTimer = null;
    const scheduleSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 600);
    };

    const save = () => {
      Store.saveContainerWithItems(container, items);
      const statusEl = document.getElementById('save-status');
      if (statusEl) {
        statusEl.textContent = '✓ Guardado';
        statusEl.classList.remove('text-slate-400');
        statusEl.classList.add('text-emerald-600');
        clearTimeout(saveTimer);
        setTimeout(() => {
          statusEl.classList.add('text-slate-400');
          statusEl.classList.remove('text-emerald-600');
          statusEl.textContent = 'Autoguardado';
        }, 1500);
      }
    };

    // --- Re-render de items (tabla editable) ---
    const refreshItemsTable = () => {
      const suppliers = Store.getAll('suppliers');

      const tbody = document.getElementById('items-tbody');
      tbody.innerHTML = items.map((item, index) => `
        <tr class="border-b border-slate-100 hover:bg-slate-50" data-idx="${index}">
          <td class="p-2">
            <select data-field="supplier_id" data-idx="${index}" class="w-32 p-1 border rounded bg-white text-xs">
              <option value="">— Proveedor —</option>
              ${suppliers.map(s => `<option value="${s.id}" ${s.id === item.supplier_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
              <option value="__new__">+ Nuevo proveedor</option>
            </select>
          </td>
          <td class="p-2"><input data-field="origin_country" data-idx="${index}" value="${esc(item.origin_country)}" class="w-20 p-1 border rounded bg-white text-xs"></td>
          <td class="p-2"><input data-field="sku" data-idx="${index}" value="${esc(item.sku)}" class="w-20 p-1 border rounded bg-white text-xs"></td>
          <td class="p-2"><input data-field="name" data-idx="${index}" value="${esc(item.name)}" class="w-32 p-1 border rounded bg-white text-xs"></td>
          <td class="p-2"><input data-field="qty" data-idx="${index}" type="number" value="${item.qty}" class="w-16 p-1 border rounded bg-white text-xs"></td>
          <td class="p-2"><input data-field="units_per_box" data-idx="${index}" type="number" value="${item.units_per_box}" class="w-16 p-1 border rounded bg-white text-xs"></td>
          <td class="p-2"><input data-field="box_volume" data-idx="${index}" type="number" step="0.001" value="${item.box_volume}" class="w-20 p-1 border rounded bg-white text-xs"></td>
          <td class="p-2 bg-blue-50/50 font-extrabold text-blue-900 text-xs" id="uc-${index}">
            ${Number(item.box_volume) > 0 ? fmtInt((Number(container.container_capacity) || 0) / Number(item.box_volume)) : 0}
          </td>
          <td class="p-2"><input data-field="fob_unit" data-idx="${index}" type="number" step="0.01" value="${item.fob_unit}" class="w-20 p-1 border rounded bg-white text-xs"></td>
          <td class="p-2"><input data-field="hs_code" data-idx="${index}" value="${esc(item.hs_code)}" class="w-24 p-1 border rounded bg-white text-xs"></td>
          <td class="p-2"><input data-field="tariff_rate" data-idx="${index}" type="number" step="0.1" value="${item.tariff_rate}" class="w-16 p-1 border rounded bg-white text-xs"></td>
          <td class="p-2"><input data-field="gain_margin" data-idx="${index}" type="number" step="0.1" value="${item.gain_margin}" class="w-16 p-1 border rounded bg-white text-xs"></td>
          <td class="p-2 text-center">
            <button data-remove="${index}" class="text-red-500 hover:text-red-700 font-bold px-2 py-1">✕</button>
          </td>
        </tr>
      `).join('');

      // Eventos de la tabla de items
      tbody.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('input', (e) => {
          const idx = Number(e.target.dataset.idx);
          const field = e.target.dataset.field;
          const val = inp.type === 'number' ? num(inp) : inp.value.trim();
          items[idx] = { ...items[idx], [field]: val };
          // Actualiza la celda computada 'Unid/Cont.' de esa fila sin re-renderizarse
          const uc = document.getElementById('uc-' + idx);
          if (uc) {
            const boxVol = Number(items[idx].box_volume) || 0;
            const cap = Number(container.container_capacity) || 0;
            uc.textContent = boxVol > 0 ? fmtInt(cap / boxVol) : 0;
          }
          refreshResults();
        });
        inp.addEventListener('change', () => {
          // Al salir del campo (Enter/Tab/blur) se confirma y persiste vía autosave
          const idx = Number(inp.dataset.idx);
          const field = inp.dataset.field;
          const val = inp.type === 'number' ? num(inp) : inp.value.trim();
          items[idx] = { ...items[idx], [field]: val };
          refreshResults();
        });
      });
      tbody.querySelectorAll('select').forEach(sel => {
        sel.addEventListener('change', (e) => {
          const idx = Number(e.target.dataset.idx);
          const field = e.target.dataset.field;
          if (sel.value === '__new__') {
            createNewSupplier(idx);
          } else {
            items[idx] = { ...items[idx], [field]: sel.value || null };
            scheduleSave();
          }
        });
      });
      tbody.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = Number(e.target.dataset.remove);
          items.splice(idx, 1);
          refreshResults();
          refreshItemsTable();
        });
      });
    };

    const createNewSupplier = (itemIdx) => {
      const name = prompt('Nombre del nuevo proveedor:');
      if (!name) {
        refreshItemsTable();
        return;
      }
      const supplier = Store.insert('suppliers', { name, country: '', contact_email: '', contact_phone: '' });
      items[itemIdx] = { ...items[itemIdx], supplier_id: supplier.id };
      refreshResults();
      refreshItemsTable();
    };

    // --- Render principal ---
    const companies = Store.getAll('companies');
    const suppliers = Store.getAll('suppliers');

    app.innerHTML = `
      <div class="flex items-center justify-between gap-3">
        <a href="#/" class="text-blue-600 hover:text-blue-800 text-sm font-semibold">← Dashboard</a>
        <div class="flex items-center gap-2">
          <button id="btn-reset" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-2 px-3 rounded-lg border transition">
            🔄 Restablecer Datos
          </button>
          <button id="btn-delete" class="text-xs bg-red-50 hover:bg-red-100 text-red-600 font-semibold py-2 px-3 rounded-lg border border-red-200 transition">
            🗑 Eliminar Contenedor
          </button>
        </div>
      </div>

      <!-- Header + Compañía -->
      <header class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <h1 class="text-2xl font-bold text-slate-900">CIFCalc — Calculadora CIF</h1>
            <p class="text-sm text-slate-500" id="save-status">Autoguardado</p>
          </div>
          <div class="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
            <div class="flex items-center gap-2">
              <label class="text-xs font-semibold text-slate-600">Compañía:</label>
              <select id="sel-company" class="p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white">
                <option value="">— Sin compañía —</option>
                ${companies.map(c => `<option value="${c.id}" ${c.id === container.company_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
                <option value="__new__">+ Nueva compañía</option>
              </select>
            </div>
            <div class="flex items-center gap-2">
              <label class="text-xs font-semibold text-slate-600">Estado:</label>
              <span id="status-badge" class="inline-block px-2 py-1 rounded-full text-xs font-semibold"></span>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-4">
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Nº Embarque / BL</label>
            <input id="f-bl" type="text" value="${esc(container.bl_number)}" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Fecha de Operación</label>
            <input id="f-date" type="date" value="${esc(container.operation_date)}" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Vol. Contenedor (m³)</label>
            <input id="f-capacity" type="number" step="0.1" value="${container.container_capacity}" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900">
          </div>
          <div class="flex items-end gap-2">
            <div class="flex-1">
              <label class="block text-xs font-semibold text-blue-700 mb-1">Tasa Seguro (%)</label>
              <input id="f-insurance-rate" type="number" step="0.01" value="${container.insurance_rate}" ${container.insurance_enabled ? '' : 'disabled'} class="w-full p-2 border border-blue-200 rounded-lg text-sm bg-blue-50/30 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-blue-900 disabled:opacity-50">
            </div>
            <label class="flex items-center gap-1 text-xs font-semibold text-slate-600 mb-2 cursor-pointer whitespace-nowrap">
              <input id="f-insurance-on" type="checkbox" ${container.insurance_enabled ? 'checked' : ''} class="accent-blue-600 w-4 h-4">
              Activo
            </label>
          </div>
          <div>
            <label class="block text-xs font-semibold text-teal-700 mb-1">Tasa Portuaria (%)</label>
            <input id="f-port-rate" type="number" step="0.01" value="${container.port_fee_rate}" class="w-full p-2 border border-teal-200 rounded-lg text-sm bg-teal-50/30 focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none font-semibold text-teal-900">
          </div>
          <div>
            <label class="block text-xs font-semibold text-purple-700 mb-1">Tasa IVA Importación (%)</label>
            <input id="f-vat" type="number" step="0.1" value="${container.vat_rate}" class="w-full p-2 border border-purple-200 rounded-lg text-sm bg-purple-50/30 focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none font-semibold text-purple-900">
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 pt-2">
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Flete Marítimo ($)</label>
            <input id="f-ocean" type="number" step="0.01" value="${container.ocean_freight}" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Flete Terrestre ($)</label>
            <input id="f-inland" type="number" step="0.01" value="${container.inland_freight}" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Gastos Aduana Fijos ($)</label>
            <input id="f-customs" type="number" step="0.01" value="${container.customs_expenses}" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
          </div>
          <div>
            <label class="block text-xs font-semibold text-amber-700 mb-1">Agente Aduanal Fijo ($)</label>
            <input id="f-broker" type="number" step="0.01" value="${container.customs_broker_fee}" class="w-full p-2 border border-amber-200 rounded-lg text-sm bg-amber-50/30 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none font-semibold text-amber-900">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Gastos Operativos ($)</label>
            <input id="f-op" type="number" step="0.01" value="${container.op_expenses}" class="w-full p-2 border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none">
          </div>
        </div>

        <div class="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div class="col-span-2 space-y-1">
            <div class="flex justify-between text-xs font-semibold">
              <span id="vol-text">${computeContainer(container, items).totalVolume.toFixed(2)} / ${Number(container.container_capacity) || 0} m³</span>
              <span id="vol-occ" class="text-slate-600 text-xs font-semibold">${computeContainer(container, items).volumePercentage.toFixed(1)}% Ocupado</span>
            </div>
            <div class="w-full bg-slate-200 h-3 rounded-full overflow-hidden">
              <div id="vol-bar" class="h-full transition-all duration-300 bg-blue-600" style="width:${Math.min(computeContainer(container, items).volumePercentage, 100)}%"></div>
            </div>
          </div>
          <div class="text-right border-l pl-4 border-slate-300">
            <span class="block text-xs text-slate-500 font-medium">Contenedores Totales Requeridos</span>
            <span id="vol-req" class="text-lg font-bold text-blue-900">${computeContainer(container, items).containersRequired.toFixed(2)} FCL</span>
          </div>
        </div>
      </header>

      <!-- Tabla de productos -->
      <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
        <div class="flex justify-between items-center border-b pb-2">
          <h2 class="text-lg font-bold text-slate-800">Registro de Productos (SKUs)</h2>
          <button id="btn-add-item" class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-4 rounded-lg shadow-sm transition">
            + Agregar Producto
          </button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="bg-slate-100 border-b border-slate-200 text-slate-700">
                <th class="p-2">Proveedor</th>
                <th class="p-2">País Origen</th>
                <th class="p-2">SKU</th>
                <th class="p-2">Nombre</th>
                <th class="p-2">Cant.</th>
                <th class="p-2">Unid/Caja</th>
                <th class="p-2">Vol. Caja (m³)</th>
                <th class="p-2 bg-blue-50 text-blue-900 font-bold">Unid/Cont.</th>
                <th class="p-2">FOB Unit ($)</th>
                <th class="p-2">Cód. Arancel</th>
                <th class="p-2">% Arancel</th>
                <th class="p-2">Margen %</th>
                <th class="p-2 text-center">✕</th>
              </tr>
            </thead>
            <tbody id="items-tbody"></tbody>
          </table>
        </div>
      </div>

      <!-- Tabla de resultados -->
      <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
        <h2 class="text-lg font-bold text-slate-800 border-b pb-2">Resultados Prorrateados y Costo Landed Final</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="bg-slate-800 text-white">
                <th class="p-2">SKU</th>
                <th class="p-2">Vol. Total (m³)</th>
                <th class="p-2">% Prorrateo</th>
                <th class="p-2 bg-slate-700">Unid/Cont.</th>
                <th class="p-2">FOB Total ($)</th>
                <th class="p-2">Flete Mar. ($)</th>
                <th class="p-2 text-blue-300">Seguro ($)</th>
                <th class="p-2 font-bold text-blue-200">CIF Total ($)</th>
                <th class="p-2">Arancel ($)</th>
                <th class="p-2 text-teal-300">Tasa Port. ($)</th>
                <th class="p-2 text-amber-300">Ag. Aduanal ($)</th>
                <th class="p-2 text-purple-300">IVA ($)</th>
                <th class="p-2">Otros Gastos ($)</th>
                <th class="p-2">Landed Total ($)</th>
                <th class="p-2 bg-slate-700">Costo Unit. sin IVA ($)</th>
                <th class="p-2 bg-blue-900 text-white font-bold">Costo Unit. + IVA ($)</th>
                <th class="p-2 text-emerald-300">P. Venta / Costo Unit. ($)</th>
                <th class="p-2 font-bold text-emerald-200">P. Venta / Costo + IVA ($)</th>
              </tr>
            </thead>
            <tbody id="results-tbody"></tbody>
            <tfoot class="bg-slate-100 font-bold border-t-2 border-slate-300" id="results-tfoot"></tfoot>
          </table>
        </div>
      </div>

      <!-- Acción de estado (irreversible) -->
      <div class="flex justify-end">
        <button id="btn-status" class="text-sm font-bold py-2.5 px-6 rounded-lg shadow-sm transition hidden"></button>
      </div>
    `;

    // --- Bindings de los parámetros del contenedor ---
    const bind = (id, field, isNumber) => {
      document.getElementById(id).addEventListener('input', (e) => {
        container = { ...container, [field]: isNumber ? num(e.target) : e.target.value };
        refreshResults();
      });
    };
    bind('f-bl', 'bl_number', false);
    bind('f-date', 'operation_date', false);
    bind('f-capacity', 'container_capacity', true);
    bind('f-insurance-rate', 'insurance_rate', true);
    bind('f-port-rate', 'port_fee_rate', true);
    bind('f-vat', 'vat_rate', true);
    bind('f-ocean', 'ocean_freight', true);
    bind('f-inland', 'inland_freight', true);
    bind('f-customs', 'customs_expenses', true);
    bind('f-broker', 'customs_broker_fee', true);
    bind('f-op', 'op_expenses', true);

    // Checkbox seguro
    const insOn = document.getElementById('f-insurance-on');
    const insRate = document.getElementById('f-insurance-rate');
    insOn.addEventListener('change', () => {
      container = { ...container, insurance_enabled: insOn.checked };
      insRate.disabled = !insOn.checked;
      refreshResults();
    });

    // Selector de compañía
    document.getElementById('sel-company').addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === '__new__') {
        const name = prompt('Nombre de la nueva compañía:');
        if (name) {
          const c = Store.insert('companies', { name, tax_id: '' });
          container = { ...container, company_id: c.id };
          scheduleSave();
          // Insertar la nueva compañía como opción y seleccionarla (sin recargar página)
          const select = document.getElementById('sel-company');
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = c.name;
          select.insertBefore(opt, select.querySelector('option[value="__new__"]'));
          select.value = c.id;
          return;
        }
        e.target.value = container.company_id || '';
        return;
      }
      container = { ...container, company_id: val || null };
      scheduleSave();
    });

    // Estado (badge + botón de acción irreversible)
    const STATUS_LABEL = { draft: 'Borrador', in_transit: 'En proceso', closed: 'Completo' };
    const STATUS_STYLE = {
      draft: 'bg-amber-100 text-amber-700',
      in_transit: 'bg-blue-100 text-blue-700',
      closed: 'bg-slate-200 text-slate-600'
    };

    const renderStatus = () => {
      const badge = document.getElementById('status-badge');
      if (badge) {
        badge.textContent = STATUS_LABEL[container.status] || 'Borrador';
        badge.className = 'inline-block px-2 py-1 rounded-full text-xs font-semibold ' + (STATUS_STYLE[container.status] || STATUS_STYLE.draft);
      }
      const btn = document.getElementById('btn-status');
      if (btn) {
        if (container.status === 'draft') {
          btn.textContent = 'Preparar';
          btn.className = 'bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2.5 px-6 rounded-lg shadow-sm transition';
          btn.removeAttribute('disabled');
        } else if (container.status === 'in_transit') {
          btn.textContent = 'Completar';
          btn.className = 'bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold py-2.5 px-6 rounded-lg shadow-sm transition';
          btn.removeAttribute('disabled');
        } else {
          btn.textContent = '✓ Completado';
          btn.className = 'bg-slate-200 text-slate-500 text-sm font-bold py-2.5 px-6 rounded-lg cursor-not-allowed';
          btn.setAttribute('disabled', 'disabled');
        }
        btn.classList.remove('hidden');
      }
    };

    document.getElementById('btn-status').addEventListener('click', () => {
      if (container.status === 'draft') {
        container = { ...container, status: 'in_transit' };
      } else if (container.status === 'in_transit') {
        container = { ...container, status: 'closed' };
      } else {
        return; // ya completo, no se puede cambiar
      }
      scheduleSave();
      renderStatus();
    });
    renderStatus();

    // Agregar / resetear
    document.getElementById('btn-add-item').addEventListener('click', () => {
      const item = Store.insert('items', {
        container_id: containerId,
        supplier_id: null,
        origin_country: '',
        sku: 'SKU-' + (items.length + 1),
        name: 'Nuevo Producto',
        qty: 100,
        units_per_box: 1,
        box_volume: 0.01,
        fob_unit: 10,
        hs_code: '',
        tariff_rate: 0,
        gain_margin: 0
      });
      items.push(item);
      refreshResults();
      refreshItemsTable();
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
      if (!confirm('¿Restablecer todos los productos de este contenedor?')) return;
      items = [];
      refreshResults();
      refreshItemsTable();
    });

    document.getElementById('btn-delete').addEventListener('click', () => {
      if (!confirm('¿Eliminar este contenedor y todos sus productos? Esta acción no se puede deshacer.')) return;
      Store.removeContainer(containerId);
      window.location.hash = '#/';
    });

    // Inicial
    refreshResults();
    refreshItemsTable();
  }
};

export default Calculator;
