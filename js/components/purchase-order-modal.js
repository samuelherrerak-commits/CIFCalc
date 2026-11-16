import Store from '../store.js';
import { fmtNum, fmtInt, esc, computeContainer } from '../utils.js';
import { uploadFoto } from '../sheets.js';
import { readPurchaseOrder } from '../purchase-order-import.js';

// "Importar orden de compra": eliges el Excel, ves la vista previa (totales
// FOB/flete/seguro/CIF, volumen, peso, avisos) y al confirmar se crea el
// contenedor en Borrador con sus productos y fotos.

const inputCls = 'w-full p-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none';

function toItems(order, supplierIds) {
  return order.items.map(it => ({
    supplier_id: supplierIds[it.supplier.toUpperCase()] || null, origin_country: 'China',
    sku: it.sku, sku_briggs: '', name: it.name, qty: it.qty, units_per_box: it.units_per_box,
    box_volume: it.box_volume, weight_kg: it.weight_kg, fob_unit: it.fob_unit, hs_code: it.hs_code,
    tariff_rate: 0, gain_margin: 0, product_id: null, foto_url: '', foto_file_id: ''
  }));
}

async function uploadWithRetry(id, photo, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { return await uploadFoto(id, photo.filename, photo.mimeType, photo.base64, 'items'); } catch (e) {
      last = e;
      await new Promise(r => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw last;
}

export function openPurchaseOrderImport() {
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = '.xlsx,.xlsm';
  picker.addEventListener('change', async () => {
    const file = picker.files[0];
    if (!file) return;
    let order;
    try { order = await readPurchaseOrder(file); } catch (e) { alert('No se pudo leer la orden de compra: ' + e.message); return; }
    showPreview(order);
  });
  picker.click();
}

function showPreview(order) {
  const wrap = document.createElement('div');
  wrap.className = 'fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4';
  document.body.appendChild(wrap);
  const state = { name: order.name, ...order.container, max_weight: 26500 };

  const calc = () => {
    const c = { container_capacity: state.container_capacity, ocean_freight: state.ocean_freight, insurance_enabled: state.insurance_rate > 0,
      insurance_rate: state.insurance_rate, insurance_basis: state.insurance_basis, vat_rate: 0 };
    const res = computeContainer(c, toItems(order, {}));
    const t = res.calculated.reduce((a, x) => ({ fob: a.fob + x.fobTotal, fr: a.fr + x.oceanFreightAssigned, ins: a.ins + x.insuranceAmount, cif: a.cif + x.cifTotal, kg: a.kg + x.boxes * (Number(x.item.weight_kg) || 0), pcs: a.pcs + x.qty }), { fob: 0, fr: 0, ins: 0, cif: 0, kg: 0, pcs: 0 });
    return { res, t };
  };

  const render = () => {
    const { res, t } = calc();
    const tile = (k, v, strong) => `<div class="rounded-xl bg-slate-50 px-3 py-2"><div class="text-[10px] uppercase tracking-wide text-slate-400">${k}</div><div class="text-sm ${strong ? 'font-extrabold text-blue-900' : 'font-semibold text-slate-800'}">${v}</div></div>`;
    wrap.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">
        <div class="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h3 class="font-semibold text-slate-900">Importar orden de compra</h3>
          <button data-close class="text-slate-400 hover:text-slate-700 text-xl leading-none">✕</button>
        </div>
        <div class="p-5 space-y-4 overflow-y-auto">
          <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div class="sm:col-span-2"><label class="block text-xs font-semibold text-slate-600 mb-1">Nombre del contenedor *</label><input id="po-name" class="${inputCls}" value="${esc(state.name)}"></div>
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Volumen (m³)</label><input id="po-cap" type="number" step="0.1" class="${inputCls}" value="${state.container_capacity}"></div>
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Flete marítimo ($)</label><input id="po-freight" type="number" step="0.01" class="${inputCls}" value="${state.ocean_freight}"></div>
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Seguro (%)</label><input id="po-ins" type="number" step="0.01" class="${inputCls}" value="${state.insurance_rate}"></div>
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Base del seguro</label><select id="po-basis" class="${inputCls}"><option value="fob" ${state.insurance_basis !== 'cfr110' ? 'selected' : ''}>Sobre FOB</option><option value="cfr110" ${state.insurance_basis === 'cfr110' ? 'selected' : ''}>110 % del CFR</option></select></div>
            <div><label class="block text-xs font-semibold text-slate-600 mb-1">Carga máx. (kg)</label><input id="po-kg" type="number" step="100" class="${inputCls}" value="${state.max_weight}"></div>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            ${tile('Productos', fmtInt(order.items.length))}${tile('Piezas', fmtInt(t.pcs))}
            ${tile('Volumen', `${res.totalVolume.toFixed(2)} m³ · ${res.volumePercentage.toFixed(0)}%`)}${tile('Peso', `${fmtInt(t.kg)} kg`)}
            ${tile('FOB', '$' + fmtNum(t.fob))}${tile('Flete', '$' + fmtNum(t.fr))}${tile('Seguro', '$' + fmtNum(t.ins))}${tile('CIF', '$' + fmtNum(t.cif), true)}
          </div>
          ${order.warnings.length ? `<details class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><summary class="cursor-pointer font-semibold">${order.warnings.length} aviso(s) de la plantilla</summary><ul class="mt-1 list-disc pl-5 space-y-0.5">${order.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
          <div class="border border-slate-200 rounded-xl overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="bg-slate-50 text-[10px] font-semibold text-slate-400 uppercase tracking-wide"><tr><th class="p-2 text-left">Producto</th><th class="p-2 text-left">Fábrica</th><th class="p-2 text-right">Cant.</th><th class="p-2 text-right">FOB unit.</th><th class="p-2 text-right">Cajas</th><th class="p-2 text-right">m³</th><th class="p-2 text-right">CIF total</th><th class="p-2 text-right">CIF unit.</th></tr></thead>
              <tbody>${res.calculated.map((x, i) => {
                const it = order.items[i];
                return `<tr class="border-t border-slate-100">
                  <td class="p-2"><div class="flex items-center gap-2">${it.photo ? `<img src="data:${it.photo.mimeType};base64,${it.photo.base64}" class="w-9 h-9 object-contain rounded border border-slate-200 bg-white flex-shrink-0" alt="">` : '<div class="w-9 h-9 rounded border border-dashed border-slate-200 flex-shrink-0"></div>'}<div><div class="font-mono font-semibold text-slate-800">${esc(it.sku)}</div><div class="text-slate-500 truncate max-w-[18rem]">${esc(it.name)}</div></div></div></td>
                  <td class="p-2 text-slate-600">${esc(it.supplier)}</td>
                  <td class="p-2 text-right tabular-nums">${fmtInt(it.qty)}</td>
                  <td class="p-2 text-right tabular-nums">$${fmtNum(it.fob_unit)}</td>
                  <td class="p-2 text-right tabular-nums">${fmtInt(it.boxes)}</td>
                  <td class="p-2 text-right tabular-nums">${x.volTotal.toFixed(3)}</td>
                  <td class="p-2 text-right tabular-nums">$${fmtNum(x.cifTotal)}</td>
                  <td class="p-2 text-right tabular-nums font-semibold text-blue-900">$${fmtNum(x.cifUnit)}</td>
                </tr>`;
              }).join('')}</tbody>
            </table>
          </div>
          <p class="text-[11px] text-slate-400">CIF unitario = CIF de la línea ÷ piezas pedidas. El contenedor se crea en Borrador: no toca inventario ni contabilidad. Los productos no se agregan al catálogo.</p>
        </div>
        <div class="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between gap-3">
          <p id="po-msg" class="text-xs text-slate-500"></p>
          <div class="flex gap-2 shrink-0">
            <button data-close class="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200">Cancelar</button>
            <button id="po-create" class="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700">Crear contenedor</button>
          </div>
        </div>
      </div>`;
    wrap.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => wrap.remove()));
    const bindNum = (id, key) => wrap.querySelector('#' + id).addEventListener('change', (e) => { state[key] = parseFloat(e.target.value) || 0; render(); });
    wrap.querySelector('#po-name').addEventListener('input', (e) => { state.name = e.target.value; });
    bindNum('po-cap', 'container_capacity'); bindNum('po-freight', 'ocean_freight'); bindNum('po-ins', 'insurance_rate'); bindNum('po-kg', 'max_weight');
    wrap.querySelector('#po-basis').addEventListener('change', (e) => { state.insurance_basis = e.target.value; render(); });
    wrap.querySelector('#po-create').addEventListener('click', () => create(order, state, wrap));
  };
  render();
}

async function create(order, state, wrap) {
  const msg = wrap.querySelector('#po-msg');
  const btn = wrap.querySelector('#po-create');
  const name = state.name.trim();
  if (!name) { msg.textContent = 'Escribe el nombre del contenedor.'; msg.className = 'text-xs text-red-600'; return; }
  if (Store.getAll('containers').some(c => String(c.bl_number).trim().toLowerCase() === name.toLowerCase()) &&
    !confirm(`Ya existe un contenedor llamado "${name}". ¿Crear otro igual?`)) return;
  btn.disabled = true;
  wrap.querySelectorAll('[data-close]').forEach(b => { b.disabled = true; });
  const say = (t) => { msg.textContent = t; msg.className = 'text-xs text-slate-600'; };
  try {
    // Fábricas como proveedores (se reutilizan por nombre).
    say('Creando proveedores…');
    const supplierIds = {};
    for (const s of Store.getAll('suppliers')) supplierIds[String(s.name).trim().toUpperCase()] = s.id;
    for (const sup of [...new Set(order.items.map(i => i.supplier).filter(Boolean))]) {
      if (!supplierIds[sup.toUpperCase()]) supplierIds[sup.toUpperCase()] = Store.insert('suppliers', { name: sup, country: 'China', contact_email: '', contact_phone: '' }).id;
    }
    say('Creando el contenedor…');
    const base = Store.newContainer();
    const container = {
      ...base, bl_number: name, container_capacity: state.container_capacity, container_max_weight: state.max_weight,
      ocean_freight: state.ocean_freight, insurance_enabled: state.insurance_rate > 0, insurance_rate: state.insurance_rate,
      insurance_basis: state.insurance_basis, status: 'draft'
    };
    const { container: c, items } = await Store.saveContainerWithItems(container, toItems(order, supplierIds));

    // Fotos: a Drive (en modo prueba se quedan solo en este navegador).
    const withPhoto = items.map((it, i) => ({ it, photo: order.items[i].photo })).filter(x => x.photo);
    let ok = 0, failed = 0;
    for (const [n, { it, photo }] of withPhoto.entries()) {
      say(`Subiendo fotos ${n + 1} de ${withPhoto.length}…`);
      try {
        if (Store.isSandbox()) {
          Store.update('items', { id: it.id, foto_url: `data:${photo.mimeType};base64,${photo.base64}` });
        } else {
          const r = await uploadWithRetry(it.id, photo);
          Store.update('items', { id: it.id, foto_url: r.foto_url, foto_file_id: r.foto_file_id });
        }
        ok++;
      } catch (e) {
        failed++;
      }
    }
    wrap.remove();
    if (failed) alert(`Contenedor creado. ${failed} foto(s) no se pudieron subir; puedes intentarlo de nuevo importando otra vez.`);
    window.location.hash = `#/contenedor/${c.id}`;
  } catch (e) {
    btn.disabled = false;
    wrap.querySelectorAll('[data-close]').forEach(b => { b.disabled = false; });
    msg.textContent = 'No se pudo crear: ' + e.message;
    msg.className = 'text-xs text-red-600';
  }
}
