import Store from '../store.js';
import { fmtNum, esc, num } from '../utils.js';
import { buildExpenseLines, buildTwoLineEntry, withRoundingPlug } from '../accounting.js';
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
    // Una fila por documento (ref_doc): neto del gasto/costo, IVA y total.
    const recentDocs = () => {
      const byRef = new Map();
      for (const m of Store.getAll('movements').filter(x => x.source === 'expense')) {
        if (!byRef.has(m.ref_doc)) byRef.set(m.ref_doc, []);
        byRef.get(m.ref_doc).push(m);
      }
      const fiscal = new Map(Store.getAll('fiscal_docs').filter(d => d.ref_doc).map(d => [d.ref_doc, d]));
      return [...byRef.entries()].map(([ref, lines]) => {
        const iva = lines.filter(l => String(l.codigo_cuenta) === '1.1.03.01').reduce((s, l) => s + (Number(l.debit) || 0), 0);
        const debits = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
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
      const expenseId = document.getElementById('f-expense').value;
      const paymentId = document.getElementById('f-payment').value;
      const contact = contacts.find(c => c.id === document.getElementById('f-contact').value);
      const entidad = contact ? contact.name : '';
      const concepto = document.getElementById('f-concepto').value.trim();
      const inv = invoice.active() ? invoice.read() : null;
      // Con factura: el gasto es lo exento + la base imponible (sin IVA) y el
      // IVA va aparte a IVA Acreditable; sin factura, el monto escrito.
      const total = inv ? inv.net : num(document.getElementById('f-total'));
      const msgEl = document.getElementById('expense-msg');
      msgEl.textContent = '';

      if (!date) { msgEl.textContent = 'La fecha es obligatoria.'; return; }
      if (!expenseId) { msgEl.textContent = 'Selecciona la categoría de gasto.'; return; }
      if (!paymentId) { msgEl.textContent = 'Selecciona la cuenta de pago (Efectivo/Banco/Proveedores).'; return; }
      const invMsg = invoice.validate();
      if (invMsg) { msgEl.textContent = invMsg; return; }
      if (total <= 0) { msgEl.textContent = 'El monto debe ser mayor a 0.'; return; }
      if (!concepto) { msgEl.textContent = 'El concepto es obligatorio.'; return; }

      const refDoc = `GST-${Date.now().toString().slice(-6)}`;
      const paymentAccount = accounts.find(a => a.id === paymentId);
      const data = {
        date, total, concepto, entidad, refDoc,
        paymentAccount,
        expenseAccount: accounts.find(a => a.id === expenseId)
      };

      let lines = buildExpenseLines(data);
      if (inv && inv.tax > 0) {
        const ivaAccount = accounts.find(a => a.codigo === '1.1.03.01') || Store.ensureCatalogAccount('1.1.03.01');
        lines = lines.concat(buildTwoLineEntry({ date, total: inv.tax, concepto: `${concepto} | IVA crédito fiscal`, entidad, refDoc, debitAccount: ivaAccount, creditAccount: paymentAccount }));
      }
      Store.postJournalRows(withRoundingPlug(lines, diffAccount(), date, refDoc), { source: 'expense' });
      if (inv) Store.insert('fiscal_docs', purchaseFiscalDoc(Store, inv, { date, contact, entidad, concepto, refDoc }));

      document.getElementById('f-total').value = '';
      document.getElementById('f-concepto').value = '';
      document.getElementById('f-contact').value = '';
      invoice.reset();
      renderList();
    };

    const body = `
      <div class="${card} space-y-3">
        <h2 class="text-sm font-semibold text-slate-900">Registrar Gasto</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label class="${label}">Fecha *</label>
            <input id="f-date" type="date" value="${new Date().toISOString().slice(0, 10)}" class="${input}">
          </div>
          <div>
            <label class="${label}">Categoría de Gasto *</label>
            <select id="f-expense" class="${input}">${accountOptions(byTipo('Gasto'))}</select>
          </div>
          <div>
            <label class="${label}">Beneficiario</label>
            <select id="f-contact" class="${input}">${contactOptions(contacts, 'proveedor')}</select>
          </div>
          <div>
            <label class="${label}">Forma de Pago *</label>
            <select id="f-payment" class="${input}">
              <option value="">— Cuenta —</option>
              <optgroup label="Efectivo">${accountOptions(byTipoEspecifico('Efectivo'))}</optgroup>
              <optgroup label="Banco">${accountOptions(byTipoEspecifico('Banco'))}</optgroup>
              <optgroup label="Crédito (CxP)">${accountOptions(byTipoEspecifico('Proveedores'))}</optgroup>
            </select>
          </div>
          <div class="sm:col-span-2 lg:col-span-3">
            <label class="${label}">Concepto *</label>
            <input id="f-concepto" type="text" class="${input}">
          </div>
          <div>
            <label id="lbl-total" class="${label}">Monto Total *</label>
            <input id="f-total" type="number" min="0" step="0.01" class="${input}">
          </div>
        </div>
        ${invoiceFieldsHtml(fs, { input, label })}
        <div id="expense-msg" class="text-xs text-red-600"></div>
        <button id="btn-save-expense" class="${btnPrimary}">Registrar Gasto</button>
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
    invoice = mountInvoiceFields(fs, { totalInput: document.getElementById('f-total'), totalLabel: document.getElementById('lbl-total') });

    renderList();

    return () => destroy.abort();
  }
};

export default Expenses;
