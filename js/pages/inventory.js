import Store from '../store.js';
import { fmtNum, esc, num } from '../utils.js';
import { buildReceptionLines, withRoundingPlug } from '../accounting.js';
import { contactOptions, quickAddContact } from '../components/contact-picker.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { btnPrimary, card, input, label } from '../components/accounting-shell.js';

const Inventory = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    let accounts = Store.getAll('accounts').filter(a => a.is_active !== false);
    let contacts = Store.getAll('contacts');
    let products = Store.getAll('products');
    let subTab = 'stock';
    let query = '';

    const byTipo = (tipo) => accounts.filter(a => a.tipo === tipo).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    const byTipoEspecifico = (te) => accounts.filter(a => a.tipo_especifico === te).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    const accountOptions = (list) => list.map(a => `<option value="${a.id}">${esc(a.codigo)} — ${esc(a.nombre)}</option>`).join('');
    const diffAccount = () => accounts.find(a => a.codigo === '6.9.01.01');

    const renderStock = () => {
      const tbody = document.getElementById('stock-tbody');
      const q = query.trim().toLowerCase();
      const list = products
        .filter(p => !q || [p.sku_briggs, p.sku, p.name].some(v => String(v || '').toLowerCase().includes(q)))
        .sort((a, b) => String(a.sku_briggs).localeCompare(String(b.sku_briggs)));
      tbody.innerHTML = list.length === 0
        ? `<tr><td colspan="4" class="p-4 text-center text-slate-400">Sin productos.</td></tr>`
        : list.map(p => `
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="p-2 font-mono text-slate-700">${esc(p.sku_briggs)}</td>
            <td class="p-2 text-slate-800">${esc(p.name)}</td>
            <td class="p-2 text-right font-mono ${Number(p.stock) <= 0 ? 'text-red-600' : 'text-slate-800'}">${fmtNum(p.stock)}</td>
            <td class="p-2 text-right font-mono text-slate-500">$${fmtNum(p.avg_cost)}</td>
          </tr>
        `).join('');
    };

    const renderProductSelect = () => {
      const sel = document.getElementById('f-product');
      sel.innerHTML = `<option value="">— Producto —</option>` +
        products.map(p => `<option value="${p.id}">${esc(p.sku_briggs)} — ${esc(p.name)}</option>`).join('');
    };

    const recentReceptions = () => Store.getAll('movements')
      .filter(m => m.source === 'inventory_reception')
      .sort((a, b) => new Date(b.entry_date || 0) - new Date(a.entry_date || 0))
      .slice(0, 20);

    const renderReceptionList = () => {
      const tbody = document.getElementById('reception-tbody');
      const list = recentReceptions();
      tbody.innerHTML = list.length === 0
        ? `<tr><td colspan="4" class="p-4 text-center text-slate-400">Sin recepciones registradas todavía.</td></tr>`
        : list.map(m => `
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="p-2">${esc(m.entry_date)}</td>
            <td class="p-2">${esc(m.ref_doc)} — ${esc(m.concepto)}</td>
            <td class="p-2 text-right font-mono">${m.debit > 0 ? '$' + fmtNum(m.debit) : ''}</td>
            <td class="p-2 text-slate-500">${esc(m.entidad)}</td>
          </tr>
        `).join('');
    };

    // Recepción de mercancía: debita una cuenta de Costo (el inventario físico
    // solo es de referencia, no una cuenta de activo) y acredita la forma de pago.
    const saveReception = () => {
      const date = document.getElementById('f-date').value;
      const productId = document.getElementById('f-product').value;
      const qty = num(document.getElementById('f-qty'));
      const costTotal = num(document.getElementById('f-cost'));
      const costAccountId = document.getElementById('f-cost-account').value;
      const paymentId = document.getElementById('f-payment').value;
      const contact = contacts.find(c => c.id === document.getElementById('f-contact').value);
      const entidad = contact ? contact.name : '';
      const msgEl = document.getElementById('reception-msg');
      msgEl.textContent = '';

      if (!date) { msgEl.textContent = 'La fecha es obligatoria.'; return; }
      const product = Store.getById('products', productId);
      if (!product) { msgEl.textContent = 'Selecciona el producto recibido.'; return; }
      if (qty <= 0) { msgEl.textContent = 'La cantidad debe ser mayor a 0.'; return; }
      if (costTotal <= 0) { msgEl.textContent = 'El costo total debe ser mayor a 0.'; return; }
      if (!costAccountId) { msgEl.textContent = 'Selecciona la cuenta de costo.'; return; }
      if (!paymentId) { msgEl.textContent = 'Selecciona la forma de pago (Efectivo/Banco/Proveedores).'; return; }
      const costAccount = accounts.find(a => a.id === costAccountId);

      const refDoc = `REC-${Date.now().toString().slice(-6)}`;
      const concepto = `Recepción: ${product.name} | Cant: ${qty}`;
      const data = {
        date, total: costTotal, concepto, entidad, refDoc,
        paymentAccount: accounts.find(a => a.id === paymentId),
        costAccount,
        qty, unidad: 'unidades', codigo_barra: product.sku_briggs || ''
      };
      const lines = withRoundingPlug(buildReceptionLines(data), diffAccount(), date, refDoc);
      Store.postJournalRows(lines, { source: 'inventory_reception' });

      const prevQty = Number(product.stock) || 0;
      const prevCost = Number(product.avg_cost) || 0;
      const newQty = prevQty + qty;
      const newAvgCost = newQty > 0 ? ((prevQty * prevCost) + costTotal) / newQty : 0;
      Store.update('products', { id: product.id, stock: newQty, avg_cost: Math.round(newAvgCost * 100) / 100 });

      products = Store.getAll('products');
      document.getElementById('f-qty').value = '';
      document.getElementById('f-cost').value = '';
      document.getElementById('f-contact').value = '';
      renderStock();
      renderReceptionList();
    };

    const renderSubTabs = () => {
      const wrap = document.getElementById('inventory-subtabs');
      wrap.innerHTML = ['stock', 'recepcion'].map(t => `
        <button data-subtab="${t}" class="px-3 py-1.5 text-xs font-semibold rounded-full transition-all ${
          subTab === t ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
        }">${t === 'stock' ? 'Stock' : 'Recepción'}</button>
      `).join('');
      wrap.querySelectorAll('[data-subtab]').forEach(btn => btn.addEventListener('click', () => {
        subTab = btn.dataset.subtab;
        renderSubTabs();
        renderPanels();
      }));
    };

    const renderPanels = () => {
      document.getElementById('panel-stock').classList.toggle('hidden', subTab !== 'stock');
      document.getElementById('panel-recepcion').classList.toggle('hidden', subTab !== 'recepcion');
    };

    const body = `
      <div id="inventory-subtabs" class="flex gap-2"></div>

      <div id="panel-stock" class="space-y-4">
        <div class="${card}">
          <div class="flex justify-between items-center mb-3">
            <h2 class="text-sm font-bold text-slate-700">Existencias <span class="text-xs font-normal text-slate-400">(referencia — no son una cuenta contable)</span></h2>
            <input id="stock-search" type="text" placeholder="Buscar producto…" class="${input}" style="width:220px">
          </div>
          <table class="w-full text-left text-xs">
            <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide"><th class="p-2">SKU Briggs</th><th class="p-2">Nombre</th><th class="p-2 text-right">Existencia</th><th class="p-2 text-right">Costo Prom.</th></tr></thead>
            <tbody id="stock-tbody"></tbody>
          </table>
        </div>
      </div>

      <div id="panel-recepcion" class="hidden space-y-4">
        <div class="${card} space-y-3">
          <h2 class="text-sm font-bold text-slate-700">Registrar Recepción</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label class="${label}">Fecha *</label>
              <input id="f-date" type="date" value="${new Date().toISOString().slice(0, 10)}" class="${input}">
            </div>
            <div>
              <label class="${label}">Producto *</label>
              <select id="f-product" class="${input}"></select>
            </div>
            <div>
              <label class="${label}">Cantidad *</label>
              <input id="f-qty" type="number" min="0" step="1" class="${input}">
            </div>
            <div>
              <label class="${label}">Costo Total ($) *</label>
              <input id="f-cost" type="number" min="0" step="0.01" class="${input}">
            </div>
            <div>
              <label class="${label}">Cuenta de Costo *</label>
              <select id="f-cost-account" class="${input}">${accountOptions(byTipo('Costo'))}</select>
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
              <label class="${label}">Proveedor</label>
              <select id="f-contact" class="${input}">${contactOptions(contacts, 'proveedor')}</select>
            </div>
          </div>
          <div id="reception-msg" class="text-xs text-red-600"></div>
          <button id="btn-save-reception" class="${btnPrimary}">Confirmar Recepción</button>
        </div>

        <div class="${card}">
          <h2 class="text-sm font-bold text-slate-700 mb-3">Recepciones Registradas</h2>
          <table class="w-full text-left text-xs">
            <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide"><th class="p-2">Fecha</th><th class="p-2">Referencia</th><th class="p-2 text-right">Monto</th><th class="p-2">Proveedor</th></tr></thead>
            <tbody id="reception-tbody"></tbody>
          </table>
        </div>
      </div>
    `;

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('inventory'), body);

    document.getElementById('stock-search').addEventListener('input', (e) => { query = e.target.value; renderStock(); });
    document.getElementById('btn-save-reception').addEventListener('click', saveReception);
    document.getElementById('f-contact').addEventListener('change', (e) => {
      if (e.target.value === '__new__') {
        const c = quickAddContact(Store, 'proveedor');
        contacts = Store.getAll('contacts');
        e.target.innerHTML = contactOptions(contacts, 'proveedor', c ? c.id : '');
      }
    });

    const defaultCost = accounts.find(a => a.nombre === 'Costo FOB de Mercancía' && a.tipo === 'Costo');
    if (defaultCost) document.getElementById('f-cost-account').value = defaultCost.id;

    renderSubTabs();
    renderPanels();
    renderProductSelect();
    renderStock();
    renderReceptionList();

    return () => destroy.abort();
  }
};

export default Inventory;
