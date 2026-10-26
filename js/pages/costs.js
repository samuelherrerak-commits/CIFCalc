import Store from '../store.js';
import { fmtNum, esc, num } from '../utils.js';
import { buildCostLines, buildTwoLineEntry, withRoundingPlug } from '../accounting.js';
import { contactOptions, quickAddContact } from '../components/contact-picker.js';
import { invoiceFieldsHtml, mountInvoiceFields, purchaseFiscalDoc } from '../components/invoice-fields.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { btnPrimary, card, input, label } from '../components/accounting-shell.js';

const Costs = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    let accounts = Store.getAll('accounts').filter(a => a.is_active !== false);
    let contacts = Store.getAll('contacts');

    const byTipo = (tipo) => accounts.filter(a => a.tipo === tipo).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    const accountOptions = (list) => list.map(a => `<option value="${a.id}">${esc(a.codigo)} — ${esc(a.nombre)}</option>`).join('');
    const diffAccount = () => accounts.find(a => a.codigo === '6.9.01.01');
    const fs = Store.getFiscalSettings();
    let invoice = null;

    // Una fila por documento (ref_doc): neto del gasto/costo, IVA y total.
    const recentDocs = () => {
      const byRef = new Map();
      for (const m of Store.getAll('movements').filter(x => x.source === 'cost')) {
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
      const tbody = document.getElementById('costs-tbody');
      const list = recentDocs();
      tbody.innerHTML = list.length === 0
        ? `<tr><td colspan="6" class="p-4 text-center text-slate-400">Sin costos registrados todavía.</td></tr>`
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

    const saveCost = () => {
      const date = document.getElementById('f-date').value;
      const costId = document.getElementById('f-cost').value;
      const counterId = document.getElementById('f-counter').value;
      const contact = contacts.find(c => c.id === document.getElementById('f-contact').value);
      const entidad = contact ? contact.name : '';
      const concepto = document.getElementById('f-concepto').value.trim();
      const inv = invoice.active() ? invoice.read() : null;
      // Con factura: el costo es lo exento + la base imponible; el IVA va a IVA Acreditable.
      const total = inv ? inv.net : num(document.getElementById('f-total'));
      const msgEl = document.getElementById('cost-msg');
      msgEl.textContent = '';

      if (!date) { msgEl.textContent = 'La fecha es obligatoria.'; return; }
      if (!costId) { msgEl.textContent = 'Selecciona el subtipo de costo.'; return; }
      if (!counterId) { msgEl.textContent = 'Selecciona la cuenta contrapartida.'; return; }
      const invMsg = invoice.validate();
      if (invMsg) { msgEl.textContent = invMsg; return; }
      if (total <= 0) { msgEl.textContent = 'El monto debe ser mayor a 0.'; return; }
      if (!concepto) { msgEl.textContent = 'El concepto es obligatorio.'; return; }

      const refDoc = `COS-${Date.now().toString().slice(-6)}`;
      const data = {
        date, total, concepto, entidad, refDoc,
        costAccount: accounts.find(a => a.id === costId),
        counterAccount: accounts.find(a => a.id === counterId)
      };

      let lines = buildCostLines(data);
      if (inv && inv.tax > 0) {
        const ivaAccount = accounts.find(a => a.codigo === '1.1.03.01') || Store.ensureCatalogAccount('1.1.03.01');
        lines = lines.concat(buildTwoLineEntry({ date, total: inv.tax, concepto: `${concepto} | IVA crédito fiscal`, entidad, refDoc, debitAccount: ivaAccount, creditAccount: data.counterAccount }));
      }
      Store.postJournalRows(withRoundingPlug(lines, diffAccount(), date, refDoc), { source: 'cost' });
      if (inv) Store.insert('fiscal_docs', purchaseFiscalDoc(Store, inv, { date, contact, entidad, concepto, refDoc }));

      document.getElementById('f-total').value = '';
      document.getElementById('f-concepto').value = '';
      document.getElementById('f-contact').value = '';
      invoice.reset();
      renderList();
    };

    const body = `
      <div class="${card} space-y-3">
        <h2 class="text-sm font-semibold text-slate-900">Registrar Costo</h2>
        <p class="text-xs text-slate-400">Un costo no mueve caja ni banco de inmediato — se registra contra una cuenta contrapartida (Proveedores, Contenedores por Pagar, etc.), a diferencia de un Gasto.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label class="${label}">Fecha *</label>
            <input id="f-date" type="date" value="${new Date().toISOString().slice(0, 10)}" class="${input}">
          </div>
          <div>
            <label class="${label}">Subtipo de Costo *</label>
            <select id="f-cost" class="${input}">${accountOptions(byTipo('Costo'))}</select>
          </div>
          <div>
            <label class="${label}">Proveedor / Contraparte</label>
            <select id="f-contact" class="${input}">${contactOptions(contacts, 'proveedor')}</select>
          </div>
          <div>
            <label class="${label}">Cuenta Contrapartida *</label>
            <select id="f-counter" class="${input}">
              <option value="">— Cuenta —</option>
              ${accountOptions(accounts)}
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
        <div id="cost-msg" class="text-xs text-red-600"></div>
        <button id="btn-save-cost" class="${btnPrimary}">Registrar Costo</button>
      </div>

      <div class="${card}">
        <h2 class="text-sm font-semibold text-slate-900 mb-3">Costos Registrados</h2>
        <table class="w-full text-left text-xs">
          <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide"><th class="p-2">Fecha</th><th class="p-2">Referencia</th><th class="p-2">Contraparte</th><th class="p-2 text-right">Neto</th><th class="p-2 text-right">IVA</th><th class="p-2 text-right">Total</th></tr></thead>
          <tbody id="costs-tbody"></tbody>
        </table>
      </div>
    `;

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('costs'), body);

    document.getElementById('btn-save-cost').addEventListener('click', saveCost);
    document.getElementById('f-contact').addEventListener('change', handleContactChange);
    invoice = mountInvoiceFields(fs, { totalInput: document.getElementById('f-total'), totalLabel: document.getElementById('lbl-total') });

    renderList();

    return () => destroy.abort();
  }
};

export default Costs;
