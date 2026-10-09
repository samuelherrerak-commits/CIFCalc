import Store from '../store.js';
import { fmtNum, esc, num } from '../utils.js';
import { buildCostLines, withRoundingPlug } from '../accounting.js';
import { contactOptions, quickAddContact } from '../components/contact-picker.js';
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

    const recentCosts = () => Store.getAll('movements')
      .filter(m => m.source === 'cost')
      .sort((a, b) => new Date(b.entry_date || 0) - new Date(a.entry_date || 0))
      .slice(0, 30);

    const renderList = () => {
      const tbody = document.getElementById('costs-tbody');
      const list = recentCosts();
      tbody.innerHTML = list.length === 0
        ? `<tr><td colspan="4" class="p-4 text-center text-slate-400">Sin costos registrados todavía.</td></tr>`
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

    const saveCost = () => {
      const date = document.getElementById('f-date').value;
      const costId = document.getElementById('f-cost').value;
      const counterId = document.getElementById('f-counter').value;
      const contact = contacts.find(c => c.id === document.getElementById('f-contact').value);
      const entidad = contact ? contact.name : '';
      const concepto = document.getElementById('f-concepto').value.trim();
      const total = num(document.getElementById('f-total'));
      const msgEl = document.getElementById('cost-msg');
      msgEl.textContent = '';

      if (!date) { msgEl.textContent = 'La fecha es obligatoria.'; return; }
      if (!costId) { msgEl.textContent = 'Selecciona el subtipo de costo.'; return; }
      if (!counterId) { msgEl.textContent = 'Selecciona la cuenta contrapartida.'; return; }
      if (total <= 0) { msgEl.textContent = 'El monto debe ser mayor a 0.'; return; }
      if (!concepto) { msgEl.textContent = 'El concepto es obligatorio.'; return; }

      const refDoc = `COS-${Date.now().toString().slice(-6)}`;
      const data = {
        date, total, concepto, entidad, refDoc,
        costAccount: accounts.find(a => a.id === costId),
        counterAccount: accounts.find(a => a.id === counterId)
      };

      const lines = withRoundingPlug(buildCostLines(data), diffAccount(), date, refDoc);
      Store.postJournalRows(lines, { source: 'cost' });

      document.getElementById('f-total').value = '';
      document.getElementById('f-concepto').value = '';
      document.getElementById('f-contact').value = '';
      renderList();
    };

    const body = `
      <div class="${card} space-y-3">
        <h2 class="text-sm font-bold text-slate-700">Registrar Costo</h2>
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
            <label class="${label}">Monto Total *</label>
            <input id="f-total" type="number" min="0" step="0.01" class="${input}">
          </div>
          <div>
            <label class="${label}">Cuenta Contrapartida *</label>
            <select id="f-counter" class="${input}">
              <option value="">— Cuenta —</option>
              ${accountOptions(accounts)}
            </select>
          </div>
          <div>
            <label class="${label}">Proveedor / Contraparte</label>
            <select id="f-contact" class="${input}">${contactOptions(contacts, 'proveedor')}</select>
          </div>
          <div class="sm:col-span-2 lg:col-span-2">
            <label class="${label}">Concepto *</label>
            <input id="f-concepto" type="text" class="${input}">
          </div>
        </div>
        <div id="cost-msg" class="text-xs text-red-600"></div>
        <button id="btn-save-cost" class="${btnPrimary}">Registrar Costo</button>
      </div>

      <div class="${card}">
        <h2 class="text-sm font-bold text-slate-700 mb-3">Costos Registrados</h2>
        <table class="w-full text-left text-xs">
          <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide"><th class="p-2">Fecha</th><th class="p-2">Referencia</th><th class="p-2 text-right">Monto</th><th class="p-2">Contraparte</th></tr></thead>
          <tbody id="costs-tbody"></tbody>
        </table>
      </div>
    `;

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('costs'), body);

    document.getElementById('btn-save-cost').addEventListener('click', saveCost);
    document.getElementById('f-contact').addEventListener('change', handleContactChange);

    renderList();

    return () => destroy.abort();
  }
};

export default Costs;
