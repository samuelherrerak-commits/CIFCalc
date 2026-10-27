import Store from '../store.js';
import { fmtNum, esc } from '../utils.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { card, input, label, btnPrimary } from '../components/accounting-shell.js';

// Promociones generales: % de descuento sobre el precio de venta para un
// producto, una categoría o todo el catálogo, con vigencia. Ventas aplica sola
// la mejor promoción vigente (o el descuento del cliente si es mayor).
const SCOPE = { todos: 'Todo el catálogo', categoria: 'Categoría', producto: 'Producto' };
const today = () => new Date().toISOString().slice(0, 10);

function statusOf(p) {
  const t = today();
  if (p.active === false || String(p.active) === 'false') return { text: 'Pausada', color: 'slate' };
  if (p.start_date && p.start_date > t) return { text: 'Programada', color: 'blue' };
  if (p.end_date && p.end_date < t) return { text: 'Vencida', color: 'slate' };
  return { text: 'Vigente', color: 'emerald' };
}

const Promotions = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;
    const products = Store.getAll('products').sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const categories = [...new Set(products.map(p => String(p.category || '').trim()).filter(Boolean))].sort();
    let editingId = null;

    const targetName = (p) => p.scope === 'todos' ? 'Todo el catálogo'
      : p.scope === 'categoria' ? p.target
      : ((products.find(x => x.id === p.target) || {}).name || 'Producto eliminado');

    const affected = (p) => p.scope === 'todos' ? products.length
      : p.scope === 'categoria' ? products.filter(x => String(x.category || '').trim() === p.target).length
      : (products.some(x => x.id === p.target) ? 1 : 0);

    const renderTarget = (scope, value) => {
      const wrap = document.getElementById('f-target-wrap');
      if (scope === 'todos') { wrap.innerHTML = '<p class="text-xs text-slate-400 pt-7">Aplica a todos los productos.</p>'; return; }
      const opts = scope === 'categoria'
        ? categories.map(c => `<option value="${esc(c)}" ${c === value ? 'selected' : ''}>${esc(c)}</option>`)
        : products.map(p => `<option value="${esc(p.id)}" ${p.id === value ? 'selected' : ''}>${esc(p.name)} — ${esc(p.sku_briggs)}</option>`);
      wrap.innerHTML = `<label class="${label}">${scope === 'categoria' ? 'Categoría' : 'Producto'} *</label><select id="f-target" class="${input}">${opts.join('')}</select>`;
    };

    const fillForm = (p) => {
      editingId = p ? p.id : null;
      const v = p || Store.newPromotion();
      document.getElementById('f-name').value = v.name || '';
      document.getElementById('f-scope').value = v.scope;
      document.getElementById('f-pct').value = Number(v.discount_pct) || '';
      document.getElementById('f-start').value = v.start_date || '';
      document.getElementById('f-end').value = v.end_date || '';
      renderTarget(v.scope, v.target);
      document.getElementById('btn-save').textContent = p ? 'Guardar cambios' : 'Crear promoción';
      document.getElementById('btn-cancel').classList.toggle('hidden', !p);
    };

    const renderList = () => {
      const list = Store.getAll('promotions').sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')));
      const el = document.getElementById('promo-list');
      el.innerHTML = list.length === 0
        ? '<p class="text-sm text-slate-400 py-6 text-center">Sin promociones todavía. Crea la primera arriba.</p>'
        : list.map(p => {
          const st = statusOf(p);
          return `
          <div class="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200">
            <div class="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex flex-col items-center justify-center shrink-0">
              <span class="text-lg font-semibold leading-none">-${fmtNum(p.discount_pct).replace(/\.00$/, '')}%</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-bold text-slate-800">${esc(p.name) || 'Promoción'}</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold text-${st.color}-700 bg-${st.color}-100">${st.text}</span>
              </div>
              <div class="text-xs text-slate-500">${SCOPE[p.scope] || ''}: <strong>${esc(targetName(p))}</strong> · ${affected(p)} producto(s)</div>
              <div class="text-[11px] text-slate-400">${p.start_date ? 'Desde ' + esc(p.start_date) : 'Sin fecha de inicio'}${p.end_date ? ' hasta ' + esc(p.end_date) : ' · sin vencimiento'}</div>
            </div>
            <div class="flex gap-1.5">
              <button data-toggle="${esc(p.id)}" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700">${st.text === 'Pausada' ? '▶ Activar' : '⏸ Pausar'}</button>
              <button data-edit="${esc(p.id)}" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700">Editar</button>
              <button data-del="${esc(p.id)}" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50">Eliminar</button>
            </div>
          </div>`;
        }).join('');
      el.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => {
        const p = Store.getById('promotions', b.dataset.toggle);
        Store.update('promotions', { id: p.id, active: statusOf(p).text === 'Pausada' });
        renderList();
      }));
      el.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => { fillForm(Store.getById('promotions', b.dataset.edit)); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
      el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
        if (!confirm('¿Eliminar esta promoción?')) return;
        Store.remove('promotions', b.dataset.del);
        if (editingId === b.dataset.del) fillForm(null);
        renderList();
      }));
    };

    const save = () => {
      const msg = document.getElementById('f-msg');
      const scope = document.getElementById('f-scope').value;
      const target = scope === 'todos' ? '' : (document.getElementById('f-target') || {}).value || '';
      const pct = Number(document.getElementById('f-pct').value);
      const rec = {
        name: document.getElementById('f-name').value.trim(), scope, target, discount_pct: pct,
        start_date: document.getElementById('f-start').value, end_date: document.getElementById('f-end').value
      };
      if (!rec.name) { msg.textContent = 'Ponle un nombre (p. ej. "Semana de la grifería").'; return; }
      if (scope !== 'todos' && !target) { msg.textContent = 'Elige a qué aplica.'; return; }
      if (!(pct > 0 && pct < 100)) { msg.textContent = 'El descuento debe estar entre 1% y 99%.'; return; }
      if (rec.start_date && rec.end_date && rec.end_date < rec.start_date) { msg.textContent = 'La fecha final no puede ser antes de la inicial.'; return; }
      msg.textContent = '';
      if (editingId) Store.update('promotions', { id: editingId, ...rec });
      else Store.insert('promotions', Store.newPromotion({ ...rec, active: true }));
      fillForm(null);
      renderList();
    };

    const body = `
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Promociones</h1>
        <p class="text-xs text-slate-500">Descuentos generales con vigencia. En Ventas se aplica sola la mejor promoción vigente, o el descuento especial del cliente si es mayor (no se suman).</p>
      </div>
      <div class="${card} space-y-3">
        <div class="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div class="md:col-span-2"><label class="${label}">Nombre *</label><input id="f-name" class="${input}" placeholder="Semana de la grifería"></div>
          <div><label class="${label}">Aplica a</label>
            <select id="f-scope" class="${input}">${Object.entries(SCOPE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
          <div class="md:col-span-2" id="f-target-wrap"></div>
          <div><label class="${label}">Descuento % *</label><input id="f-pct" type="number" min="1" max="99" step="0.5" class="${input}"></div>
          <div><label class="${label}">Desde</label><input id="f-start" type="date" class="${input}"></div>
          <div><label class="${label}">Hasta (opcional)</label><input id="f-end" type="date" class="${input}"></div>
        </div>
        <div class="flex items-center gap-2">
          <button id="btn-save" class="${btnPrimary}">Crear promoción</button>
          <button id="btn-cancel" class="hidden text-xs font-semibold text-slate-500 px-3">Cancelar edición</button>
          <span id="f-msg" class="text-xs text-red-600"></span>
        </div>
      </div>
      <div class="${card}">
        <h2 class="text-sm font-semibold text-slate-900 mb-3">Promociones</h2>
        <div id="promo-list" class="space-y-2"></div>
      </div>`;
    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('promotions'), body);

    document.getElementById('f-scope').addEventListener('change', (e) => renderTarget(e.target.value, ''), { signal });
    document.getElementById('btn-save').addEventListener('click', save, { signal });
    document.getElementById('btn-cancel').addEventListener('click', () => fillForm(null), { signal });
    fillForm(null);
    renderList();
    return () => destroy.abort();
  }
};

export default Promotions;
