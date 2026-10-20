import Store from '../store.js';
import { fmtNum, esc, num } from '../utils.js';
import { buildExpenseLines, buildTwoLineEntry, withRoundingPlug } from '../accounting.js';
import { contactOptions, quickAddContact } from '../components/contact-picker.js';
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
    const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    // Factura con IVA: el monto es la base imponible y el IVA va a IVA
    // Acreditable (crédito fiscal), con su registro en el Libro de Compras.
    const withIva = () => !!(document.getElementById('f-has-iva') || {}).checked;
    const ivaCalc = () => {
      const base = num(document.getElementById('f-total'));
      const exempt = withIva() ? num(document.getElementById('f-exempt')) : 0;
      const tipo = (document.getElementById('f-iva-tipo') || {}).value || 'general';
      const rate = tipo === 'reducida' ? fs.rateReducida : fs.rateGeneral;
      const tax = withIva() ? r2(base * rate / 100) : 0;
      return { base, exempt, tipo, rate, tax, total: r2(base + exempt + tax) };
    };
    const renderIva = () => {
      const on = withIva();
      document.getElementById('iva-fields').classList.toggle('hidden', !on);
      document.getElementById('lbl-total').textContent = on ? 'Base imponible *' : 'Monto Total *';
      const c = ivaCalc();
      document.getElementById('iva-preview').innerHTML = on
        ? `IVA ${c.rate}%: <strong>$${fmtNum(c.tax)}</strong> · Total factura: <strong>$${fmtNum(c.total)}</strong>`
        : '';
    };

    const recentExpenses = () => Store.getAll('movements')
      .filter(m => m.source === 'expense')
      .sort((a, b) => new Date(b.entry_date || 0) - new Date(a.entry_date || 0))
      .slice(0, 30);

    const renderList = () => {
      const tbody = document.getElementById('expenses-tbody');
      const list = recentExpenses();
      tbody.innerHTML = list.length === 0
        ? `<tr><td colspan="4" class="p-4 text-center text-slate-400">Sin gastos registrados todavía.</td></tr>`
        : list.map(m => `
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="p-2">${esc(m.entry_date)}</td>
            <td class="p-2">${esc(m.ref_doc)} — ${esc(m.concepto)}</td>
            <td class="p-2 text-right font-mono">${m.debit > 0 ? '$' + fmtNum(m.debit) : ''}</td>
            <td class="p-2 text-slate-500">${esc(m.entidad)}</td>
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
      const iva = ivaCalc();
      const total = iva.base;
      const msgEl = document.getElementById('expense-msg');
      msgEl.textContent = '';

      if (!date) { msgEl.textContent = 'La fecha es obligatoria.'; return; }
      if (!expenseId) { msgEl.textContent = 'Selecciona la categoría de gasto.'; return; }
      if (!paymentId) { msgEl.textContent = 'Selecciona la cuenta de pago (Efectivo/Banco/Proveedores).'; return; }
      if (total <= 0) { msgEl.textContent = 'El monto debe ser mayor a 0.'; return; }
      if (!concepto) { msgEl.textContent = 'El concepto es obligatorio.'; return; }

      const invoiceNumber = withIva() ? document.getElementById('f-invoice').value.trim() : '';
      if (withIva() && !invoiceNumber) { msgEl.textContent = 'Indica el N.º de la factura del proveedor (va al Libro de Compras).'; return; }

      const refDoc = `GST-${Date.now().toString().slice(-6)}`;
      const paymentAccount = accounts.find(a => a.id === paymentId);
      const data = {
        date, total: r2(total + iva.exempt), concepto, entidad, refDoc,
        paymentAccount,
        expenseAccount: accounts.find(a => a.id === expenseId)
      };

      let lines = buildExpenseLines(data);
      if (iva.tax > 0) {
        const ivaAccount = accounts.find(a => a.codigo === '1.1.03.01') || Store.ensureCatalogAccount('1.1.03.01');
        lines = lines.concat(buildTwoLineEntry({ date, total: iva.tax, concepto: `${concepto} | IVA crédito fiscal`, entidad, refDoc, debitAccount: ivaAccount, creditAccount: paymentAccount }));
      }
      Store.postJournalRows(withRoundingPlug(lines, diffAccount(), date, refDoc), { source: 'expense' });
      if (withIva()) {
        Store.insert('fiscal_docs', Store.newFiscalDoc({
          book: 'compras', date, doc_type: 'factura', invoice_number: invoiceNumber,
          control_number: document.getElementById('f-control').value.trim(),
          rif: contact ? contact.rif || '' : '', name: entidad || concepto,
          total: iva.total, exempt: iva.exempt,
          base_general: iva.tipo === 'general' ? total : 0, tax_general: iva.tipo === 'general' ? iva.tax : 0,
          base_reducida: iva.tipo === 'reducida' ? total : 0, tax_reducida: iva.tipo === 'reducida' ? iva.tax : 0,
          ref_doc: refDoc, tasa_bcv: Store.usdRateFor(date), notes: concepto
        }));
        ['f-invoice', 'f-control', 'f-exempt'].forEach(id => { document.getElementById(id).value = ''; });
      }

      document.getElementById('f-total').value = '';
      document.getElementById('f-concepto').value = '';
      document.getElementById('f-contact').value = '';
      renderIva();
      renderList();
    };

    const body = `
      <div class="${card} space-y-3">
        <h2 class="text-sm font-bold text-slate-700">Registrar Gasto</h2>
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
            <label id="lbl-total" class="${label}">Monto Total *</label>
            <input id="f-total" type="number" min="0" step="0.01" class="${input}">
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
          <div>
            <label class="${label}">Beneficiario</label>
            <select id="f-contact" class="${input}">${contactOptions(contacts, 'proveedor')}</select>
          </div>
          <div class="sm:col-span-2 lg:col-span-2">
            <label class="${label}">Concepto *</label>
            <input id="f-concepto" type="text" class="${input}">
          </div>
        </div>
        ${fs.ivaEnabled ? `
        <label class="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
          <input id="f-has-iva" type="checkbox" class="w-4 h-4 accent-blue-600"> 🧾 Factura con IVA (crédito fiscal — va al Libro de Compras)
        </label>` : ''}
        <div id="iva-fields" class="hidden grid grid-cols-2 lg:grid-cols-4 gap-3 bg-blue-50 border border-blue-100 rounded-xl p-3">
          <div>
            <label class="${label}">N.º factura *</label>
            <input id="f-invoice" type="text" class="${input}">
          </div>
          <div>
            <label class="${label}">N.º de control</label>
            <input id="f-control" type="text" placeholder="00-000000" class="${input}">
          </div>
          <div>
            <label class="${label}">Alícuota</label>
            <select id="f-iva-tipo" class="${input}">
              <option value="general">General ${fs.rateGeneral}%</option>
              <option value="reducida">Reducida ${fs.rateReducida}%</option>
            </select>
          </div>
          <div>
            <label class="${label}">Monto exento</label>
            <input id="f-exempt" type="number" min="0" step="0.01" placeholder="0.00" class="${input}">
          </div>
          <div id="iva-preview" class="col-span-2 lg:col-span-4 text-xs text-blue-900"></div>
        </div>
        <div id="expense-msg" class="text-xs text-red-600"></div>
        <button id="btn-save-expense" class="${btnPrimary}">Registrar Gasto</button>
      </div>

      <div class="${card}">
        <h2 class="text-sm font-bold text-slate-700 mb-3">Gastos Registrados</h2>
        <table class="w-full text-left text-xs">
          <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide"><th class="p-2">Fecha</th><th class="p-2">Referencia</th><th class="p-2 text-right">Monto</th><th class="p-2">Beneficiario</th></tr></thead>
          <tbody id="expenses-tbody"></tbody>
        </table>
      </div>
    `;

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('expenses'), body);

    document.getElementById('btn-save-expense').addEventListener('click', saveExpense);
    document.getElementById('f-contact').addEventListener('change', handleContactChange);
    ['f-has-iva', 'f-total', 'f-exempt', 'f-iva-tipo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', renderIva);
    });

    renderList();

    return () => destroy.abort();
  }
};

export default Expenses;
