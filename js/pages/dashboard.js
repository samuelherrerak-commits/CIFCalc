import Store from '../store.js';
import { fmtNum, fmtInt, esc, computeContainer } from '../utils.js';

const STATUS_LABEL = { draft: 'Borrador', in_transit: 'En proceso', closed: 'Completo' };
const STATUS_STYLE = {
  draft: 'bg-amber-100 text-amber-700',
  in_transit: 'bg-blue-100 text-blue-700',
  closed: 'bg-slate-200 text-slate-600'
};

function buildTooltip(c, company, items, res, suppliers) {
  const companyName = company ? company.name : 'Sin asignar';
  const skuList = res.calculated.length === 0
    ? '<div class="text-slate-400 py-1">Sin productos</div>'
    : res.calculated.map(ci => {
        const sup = suppliers.find(s => s.id === ci.item.supplier_id);
        const supplierName = sup ? esc(sup.name) : '<span class="text-slate-400">Sin proveedor</span>';
        const skuText = ci.item.sku ? esc(ci.item.sku) : '<span class="text-slate-400">—</span>';
        const nameText = ci.item.name ? esc(ci.item.name) : '';
        return `
          <div class="flex flex-col py-1 border-b border-slate-100 last:border-0">
            <div class="flex justify-between items-center gap-3">
              <div>
                <span class="font-bold text-slate-800">${skuText}</span>
                ${nameText ? `<span class="text-slate-500 text-xs"> ${nameText}</span>` : ''}
                <span class="block text-xs text-slate-400">Proveedor: ${supplierName}</span>
              </div>
              <div class="text-right flex-shrink-0">
                <span class="block font-semibold text-slate-800 text-xs">$${fmtNum(ci.landedTotal)}</span>
                <span class="block text-xs text-slate-400">$${fmtNum(ci.unitLanded)} /unid</span>
              </div>
            </div>
            <div class="text-xs text-slate-400">Cant: ${fmtInt(ci.qty)} · Vol: ${ci.volTotal.toFixed(3)} m³</div>
          </div>
        `;
      }).join('');

  return `
    <div class="p-3 max-w-sm">
      <div class="flex justify-between items-start gap-3 mb-2">
        <div>
          <div class="font-bold text-slate-900 text-sm">${esc(c.bl_number) || 'Embarque sin BL'}</div>
          <div class="text-xs text-slate-500">${companyName}</div>
        </div>
        <span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${STATUS_STYLE[c.status] || STATUS_STYLE.draft}">${STATUS_LABEL[c.status] || 'Borrador'}</span>
      </div>

      <div class="grid grid-cols-3 gap-2 mb-2">
        <div class="bg-slate-50 rounded-lg p-2 text-center">
          <div class="text-[10px] uppercase text-slate-400 font-semibold">Landed Total</div>
          <div class="font-bold text-slate-900 text-sm">$${fmtNum(res.summary.landed)}</div>
        </div>
        <div class="bg-slate-50 rounded-lg p-2 text-center">
          <div class="text-[10px] uppercase text-slate-400 font-semibold">Productos</div>
          <div class="font-bold text-slate-900 text-sm">${res.calculated.length}</div>
        </div>
        <div class="bg-slate-50 rounded-lg p-2 text-center">
          <div class="text-[10px] uppercase text-slate-400 font-semibold">Ocupación</div>
          <div class="font-bold text-slate-900 text-sm">${res.volumePercentage.toFixed(1)}%</div>
        </div>
      </div>

      <div class="text-xs text-slate-400 mb-1">Vol: ${fmtNum(res.totalVolume)} / ${fmtNum(c.container_capacity)} m³</div>

      <div class="border-t border-slate-200 pt-1 max-h-56 overflow-y-auto">
        ${skuList}
      </div>
    </div>
  `;
}

const Dashboard = {
  async render(app, params) {
    const companies = Store.getAll('companies');
    const suppliers = Store.getAll('suppliers');
    const containers = Store.getAll('containers');

    app.innerHTML = `
      <header class="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-xl shadow-sm border border-slate-200 gap-4">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">CIFCalc — Dashboard de Embarques</h1>
          <p class="text-sm text-slate-500">Administra tus contenedores y embarques de importación</p>
        </div>
        <button id="new-container" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 px-4 rounded-lg shadow-sm transition">
          + Nuevo Contenedor
        </button>
      </header>

      ${containers.length === 0 ? `
        <div class="bg-white p-10 rounded-xl shadow-sm border border-slate-200 text-center">
          <div class="text-5xl mb-3">📦</div>
          <p class="text-slate-500 font-medium">Aún no hay contenedores registrados.</p>
          <p class="text-sm text-slate-400 mt-1">Haz clic en "Nuevo Contenedor" para comenzar.</p>
        </div>
      ` : `
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
          <table class="w-full text-left border-collapse text-sm">
            <thead>
              <tr class="bg-slate-100 border-b border-slate-200 text-slate-700">
                <th class="p-3">BL / Embarque</th>
                <th class="p-3">Fecha</th>
                <th class="p-3">Compañía</th>
                <th class="p-3 w-48">Ocupación</th>
                <th class="p-3 text-right">Costo Landed Total</th>
                <th class="p-3 text-center">Estado</th>
                <th class="p-3 text-center w-8"></th>
              </tr>
            </thead>
            <tbody>
              ${containers.map(c => {
                const company = companies.find(co => co.id === c.company_id);
                const items = Store.getItemsByContainer(c.id);
                const res = computeContainer(c, items);
                const occ = res.volumePercentage;
                return `
                  <tr class="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                      data-cid="${c.id}"
                      data-tooltip="${esc(buildTooltip(c, company, items, res, suppliers))}">
                    <td class="p-3 font-semibold text-slate-800">${esc(c.bl_number) || '—'}</td>
                    <td class="p-3">${esc(c.operation_date) || '—'}</td>
                    <td class="p-3">${company ? esc(company.name) : '<span class="text-slate-400">Sin asignar</span>'}</td>
                    <td class="p-3">
                      <div class="flex items-center gap-2">
                        <div class="flex-1 bg-slate-200 h-2.5 rounded-full overflow-hidden">
                          <div class="h-full ${occ > 100 ? 'bg-red-500' : 'bg-blue-600'}"
                               style="width:${Math.min(occ, 100)}%"></div>
                        </div>
                        <span class="text-xs font-semibold ${occ > 100 ? 'text-red-600' : 'text-slate-600'} w-12 text-right">
                          ${occ.toFixed(1)}%
                        </span>
                      </div>
                      <div class="text-xs text-slate-400 mt-1">${fmtNum(res.totalVolume)} / ${fmtNum(c.container_capacity)} m³</div>
                    </td>
                    <td class="p-3 text-right font-bold text-slate-900">$${fmtNum(res.summary.landed)}</td>
                    <td class="p-3 text-center">
                      <span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold
                        ${c.status === 'closed' ? 'bg-slate-200 text-slate-600' : c.status === 'in_transit' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}">
                        ${c.status === 'closed' ? 'Completo' : c.status === 'in_transit' ? 'En proceso' : 'Borrador'}
                      </span>
                    </td>
                    <td class="p-3 text-center text-slate-300 text-lg">→</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}

      <div id="container-tooltip"
           class="hidden fixed z-50 pointer-events-none bg-white border border-slate-200 rounded-xl shadow-2xl"></div>
    `;

    document.getElementById('new-container').addEventListener('click', () => {
      const c = Store.newContainer();
      window.location.hash = `#/contenedor/${c.id}`;
    });

    // ---- Tooltip que sigue al cursor ----
    const tooltip = document.getElementById('container-tooltip');
    const rows = app.querySelectorAll('tr[data-tooltip]');

    rows.forEach(row => {
      row.addEventListener('mouseenter', () => {
        tooltip.innerHTML = row.dataset.tooltip;
        tooltip.classList.remove('hidden');
      });
      row.addEventListener('mousemove', (e) => {
        const margen = 16;
        tooltip.style.left = (e.clientX + margen) + 'px';
        tooltip.style.top = (e.clientY + margen) + 'px';
      });
      row.addEventListener('mouseleave', () => {
        tooltip.classList.add('hidden');
      });
      // Clic en la fila abre el contenedor
      row.addEventListener('click', () => {
        const cid = row.dataset.cid;
        if (cid) window.location.hash = `#/contenedor/${cid}`;
      });
    });
  }
};

export default Dashboard;
