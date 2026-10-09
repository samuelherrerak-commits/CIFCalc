import Store from '../store.js';
import { fmtNum, esc } from '../utils.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { card, input } from '../components/accounting-shell.js';

// Inventario de referencia (no es una cuenta contable): solo se alimenta de
// los contenedores completos (Store.postInventoryForContainer) y se rebaja con
// las ventas (js/pages/sales.js). No hay entradas manuales.
const Inventory = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    const products = Store.getAll('products');
    let subTab = 'stock';
    let query = '';

    const renderStock = () => {
      const tbody = document.getElementById('stock-tbody');
      const q = query.trim().toLowerCase();
      const list = products
        .filter(p => !q || [p.sku_briggs, p.sku, p.name].some(v => String(v || '').toLowerCase().includes(q)))
        .sort((a, b) => String(a.sku_briggs).localeCompare(String(b.sku_briggs)));
      tbody.innerHTML = list.length === 0
        ? `<tr><td colspan="5" class="p-4 text-center text-slate-400">Sin productos.</td></tr>`
        : list.map(p => `
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="p-2">${p.foto_url ? `<img src="${esc(p.foto_url)}" loading="lazy" decoding="async" class="w-8 h-8 object-cover rounded border border-slate-200" alt="">` : '<div class="w-8 h-8 rounded border border-slate-200 bg-slate-50"></div>'}</td>
            <td class="p-2 font-mono text-slate-700">${esc(p.sku_briggs)}</td>
            <td class="p-2 text-slate-800">${esc(p.name)}</td>
            <td class="p-2 text-right font-mono font-semibold ${Number(p.stock) <= 0 ? 'text-red-600' : 'text-slate-800'}">${fmtNum(p.stock)}</td>
            <td class="p-2 text-right font-mono text-slate-500">$${fmtNum(p.avg_cost)}</td>
          </tr>
        `).join('');
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
          <input id="stock-search" type="text" placeholder="Buscar producto…" class="${input}" style="width:220px">
        </div>
        <table class="w-full text-left text-xs">
          <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide"><th class="p-2"></th><th class="p-2">SKU Briggs</th><th class="p-2">Nombre</th><th class="p-2 text-right">Existencia</th><th class="p-2 text-right">Costo Prom.</th></tr></thead>
          <tbody id="stock-tbody"></tbody>
        </table>
      </div>

      <div id="panel-movimientos" class="${card} hidden">
        <h2 class="text-sm font-bold text-slate-700 mb-3">Movimientos de Inventario</h2>
        <table class="w-full text-left text-xs">
          <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide"><th class="p-2">Fecha</th><th class="p-2">Tipo</th><th class="p-2">Referencia</th><th class="p-2">Producto</th><th class="p-2 text-right">Cantidad</th></tr></thead>
          <tbody id="history-tbody"></tbody>
        </table>
      </div>
    `;

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('inventory'), body);

    document.getElementById('stock-search').addEventListener('input', (e) => { query = e.target.value; renderStock(); }, { signal });

    renderSubTabs();
    renderStock();
    renderHistory();

    return () => destroy.abort();
  }
};

export default Inventory;
