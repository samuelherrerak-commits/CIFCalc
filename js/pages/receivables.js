import Store from '../store.js';
import { fmtNum, esc, num } from '../utils.js';
import { buildTwoLineEntry, withRoundingPlug } from '../accounting.js';
import { orderMoney } from '../orders.js';
import { paymentModal } from './orders.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { btnPrimary, card, input, label } from '../components/accounting-shell.js';

// Cuentas por cobrar según las ÓRDENES DE VENTA: lo que realmente debe cada
// cliente = total de sus órdenes − anticipos − cobros − retención de IVA,
// estén facturadas o no, con o sin factura. El pago se registra en la orden
// (anticipo si aún no se factura, cobro si ya se facturó).
// Aparte, saldos viejos de Cuentas por Cobrar en el diario que no vienen de
// ninguna orden (ventas anteriores al módulo de órdenes).
const isFiscal = (o) => o.fiscal === true || String(o.fiscal) === 'true';
const fmtDate = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
let fiscalFilter = 'todas';
let openClient = null;

const Receivables = {
  async render(app) {
    const accounts = Store.getAll('accounts').filter(a => a.is_active !== false);
    const byTipoEspecifico = (te) => accounts.filter(a => a.tipo_especifico === te).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    const accountOptions = (list) => list.map(a => `<option value="${a.id}">${esc(a.codigo)} — ${esc(a.nombre)}</option>`).join('');
    const receivableAccount = () => accounts.find(a => a.tipo_especifico === 'Clientes');

    const draw = () => {
      const all = Store.getAll('sales_orders').filter(o => o.status !== 'anulada').map(o => ({ o, m: orderMoney(o) }))
        .filter(x => x.m.balance > 0.005);
      const list = all.filter(x => fiscalFilter === 'todas' || (fiscalFilter === 'fiscal') === isFiscal(x.o));
      const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0);
      const invoiced = list.filter(x => x.o.status === 'facturada');
      const notInvoiced = list.filter(x => x.o.status !== 'facturada');

      // Agrupado por cliente.
      const groups = new Map();
      for (const x of list) {
        const k = x.o.contact_id || 'name:' + (x.o.contact_name || 'Sin cliente');
        const g = groups.get(k) || { key: k, name: x.o.contact_name || 'Sin cliente', contactId: x.o.contact_id, rows: [], balance: 0 };
        g.rows.push(x); g.balance += x.m.balance;
        groups.set(k, g);
      }
      const clients = [...groups.values()].sort((a, b) => b.balance - a.balance);

      // Saldos del diario sin orden (ventas viejas): CxC por entidad menos lo facturado en órdenes.
      const cxc = receivableAccount();
      const journal = new Map();
      if (cxc) for (const mv of Store.getAll('movements').filter(x => x.codigo_cuenta === cxc.codigo)) {
        const k = String(mv.entidad || 'Sin especificar').trim();
        journal.set(k, (journal.get(k) || 0) + (Number(mv.debit) || 0) - (Number(mv.credit) || 0));
      }
      for (const x of all.filter(y => y.o.status === 'facturada')) {
        const k = String(x.o.contact_name || '').trim();
        if (journal.has(k)) journal.set(k, journal.get(k) - x.m.balance);
      }
      const legacy = [...journal.entries()].map(([name, b]) => ({ name, balance: Math.round(b * 100) / 100 })).filter(r => r.balance > 0.01);

      const tile = (l, v, sub) => `<div class="rounded-lg border border-slate-200 bg-white px-4 py-3"><div class="text-xs text-slate-500">${l}</div><div class="text-xl font-semibold text-slate-900 tabular-nums">$${fmtNum(v)}</div><div class="text-[11px] text-slate-400">${sub}</div></div>`;
      const body = `
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 class="text-xl font-semibold text-slate-900">Cuentas por cobrar</h1>
            <p class="text-xs text-slate-400">Lo que debe cada cliente según sus órdenes de venta: total − anticipos − cobros − retención de IVA.</p>
          </div>
          <div class="flex gap-0.5 p-0.5 rounded-lg bg-slate-100 text-xs">
            ${[['todas', 'Con y sin factura'], ['fiscal', 'Con factura'], ['no-fiscal', 'Sin factura']].map(([k, t]) => `<button data-fiscal="${k}" class="px-3 py-1.5 rounded-md ${fiscalFilter === k ? 'bg-white text-slate-900 font-semibold shadow-sm' : 'text-slate-500'}">${t}</button>`).join('')}
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          ${tile('Total por cobrar', sum(list, x => x.m.balance), `${list.length} orden(es) de ${clients.length} cliente(s)`)}
          ${tile('Ya facturado', sum(invoiced, x => x.m.balance), 'en Cuentas por Cobrar (contable)')}
          ${tile('Por facturar', sum(notInvoiced, x => x.m.balance), 'órdenes abiertas, descontando anticipos')}
        </div>
        <div class="${card} !p-0 overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="text-[10px] uppercase tracking-wide text-slate-400 bg-slate-50">
              <th class="text-left px-3 py-2">Cliente / orden</th><th class="text-left px-3 py-2">Estado</th><th class="text-right px-3 py-2">Total</th>
              <th class="text-right px-3 py-2">Pagado</th><th class="text-right px-3 py-2">Retención</th><th class="text-right px-3 py-2">Saldo</th><th class="px-3 py-2"></th>
            </tr></thead>
            <tbody>${clients.length === 0 ? '<tr><td colspan="7" class="px-3 py-10 text-center text-slate-400">Ningún cliente tiene saldo pendiente.</td></tr>' : clients.map(g => `
              <tr data-client="${esc(g.key)}" class="border-t border-slate-200 bg-slate-50/60 cursor-pointer hover:bg-slate-100/60">
                <td class="px-3 py-2 font-medium text-slate-900" colspan="5">${esc(g.name)} <span class="text-xs font-normal text-slate-400">· ${g.rows.length} orden(es)</span></td>
                <td class="px-3 py-2 text-right tabular-nums font-semibold">$${fmtNum(g.balance)}</td>
                <td class="px-3 py-2 text-right text-xs text-slate-400">${openClient === g.key ? 'Ocultar' : 'Ver órdenes'}</td>
              </tr>
              ${openClient === g.key ? g.rows.sort((a, b) => String(a.o.date).localeCompare(String(b.o.date))).map(({ o, m }) => `
              <tr class="border-t border-slate-100">
                <td class="px-3 py-2 pl-6"><a href="#/contabilidad/ordenes/${esc(o.id)}" class="text-slate-800 hover:text-blue-600">${esc(o.order_number)}</a>${isFiscal(o) ? '' : ' <span class="ml-1 px-1.5 py-0.5 rounded text-[10px] text-slate-600 bg-slate-100">Sin factura</span>'}<div class="text-[11px] text-slate-400">${fmtDate(o.date)}${o.invoice_ref ? ' · ' + esc(o.invoice_ref) : ''}</div></td>
                <td class="px-3 py-2 text-xs text-slate-500">${o.status === 'facturada' ? 'Facturada' : 'Por facturar'}</td>
                <td class="px-3 py-2 text-right tabular-nums">$${fmtNum(m.total)}</td>
                <td class="px-3 py-2 text-right tabular-nums text-slate-500">$${fmtNum(m.advances + m.collections)}</td>
                <td class="px-3 py-2 text-right tabular-nums text-slate-500">${m.withheld ? '$' + fmtNum(m.withheld) : '—'}</td>
                <td class="px-3 py-2 text-right tabular-nums font-medium">$${fmtNum(m.balance)}</td>
                <td class="px-3 py-2 text-right"><button data-pay="${esc(o.id)}" class="text-xs font-semibold text-blue-600 hover:text-blue-800 whitespace-nowrap">${o.status === 'facturada' ? 'Registrar cobro' : 'Registrar anticipo'}</button></td>
              </tr>`).join('') : ''}`).join('')}</tbody>
          </table>
        </div>
        ${legacy.length ? `
        <div class="${card} space-y-2">
          <h2 class="text-sm font-semibold text-slate-900">Saldos anteriores sin orden de venta</h2>
          <p class="text-xs text-slate-400">Cuentas por cobrar del diario que no vienen de una orden (ventas registradas antes del módulo de órdenes).</p>
          ${legacy.map(r => `
            <div class="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-2" data-legacy="${esc(r.name)}">
              <div class="flex-1 min-w-[10rem]"><div class="text-sm text-slate-800">${esc(r.name)}</div><div class="text-xs text-slate-500">Saldo $${fmtNum(r.balance)}</div></div>
              <div><label class="${label}">Fecha</label><input data-l-date type="date" value="${new Date().toISOString().slice(0, 10)}" class="${input}"></div>
              <div><label class="${label}">Monto</label><input data-l-amount type="number" min="0" step="0.01" value="${r.balance}" class="${input} w-32"></div>
              <div><label class="${label}">Cuenta</label><select data-l-account class="${input}"><optgroup label="Efectivo">${accountOptions(byTipoEspecifico('Efectivo'))}</optgroup><optgroup label="Banco">${accountOptions(byTipoEspecifico('Banco'))}</optgroup></select></div>
              <button data-l-save class="${btnPrimary}">Registrar cobro</button>
            </div>`).join('')}
        </div>` : ''}`;
      app.innerHTML = AccountingShell.wrap(AccountingTabs.render('receivables'), body);

      app.querySelectorAll('[data-fiscal]').forEach(b => b.addEventListener('click', () => { fiscalFilter = b.dataset.fiscal; draw(); }));
      app.querySelectorAll('[data-client]').forEach(r => r.addEventListener('click', () => { openClient = openClient === r.dataset.client ? null : r.dataset.client; draw(); }));
      app.querySelectorAll('[data-pay]').forEach(b => b.addEventListener('click', () => paymentModal(Store.getById('sales_orders', b.dataset.pay), () => draw())));
      app.querySelectorAll('[data-legacy]').forEach(row => row.querySelector('[data-l-save]').addEventListener('click', () => {
        const name = row.dataset.legacy;
        const r = legacy.find(x => x.name === name);
        const date = row.querySelector('[data-l-date]').value;
        const amount = num(row.querySelector('[data-l-amount]'));
        const acc = accounts.find(a => a.id === row.querySelector('[data-l-account]').value);
        if (!date || !(amount > 0) || amount > r.balance + 0.01 || !acc) { alert(`Revisa la fecha, la cuenta y el monto (máximo $${fmtNum(r.balance)}).`); return; }
        const refDoc = Store.uniqueRef('COB');
        const lines = withRoundingPlug(buildTwoLineEntry({ date, total: amount, concepto: `Cobro a ${name}`, entidad: name, refDoc, debitAccount: acc, creditAccount: receivableAccount() }),
          accounts.find(a => a.codigo === '6.9.01.01'), date, refDoc);
        Store.postJournalRows(lines, { source: 'receivable_collection' });
        draw();
      }));
    };

    draw();
    return () => {};
  }
};

export default Receivables;
