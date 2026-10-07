import Store from '../store.js';
import { fmtNum, esc, num } from '../utils.js';
import { buildIncomeLines, withRoundingPlug } from '../accounting.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { btnPrimary, card, input, label } from '../components/accounting-shell.js';

const Income = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    let accounts = Store.getAll('accounts').filter(a => a.is_active !== false);
    let includeInventory = false;

    const byTipo = (tipo) => accounts.filter(a => a.tipo === tipo).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    const byTipoEspecifico = (te) => accounts.filter(a => a.tipo_especifico === te).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    const accountOptions = (list) => list.map(a => `<option value="${a.id}">${esc(a.codigo)} — ${esc(a.nombre)}</option>`).join('');
    const diffAccount = () => accounts.find(a => a.codigo === '6.9.01.01');

    const recentIncome = () => Store.getAll('movements')
      .filter(m => m.source === 'income')
      .sort((a, b) => new Date(b.entry_date || 0) - new Date(a.entry_date || 0))
      .slice(0, 30);

    const renderList = () => {
      const tbody = document.getElementById('income-tbody');
      const list = recentIncome();
      tbody.innerHTML = list.length === 0
        ? `<tr><td colspan="4" class="py-4 text-center text-slate-500">Sin ingresos registrados todavía.</td></tr>`
        : list.map(m => `
          <tr class="border-t border-slate-700/30 hover:bg-slate-800/30">
            <td class="py-1.5">${esc(m.entry_date)}</td>
            <td class="py-1.5">${esc(m.ref_doc)} — ${esc(m.concepto)}</td>
            <td class="py-1.5 text-right font-mono">${m.debit > 0 ? '$' + fmtNum(m.debit) : ''}</td>
            <td class="py-1.5 text-slate-400">${esc(m.entidad)}</td>
          </tr>
        `).join('');
    };

    const renderProductOptions = () => {
      const sel = document.getElementById('f-product');
      const products = Store.getAll('products').filter(p => Number(p.stock) > 0);
      sel.innerHTML = products.length
        ? `<option value="">— Producto —</option>` + products.map(p => `<option value="${p.id}">${esc(p.sku_briggs)} — ${esc(p.name)} (stock: ${fmtNum(p.stock)})</option>`).join('')
        : `<option value="">— Sin productos con stock —</option>`;
    };

    const toggleInventory = () => {
      includeInventory = document.getElementById('f-inventory-toggle').checked;
      document.getElementById('inventory-fields').classList.toggle('hidden', !includeInventory);
      if (includeInventory) renderProductOptions();
    };

    const saveIncome = () => {
      const date = document.getElementById('f-date').value;
      const revenueId = document.getElementById('f-revenue').value;
      const paymentId = document.getElementById('f-payment').value;
      const entidad = document.getElementById('f-entidad').value.trim();
      const concepto = document.getElementById('f-concepto').value.trim();
      const total = num(document.getElementById('f-total'));
      const msgEl = document.getElementById('income-msg');
      msgEl.textContent = '';

      if (!date) { msgEl.textContent = 'La fecha es obligatoria.'; return; }
      if (!revenueId) { msgEl.textContent = 'Selecciona la cuenta de ingreso.'; return; }
      if (!paymentId) { msgEl.textContent = 'Selecciona la cuenta de pago (Efectivo/Banco/Clientes).'; return; }
      if (total <= 0) { msgEl.textContent = 'El monto debe ser mayor a 0.'; return; }
      if (!concepto) { msgEl.textContent = 'El concepto es obligatorio.'; return; }

      const refDoc = `ING-${Date.now().toString().slice(-6)}`;
      const data = {
        date, total, concepto, entidad, refDoc,
        paymentAccount: accounts.find(a => a.id === paymentId),
        revenueAccount: accounts.find(a => a.id === revenueId)
      };

      let product = null;
      if (includeInventory) {
        const productId = document.getElementById('f-product').value;
        const qty = num(document.getElementById('f-qty'));
        product = Store.getById('products', productId);
        if (!product) { msgEl.textContent = 'Selecciona el producto vendido.'; return; }
        if (qty <= 0 || qty > Number(product.stock)) { msgEl.textContent = `Cantidad inválida (stock disponible: ${fmtNum(product.stock)}).`; return; }
        const costAccount = accounts.find(a => a.tipo === 'Costo');
        const inventoryAccount = accounts.find(a => a.tipo_especifico === 'Inventario');
        if (!costAccount || !inventoryAccount) { msgEl.textContent = 'Crea una cuenta de tipo Costo y una de Inventario en el Plan de Cuentas antes de vender inventario.'; return; }
        data.inventory = { qty, unitCost: Number(product.avg_cost) || 0, costAccount, inventoryAccount };
      }

      const lines = withRoundingPlug(buildIncomeLines(data), diffAccount(), date, refDoc);
      Store.postJournalRows(lines, { source: 'income' });

      if (product) {
        const qty = data.inventory.qty;
        Store.update('products', { id: product.id, stock: Number(product.stock) - qty });
      }

      document.getElementById('f-total').value = '';
      document.getElementById('f-concepto').value = '';
      document.getElementById('f-entidad').value = '';
      renderList();
    };

    const body = `
      <div class="${card} space-y-3">
        <h2 class="text-sm font-black uppercase tracking-wide text-slate-300">Registrar Ingreso</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label class="${label}">Fecha *</label>
            <input id="f-date" type="date" value="${new Date().toISOString().slice(0, 10)}" class="${input}">
          </div>
          <div>
            <label class="${label}">Cuenta de Ingreso *</label>
            <select id="f-revenue" class="${input}">${accountOptions(byTipo('Ingreso'))}</select>
          </div>
          <div>
            <label class="${label}">Monto Total *</label>
            <input id="f-total" type="number" min="0" step="0.01" class="${input}">
          </div>
          <div>
            <label class="${label}">Forma de Pago *</label>
            <select id="f-payment" class="${input}">
              <option value="">— Cuenta —</option>
              <optgroup label="Efectivo">${accountOptions(byTipoEspecifico('Efectivo'))}</optgroup>
              <optgroup label="Banco">${accountOptions(byTipoEspecifico('Banco'))}</optgroup>
              <optgroup label="Crédito (CxC)">${accountOptions(byTipoEspecifico('Clientes'))}</optgroup>
            </select>
          </div>
          <div>
            <label class="${label}">Cliente / Contraparte</label>
            <input id="f-entidad" type="text" class="${input}">
          </div>
          <div class="sm:col-span-2 lg:col-span-2">
            <label class="${label}">Concepto *</label>
            <input id="f-concepto" type="text" class="${input}">
          </div>
        </div>
        <label class="flex items-center gap-2 text-xs text-slate-400">
          <input id="f-inventory-toggle" type="checkbox" class="accent-blue-600 w-4 h-4"> ¿Es venta de un producto del inventario?
        </label>
        <div id="inventory-fields" class="hidden grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-700/30">
          <div>
            <label class="${label}">Producto</label>
            <select id="f-product" class="${input}"></select>
          </div>
          <div>
            <label class="${label}">Cantidad</label>
            <input id="f-qty" type="number" min="0" step="1" class="${input}">
          </div>
        </div>
        <div id="income-msg" class="text-xs text-rose-400"></div>
        <button id="btn-save-income" class="${btnPrimary}">Registrar Ingreso</button>
      </div>

      <div class="${card}">
        <h2 class="text-sm font-black uppercase tracking-wide text-slate-300 mb-3">Ingresos Registrados</h2>
        <table class="w-full text-left text-xs">
          <thead><tr class="text-[9px] font-black text-slate-500 uppercase tracking-wider"><th class="py-1.5">Fecha</th><th class="py-1.5">Referencia</th><th class="py-1.5 text-right">Monto</th><th class="py-1.5">Cliente</th></tr></thead>
          <tbody id="income-tbody"></tbody>
        </table>
      </div>
    `;

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('income'), body);

    document.getElementById('f-inventory-toggle').addEventListener('change', toggleInventory);
    document.getElementById('btn-save-income').addEventListener('click', saveIncome);

    renderList();

    return () => destroy.abort();
  }
};

export default Income;
