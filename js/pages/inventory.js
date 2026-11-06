import Store from '../store.js';
import { fmtInt, esc, computeContainer } from '../utils.js';
import { orderItems } from '../orders.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { card, input, label, btnPrimary, btnSecondary } from '../components/accounting-shell.js';

// Existencias: solo inventario, nada contable. Entra con las recepciones de
// mercancía y sale con los despachos de las órdenes de venta (y salidas o
// ajustes manuales). El costo y el precio están en Catálogo.
const KIND = {
  recepcion: { label: 'Recepción', sign: '+', tone: 'text-emerald-700' },
  salida: { label: 'Salida', sign: '−', tone: 'text-slate-700' },
  ajuste: { label: 'Ajuste', sign: '±', tone: 'text-slate-700' },
  despacho: { label: 'Despacho', sign: '−', tone: 'text-slate-700' },
  venta: { label: 'Venta', sign: '−', tone: 'text-slate-700' }
};
const parse = (j) => { try { const v = JSON.parse(j || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const today = () => new Date().toISOString().slice(0, 10);

const Inventory = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;
    let tab = 'stock';
    let query = '';
    let onlyActive = true;

    const products = () => Store.getAll('products');
    // Unidades pedidas en órdenes de venta que faltan por despachar.
    const pendingByProduct = () => {
      const m = new Map();
      for (const o of Store.getAll('sales_orders')) {
        if (o.status === 'anulada') continue;
        for (const it of orderItems(o)) {
          const left = Math.max(0, (Number(it.qty) || 0) - (Number(it.dispatched) || 0));
          if (it.productId && left) m.set(it.productId, (m.get(it.productId) || 0) + left);
        }
      }
      return m;
    };

    const renderAudit = () => {
      const rows = Store.inventoryAudit().filter(r => r.current !== r.expected);
      const el = document.getElementById('stock-audit');
      if (!rows.length) { el.innerHTML = ''; return; }
      const ready = Store.hasSyncedOnce() || !Store.isSheetsReachable();
      el.innerHTML = `
        <details class="group rounded-lg border border-slate-200 bg-white">
          <summary class="flex items-center gap-2 cursor-pointer list-none px-3 py-2 text-sm text-slate-600">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0"></span>
            <span class="flex-1">${rows.length} producto(s) con existencia que no cuadra con las recepciones y despachos</span>
            <span class="text-xs font-medium text-blue-600 group-open:hidden">Revisar</span>
            <span class="text-xs font-medium text-slate-400 hidden group-open:inline">Ocultar</span>
          </summary>
          <div class="border-t border-slate-100 p-3 space-y-3">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <p class="text-xs text-slate-500">"Corregir" deja la existencia en lo que dicen los movimientos. Si la existencia actual es la correcta (p. ej. un conteo físico), registra un Ajuste.</p>
              <button id="btn-rebuild" ${ready ? '' : 'disabled'} class="flex-shrink-0 border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-sm font-medium py-1.5 px-3 rounded-lg">${ready ? 'Corregir' : 'Sincronizando…'}</button>
            </div>
            <table class="w-full text-left text-xs">
              <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide"><th class="p-1.5">Producto</th><th class="p-1.5 text-right">Tiene</th><th class="p-1.5 text-right">Según movimientos</th></tr></thead>
              <tbody>${rows.map(r => `<tr class="border-t border-slate-100"><td class="p-1.5">${esc(r.product.name)} <span class="font-mono text-slate-400">${esc(r.product.sku_briggs)}</span></td><td class="p-1.5 text-right tabular-nums">${fmtInt(r.current)}</td><td class="p-1.5 text-right tabular-nums">${fmtInt(r.expected)} <span class="text-slate-400">(${fmtInt(r.inQty)} entradas − ${fmtInt(r.outQty)} salidas)</span></td></tr>`).join('')}</tbody>
            </table>
          </div>
        </details>`;
      const btn = document.getElementById('btn-rebuild');
      if (btn) btn.addEventListener('click', () => {
        if (!confirm(`Se ajustará la existencia de ${rows.length} producto(s) a lo que dicen las recepciones, salidas y despachos. ¿Continuar?`)) return;
        Store.rebuildInventory();
        draw();
      });
    };

    const renderStock = () => {
      const pend = pendingByProduct();
      const all = products();
      const withStock = all.filter(p => Number(p.stock) > 0);
      const tile = (l, v) => `<div class="rounded-lg border border-slate-200 bg-white px-3 py-2"><div class="text-[11px] text-slate-500">${l}</div><div class="text-base font-semibold text-slate-800 tabular-nums">${v}</div></div>`;
      document.getElementById('stock-summary').innerHTML =
        tile('Productos con existencia', fmtInt(withStock.length)) +
        tile('Unidades en almacén', fmtInt(withStock.reduce((s, p) => s + Number(p.stock), 0))) +
        tile('Por despachar (órdenes)', fmtInt([...pend.values()].reduce((s, n) => s + n, 0)));
      const q = query.trim().toLowerCase();
      const list = all
        .filter(p => !onlyActive || Number(p.stock) > 0 || pend.get(p.id))
        .filter(p => !q || [p.sku_briggs, p.sku, p.name].some(v => String(v || '').toLowerCase().includes(q)))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      document.getElementById('stock-tbody').innerHTML = list.length === 0
        ? `<tr><td colspan="4" class="p-6 text-center text-slate-400">${onlyActive ? 'No hay productos con existencia ni pedidos por despachar. Registra una recepción cuando llegue la mercancía.' : 'Sin productos.'}</td></tr>`
        : list.map(p => {
          const st = Number(p.stock) || 0, pd = pend.get(p.id) || 0, av = st - pd;
          return `
          <tr class="border-t border-slate-100">
            <td class="p-2"><div class="text-sm text-slate-800">${esc(p.name)}</div><div class="text-[11px] font-mono text-slate-400">${esc(p.sku_briggs)}</div></td>
            <td class="p-2 text-right tabular-nums text-slate-900">${fmtInt(st)}</td>
            <td class="p-2 text-right tabular-nums ${pd ? 'text-slate-700' : 'text-slate-300'}">${pd ? fmtInt(pd) : '—'}</td>
            <td class="p-2 text-right tabular-nums ${av < 0 ? 'text-red-600' : 'text-slate-700'}">${fmtInt(av)}</td>
          </tr>`;
        }).join('');
    };

    // Historial: un renglón por documento.
    const history = () => {
      const docs = [];
      for (const mv of Store.getAll('stock_moves')) {
        const items = parse(mv.items);
        const ct = mv.container_id ? Store.getById('containers', mv.container_id) : null;
        docs.push({ id: mv.id, editable: true, date: mv.date, kind: mv.kind, number: mv.move_number, ref: [ct && (ct.bl_number || 'Contenedor'), mv.reference].filter(Boolean).join(' · '), items, created: mv.created_at });
      }
      for (const d of Store.getAll('dispatches')) {
        const o = Store.getById('sales_orders', d.order_id);
        docs.push({ date: d.date, kind: 'despacho', number: d.dispatch_number, ref: o ? o.order_number : '', items: parse(d.items), created: d.created_at });
      }
      return docs.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.created || '').localeCompare(String(a.created || '')));
    };

    const renderHistory = () => {
      const list = history();
      document.getElementById('history-tbody').innerHTML = list.length === 0
        ? '<tr><td colspan="5" class="p-6 text-center text-slate-400">Sin movimientos todavía.</td></tr>'
        : list.map(d => {
          const k = KIND[d.kind] || KIND.ajuste;
          const units = d.items.reduce((s, it) => s + Math.abs(Number(it.qty) || 0), 0);
          return `
          <tr class="border-t border-slate-100 align-top">
            <td class="p-2 whitespace-nowrap text-slate-500">${esc(d.date)}</td>
            <td class="p-2"><div class="text-slate-800">${k.label}</div><div class="text-[11px] font-mono text-slate-400">${esc(d.number || '')}</div></td>
            <td class="p-2 text-slate-500">${esc(d.ref || '')}</td>
            <td class="p-2">
              <details><summary class="cursor-pointer text-slate-700">${d.items.length} producto(s) · ${fmtInt(units)} unid.</summary>
                <div class="mt-1 space-y-0.5">${d.items.map(it => {
                  const q = Number(it.qty) || 0;
                  const sign = d.kind === 'ajuste' ? (q > 0 ? '+' : '−') : k.sign;
                  return `<div class="flex justify-between gap-3 text-[11px]"><span class="text-slate-600 truncate">${esc(it.name)}</span><span class="tabular-nums ${k.tone}">${sign}${fmtInt(Math.abs(q))}</span></div>`;
                }).join('')}</div>
              </details>
            </td>
            <td class="p-2 text-right">${d.editable ? `<button data-undo="${esc(d.id)}" class="text-[11px] text-slate-400 hover:text-red-600">Anular</button>` : ''}</td>
          </tr>`;
        }).join('');
    };

    // Formulario de recepción / salida / ajuste.
    const openForm = (kind) => {
      const k = KIND[kind];
      const all = products().slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
      const seen = new Set();
      const containers = Store.getAll('containers').filter(c => !seen.has(c.id) && seen.add(c.id) && c.status !== 'draft')
        .sort((a, b) => String(b.operation_date || '').localeCompare(String(a.operation_date || '')));
      let lines = [];
      const wrap = document.createElement('div');
      wrap.className = 'fixed inset-0 z-50 bg-black/30 flex items-start sm:items-center justify-center p-3 overflow-y-auto';
      wrap.innerHTML = `
        <div class="bg-white rounded-xl shadow-xl w-full max-w-2xl p-4 space-y-3">
          <div class="flex justify-between items-center">
            <h2 class="text-sm font-semibold text-slate-900">${k.label} de mercancía</h2>
            <button data-close class="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label class="${label}">Fecha</label><input id="m-date" type="date" value="${today()}" class="${input}"></div>
            ${kind === 'recepcion' ? `
            <div class="sm:col-span-2"><label class="${label}">Contenedor (opcional)</label>
              <div class="flex gap-2"><select id="m-container" class="${input}"><option value="">— Sin contenedor —</option>${containers.map(c => `<option value="${esc(c.id)}">${esc(c.bl_number || 'Sin BL')}${c.operation_date ? ' · ' + esc(String(c.operation_date).slice(0, 10)) : ''}</option>`).join('')}</select>
              <button id="m-load" type="button" class="${btnSecondary} whitespace-nowrap">Cargar productos</button></div>
            </div>` : `
            <div class="sm:col-span-2"><label class="${label}">${kind === 'ajuste' ? 'Motivo' : 'Motivo o destino'}</label><input id="m-reason" type="text" placeholder="${kind === 'ajuste' ? 'Conteo físico, avería, muestra…' : 'Muestra, garantía, avería…'}" class="${input}"></div>`}
            <div class="sm:col-span-3"><label class="${label}">Referencia</label><input id="m-ref" type="text" placeholder="Guía, nota de entrega…" class="${input}"></div>
          </div>
          <div>
            <label class="${label}">Productos ${kind === 'ajuste' ? '<span class="font-normal text-slate-400">(cantidad positiva suma, negativa resta)</span>' : ''}</label>
            <div class="flex gap-2">
              <input id="m-product" list="m-products" placeholder="Buscar producto por nombre o código" class="${input}">
              <datalist id="m-products">${all.map(p => `<option value="${esc(p.sku_briggs || p.name)} — ${esc(p.name)}"></option>`).join('')}</datalist>
            </div>
            <div id="m-lines" class="mt-2 divide-y divide-slate-100 max-h-72 overflow-y-auto"></div>
          </div>
          <div id="m-msg" class="text-xs text-red-600"></div>
          <div class="flex justify-end gap-2">
            <button data-close class="${btnSecondary}">Cancelar</button>
            <button id="m-save" class="${btnPrimary}">Registrar ${k.label.toLowerCase()}</button>
          </div>
        </div>`;
      document.body.appendChild(wrap);
      const $ = (id) => wrap.querySelector('#' + id);
      const drawLines = () => {
        $('m-lines').innerHTML = lines.length ? lines.map((l, i) => `
          <div class="flex items-center gap-2 py-1.5">
            <div class="flex-1 min-w-0"><div class="text-sm text-slate-800 truncate">${esc(l.name)}</div><div class="text-[11px] font-mono text-slate-400">${esc(l.sku)} · existencia ${fmtInt((products().find(p => p.id === l.productId) || {}).stock)}</div></div>
            <input data-q="${i}" type="number" step="1" ${kind === 'ajuste' ? '' : 'min="0"'} value="${l.qty}" class="w-24 p-1.5 border border-slate-200 rounded-md text-right text-sm">
            <button data-rm="${i}" class="text-slate-300 hover:text-red-600">✕</button>
          </div>`).join('') : '<p class="text-xs text-slate-400 py-2">Agrega productos con el buscador.</p>';
      };
      const addProduct = (p, qty = 1) => {
        const ex = lines.find(l => l.productId === p.id);
        if (ex) ex.qty += qty; else lines.push({ productId: p.id, name: p.name, sku: p.sku_briggs, qty });
        drawLines();
      };
      $('m-product').addEventListener('change', (e) => {
        const v = e.target.value;
        const p = all.find(x => v === `${x.sku_briggs || x.name} — ${x.name}`) || all.find(x => x.sku_briggs && v.trim().toLowerCase() === String(x.sku_briggs).toLowerCase());
        if (p) { addProduct(p); e.target.value = ''; }
      });
      if ($('m-load')) $('m-load').addEventListener('click', () => {
        const c = containers.find(x => x.id === $('m-container').value);
        if (!c) { $('m-msg').textContent = 'Elige un contenedor.'; return; }
        $('m-msg').textContent = '';
        lines = [];
        for (const calc of computeContainer(c, Store.getItemsByContainer(c.id)).calculated) {
          const p = calc.item.product_id && all.find(x => x.id === calc.item.product_id);
          if (p && calc.qty > 0) addProduct(p, calc.qty);
        }
        if (!lines.length) $('m-msg').textContent = 'Ese contenedor no tiene productos vinculados al catálogo.';
        drawLines();
      });
      wrap.addEventListener('input', (e) => { const i = e.target.dataset.q; if (i != null) lines[i].qty = Number(e.target.value) || 0; });
      wrap.addEventListener('click', (e) => {
        if (e.target.closest('[data-close]') || e.target === wrap) { wrap.remove(); return; }
        const rm = e.target.closest('[data-rm]');
        if (rm) { lines.splice(Number(rm.dataset.rm), 1); drawLines(); }
      });
      $('m-save').addEventListener('click', () => {
        try {
          const reason = $('m-reason') ? $('m-reason').value.trim() : '';
          Store.registerStockMove({
            kind, date: $('m-date').value || today(),
            containerId: $('m-container') ? $('m-container').value : '',
            reference: [$('m-ref').value.trim(), reason].filter(Boolean).join(' · '),
            items: lines
          });
          wrap.remove();
          tab = 'movimientos';
          draw();
        } catch (err) { $('m-msg').textContent = err.message; }
      });
      drawLines();
    };

    // Las salidas son los despachos: se elige la orden de venta y se abre su
    // formulario de despacho (que genera la orden de despacho imprimible).
    const openDispatchPicker = () => {
      const orders = Store.getAll('sales_orders').filter(o => o.status !== 'anulada').map(o => {
        const pending = orderItems(o).reduce((s, it) => s + Math.max(0, (Number(it.qty) || 0) - (Number(it.dispatched) || 0)), 0);
        return { o, pending };
      }).filter(x => x.pending > 0).sort((a, b) => String(a.o.date || '').localeCompare(String(b.o.date || '')));
      const wrap = document.createElement('div');
      wrap.className = 'fixed inset-0 z-50 bg-black/30 flex items-start sm:items-center justify-center p-3';
      wrap.innerHTML = `
        <div class="bg-white rounded-xl shadow-xl w-full max-w-lg p-4 space-y-3">
          <div class="flex justify-between items-center">
            <h2 class="text-sm font-semibold text-slate-900">¿De qué orden de venta es el despacho?</h2>
            <button data-close class="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
          </div>
          ${orders.length ? `<div class="divide-y divide-slate-100 max-h-80 overflow-y-auto">${orders.map(({ o, pending }) => `
            <button data-order="${esc(o.id)}" class="w-full flex items-center justify-between gap-3 py-2.5 px-1 text-left hover:bg-slate-50 rounded-lg">
              <span><span class="block text-sm text-slate-800">${esc(o.order_number)} · ${esc(o.contact_name || 'Sin cliente')}</span><span class="block text-[11px] text-slate-400">${esc(o.date || '')}</span></span>
              <span class="text-xs text-slate-500 whitespace-nowrap">${fmtInt(pending)} unid. por despachar →</span>
            </button>`).join('')}</div>`
          : '<p class="text-sm text-slate-500 py-2">No hay órdenes de venta con mercancía por despachar.</p>'}
        </div>`;
      document.body.appendChild(wrap);
      wrap.addEventListener('click', (e) => {
        if (e.target === wrap || e.target.closest('[data-close]')) { wrap.remove(); return; }
        const b = e.target.closest('[data-order]');
        if (!b) return;
        sessionStorage.setItem('cif_open_dispatch', b.dataset.order);
        wrap.remove();
        location.hash = `#/contabilidad/ordenes/${b.dataset.order}`;
      });
    };

    const draw = () => {
      const body = `
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 class="text-xl font-semibold text-slate-900">Existencias</h1>
            <p class="text-xs text-slate-400">Entra con las recepciones y sale con los despachos de las órdenes de venta. Solo inventario, no mueve la contabilidad.</p>
          </div>
          <div class="flex gap-2">
            <button data-new="ajuste" class="${btnSecondary}">Ajuste</button>
            <button id="btn-dispatch" class="${btnSecondary}">Despacho</button>
            <button data-new="recepcion" class="${btnPrimary}">Registrar recepción</button>
          </div>
        </div>
        <div id="stock-audit"></div>
        <div class="flex gap-4 border-b border-slate-200 text-sm">
          ${[['stock', 'Existencias'], ['movimientos', 'Movimientos']].map(([t, l]) => `<button data-tab="${t}" class="pb-2 -mb-px border-b-2 ${tab === t ? 'border-blue-600 text-slate-900 font-medium' : 'border-transparent text-slate-500 hover:text-slate-800'}">${l}</button>`).join('')}
        </div>
        <div class="${tab === 'stock' ? '' : 'hidden'} space-y-3">
          <div id="stock-summary" class="grid grid-cols-1 sm:grid-cols-3 gap-3"></div>
          <div class="${card} space-y-3">
            <div class="flex flex-wrap items-center gap-3">
              <input id="stock-search" type="text" placeholder="Buscar producto…" value="${esc(query)}" class="${input} flex-1 min-w-[12rem]">
              <label class="flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap"><input id="stock-only" type="checkbox" ${onlyActive ? 'checked' : ''}> Solo con existencia o por despachar</label>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide"><th class="p-2">Producto</th><th class="p-2 text-right">En almacén</th><th class="p-2 text-right">Por despachar</th><th class="p-2 text-right">Disponible</th></tr></thead>
                <tbody id="stock-tbody"></tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="${tab === 'movimientos' ? '' : 'hidden'} ${card} overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide"><th class="p-2">Fecha</th><th class="p-2">Tipo</th><th class="p-2">Referencia</th><th class="p-2">Productos</th><th class="p-2"></th></tr></thead>
            <tbody id="history-tbody"></tbody>
          </table>
        </div>`;
      app.innerHTML = AccountingShell.wrap(AccountingTabs.render('inventory'), body);
      renderAudit();
      renderStock();
      renderHistory();
      app.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; draw(); }));
      app.querySelectorAll('[data-new]').forEach(b => b.addEventListener('click', () => openForm(b.dataset.new)));
      document.getElementById('btn-dispatch').addEventListener('click', openDispatchPicker);
      document.getElementById('stock-search').addEventListener('input', (e) => { query = e.target.value; renderStock(); });
      document.getElementById('stock-only').addEventListener('change', (e) => { onlyActive = e.target.checked; renderStock(); });
      document.getElementById('history-tbody').addEventListener('click', (e) => {
        const b = e.target.closest('[data-undo]');
        if (!b || !confirm('¿Anular este movimiento? La existencia vuelve a como estaba antes.')) return;
        Store.deleteStockMove(b.dataset.undo);
        draw();
      });
    };

    draw();
    window.addEventListener('cif-data-updated', () => { if (document.getElementById('stock-tbody')) { renderAudit(); renderStock(); renderHistory(); } }, { signal });
    return () => destroy.abort();
  }
};

export default Inventory;
