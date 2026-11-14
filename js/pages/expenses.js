import Store from '../store.js';
import { fmtNum, esc, num } from '../utils.js';
import { line, withRoundingPlug } from '../accounting.js';
import { invoiceLinesHtml, mountInvoiceLines } from '../components/invoice-lines.js';
import { contactOptions, quickAddContact } from '../components/contact-picker.js';
import { invoiceFieldsHtml, mountInvoiceFields, purchaseFiscalDoc } from '../components/invoice-fields.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { btnPrimary, card, input, label } from '../components/accounting-shell.js';

const Expenses = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    let accounts = Store.getAll('accounts').filter(a => a.is_active !== false);
    let contacts = Store.getAll('contacts');

    const byTipo = (tipo) => accounts.filter(a => a.tipo === tipo).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    const byTipoEspecifico = (te) => accounts.filter(a => a.tipo_especifico === te).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    const accountOptions = (list) => list.map(a => `<option value="${a.id}">${esc(a.codigo)} — ${esc(a.nombre)}</option>`).join('');
    const diffAccount = () => accounts.find(a => a.codigo === '6.9.01.01');
    const fs = Store.getFiscalSettings();
    let invoice = null; // bloque de factura fiscal (exento + bases imponibles + IVA)
    let lines = null; // líneas de la factura (concepto → cuenta → monto)
    const LINE_GROUPS = [{ label: 'Gastos', accounts: byTipo('Gasto') }, { label: 'Costos', accounts: byTipo('Costo') }];

    // Asiento de la factura: cada línea a su cuenta (descuento al haber), el IVA
    // a IVA crédito fiscal y el total (neto + IVA) contra el método de pago.
    const entryLines = ({ date, concepto, entidad, refDoc, payAccount, tax }) => {
      const out = lines.journalLines({ date, concepto, refDoc, entidad });
      if (tax > 0) {
        const ivaAccount = accounts.find(a => a.codigo === '1.1.03.01') || Store.ensureCatalogAccount('1.1.03.01');
        out.push(line(date, ivaAccount, tax, 0, `${concepto} | IVA crédito fiscal`, refDoc, entidad));
      }
      out.push(line(date, payAccount, 0, Math.round((lines.totals().subtotal + tax) * 100) / 100, concepto, refDoc, entidad));
      return out;
    };
    // Una fila por documento (ref_doc): neto del gasto/costo, IVA y total.
    const recentDocs = () => {
      const byRef = new Map();
      for (const m of Store.getAll('movements').filter(x => x.source === 'expense')) {
        if (!byRef.has(m.ref_doc)) byRef.set(m.ref_doc, []);
        byRef.get(m.ref_doc).push(m);
      }
      const fiscal = new Map(Store.getAll('fiscal_docs').filter(d => d.ref_doc).map(d => [d.ref_doc, d]));
      const tipoOf = new Map(accounts.map(a => [String(a.codigo), a.tipo]));
      const isNetLine = (l) => { const c = String(l.codigo_cuenta); return c.startsWith('5') || c.startsWith('6') || ['Costo', 'Gasto'].includes(tipoOf.get(c)); };
      return [...byRef.entries()].map(([ref, lines]) => {
        const iva = lines.filter(l => String(l.codigo_cuenta) === '1.1.03.01').reduce((s, l) => s + (Number(l.debit) || 0), 0);
        // Neto = lo que va a costo/gasto (debe − haber: los descuentos restan).
        const net = lines.filter(isNetLine).reduce((s, l) => s + (Number(l.debit) || 0) - (Number(l.credit) || 0), 0);
        const debits = net + iva;
        const first = lines[0];
        return { ref, date: first.entry_date, created: first.created_at, concepto: String(first.concepto || '').split('|')[0].trim(), entidad: first.entidad, net: debits - iva, iva, total: debits, invoice: (fiscal.get(ref) || {}).invoice_number };
      }).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.created || '').localeCompare(String(a.created || ''))).slice(0, 30);
    };
    const renderList = () => {
      const tbody = document.getElementById('expenses-tbody');
      const list = recentDocs();
      tbody.innerHTML = list.length === 0
        ? `<tr><td colspan="6" class="p-4 text-center text-slate-400">Sin gastos registrados todavía.</td></tr>`
        : list.map(d => `
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="p-2">${esc(d.date)}</td>
            <td class="p-2">${esc(d.ref)} — ${esc(d.concepto)}${d.invoice ? ` <span class="text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full">Fact. ${esc(d.invoice)}</span>` : ''}</td>
            <td class="p-2 text-slate-500">${esc(d.entidad)}</td>
            <td class="p-2 text-right font-mono">$${fmtNum(d.net)}</td>
            <td class="p-2 text-right font-mono text-slate-500">${d.iva ? '$' + fmtNum(d.iva) : '—'}</td>
            <td class="p-2 text-right font-mono font-semibold">$${fmtNum(d.total)}</td>
          </tr>
        `).join('');
    };

    const handleContactChange = (e) => {
      if (e.target.value === '__new__') {
        const c = quickAddContact(Store, 'proveedor');
        contacts = Store.getAll('contacts');
        e.target.innerHTML = contactOptions(contacts, 'proveedor', c ? c.id : '');
      }
    };

    const saveExpense = () => {
      const date = document.getElementById('f-date').value;
      const paymentId = document.getElementById('f-payment').value;
      const contact = contacts.find(c => c.id === document.getElementById('f-contact').value);
      const entidad = contact ? contact.name : '';
      const concepto = document.getElementById('f-concepto').value.trim();
      const inv = invoice.active() ? invoice.read() : null;
      const msgEl = document.getElementById('expense-msg');
      msgEl.textContent = '';

      if (!date) { msgEl.textContent = 'La fecha es obligatoria.'; return; }
      const linesMsg = lines.validate();
      if (linesMsg) { msgEl.textContent = linesMsg; return; }
      if (!paymentId) { msgEl.textContent = 'Selecciona la cuenta de pago (Efectivo/Banco/Proveedores).'; return; }
      const invMsg = invoice.validate();
      if (invMsg) { msgEl.textContent = invMsg; return; }
      if (!concepto) { msgEl.textContent = 'El concepto es obligatorio.'; return; }

      const refDoc = Store.uniqueRef('GST');
      const paymentAccount = accounts.find(a => a.id === paymentId);
      const jl = entryLines({ date, concepto, entidad, refDoc, payAccount: paymentAccount, tax: inv ? inv.tax : 0 });
      Store.postJournalRows(withRoundingPlug(jl, diffAccount(), date, refDoc), { source: 'expense', keepLines: true });
      if (inv) Store.insert('fiscal_docs', purchaseFiscalDoc(Store, inv, { date, contact, entidad, concepto, refDoc }));

      document.getElementById('f-concepto').value = '';
      document.getElementById('f-contact').value = '';
      lines.reset();
      invoice.reset();
      updateTotal();
      renderList();
    };

    const body = `
      <div class="${card} space-y-3">
        <h2 class="text-sm font-semibold text-slate-900">Registrar factura de gastos</h2>
        <p class="text-xs text-slate-400">Una factura puede tener varias líneas, cada una a su cuenta contable.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label class="${label}">Fecha *</label>
            <input id="f-date" type="date" value="${new Date().toISOString().slice(0, 10)}" class="${input}">
          </div>
          <div>
            <label class="${label}">Beneficiario</label>
            <select id="f-contact" class="${input}">${contactOptions(contacts, 'proveedor')}</select>
          </div>
          <div>
            <label class="${label}">Método de pago *</label>
            <select id="f-payment" class="${input}">
              <option value="">— Cuenta —</option>
              <optgroup label="Efectivo">${accountOptions(byTipoEspecifico('Efectivo'))}</optgroup>
              <optgroup label="Banco">${accountOptions(byTipoEspecifico('Banco'))}</optgroup>
              <optgroup label="Crédito (CxP)">${accountOptions(byTipoEspecifico('Proveedores'))}</optgroup>
            </select>
          </div>
          <div class="sm:col-span-2 lg:col-span-3">
            <label class="${label}">Concepto general *</label>
            <input id="f-concepto" type="text" class="${input}">
          </div>
          <div>
            <label class="${label}">Total a pagar</label>
            <input id="f-total" type="text" readonly tabindex="-1" placeholder="Suma de las líneas" class="${input} bg-slate-100 text-right font-mono font-semibold">
          </div>
        </div>
        ${invoiceLinesHtml({ label })}
        ${invoiceFieldsHtml(fs, { input, label })}
        <div id="expense-msg" class="text-xs text-red-600"></div>
        <button id="btn-save-expense" class="${btnPrimary}">Registrar factura</button>
      </div>

      <div class="${card}">
        <h2 class="text-sm font-semibold text-slate-900 mb-3">Gastos Registrados</h2>
        <table class="w-full text-left text-xs">
          <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide"><th class="p-2">Fecha</th><th class="p-2">Referencia</th><th class="p-2">Beneficiario</th><th class="p-2 text-right">Neto</th><th class="p-2 text-right">IVA</th><th class="p-2 text-right">Total</th></tr></thead>
          <tbody id="expenses-tbody"></tbody>
        </table>
      </div>
    `;

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('expenses'), body);

    document.getElementById('btn-save-expense').addEventListener('click', saveExpense);
    document.getElementById('f-contact').addEventListener('change', handleContactChange);

    // Factura por líneas: cada concepto a su cuenta; el IVA (si hay factura
    // fiscal) sale de las bases de las líneas.
    const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const updateTotal = () => {
      if (!lines) return; // aún montándose
      const t = lines.totals();
      const tax = invoice && invoice.active() ? invoice.read().tax : 0;
      document.getElementById('f-total').value = (t.subtotal || tax) ? r2(t.subtotal + tax).toFixed(2) : '';
    };
    lines = mountInvoiceLines({
      fs, groups: LINE_GROUPS, input,
      onChange: (t) => { if (invoice && invoice.active()) invoice.setBases(t); updateTotal(); }
    });
    invoice = mountInvoiceFields(fs, {
      basesFromLines: true,
      onChange: updateTotal,
      onToggle: (on) => { lines.setFiscal(on); if (on) invoice.setBases(lines.totals()); updateTotal(); }
    });

    renderList();

    return () => destroy.abort();
  }
};

export default Expenses;
