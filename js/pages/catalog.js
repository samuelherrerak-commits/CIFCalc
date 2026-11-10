import Store from '../store.js';
import { fmtNum, esc, computeContainer } from '../utils.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { card, input } from '../components/accounting-shell.js';

// Catálogo: todo lo que se vende (se vende todo el catálogo, haya o no
// existencia). Muestra el costo estimado por el módulo de Contenedores (el
// contenedor más reciente donde viene el producto) y el precio de venta, que
// se puede ajustar aquí.
const STATUS = { draft: 'Borrador', in_transit: 'En proceso', closed: 'Completo' };

function latestEstimates() {
  const map = new Map(); // productId → { cost, suggested, bl, status, date }
  const seen = new Set();
  const containers = Store.getAll('containers')
    .filter(c => !seen.has(c.id) && seen.add(c.id))
    .sort((a, b) => String(b.operation_date || b.updated_at || '').localeCompare(String(a.operation_date || a.updated_at || '')));
  for (const c of containers) {
    const items = Store.getItemsByContainer(c.id);
    if (!items.length) continue;
    for (const calc of computeContainer(c, items).calculated) {
      const pid = calc.item.product_id;
      if (!pid || map.has(pid) || !(calc.qty > 0)) continue;
      map.set(pid, { cost: calc.costNoVat, suggested: calc.salePriceOnCost, bl: c.bl_number || 'Sin BL', status: c.status, date: c.operation_date });
    }
  }
  return map;
}

const Catalog = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;
    const products = Store.getAll('products');
    const est = latestEstimates();
    let query = '';
    let category = '';

    const costOf = (p) => (est.get(p.id) || {}).cost || Number(p.avg_cost) || 0;
    const marginOf = (p) => {
      const price = Number(p.sale_price) || 0, cost = costOf(p);
      return price > 0 && cost > 0 ? ((price - cost) / price) * 100 : null;
    };
    const categories = [...new Set(products.map(p => String(p.category || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

    const renderRows = () => {
      const q = query.trim().toLowerCase();
      const list = products
        .filter(p => !category || String(p.category || '').trim() === category)
        .filter(p => !q || [p.sku_briggs, p.sku, p.name, p.collection, p.color].some(v => String(v || '').toLowerCase().includes(q)))
        .sort((a, b) => String(a.category || '').localeCompare(String(b.category || '')) || String(a.name).localeCompare(String(b.name)));
      document.getElementById('cat-count').textContent = `${list.length} producto${list.length === 1 ? '' : 's'}`;
      document.getElementById('cat-tbody').innerHTML = list.length === 0
        ? '<tr><td colspan="6" class="p-6 text-center text-slate-400">Sin productos.</td></tr>'
        : list.map(p => {
          const e = est.get(p.id);
          const m = marginOf(p);
          const sug = e && e.suggested > 0 && Math.abs(e.suggested - (Number(p.sale_price) || 0)) > 0.009 ? e.suggested : 0;
          return `
          <tr class="border-t border-slate-100 hover:bg-slate-50/60">
            <td class="p-2 w-12">${p.foto_url
              ? `<img src="${esc(p.foto_url)}" loading="lazy" decoding="async" class="w-10 h-10 object-contain rounded-md bg-white" alt="">`
              : '<div class="w-10 h-10 rounded-md bg-slate-50"></div>'}</td>
            <td class="p-2">
              <div class="text-sm text-slate-800">${esc(p.name) || '<span class="text-slate-400">Sin nombre</span>'}</div>
              <div class="text-[11px] font-mono text-slate-400">${esc(p.sku_briggs)}${/^PROV-/i.test(p.sku_briggs || '') ? ' <span class="font-sans text-amber-600">· código provisional</span>' : ''}</div>
            </td>
            <td class="p-2 text-slate-500"><div>${esc(p.category)}</div><div class="text-[11px] text-slate-400">${[p.collection, p.color].filter(Boolean).map(esc).join(' · ')}</div></td>
            <td class="p-2 text-right">
              <div class="tabular-nums text-slate-700">${costOf(p) > 0 ? '$' + fmtNum(costOf(p)) : '<span class="text-slate-300">—</span>'}</div>
              <div class="text-[10px] text-slate-400">${e ? `${esc(e.bl)} · ${STATUS[e.status] || ''}` : ''}</div>
            </td>
            <td class="p-2 text-right">
              <div class="inline-flex items-center gap-1"><span class="text-slate-400">$</span>
                <input data-price="${esc(p.id)}" type="number" min="0" step="0.01" value="${Number(p.sale_price) || ''}" placeholder="0.00" class="w-24 p-1 border border-slate-200 rounded-md text-right tabular-nums bg-white focus:border-blue-400 outline-none">
              </div>
              ${sug ? `<button data-sug="${esc(p.id)}" data-val="${sug.toFixed(2)}" class="block ml-auto text-[10px] text-slate-400 hover:text-blue-600">Sugerido $${fmtNum(sug)}</button>` : ''}
            </td>
            <td class="p-2 text-right tabular-nums ${m === null ? 'text-slate-300' : m < 0 ? 'text-red-600' : 'text-slate-600'}">${m === null ? '—' : fmtNum(m) + '%'}</td>
          </tr>`;
        }).join('');
    };

    const setPrice = (id, val) => {
      const p = products.find(x => x.id === id);
      if (!p) return;
      p.sale_price = Math.max(0, Math.round((Number(val) || 0) * 100) / 100);
      Store.update('products', { id: p.id, sale_price: p.sale_price });
      renderRows();
    };

    const body = `
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-slate-900">Catálogo</h1>
          <p class="text-xs text-slate-400">Costo estimado del contenedor más reciente y precio de venta.</p>
        </div>
        <a href="#/productos" class="text-xs text-slate-500 hover:text-slate-900">Agregar o editar productos →</a>
      </div>
      <div class="${card} space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <input id="cat-search" type="text" placeholder="Buscar por nombre, código, colección o color" class="${input.replace('w-full', '')} flex-1 min-w-[14rem]">
          <select id="cat-category" class="${input.replace('w-full', 'w-full sm:w-56')}">
            <option value="">Todas las categorías</option>
            ${categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
          </select>
          <span id="cat-count" class="text-xs text-slate-400 whitespace-nowrap"></span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide"><th class="p-2"></th><th class="p-2">Producto</th><th class="p-2">Categoría</th><th class="p-2 text-right">Costo estimado</th><th class="p-2 text-right">Precio de venta</th><th class="p-2 text-right">Margen</th></tr></thead>
            <tbody id="cat-tbody"></tbody>
          </table>
        </div>
      </div>`;

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('catalog'), body);
    document.getElementById('cat-search').addEventListener('input', (e) => { query = e.target.value; renderRows(); }, { signal });
    document.getElementById('cat-category').addEventListener('change', (e) => { category = e.target.value; renderRows(); }, { signal });
    document.getElementById('cat-tbody').addEventListener('change', (e) => {
      if (e.target.dataset.price) setPrice(e.target.dataset.price, e.target.value);
    }, { signal });
    document.getElementById('cat-tbody').addEventListener('click', (e) => {
      const b = e.target.closest('[data-sug]');
      if (b) setPrice(b.dataset.sug, b.dataset.val);
    }, { signal });
    renderRows();
    return () => destroy.abort();
  }
};

export default Catalog;
