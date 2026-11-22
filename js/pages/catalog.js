import Store from '../store.js';
import { priceFor } from '../pricing.js';
import { openCatalogPdf } from '../catalog-pdf.js';
import { exportCatalogExcel } from '../catalog-xlsx.js';
import { fmtNum, esc, computeContainer } from '../utils.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { card, input } from '../components/accounting-shell.js';

// Catálogo: todo lo que se vende (se vende todo el catálogo, haya o no
// existencia). Muestra el costo estimado por el módulo de Contenedores (el
// contenedor más reciente donde viene el producto) y el precio de venta, que
// se puede ajustar aquí.
const STATUS = { draft: 'Borrador', in_transit: 'En proceso', closed: 'Completo' };

// Producto de un ítem del contenedor: el vinculado (product_id) o, si no está vinculado
// todavía, el que tenga el mismo código de origen (SKU de la fábrica) en Productos.
// Así el catálogo toma los costos aunque el contenedor se haya preparado antes de vincular.
function productResolver() {
  const clean = (s) => String(s || '').replace(/\*/g, '').trim().toLowerCase();
  const products = Store.getAll('products');
  const ids = new Set(products.map(p => p.id));
  const byOrigin = new Map();
  for (const p of products) {
    const k = clean(p.sku);
    if (!k) continue;
    if (!byOrigin.has(k)) byOrigin.set(k, []);
    byOrigin.get(k).push(p);
  }
  return (item) => {
    if (item.product_id && ids.has(item.product_id)) return item.product_id;
    const cand = byOrigin.get(clean(item.sku)) || [];
    const p = cand.length === 1 ? cand[0]
      : cand.find(x => String(x.sku_briggs || '').trim().toLowerCase() === String(item.sku_briggs || '').trim().toLowerCase());
    return p ? p.id : null;
  };
}

function latestEstimates() {
  const map = new Map(); // productId → { cost, suggested, bl, status, date }
  const resolve = productResolver();
  const seen = new Set();
  const containers = Store.getAll('containers')
    .filter(c => !seen.has(c.id) && seen.add(c.id))
    .sort((a, b) => String(b.operation_date || b.updated_at || '').localeCompare(String(a.operation_date || a.updated_at || '')));
  for (const c of containers) {
    const items = Store.getItemsByContainer(c.id);
    if (!items.length) continue;
    for (const calc of computeContainer(c, items).calculated) {
      const pid = resolve(calc.item);
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
    let tiers = Store.getPriceTiers();
    // Precio con margen sobre la venta: costo / (1 − margen).

    // Un acabado sin costo propio (no vino en la compra: cantidad 0) no tiene precio: sale "Consultar".
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
        ? '<tr><td colspan="${5 + tiers.length}" class="p-6 text-center text-slate-400">Sin productos.</td></tr>'
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
            <td class="p-2 text-slate-500"><div>${esc(p.category)}</div><div class="text-[11px] text-slate-400">${[p.collection, p.forma, p.color].filter(Boolean).map(esc).join(' · ')}</div></td>
            <td class="p-2 text-right">
              <div class="tabular-nums text-slate-700">${costOf(p) > 0 ? '$' + fmtNum(costOf(p)) : '<span class="text-slate-300">—</span>'}</div>
              <div class="text-[10px] text-slate-400">${e ? `${esc(e.bl)} · ${STATUS[e.status] || ''}` : ''}</div>
            </td>
            ${tiers.map(t => { const v = priceFor(costOf(p), t, tiers); return `<td class="p-2 text-right tabular-nums text-slate-800">${v ? '$' + fmtNum(v) : '<span class="text-slate-300">—</span>'}</td>`; }).join('')}
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

    const renderHead = () => {
      document.getElementById('cat-thead').innerHTML = `<tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide"><th class="p-2"></th><th class="p-2">Producto</th><th class="p-2">Categoría</th><th class="p-2 text-right">Costo estimado</th>${tiers.map(t => `<th class="p-2 text-right">${esc(t.name)}<div class="normal-case font-normal">${fmtNum(t.pct)}%</div></th>`).join('')}<th class="p-2 text-right">Precio de venta</th><th class="p-2 text-right">Margen</th></tr>`;
    };
    const renderTiers = () => {
      const f = 'p-1.5 border border-slate-200 rounded-md text-xs bg-white';
      document.getElementById('tiers-box').innerHTML = tiers.map((t, i) => `
        <div class="flex items-end gap-1">
          <label class="text-[10px] text-slate-400 uppercase">Nombre<input data-tn="${i}" type="text" value="${esc(t.name)}" class="${f} block w-32 normal-case text-slate-800"></label>
          <label class="text-[10px] text-slate-400 uppercase">Margen %<input data-tp="${i}" type="number" min="1" max="99" step="0.5" value="${t.pct}" class="${f} block w-20 text-right text-slate-800"></label>
          ${i > 0 ? `<label class="text-[10px] text-slate-400 uppercase">Sobre<select data-tb="${i}" class="${f} block text-slate-800"><option value="cost" ${t.base !== 'first' ? 'selected' : ''}>Costo</option><option value="first" ${t.base === 'first' ? 'selected' : ''}>Precio ${esc(tiers[0].name)}</option></select></label>` : ''}
          ${tiers.length > 1 ? `<button data-td="${i}" class="pb-1.5 text-slate-300 hover:text-red-600" title="Quitar">✕</button>` : ''}
        </div>`).join('') + (tiers.length < 6 ? '<button id="tier-add" class="text-xs font-semibold text-blue-600 hover:text-blue-800 pb-1.5">+ Nivel</button>' : '');
    };
    const saveTiers = () => { Store.savePriceTiers(tiers); renderHead(); renderRows(); };

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
        <div class="flex items-center gap-3">
          <button id="cat-pdf" class="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-700">Descargar catálogo (PDF / Excel)</button>
          <a href="#/productos" class="text-xs text-slate-500 hover:text-slate-900">Agregar o editar productos →</a>
        </div>
      </div>
      <div class="${card} space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="text-sm font-semibold text-slate-800">Niveles de precio</div>
          <span class="text-[11px] text-slate-400">El % es el margen sobre la venta: precio = base ÷ (1 − %). Distribuidor: sobre el costo. Los demás niveles: sobre el precio de Distribuidor (o sobre el costo, si lo eliges).</span>
        </div>
        <div id="tiers-box" class="flex flex-wrap items-end gap-3"></div>
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
            <thead id="cat-thead"><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide"><th class="p-2"></th><th class="p-2">Producto</th><th class="p-2">Categoría</th><th class="p-2 text-right">Costo estimado</th>${tiers.map(t => `<th class="p-2 text-right">${esc(t.name)}<div class="normal-case font-normal">${fmtNum(t.pct)}%</div></th>`).join('')}<th class="p-2 text-right">Precio de venta</th><th class="p-2 text-right">Margen</th></tr></thead>
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
    const tb = document.getElementById('tiers-box');
    tb.addEventListener('change', (e) => {
      const d = e.target.dataset;
      if (d.tn !== undefined) tiers[d.tn].name = e.target.value.trim() || tiers[d.tn].name;
      else if (d.tp !== undefined) { const v = Number(e.target.value); if (v > 0 && v < 100) tiers[d.tp].pct = v; else e.target.value = tiers[d.tp].pct; }
      else if (d.tb !== undefined) tiers[d.tb].base = e.target.value === 'first' ? 'first' : 'cost';
      else return;
      saveTiers(); renderTiers();
    }, { signal });
    tb.addEventListener('click', (e) => {
      if (e.target.closest('#tier-add')) { tiers.push({ name: 'Nuevo nivel', pct: 40, base: 'cost' }); saveTiers(); renderTiers(); return; }
      const del = e.target.closest('[data-td]');
      if (del) { tiers.splice(Number(del.dataset.td), 1); saveTiers(); renderTiers(); }
    }, { signal });
    document.getElementById('cat-pdf').addEventListener('click', () => {
      const old = document.getElementById('pdf-dlg'); if (old) old.remove();
      const dlg = document.createElement('div');
      dlg.id = 'pdf-dlg';
      dlg.className = 'fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4';
      dlg.innerHTML = `<div class="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3">
        <div class="text-base font-semibold text-slate-900">Descargar catálogo</div>
        <p class="text-xs text-slate-500">¿A quién le vas a vender? El archivo llevará solo los precios de ese nivel.</p>
        <div class="space-y-1.5">${tiers.map((t, i) => `<label class="flex items-center gap-2 p-2 border border-slate-200 rounded-lg text-sm cursor-pointer"><input type="radio" name="pdf-tier" value="${i}" ${i === tiers.length - 1 ? 'checked' : ''}> ${esc(t.name)} <span class="text-xs text-slate-400">${fmtNum(t.pct)}%</span></label>`).join('')}</div>
        <div class="flex gap-2 text-sm"><label class="flex-1 flex items-center gap-2 p-2 border border-slate-200 rounded-lg cursor-pointer"><input type="radio" name="pdf-fmt" value="pdf" checked> PDF</label><label class="flex-1 flex items-center gap-2 p-2 border border-slate-200 rounded-lg cursor-pointer"><input type="radio" name="pdf-fmt" value="xlsx"> Excel con fotos</label></div>
        <p id="pdf-hint" class="text-[11px] text-slate-400">PDF: se abre la vista de impresión; elige "Guardar como PDF".</p>
        <div class="flex justify-end gap-2"><button id="pdf-cancel" class="px-3 py-2 text-xs text-slate-500">Cancelar</button><button id="pdf-ok" class="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold">Descargar</button></div></div>`;
      document.body.appendChild(dlg);
      dlg.querySelector('#pdf-cancel').onclick = () => dlg.remove();
      dlg.querySelectorAll('input[name="pdf-fmt"]').forEach(r => r.addEventListener('change', () => {
        dlg.querySelector('#pdf-hint').textContent = r.value === 'xlsx' && r.checked
          ? 'Excel: una fila por producto y acabado, con su foto cuadrada. Puede tardar unos segundos por las fotos.'
          : 'PDF: se abre la vista de impresión; elige "Guardar como PDF".';
      }));
      dlg.querySelector('#pdf-ok').onclick = async () => {
        const i = Number(dlg.querySelector('input[name="pdf-tier"]:checked').value);
        const fmt = dlg.querySelector('input[name="pdf-fmt"]:checked').value;
        if (fmt === 'xlsx') {
          const btn = dlg.querySelector('#pdf-ok');
          btn.disabled = true;
          try {
            const res = await exportCatalogExcel(products, costOf, tiers[i], tiers, (d, t) => { btn.textContent = `Fotos ${d}/${t}…`; });
            dlg.remove();
            if (res.photosMissing) alert(`Excel generado. ${res.photosMissing} fotos no se pudieron leer y quedaron vacías.`);
          } catch (e) { btn.disabled = false; btn.textContent = 'Descargar'; alert('No se pudo generar el Excel: ' + e.message); }
          return;
        }
        const ok = openCatalogPdf(products, costOf, tiers[i], tiers);
        if (!ok) alert('El navegador bloqueó la ventana. Permite ventanas emergentes para este sitio e inténtalo de nuevo.');
        dlg.remove();
      };
    }, { signal });
    renderTiers(); renderHead();
    renderRows();
    return () => destroy.abort();
  }
};

export default Catalog;
