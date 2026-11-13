import Store from '../store.js';
import { fmtNum, fmtInt, esc } from '../utils.js';
import { taxSummaryRows } from '../fiscal.js';
import {
  ORDER_STATUS, PAY_METHODS, orderItems, orderMoney, orderPayments, orderDispatches, dispatchItems,
  dispatchStatus, registerPayment, registerDispatch, invoiceOrder, attachProof, orderDocument
} from '../orders.js';
import { printSalesDocument } from '../components/sales-document.js';
import { einvoiceInfo, emitEinvoice, sendEinvoiceEmail, einvoicePdfLink, whatsappText, waLink } from '../einvoice.js';
import { printPage } from '../components/print-page.js';
import { icon } from '../components/icons.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { btnPrimary, btnSecondary, card, input, label } from '../components/accounting-shell.js';

// Órdenes de venta: el presupuesto aprobado se convierte en orden; sobre la
// orden se registran los anticipos (con su comprobante), los despachos
// (parciales o totales) y, al final, la factura, que cruza los anticipos y
// deja el resto en Cuentas por Cobrar.

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const isFiscal = (o) => o.fiscal === true || String(o.fiscal) === 'true';
let listFilter = 'abierta';
let fiscalFilter = 'todas';
const fmtRate = (n) => Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Venta pagada en bolívares: precios en $ a tasa BCV ajustados con la tasa USDT.
const bsChip = (o, total) => o.payment_currency === 'bs'
  ? `<span class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-blue-700 bg-blue-50" title="USDT ${fmtRate(o.fx_usdt)} ÷ BCV ${fmtRate(o.fx_bcv)} = ×${Number(o.fx_factor || 0).toFixed(4)}">Pago en Bs${total ? ' · Bs ' + fmtRate(total * Number(o.fx_bcv || 0)) : ''}</span>`
  : '';
let listQuery = '';

function badge(status) {
  const st = ORDER_STATUS[status] || ORDER_STATUS.abierta;
  return `<span class="px-2 py-0.5 rounded-full text-[11px] font-medium ${st.tone}">${st.label}</span>`;
}

function modal(title, bodyHtml, { saveLabel = 'Guardar', wide = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4';
  wrap.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <h3 class="font-semibold text-slate-900">${title}</h3>
        <button data-close class="text-slate-400 hover:text-slate-700 text-xl leading-none">✕</button>
      </div>
      <div class="p-5 space-y-3">${bodyHtml}</div>
      <div class="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between gap-3">
        <p id="m-msg" class="text-xs text-red-600"></p>
        <div class="flex gap-2 shrink-0">
          <button data-close class="${btnSecondary}">Cancelar</button>
          <button id="m-save" class="${btnPrimary}">${saveLabel}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  return { el: wrap, close, $: (id) => wrap.querySelector('#' + id), msg: (t) => { wrap.querySelector('#m-msg').textContent = t; } };
}

function printOrder(order) {
  printSalesDocument(orderDocument(order), Store.getBusinessProfile());
}

const contactOf = (order) => (order.contact_id ? Store.getById('contacts', order.contact_id) : null) || {};

const clientOf = (order) => {
  const c = order.contact_id ? Store.getById('contacts', order.contact_id) : null;
  return c ? { name: c.name, rif: c.rif, address: c.address, phone: c.phone } : { name: order.contact_name };
};

// Estado por producto: pedido, despachado y pendiente.
function dispatchRows(order) {
  return orderItems(order).map(it => {
    const qty = Number(it.qty) || 0, done = Number(it.dispatched) || 0;
    return { ...it, qty, done, pending: Math.max(0, qty - done) };
  });
}

// Orden de despacho: lo que sale en este despacho y lo que queda pendiente
// (sin precios), con firmas de quien despacha y quien recibe.
function printDispatchOrder(order, dispatch) {
  const items = dispatchItems(dispatch);
  const rows = dispatchRows(order);
  const bodyHtml = `
    <h3>Productos despachados</h3>
    <table><thead><tr><th>Código</th><th>Descripción</th><th class="n">Cantidad despachada</th></tr></thead><tbody>
      ${items.map(x => { const it = rows.find(r => r.productId === x.productId) || {}; return `<tr><td>${esc(it.sku || '')}</td><td>${esc(x.name)}</td><td class="n">${fmtInt(x.qty)}</td></tr>`; }).join('')}
      <tr class="tot"><td colspan="2">Total de unidades en este despacho</td><td class="n">${fmtInt(items.reduce((t, x) => t + Number(x.qty), 0))}</td></tr>
    </tbody></table>
    <h3>Estado de la orden ${esc(order.order_number)} después de este despacho</h3>
    <table><thead><tr><th>Código</th><th>Descripción</th><th class="n">Pedido</th><th class="n">Despachado</th><th class="n">Pendiente</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.sku)}</td><td>${esc(r.name)}</td><td class="n">${fmtInt(r.qty)}</td><td class="n">${fmtInt(r.done)}</td><td class="n">${fmtInt(r.pending)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="2">Totales</td><td class="n">${fmtInt(rows.reduce((t, r) => t + r.qty, 0))}</td><td class="n">${fmtInt(rows.reduce((t, r) => t + r.done, 0))}</td><td class="n">${fmtInt(rows.reduce((t, r) => t + r.pending, 0))}</td></tr>
    </tbody></table>
    ${dispatch.notes ? `<h3>Notas</h3><p>${esc(dispatch.notes)}</p>` : ''}`;
  printPage({
    title: 'Orden de despacho', number: dispatch.dispatch_number, date: dispatch.date, client: clientOf(order),
    meta: [['Orden de venta', order.order_number]], bodyHtml, signatures: ['Despachado por', 'Transportista', 'Recibido conforme']
  }, Store.getBusinessProfile());
}

// Estado de la orden: total, anticipos y lo que falta por cobrar; productos
// pedidos, despachados y pendientes por despachar.
function printOrderStatus(order) {
  const m = orderMoney(order);
  const rows = dispatchRows(order);
  const pays = orderPayments(order.id);
  const bodyHtml = `
    <h3>Cobro</h3>
    <table class="sum"><tbody>
      <tr><td>Total de la orden</td><td class="n">$${fmtNum(m.total)}</td></tr>
      <tr><td>Menos: anticipos recibidos</td><td class="n">-$${fmtNum(m.advances)}</td></tr>
      ${m.collections > 0 ? `<tr><td>Menos: cobros</td><td class="n">-$${fmtNum(m.collections)}</td></tr>` : ''}
      ${m.withheld > 0 ? `<tr><td>Menos: retención de IVA (${m.retPct}%)</td><td class="n">-$${fmtNum(m.withheld)}</td></tr>` : ''}
      <tr class="grand"><td>${m.balance < -0.005 ? 'Saldo a favor del cliente' : 'Falta por cobrar'}</td><td class="n">$${fmtNum(Math.abs(m.balance))}</td></tr>
    </tbody></table>
    ${pays.length ? `<h3>Pagos recibidos</h3><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Forma</th><th>Referencia</th><th class="n">Monto</th></tr></thead><tbody>
      ${pays.map(p => `<tr><td>${fmtDate(p.date)}</td><td>${p.kind === 'anticipo' ? 'Anticipo' : 'Cobro'}</td><td>${esc((PAY_METHODS.find(x => x.key === p.method) || {}).label || p.method)}</td><td>${esc(p.reference || p.ref_doc)}</td><td class="n">$${fmtNum(p.amount)}</td></tr>`).join('')}
    </tbody></table>` : ''}
    <h3>Despacho</h3>
    <table><thead><tr><th>Código</th><th>Descripción</th><th class="n">Pedido</th><th class="n">Despachado</th><th class="n">Pendiente</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.sku)}</td><td>${esc(r.name)}</td><td class="n">${fmtInt(r.qty)}</td><td class="n">${fmtInt(r.done)}</td><td class="n">${fmtInt(r.pending)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="2">Pendiente por despachar</td><td class="n">${fmtInt(rows.reduce((t, r) => t + r.qty, 0))}</td><td class="n">${fmtInt(rows.reduce((t, r) => t + r.done, 0))}</td><td class="n">${fmtInt(rows.reduce((t, r) => t + r.pending, 0))}</td></tr>
    </tbody></table>`;
  printPage({
    title: 'Estado de la orden', number: order.order_number, date: new Date().toISOString().slice(0, 10), client: clientOf(order),
    meta: [['Fecha de la orden', fmtDate(order.date)], ...(order.invoice_ref ? [['Factura', order.invoice_number || order.invoice_ref]] : [])], bodyHtml
  }, Store.getBusinessProfile());
}

// Aviso después de registrar un anticipo o un despacho (con su documento).
let lastEvent = null;

// ---------- Modales de acción ----------
export function paymentModal(order, onDone) {
  const m = orderMoney(order);
  const kind = order.status === 'facturada' ? 'cobro' : 'anticipo';
  const banks = Store.getAll('accounts').filter(a => a.tipo_especifico === 'Banco' && a.is_active !== false);
  const md = modal(kind === 'anticipo' ? `Registrar anticipo · ${esc(order.order_number)}` : `Registrar cobro · ${esc(order.order_number)}`, `
    <p class="text-xs text-slate-500">${kind === 'anticipo'
      ? 'El anticipo queda como <strong>Anticipos de clientes</strong> (lo que le debes al cliente) hasta que se factura la orden.'
      : 'El cobro baja la <strong>Cuenta por cobrar</strong> de este cliente.'} Saldo pendiente: <strong>$${fmtNum(Math.max(0, m.balance))}</strong>.</p>
    <div class="grid grid-cols-2 gap-3">
      <div><label class="${label}">Fecha *</label><input id="p-date" type="date" value="${today()}" class="${input}"></div>
      <div><label class="${label}">Monto (USD) *</label><input id="p-amount" type="number" min="0" step="0.01" value="${m.balance > 0 ? m.balance.toFixed(2) : ''}" class="${input} text-right"></div>
    </div>
    <div>
      <label class="${label}">Forma de pago *</label>
      <div id="p-method" class="grid grid-cols-2 gap-0.5 p-0.5 rounded-lg bg-slate-100">
        ${PAY_METHODS.map((pm, i) => `<button type="button" data-method="${pm.key}" class="py-1.5 rounded-md text-sm ${i === 1 ? 'bg-white text-slate-900 font-semibold shadow-sm' : 'text-slate-500'}">${pm.label}</button>`).join('')}
      </div>
      ${banks.length > 1 ? `<select id="p-bank" class="${input} mt-2">${banks.map(a => `<option value="${a.id}">${esc(a.codigo)} — ${esc(a.nombre)}</option>`).join('')}</select>` : ''}
    </div>
    <div><label class="${label}">Referencia (N.º de transferencia, recibo…)</label><input id="p-ref" type="text" class="${input}"></div>
    <div>
      <label class="${label}">Comprobante (foto del efectivo o captura del banco)</label>
      <label class="flex items-center gap-3 p-3 rounded-lg border border-dashed border-slate-300 hover:border-blue-400 cursor-pointer">
        <span class="text-slate-400">${icon('download', 'w-5 h-5')}</span>
        <span id="p-file-name" class="text-sm text-slate-500">Elegir imagen o tomar foto</span>
        <input id="p-file" type="file" accept="image/*" class="hidden">
      </label>
      <img id="p-preview" class="hidden mt-2 max-h-40 rounded-lg border border-slate-200" alt="">
    </div>
    <div><label class="${label}">Notas</label><input id="p-notes" type="text" class="${input}"></div>`, { saveLabel: kind === 'anticipo' ? 'Registrar anticipo' : 'Registrar cobro' });
  let method = 'banco';
  md.el.querySelectorAll('[data-method]').forEach(b => b.addEventListener('click', () => {
    method = b.dataset.method;
    md.el.querySelectorAll('[data-method]').forEach(x => { x.className = `py-1.5 rounded-md text-sm ${x.dataset.method === method ? 'bg-white text-slate-900 font-semibold shadow-sm' : 'text-slate-500'}`; });
    if (md.$('p-bank')) md.$('p-bank').classList.toggle('hidden', method !== 'banco');
  }));
  md.$('p-file').addEventListener('change', () => {
    const f = md.$('p-file').files[0];
    md.$('p-file-name').textContent = f ? f.name : 'Elegir imagen o tomar foto';
    if (f) { md.$('p-preview').src = URL.createObjectURL(f); md.$('p-preview').classList.remove('hidden'); }
  });
  md.$('m-save').addEventListener('click', async () => {
    const amount = Math.round((parseFloat(md.$('p-amount').value) || 0) * 100) / 100;
    const date = md.$('p-date').value;
    if (!date) return md.msg('La fecha es obligatoria.');
    if (!(amount > 0)) return md.msg('El monto debe ser mayor a 0.');
    const file = md.$('p-file').files[0];
    if (!file && !confirm('No adjuntaste comprobante. ¿Registrar el pago de todas formas? Podrás subirlo después.')) return;
    md.$('m-save').disabled = true;
    const pay = registerPayment(order, { date, amount, method, accountId: md.$('p-bank') ? md.$('p-bank').value : '', reference: md.$('p-ref').value.trim(), notes: md.$('p-notes').value.trim() });
    if (file) {
      md.msg('');
      md.$('m-save').textContent = 'Subiendo comprobante…';
      try { await attachProof(pay, file); } catch (e) {
        alert(`El pago quedó registrado, pero el comprobante no se pudo subir: ${e.message}. Puedes subirlo de nuevo desde la orden.`);
      }
    }
    md.close();
    onDone({ kind: 'pago', id: pay.id });
  });
}

function dispatchModal(order, onDone) {
  const items = orderItems(order).filter(it => Number(it.qty) - (Number(it.dispatched) || 0) > 0);
  const products = new Map(Store.getAll('products').map(p => [p.id, p]));
  const md = modal(`Registrar despacho · ${esc(order.order_number)}`, `
    <p class="text-xs text-slate-500">Indica cuánto sale hoy de cada producto. El inventario baja con lo despachado; puedes despachar por partes.</p>
    <div><label class="${label}">Fecha *</label><input id="d-date" type="date" value="${today()}" class="${input}"></div>
    <table class="w-full text-sm">
      <thead><tr class="text-[11px] text-slate-400 uppercase"><th class="text-left py-1">Producto</th><th class="text-right py-1">Pendiente</th><th class="text-right py-1">Existencia</th><th class="text-right py-1 w-24">Despachar</th></tr></thead>
      <tbody>${items.map(it => {
        const pend = Number(it.qty) - (Number(it.dispatched) || 0);
        const stock = Number((products.get(it.productId) || {}).stock) || 0;
        return `<tr class="border-t border-slate-100">
          <td class="py-1.5 pr-2"><div class="text-slate-700 truncate max-w-[14rem]" title="${esc(it.name)}">${esc(it.name)}</div><div class="text-[10px] font-mono text-slate-400">${esc(it.sku)}</div></td>
          <td class="py-1.5 text-right tabular-nums">${fmtInt(pend)}</td>
          <td class="py-1.5 text-right tabular-nums ${stock < pend ? 'text-amber-600' : 'text-slate-500'}">${fmtInt(stock)}</td>
          <td class="py-1.5 text-right"><input data-dq="${esc(it.productId)}" data-stock="${stock}" type="number" min="0" max="${pend}" step="1" value="${Math.min(pend, Math.max(0, stock))}" class="w-20 p-1.5 border border-slate-200 rounded-lg text-right text-sm"></td>
        </tr>`;
      }).join('')}</tbody>
    </table>
    <div><label class="${label}">Notas (transporte, guía, quién retira…)</label><input id="d-notes" type="text" class="${input}"></div>`, { saveLabel: 'Registrar despacho', wide: true });
  md.$('m-save').addEventListener('click', () => {
    const date = md.$('d-date').value;
    if (!date) return md.msg('La fecha es obligatoria.');
    const qtyByProduct = {};
    let over = false, any = false;
    md.el.querySelectorAll('[data-dq]').forEach(el => {
      const q = Math.floor(Number(el.value) || 0);
      if (q > 0) { qtyByProduct[el.dataset.dq] = q; any = true; if (q > Number(el.dataset.stock)) over = true; }
    });
    if (!any) return md.msg('Indica al menos una cantidad a despachar.');
    if (over && !confirm('Algunas cantidades superan la existencia registrada; el inventario quedará en negativo. ¿Despachar de todas formas?')) return;
    const d = registerDispatch(order, { date, qtyByProduct, notes: md.$('d-notes').value.trim() });
    md.close();
    onDone(d ? { kind: 'despacho', id: d.id } : null);
  });
}

function invoiceModal(order, onDone) {
  const m = orderMoney(order);
  const fiscal = isFiscal(order);
  const due = m.total - m.withheld;
  const applied = Math.min(m.advances, due);
  const ds = dispatchStatus(order);
  const md = modal(`${fiscal ? 'Facturar' : 'Emitir nota de entrega'} · ${esc(order.order_number)}`, `
    ${!ds.complete ? `<p class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">Quedan ${fmtInt(ds.pending)} unidades por despachar. Puedes facturar ahora y despachar después.</p>` : ''}
    ${fiscal ? `
    <div class="flex gap-1 bg-slate-100 rounded-lg p-1 text-xs">
      <button type="button" data-imode="digital" class="flex-1 px-3 py-1.5 rounded-md">Factura digital</button>
      <button type="button" data-imode="manual" class="flex-1 px-3 py-1.5 rounded-md">Número manual</button>
    </div>
    <div id="i-digital" class="rounded-lg border border-slate-200 p-3 text-xs text-slate-600 space-y-1">
      <p>La imprenta digital asigna el <strong>número de factura</strong> y el <strong>número de control</strong>. Se emite con fecha de hoy.</p>
      <p id="i-provider" class="text-slate-400">Consultando la imprenta…</p>
      ${contactOf(order).email ? `<label class="flex items-center gap-2 pt-1 text-slate-700"><input id="i-email" type="checkbox" checked class="w-4 h-4 accent-blue-600"> Enviarla por correo a <strong>${esc(contactOf(order).email)}</strong></label>` : '<p class="pt-1 text-slate-400">El cliente no tiene correo registrado: no se enviará por correo.</p>'}
    </div>` : ''}
    <div class="grid grid-cols-2 gap-3">
      <div><label class="${label}">Fecha *</label><input id="i-date" type="date" value="${today()}" class="${input}"></div>
      ${fiscal ? `<div data-manual><label class="${label}">N.º factura fiscal</label><input id="i-number" type="text" class="${input}"></div>
      <div data-manual><label class="${label}">N.º de control</label><input id="i-control" type="text" placeholder="00-000000" class="${input}"></div>` : ''}
    </div>
    <div class="rounded-xl bg-slate-50 p-3 text-sm space-y-1">
      <div class="flex justify-between"><span class="text-slate-500">Total ${fiscal ? 'con IVA' : ''}</span><span class="tabular-nums">$${fmtNum(m.total)}</span></div>
      ${m.withheld > 0 ? `<div class="flex justify-between"><span class="text-slate-500">Retención de IVA del cliente (${m.retPct}%)</span><span class="tabular-nums">−$${fmtNum(m.withheld)}</span></div>` : ''}
      <div class="flex justify-between"><span class="text-slate-500">Anticipos que se aplican</span><span class="tabular-nums">−$${fmtNum(applied)}</span></div>
      <div class="flex justify-between font-semibold border-t border-slate-200 pt-1"><span>Queda en Cuentas por cobrar</span><span class="tabular-nums">$${fmtNum(Math.max(0, due - applied))}</span></div>
      ${m.advances > due ? `<p class="text-xs text-amber-700">El cliente pagó $${fmtNum(m.advances - due)} de más: queda como saldo a su favor en Anticipos de clientes.</p>` : ''}
    </div>
    <p class="text-[11px] text-slate-400">Asiento: Debe Anticipos de clientes${m.withheld > 0 ? ' + IVA retenido' : ''} + Cuentas por cobrar / Haber Ingresos por ventas${fiscal ? ' + IVA débito fiscal' : ''}.</p>`, { saveLabel: fiscal ? 'Facturar' : 'Emitir nota' });
  let mode = fiscal ? 'digital' : 'manual';
  const setMode = (m) => {
    mode = m;
    md.el.querySelectorAll('[data-imode]').forEach(b => { b.className = `flex-1 px-3 py-1.5 rounded-md ${b.dataset.imode === m ? 'bg-white text-slate-900 font-semibold shadow-sm' : 'text-slate-500'}`; });
    md.el.querySelectorAll('[data-manual]').forEach(el => el.classList.toggle('hidden', m === 'digital'));
    if (md.$('i-digital')) md.$('i-digital').classList.toggle('hidden', m !== 'digital');
    const d = md.$('i-date');
    if (m === 'digital') d.value = today();
    d.disabled = m === 'digital';
    md.$('m-save').textContent = m === 'digital' ? 'Emitir factura digital' : (fiscal ? 'Facturar' : 'Emitir nota');
  };
  md.el.querySelectorAll('[data-imode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.imode)));
  if (fiscal) {
    setMode('digital');
    einvoiceInfo().then(info => {
      const el = md.$('i-provider');
      if (!el) return;
      if (info.missing && info.missing.length) { el.className = 'text-red-600'; el.textContent = 'Falta configurar Cachicamo en el Apps Script: ' + info.missing.join(', '); return; }
      el.className = info.simulated ? 'text-amber-700 font-medium' : 'text-emerald-700 font-medium';
      el.textContent = info.simulated
        ? 'Simulador de Cachicamo: los números son de prueba y la factura no tiene validez fiscal.'
        : 'Conectado a Cachicamo (imprenta digital).';
    }).catch(err => {
      const el = md.$('i-provider');
      if (el) { el.className = 'text-red-600'; el.textContent = 'No se pudo consultar la imprenta: ' + err.message; }
    });
  }
  md.$('m-save').addEventListener('click', async () => {
    const date = md.$('i-date').value;
    if (!date) return md.msg('La fecha es obligatoria.');
    if (mode === 'digital') {
      const btn = md.$('m-save');
      btn.disabled = true;
      btn.textContent = 'Emitiendo…';
      md.msg('');
      try {
        const inv = await emitEinvoice(Store.getById('sales_orders', order.id) || order);
        invoiceOrder(order, { date: inv.issueDate || today(), invoiceNumber: inv.number, controlNumber: inv.control, einvoice: inv });
        const mailTo = md.$('i-email') && md.$('i-email').checked ? contactOf(order).email : '';
        if (mailTo && !inv.emailedTo) {
          btn.textContent = 'Enviando correo…';
          try { await sendEinvoiceEmail(Store.getById('sales_orders', order.id), mailTo); } catch (e) { alert(`La factura se emitió, pero no se pudo enviar el correo: ${e.message}\nPuedes reenviarla con el botón "Enviar por correo".`); }
        }
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Emitir factura digital';
        return md.msg(err.message);
      }
      md.close();
      return onDone();
    }
    invoiceOrder(order, { date, invoiceNumber: md.$('i-number') ? md.$('i-number').value.trim() : '', controlNumber: md.$('i-control') ? md.$('i-control').value.trim() : '' });
    md.close();
    onDone();
  });
}

// ---------- Vistas ----------

function renderList(app) {
  // Con factura (IVA) / sin factura: se controlan por separado.
  const orders = Store.getAll('sales_orders')
    .filter(o => fiscalFilter === 'todas' || (fiscalFilter === 'fiscal') === isFiscal(o));
  const enriched = orders.map(o => ({ o, m: orderMoney(o), ds: dispatchStatus(o) }));
  const open = enriched.filter(x => x.o.status === 'abierta');
  const receivable = enriched.filter(x => x.o.status !== 'anulada' && x.m.balance > 0.005);
  const invoicedDue = receivable.filter(x => x.o.status === 'facturada');
  const tile = (k, v, sub, filter) => `
    <button data-filter="${filter}" class="text-left bg-white rounded-xl border p-4 shadow-sm transition ${listFilter === filter ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-200/70 hover:border-slate-300'}">
      <p class="text-xs text-slate-500">${k}</p><p class="text-xl font-semibold text-slate-900 tabular-nums mt-0.5">${v}</p><p class="text-[11px] text-slate-400 mt-0.5">${sub}</p>
    </button>`;
  const q = listQuery.trim().toLowerCase();
  const rows = enriched
    .filter(x => listFilter === 'todas' || (listFilter === 'por-cobrar' ? (x.o.status !== 'anulada' && x.m.balance > 0.005) : x.o.status === listFilter))
    .filter(x => !q || [x.o.order_number, x.o.contact_name, x.o.invoice_ref, x.o.invoice_number].some(v => String(v || '').toLowerCase().includes(q)))
    .sort((a, b) => String(b.o.date).localeCompare(String(a.o.date)) || String(b.o.order_number).localeCompare(String(a.o.order_number)));

  const body = `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Órdenes de venta</h1>
        <p class="text-xs text-slate-500">Presupuesto aprobado → orden → anticipos → despachos → factura. Lo que no se pagó por anticipado queda en cuentas por cobrar.</p>
      </div>
      <a href="#/contabilidad/presupuestos" class="${btnSecondary}">Ir a presupuestos</a>
    </div>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      ${tile('Abiertas', fmtInt(open.length), `$${fmtNum(open.reduce((s, x) => s + x.m.total, 0))} en pedidos`, 'abierta')}
      ${tile('Anticipos recibidos', '$' + fmtNum(open.reduce((s, x) => s + x.m.advances, 0)), 'de órdenes sin facturar', 'abierta')}
      ${tile('Por cobrar', '$' + fmtNum(receivable.reduce((s, x) => s + x.m.balance, 0)), `${fmtInt(receivable.length)} orden(es) · $${fmtNum(invoicedDue.reduce((s, x) => s + x.m.balance, 0))} ya facturado`, 'por-cobrar')}
      ${tile('Todas', fmtInt(orders.length), 'histórico de órdenes', 'todas')}
    </div>
    <div class="${card} !p-0 overflow-hidden">
      <div class="p-3 border-b border-slate-100 flex flex-wrap gap-2 items-center">
        <input id="o-search" type="text" value="${esc(listQuery)}" placeholder="Buscar por número, cliente o factura" class="${input} max-w-sm">
        <div class="flex gap-0.5 p-0.5 rounded-lg bg-slate-100 text-xs">
          ${[['abierta', 'Abiertas'], ['por-cobrar', 'Por cobrar'], ['facturada', 'Facturadas'], ['todas', 'Todas']].map(([k, t]) => `<button data-filter="${k}" class="px-3 py-1.5 rounded-md ${listFilter === k ? 'bg-white text-slate-900 font-semibold shadow-sm' : 'text-slate-500'}">${t}</button>`).join('')}
        </div>
        <div class="flex gap-0.5 p-0.5 rounded-lg bg-slate-100 text-xs">
          ${[['todas', 'Con y sin factura'], ['fiscal', 'Con factura'], ['no-fiscal', 'Sin factura']].map(([k, t]) => `<button data-fiscal="${k}" class="px-3 py-1.5 rounded-md ${fiscalFilter === k ? 'bg-white text-slate-900 font-semibold shadow-sm' : 'text-slate-500'}">${t}</button>`).join('')}
        </div>
      </div>
      <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead><tr class="text-[10px] uppercase tracking-wide text-slate-400 bg-slate-50">
          <th class="text-left px-3 py-2">Orden</th><th class="text-left px-3 py-2">Cliente</th><th class="text-right px-3 py-2">Total</th>
          <th class="text-right px-3 py-2">Pagado</th><th class="text-right px-3 py-2">Saldo</th><th class="text-left px-3 py-2">Despacho</th><th class="text-left px-3 py-2">Estado</th>
        </tr></thead>
        <tbody>${rows.length === 0 ? '<tr><td colspan="7" class="px-3 py-10 text-center text-slate-400">No hay órdenes en este filtro. Convierte un presupuesto aprobado en orden de venta.</td></tr>' : rows.map(({ o, m, ds }) => `
          <tr data-open="${esc(o.id)}" class="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
            <td class="px-3 py-2.5"><div class="font-medium text-slate-900">${esc(o.order_number)}${isFiscal(o) ? '' : ' <span class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-600 bg-slate-100">Sin factura</span>'}${bsChip(o)}</div><div class="text-[11px] text-slate-400">${fmtDate(o.date)}${o.invoice_ref ? ' · ' + esc(o.invoice_ref) : ''}</div></td>
            <td class="px-3 py-2.5 text-slate-700">${esc(o.contact_name) || '<span class="text-slate-400">Sin cliente</span>'}</td>
            <td class="px-3 py-2.5 text-right tabular-nums">$${fmtNum(m.total)}</td>
            <td class="px-3 py-2.5 text-right tabular-nums text-slate-500">$${fmtNum(m.paid)}</td>
            <td class="px-3 py-2.5 text-right tabular-nums font-medium ${m.balance > 0.005 ? 'text-slate-900' : 'text-emerald-600'}">$${fmtNum(Math.max(0, m.balance))}</td>
            <td class="px-3 py-2.5"><div class="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div class="h-full bg-blue-500" style="width:${ds.total ? Math.round(ds.dispatched / ds.total * 100) : 0}%"></div></div><div class="text-[10px] text-slate-400 mt-0.5">${fmtInt(ds.dispatched)} de ${fmtInt(ds.total)} unid.</div></td>
            <td class="px-3 py-2.5">${badge(o.status)}</td>
          </tr>`).join('')}</tbody>
      </table>
      </div>
    </div>`;
  app.innerHTML = AccountingShell.wrap(AccountingTabs.render('orders'), body);
  app.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => { listFilter = b.dataset.filter; renderList(app); }));
  app.querySelectorAll('[data-fiscal]').forEach(b => b.addEventListener('click', () => { fiscalFilter = b.dataset.fiscal; renderList(app); }));
  app.querySelectorAll('[data-open]').forEach(r => r.addEventListener('click', () => { location.hash = `#/contabilidad/ordenes/${r.dataset.open}`; }));
  const search = document.getElementById('o-search');
  search.addEventListener('input', () => { listQuery = search.value; const pos = search.selectionStart; renderList(app); const s2 = document.getElementById('o-search'); s2.focus(); s2.setSelectionRange(pos, pos); });
}

function renderDetail(app, id) {
  const order = Store.getById('sales_orders', id);
  if (!order) {
    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('orders'), `<div class="${card}"><p class="text-sm text-slate-500">No se encontró la orden. <a class="text-blue-600" href="#/contabilidad/ordenes">Volver a órdenes</a></p></div>`);
    return;
  }
  const refresh = (ev) => { lastEvent = ev ? { ...ev, orderId: id } : null; renderDetail(app, id); };
  const event = lastEvent && lastEvent.orderId === id ? lastEvent : null;
  lastEvent = null;
  const m = orderMoney(order);
  const ds = dispatchStatus(order);
  const items = orderItems(order);
  const pays = orderPayments(order.id);
  const disp = orderDispatches(order.id);
  const fiscal = isFiscal(order);
  const open = order.status === 'abierta';
  const fs = Store.getFiscalSettings();
  const dRows = dispatchRows(order);
  const row = (k, v, cls = '') => `<div class="flex justify-between ${cls}"><span class="text-slate-500">${k}</span><span class="tabular-nums">${v}</span></div>`;

  const body = `
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex items-start gap-3">
        <a href="#/contabilidad/ordenes" class="mt-1 w-8 h-8 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-500">←</a>
        <div>
          <div class="flex items-center gap-2"><h1 class="text-xl font-semibold text-slate-900">${esc(order.order_number)}</h1>${badge(order.status)}${bsChip(order, m.total)}</div>
          ${order.payment_currency === 'bs' ? `<p class="text-[11px] text-slate-500">Pago en bolívares: precios en $ a tasa BCV ${fmtRate(order.fx_bcv)}, ajustados por tasa USDT ${fmtRate(order.fx_usdt)} (×${Number(order.fx_factor || 0).toFixed(4)}).</p>` : ''}
          <p class="text-sm text-slate-600">${esc(order.contact_name) || 'Sin cliente'} · ${fmtDate(order.date)}${order.invoice_ref ? ` · Factura <span class="font-mono">${esc(order.invoice_ref)}</span>${order.invoice_number ? ' (N.º ' + esc(order.invoice_number) + (order.control_number ? ' · Control ' + esc(order.control_number) : '') + ')' : ''}` : ''}${order.einvoice_uuid ? (order.einvoice_provider === 'simulador' ? ' <span class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-amber-800 bg-amber-100">Factura digital simulada</span>' : ' <span class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-emerald-700 bg-emerald-50">Factura digital</span>') : ''}${order.einvoice_pdf_url ? ` · <a href="${esc(order.einvoice_pdf_url)}" target="_blank" rel="noopener" class="text-blue-600 hover:underline">PDF</a>` : ''}</p>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <button id="a-print" class="${btnSecondary}">Imprimir</button>
        ${order.status !== 'anulada' ? `<button id="a-pay" class="${btnSecondary}">${open ? 'Registrar anticipo' : 'Registrar cobro'}</button>` : ''}
        ${order.status !== 'anulada' && !ds.complete ? `<button id="a-dispatch" class="${btnSecondary}">Registrar despacho</button>` : ''}
        ${order.einvoice_uuid ? `<button id="a-mail" class="${btnSecondary}">Enviar por correo</button><button id="a-wa" class="${btnSecondary}">WhatsApp</button>` : ''}
        ${open ? `<button id="a-invoice" class="${btnPrimary}">${fiscal ? 'Facturar' : 'Emitir nota de entrega'}</button>` : ''}
      </div>
    </div>

    ${event ? `
    <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
      <span>${event.kind === 'despacho' ? `Despacho <strong>${esc((Store.getById('dispatches', event.id) || {}).dispatch_number || '')}</strong> registrado.` : 'Pago registrado.'} El estado de la orden ya está actualizado.</span>
      <button id="ev-print" class="${btnSecondary} !py-1.5">${event.kind === 'despacho' ? 'Imprimir orden de despacho' : 'Imprimir estado de la orden'}</button>
    </div>` : ''}

    <!-- Estado de la orden: cobro (total − anticipos = falta por cobrar) y
         despacho (pedido − despachado = pendiente) por producto. -->
    <div class="${card} !p-0 overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-slate-900">Estado de la orden</h2>
        <button id="a-status" class="text-xs text-slate-500 hover:text-blue-600">Imprimir estado</button>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
        <div class="lg:col-span-2 p-4 text-sm space-y-1.5">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Cobro</p>
          ${taxSummaryRows(m, { ...fs, ivaEnabled: fiscal }).map(([k, v]) => row(k, '$' + fmtNum(v), 'text-xs')).join('')}
          ${row('Total de la orden', '$' + fmtNum(m.total), 'font-semibold text-slate-900')}
          ${row('Menos: anticipos', '−$' + fmtNum(m.advances))}
          ${m.collections > 0 ? row('Menos: cobros', '−$' + fmtNum(m.collections)) : ''}
          ${m.withheld > 0 ? row(`Menos: retención IVA ${m.retPct}%`, '−$' + fmtNum(m.withheld)) : ''}
          ${row(m.balance < -0.005 ? 'Saldo a favor del cliente' : 'Falta por cobrar', '$' + fmtNum(Math.abs(m.balance)), 'text-base font-semibold border-t border-slate-200 pt-1.5 ' + (m.balance > 0.005 ? 'text-slate-900' : 'text-emerald-600'))}
          <div class="pt-1.5">
            <div class="w-full h-2 rounded-full bg-slate-100 overflow-hidden"><div class="h-full bg-emerald-500" style="width:${m.total > 0 ? Math.min(100, Math.round(m.paid / m.total * 100)) : 0}%"></div></div>
            <p class="text-[11px] text-slate-400 mt-1">${m.total > 0 ? Math.min(100, Math.round(m.paid / m.total * 100)) : 0}% cobrado</p>
          </div>
        </div>
        <div class="lg:col-span-3 p-4">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Despacho</p>
          <table class="w-full text-sm">
            <thead><tr class="text-[10px] uppercase tracking-wide text-slate-400"><th class="text-left py-1">Producto</th><th class="text-right py-1">Pedido</th><th class="text-right py-1">Despachado</th><th class="text-right py-1">Pendiente</th></tr></thead>
            <tbody>${dRows.map(r => `
              <tr class="border-t border-slate-100">
                <td class="py-1.5 pr-2"><div class="text-slate-800 truncate max-w-[16rem]" title="${esc(r.name)}">${esc(r.name)}</div><div class="text-[10px] font-mono text-slate-400">${esc(r.sku)}</div></td>
                <td class="py-1.5 text-right tabular-nums">${fmtInt(r.qty)}</td>
                <td class="py-1.5 text-right tabular-nums text-slate-500">${r.done ? '−' + fmtInt(r.done) : '0'}</td>
                <td class="py-1.5 text-right tabular-nums font-medium ${r.pending ? 'text-slate-900' : 'text-emerald-600'}">${r.pending ? fmtInt(r.pending) : '✓'}</td>
              </tr>`).join('')}
              <tr class="border-t-2 border-slate-200 font-semibold">
                <td class="py-1.5">Pendiente por despachar</td>
                <td class="py-1.5 text-right tabular-nums">${fmtInt(ds.total)}</td>
                <td class="py-1.5 text-right tabular-nums text-slate-500">${ds.dispatched ? '−' + fmtInt(ds.dispatched) : '0'}</td>
                <td class="py-1.5 text-right tabular-nums ${ds.pending ? 'text-slate-900' : 'text-emerald-600'}">${fmtInt(ds.pending)} unid.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div class="${order.notes ? 'xl:col-span-2' : 'xl:col-span-3'} space-y-4">
        <div class="${card} !p-0 overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 class="text-sm font-semibold text-slate-900">Productos y precios</h2>
            ${open ? `<label class="flex items-center gap-2 text-xs text-slate-600"><input id="a-fiscal" type="checkbox" class="w-4 h-4 accent-blue-600" ${fiscal ? 'checked' : ''}> Con factura (IVA)</label>` : `<span class="text-xs text-slate-500">${fiscal ? 'Con factura' : 'Sin factura'}</span>`}
          </div>
          <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="text-[10px] uppercase tracking-wide text-slate-400 bg-slate-50">
              <th class="text-left px-4 py-2">Producto</th><th class="text-right px-2 py-2">Cant.</th><th class="text-right px-2 py-2">Despachado</th>
              <th class="text-right px-2 py-2">Lista</th><th class="text-right px-2 py-2">Desc.</th><th class="text-right px-2 py-2">Neto</th><th class="text-right px-4 py-2">Importe</th>
            </tr></thead>
            <tbody>${items.map(it => `
              <tr class="border-t border-slate-100">
                <td class="px-4 py-2"><div class="text-slate-800">${esc(it.name)}</div><div class="text-[10px] font-mono text-slate-400">${esc(it.sku)}</div></td>
                <td class="px-2 py-2 text-right tabular-nums">${fmtInt(it.qty)}</td>
                <td class="px-2 py-2 text-right tabular-nums ${Number(it.dispatched) >= Number(it.qty) ? 'text-emerald-600' : 'text-slate-500'}">${fmtInt(it.dispatched || 0)}</td>
                <td class="px-2 py-2 text-right tabular-nums text-slate-500">$${fmtNum(it.listPrice)}</td>
                <td class="px-2 py-2 text-right tabular-nums text-slate-500">${Number(it.discountPct) > 0 ? fmtNum(it.discountPct).replace(/\.00$/, '') + '%' : '—'}</td>
                <td class="px-2 py-2 text-right tabular-nums">$${fmtNum(it.unitPrice)}</td>
                <td class="px-4 py-2 text-right tabular-nums font-medium">$${fmtNum(it.qty * it.unitPrice)}</td>
              </tr>`).join('')}</tbody>
          </table>
          </div>
        </div>

        <div class="${card}">
          <h2 class="text-sm font-semibold text-slate-900 mb-2">Pagos</h2>
          ${pays.length === 0 ? '<p class="text-sm text-slate-400">Aún no hay anticipos ni cobros.</p>' : `
          <div class="divide-y divide-slate-100">${pays.map(p => `
            <div class="flex items-center gap-3 py-2.5">
              ${p.foto_url
                ? `<a href="${esc(p.foto_url)}" target="_blank" rel="noopener" title="Ver comprobante"><img src="${esc(p.foto_url)}" class="w-11 h-11 rounded-lg object-cover border border-slate-200" alt=""></a>`
                : `<button data-proof="${esc(p.id)}" title="Subir comprobante" class="w-11 h-11 rounded-lg border border-dashed border-amber-300 bg-amber-50 text-amber-600 flex items-center justify-center">${icon('download', 'w-4 h-4')}</button>`}
              <div class="flex-1 min-w-0">
                <p class="text-sm text-slate-800">${p.kind === 'anticipo' ? 'Anticipo' : 'Cobro'} · ${esc((PAY_METHODS.find(x => x.key === p.method) || {}).label || p.method)}${p.reference ? ' · ' + esc(p.reference) : ''}</p>
                <p class="text-[11px] text-slate-400">${fmtDate(p.date)} · ${esc(p.ref_doc)}${p.foto_url ? '' : ' · <span class="text-amber-600">sin comprobante</span>'}</p>
              </div>
              <span class="tabular-nums font-medium text-slate-900">$${fmtNum(p.amount)}</span>
            </div>`).join('')}</div>`}
          <input id="proof-input" type="file" accept="image/*" class="hidden">
        </div>

        <div class="${card}">
          <h2 class="text-sm font-semibold text-slate-900 mb-2">Despachos</h2>
          ${disp.length === 0 ? '<p class="text-sm text-slate-400">Aún no se ha despachado nada.</p>' : `
          <div class="divide-y divide-slate-100">${disp.map(d => `
            <div class="py-2.5">
              <div class="flex justify-between items-center text-sm"><span class="text-slate-800">${esc(d.dispatch_number)} <span class="text-slate-400 text-xs ml-1">${fmtDate(d.date)}</span></span><button data-dprint="${esc(d.id)}" class="text-xs text-slate-500 hover:text-blue-600">Orden de despacho</button></div>
              <p class="text-xs text-slate-500">${dispatchItems(d).map(x => `${fmtInt(x.qty)} × ${esc(x.name)}`).join(' · ')}${d.notes ? ' — ' + esc(d.notes) : ''}</p>
            </div>`).join('')}</div>`}
        </div>
      </div>

      <div class="space-y-4 ${order.notes ? '' : 'hidden'}">
        ${order.notes ? `<div class="${card} text-sm"><h2 class="text-sm font-semibold text-slate-900 mb-1">Notas</h2><p class="text-slate-600">${esc(order.notes)}</p></div>` : ''}
      </div>
    </div>`;
  app.innerHTML = AccountingShell.wrap(AccountingTabs.render('orders'), body);

  const on = (idEl, fn) => { const el = document.getElementById(idEl); if (el) el.addEventListener('click', fn); };
  on('a-print', () => printOrder(Store.getById('sales_orders', id)));
  on('a-status', () => printOrderStatus(Store.getById('sales_orders', id)));
  on('ev-print', () => {
    const o = Store.getById('sales_orders', id);
    if (event.kind === 'despacho') printDispatchOrder(o, Store.getById('dispatches', event.id));
    else printOrderStatus(o);
  });
  app.querySelectorAll('[data-dprint]').forEach(b => b.addEventListener('click', () => printDispatchOrder(Store.getById('sales_orders', id), Store.getById('dispatches', b.dataset.dprint))));
  on('a-pay', () => paymentModal(Store.getById('sales_orders', id), refresh));
  on('a-dispatch', () => dispatchModal(Store.getById('sales_orders', id), refresh));
  // Desde Existencias → "Despacho": se abre directo el formulario de despacho.
  if (sessionStorage.getItem('cif_open_dispatch') === id) {
    sessionStorage.removeItem('cif_open_dispatch');
    if (document.getElementById('a-dispatch')) dispatchModal(Store.getById('sales_orders', id), refresh);
  }
  on('a-invoice', () => invoiceModal(Store.getById('sales_orders', id), refresh));
  on('a-mail', async () => {
    const o = Store.getById('sales_orders', id);
    const to = prompt('Enviar la factura por correo a:', contactOf(o).email || '');
    if (!to) return;
    try { await sendEinvoiceEmail(o, to.trim()); alert(`Factura enviada a ${to.trim()}.`); } catch (e) { alert('No se pudo enviar: ' + e.message); }
  });
  on('a-wa', async () => {
    const o = Store.getById('sales_orders', id);
    const phone = contactOf(o).phone || prompt('Número de WhatsApp del cliente (ej. 0414-1234567):', '');
    if (!phone) return;
    const w = window.open('', '_blank'); // se abre ya para que el navegador no lo bloquee
    try {
      const url = await einvoicePdfLink(o);
      const link = waLink(phone, whatsappText(o, url));
      if (w) w.location.href = link; else location.href = link;
    } catch (e) {
      if (w) w.close();
      alert('No se pudo preparar el WhatsApp: ' + e.message);
    }
  });
  const fiscalBox = document.getElementById('a-fiscal');
  if (fiscalBox) fiscalBox.addEventListener('change', () => { Store.update('sales_orders', { id, fiscal: fiscalBox.checked }); refresh(); });
  // Subir comprobante que faltó.
  let proofFor = null;
  const proofInput = document.getElementById('proof-input');
  app.querySelectorAll('[data-proof]').forEach(b => b.addEventListener('click', () => { proofFor = b.dataset.proof; proofInput.click(); }));
  proofInput.addEventListener('change', async () => {
    const f = proofInput.files[0];
    const pay = proofFor && Store.getById('order_payments', proofFor);
    if (!f || !pay) return;
    try { await attachProof(pay, f); } catch (e) { alert(`No se pudo subir el comprobante: ${e.message}`); }
    refresh();
  });
}

const Orders = {
  async render(app, params) {
    const id = params && params[0];
    if (id) renderDetail(app, id); else renderList(app);
  }
};

export default Orders;
