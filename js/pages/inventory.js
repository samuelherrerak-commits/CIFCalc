import Store from '../store.js';
import { fmtNum, fmtInt, esc, computeContainer } from '../utils.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { card, input } from '../components/accounting-shell.js';

// Inventario de referencia (no es una cuenta contable): solo se alimenta de
// los contenedores completos (Store.postInventoryForContainer) y se rebaja con
// las ventas (js/pages/sales.js). No hay entradas manuales.
const Inventory = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    // Productos sin precio de venta todavía (contenedores completados antes de
    // que existiera el campo): se toma el precio sugerido por la calculadora en
    // el contenedor completo más reciente donde el ítem tenga margen.
    const backfillSalePrices = () => {
      const missing = new Set(Store.getAll('products').filter(p => !(Number(p.sale_price) > 0)).map(p => p.id));
      if (missing.size === 0) return;
      const closed = Store.getAll('containers')
        .filter(c => c.status === 'closed')
        .sort((a, b) => new Date(b.operation_date || b.updated_at || 0) - new Date(a.operation_date || a.updated_at || 0));
      for (const c of closed) {
        if (missing.size === 0) break;
        const items = Store.getItemsByContainer(c.id);
        if (!items.some(it => missing.has(it.product_id))) continue;
        for (const calc of computeContainer(c, items).calculated) {
          const pid = calc.item.product_id;
          if (!missing.has(pid) || !(Number(calc.item.gain_margin) > 0) || !(calc.salePriceOnCost > 0)) continue;
          Store.update('products', { id: pid, sale_price: Math.round(calc.salePriceOnCost * 100) / 100 });
          missing.delete(pid);
        }
      }
    };
    backfillSalePrices();

    const products = Store.getAll('products');
    let subTab = 'stock';
    let query = '';
    let onlyInStock = true;

    const marginPct = (p) => {
      const price = Number(p.sale_price) || 0;
      const cost = Number(p.avg_cost) || 0;
      return price > 0 && cost > 0 ? ((price - cost) / price) * 100 : null;
    };

    const renderSummary = () => {
      const withStock = products.filter(p => Number(p.stock) > 0);
      const units = withStock.reduce((s, p) => s + Number(p.stock), 0);
      const atCost = withStock.reduce((s, p) => s + Number(p.stock) * (Number(p.avg_cost) || 0), 0);
      const atPrice = withStock.reduce((s, p) => s + Number(p.stock) * (Number(p.sale_price) || 0), 0);
      const tile = (label, value, color) => `
        <div class="rounded-xl border border-${color}-100 bg-${color}-50 p-3">
          <div class="text-[10px] font-semibold uppercase tracking-wide text-${color}-600">${label}</div>
          <div class="text-lg font-bold text-slate-800 font-mono">${value}</div>
        </div>`;
      document.getElementById('stock-summary').innerHTML =
        tile('Productos con existencia', fmtInt(withStock.length), 'blue') +
        tile('Unidades', fmtInt(units), 'violet') +
        tile('Valor a costo', '$' + fmtNum(atCost), 'amber') +
        tile('Valor a precio de venta', '$' + fmtNum(atPrice), 'emerald');
    };

    const renderStock = () => {
      const tbody = document.getElementById('stock-tbody');
      const q = query.trim().toLowerCase();
      const list = products
        .filter(p => !onlyInStock || Number(p.stock) > 0)
        .filter(p => !q || [p.sku_briggs, p.sku, p.name].some(v => String(v || '').toLowerCase().includes(q)))
        .sort((a, b) => (Number(b.stock) > 0) - (Number(a.stock) > 0) || String(a.name).localeCompare(String(b.name)));
      tbody.innerHTML = list.length === 0
        ? `<tr><td colspan="6" class="p-4 text-center text-slate-400">Sin productos.</td></tr>`
        : list.map(p => {
          const m = marginPct(p);
          return `
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="p-2">${p.foto_url
              ? `<img src="${esc(p.foto_url)}" loading="lazy" decoding="async" class="w-14 h-14 object-cover rounded-lg border border-slate-200 bg-white" alt="">`
              : '<div class="w-14 h-14 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-300 text-lg">📦</div>'}</td>
            <td class="p-2">
              <div class="text-sm font-semibold text-slate-800">${esc(p.name) || '<span class="text-slate-400">Sin nombre</span>'}</div>
              <div class="text-[11px] font-mono text-slate-400">${esc(p.sku_briggs)}${p.sku ? ' · ' + esc(p.sku) : ''}</div>
            </td>
            <td class="p-2 text-right">
              <span class="inline-block min-w-[3rem] px-2 py-1 rounded-full text-xs font-bold font-mono ${Number(p.stock) > 0 ? 'text-emerald-700 bg-emerald-100' : 'text-red-600 bg-red-50'}">${fmtInt(p.stock)}</span>
            </td>
            <td class="p-2 text-right font-mono text-slate-600">$${fmtNum(p.avg_cost)}</td>
            <td class="p-2 text-right">
              <div class="inline-flex items-center gap-1">
                <span class="text-slate-400">$</span>
                <input data-price="${esc(p.id)}" type="number" min="0" step="0.01" value="${Number(p.sale_price) || ''}" placeholder="0.00"
                  class="w-24 p-1.5 border border-slate-200 rounded-lg text-right font-mono font-semibold text-blue-700 bg-white focus:border-blue-400 focus:outline-none">
              </div>
            </td>
            <td class="p-2 text-right font-mono text-[11px] ${m === null ? 'text-slate-300' : m < 0 ? 'text-red-600' : 'text-emerald-600'}">${m === null ? '—' : fmtNum(m) + '%'}</td>
          </tr>`;
        }).join('');

      tbody.querySelectorAll('[data-price]').forEach(el => el.addEventListener('change', (e) => {
        const p = products.find(x => x.id === e.target.dataset.price);
        if (!p) return;
        const val = Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100) / 100);
        p.sale_price = val;
        Store.update('products', { id: p.id, sale_price: val });
        renderSummary();
        renderStock();
      }, { signal }));
    };

    // Entradas: ítems vinculados a productos de cada contenedor completo cuyo
    // inventario ya se registró. Salidas: líneas de Ingresos por Ventas (las
    // únicas de la venta con precio_venta) — el nombre va tras "|" en el concepto.
    const movementsHistory = () => {
      const entries = [];
      const containers = Store.getAll('containers').filter(c => c.status === 'closed' && c.inventory_posted);
      for (const c of containers) {
        for (const it of Store.getItemsByContainer(c.id)) {
          if (!it.product_id || !(Number(it.qty) > 0)) continue;
          entries.push({ date: c.operation_date, type: 'entrada', ref: c.bl_number || 'Contenedor', name: it.name, qty: Number(it.qty) });
        }
      }
      for (const m of Store.getAll('movements')) {
        if (m.source !== 'sale' || !(Number(m.cantidad) > 0) || !(Number(m.precio_venta) > 0)) continue;
        const parts = String(m.concepto || '').split('|');
        entries.push({ date: m.entry_date, type: 'salida', ref: m.ref_doc, name: (parts[1] || parts[0] || '').trim(), qty: Number(m.cantidad) });
      }
      return entries.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 100);
    };

    const renderHistory = () => {
      const tbody = document.getElementById('history-tbody');
      const list = movementsHistory();
      tbody.innerHTML = list.length === 0
        ? `<tr><td colspan="5" class="p-4 text-center text-slate-400">Sin movimientos todavía. El stock entra al completar un contenedor y sale con cada venta.</td></tr>`
        : list.map(e => `
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="p-2">${esc(e.date)}</td>
            <td class="p-2">${e.type === 'entrada'
              ? '<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold text-emerald-700 bg-emerald-100">Entrada · Contenedor</span>'
              : '<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold text-blue-700 bg-blue-100">Salida · Venta</span>'}</td>
            <td class="p-2 text-slate-500">${esc(e.ref)}</td>
            <td class="p-2 text-slate-800">${esc(e.name)}</td>
            <td class="p-2 text-right font-mono font-semibold ${e.type === 'entrada' ? 'text-emerald-600' : 'text-blue-600'}">${e.type === 'entrada' ? '+' : '−'}${fmtNum(e.qty)}</td>
          </tr>
        `).join('');
    };

    const renderSubTabs = () => {
      const wrap = document.getElementById('inventory-subtabs');
      wrap.innerHTML = [['stock', 'Stock'], ['movimientos', 'Movimientos']].map(([t, lbl]) => `
        <button data-subtab="${t}" class="px-3 py-1.5 text-xs font-semibold rounded-full transition-all ${
          subTab === t ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
        }">${lbl}</button>
      `).join('');
      wrap.querySelectorAll('[data-subtab]').forEach(btn => btn.addEventListener('click', () => {
        subTab = btn.dataset.subtab;
        renderSubTabs();
        document.getElementById('panel-stock').classList.toggle('hidden', subTab !== 'stock');
        document.getElementById('panel-movimientos').classList.toggle('hidden', subTab !== 'movimientos');
      }));
    };

    const body = `
      <div id="inventory-subtabs" class="flex gap-2"></div>

      <div id="panel-stock" class="${card}">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
          <div>
            <h2 class="text-sm font-bold text-slate-700">Existencias</h2>
            <p class="text-xs text-slate-400">Entra al completar un contenedor, sale con cada venta. Es de referencia, no una cuenta contable.</p>
          </div>
          <div class="flex items-center gap-3">
            <label class="flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap"><input id="stock-only" type="checkbox" checked> Solo con existencia</label>
            <input id="stock-search" type="text" placeholder="Buscar producto…" class="${input}" style="width:220px">
          </div>
        </div>
        <div id="stock-summary" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4"></div>
        <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide"><th class="p-2">Foto</th><th class="p-2">Producto</th><th class="p-2 text-right">Existencias</th><th class="p-2 text-right">Costo</th><th class="p-2 text-right">Precio de venta</th><th class="p-2 text-right">Margen</th></tr></thead>
          <tbody id="stock-tbody"></tbody>
        </table>
        </div>
        <p class="text-[11px] text-slate-400 mt-2">Costo = promedio ponderado sin IVA de los contenedores completos. El precio de venta se toma del margen de la calculadora al completar el contenedor; puedes cambiarlo aquí y se usará al vender.</p>
      </div>

      <div id="panel-movimientos" class="${card} hidden">
        <h2 class="text-sm font-bold text-slate-700 mb-3">Movimientos de Inventario</h2>
        <table class="w-full text-left text-xs">
          <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide"><th class="p-2">Fecha</th><th class="p-2">Tipo</th><th class="p-2">Referencia</th><th class="p-2">Producto</th><th class="p-2 text-right">Cantidad</th></tr></thead>
          <tbody id="history-tbody"></tbody>
        </table>
      </div>

      <div class="bg-white border border-red-200 rounded-xl shadow-sm p-4 space-y-3">
        <div>
          <h2 class="text-sm font-bold text-red-700">Eliminar contenedores completados (de prueba)</h2>
          <p class="text-xs text-slate-500 mt-1">Marca los contenedores <strong>completados</strong> que quieres borrar. Se elimina el contenedor con sus productos, su asiento de cierre, sus pagos y la mercancía que sumó al inventario. <strong>Los contenedores en Borrador o En proceso no aparecen aquí y no se tocan.</strong></p>
          <p id="del-protected" class="text-xs text-emerald-700 mt-1"></p>
        </div>
        <div id="del-list" class="border border-slate-100 rounded-lg divide-y divide-slate-100 max-h-72 overflow-y-auto"></div>
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex flex-col gap-1">
            <label class="flex items-center gap-2 text-xs text-slate-600"><input id="del-all" type="checkbox"> Seleccionar todos</label>
            <label class="flex items-center gap-2 text-xs text-slate-600"><input id="del-sales" type="checkbox"> También borrar las ventas registradas (<span id="del-sales-count">0</span>) y devolver su mercancía</label>
          </div>
          <button id="btn-delete-containers" class="flex-shrink-0 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white text-sm font-bold py-2 px-4 rounded-lg shadow-sm" disabled>Eliminar seleccionados</button>
        </div>
      </div>
    `;

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('inventory'), body);

    document.getElementById('stock-search').addEventListener('input', (e) => { query = e.target.value; renderStock(); }, { signal });
    document.getElementById('stock-only').addEventListener('change', (e) => { onlyInStock = e.target.checked; renderStock(); }, { signal });

    renderSubTabs();
    renderSummary();
    renderStock();
    renderHistory();

    // --- Eliminar contenedores completados de prueba ---
    const STATUS_TXT = { draft: 'borrador', in_transit: 'proceso' };
    const renderDeletePanel = () => {
      const all = Store.getAll('containers');
      const closed = all.filter(c => c.status === 'closed')
        .sort((a, b) => String(b.operation_date || '').localeCompare(String(a.operation_date || '')));
      const protectedOnes = all.filter(c => c.status !== 'closed');
      const byStatus = protectedOnes.reduce((m, c) => { const k = STATUS_TXT[c.status] || 'borrador'; m[k] = (m[k] || 0) + 1; return m; }, {});
      document.getElementById('del-protected').textContent = protectedOnes.length
        ? '🔒 Protegidos: ' + Object.entries(byStatus).map(([k, n]) => `${n} en ${k}`).join(', ') + '.'
        : '';
      const movs = Store.getAll('movements');
      document.getElementById('del-sales-count').textContent = new Set(movs.filter(m => m.source === 'sale').map(m => m.ref_doc)).size;
      const list = document.getElementById('del-list');
      list.innerHTML = closed.length === 0
        ? '<div class="p-4 text-center text-xs text-slate-400">No hay contenedores completados.</div>'
        : closed.map(c => {
          const items = Store.getItemsByContainer(c.id);
          const units = items.reduce((s2, it) => s2 + (Number(it.qty) || 0), 0);
          const close = movs.filter(m => m.source === 'container_close' && m.source_ref === c.id).reduce((s2, m) => s2 + (Number(m.debit) || 0), 0);
          const paid = movs.some(m => m.source === 'container_payment' && m.source_ref === c.id);
          return `
          <label class="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer">
            <input type="checkbox" data-del-id="${esc(c.id)}">
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold text-slate-800">${esc(c.bl_number) || 'Sin BL'} <span class="text-[10px] font-normal text-slate-400">${esc(c.operation_date || '')}</span></div>
              <div class="text-[11px] text-slate-500">${items.length} producto(s) · ${fmtNum(units).replace(/\.00$/, '')} unid.${close ? ` · asiento $${fmtNum(close)}` : ' · sin asiento'}${paid ? ' · con pagos' : ''}</div>
            </div>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold text-slate-600 bg-slate-200">Completo</span>
          </label>`;
        }).join('');
      const sync = () => {
        const n = list.querySelectorAll('[data-del-id]:checked').length;
        const btn = document.getElementById('btn-delete-containers');
        btn.disabled = n === 0;
        btn.textContent = n ? `Eliminar ${n} seleccionado(s)` : 'Eliminar seleccionados';
      };
      list.querySelectorAll('[data-del-id]').forEach(cb => cb.addEventListener('change', sync));
      document.getElementById('del-all').checked = false;
      sync();
    };
    renderDeletePanel();
    document.getElementById('del-all').addEventListener('change', (e) => {
      document.querySelectorAll('#del-list [data-del-id]').forEach(cb => { cb.checked = e.target.checked; cb.dispatchEvent(new Event('change')); });
    }, { signal });
    document.getElementById('btn-delete-containers').addEventListener('click', () => {
      const ids = [...document.querySelectorAll('#del-list [data-del-id]:checked')].map(cb => cb.dataset.delId);
      if (!ids.length) return;
      const names = ids.map(id => (Store.getById('containers', id) || {}).bl_number || 'Sin BL');
      const deleteSales = document.getElementById('del-sales').checked;
      const msg = `Se van a ELIMINAR ${ids.length} contenedor(es) completado(s):\n\n${names.map(n => '• ' + n).join('\n')}\n\n` +
        'Con sus productos, asiento de cierre, pagos y la mercancía que sumaron al inventario' +
        (deleteSales ? ', y TODAS las ventas registradas' : '') +
        '.\n\nLos contenedores en Borrador o En proceso no se tocan.\nTambién se borra en Google Sheets y no se puede deshacer. ¿Continuar?';
      if (!confirm(msg)) return;
      const res = Store.deleteCompletedContainers(ids, { deleteSales });
      alert(`Listo: ${res.containers} contenedor(es) eliminado(s), ${res.movements} línea(s) de diario borradas, ${res.products} producto(s) con existencia ajustada.`);
    }, { signal });

    return () => destroy.abort();
  }
};

export default Inventory;
