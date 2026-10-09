import Store from '../store.js';
import { esc } from '../utils.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { btnPrimary, card, input, label } from '../components/accounting-shell.js';

const TYPE_LABEL = { cliente: 'Cliente', proveedor: 'Proveedor', ambos: 'Cliente y Proveedor' };
const TYPE_COLOR = { cliente: 'blue', proveedor: 'amber', ambos: 'emerald' };

const Contacts = {
  async render(app) {
    const destroy = new AbortController();
    const { signal } = destroy;

    let contacts = Store.getAll('contacts');
    let query = '';
    let typeFilter = '';

    const renderList = () => {
      const tbody = document.getElementById('contacts-tbody');
      const q = query.trim().toLowerCase();
      const list = contacts
        .filter(c => !typeFilter || c.type === typeFilter)
        .filter(c => !q || [c.name, c.rif, c.email, c.phone].some(v => String(v || '').toLowerCase().includes(q)))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));

      document.getElementById('contacts-count').textContent = `${list.length} contacto${list.length === 1 ? '' : 's'}`;

      tbody.innerHTML = list.length === 0
        ? `<tr><td colspan="6" class="p-4 text-center text-slate-400">Sin contactos que coincidan.</td></tr>`
        : list.map(c => `
          <tr class="border-b border-slate-100 hover:bg-slate-50">
            <td class="p-2 font-semibold text-slate-800">${esc(c.name)}</td>
            <td class="p-2"><span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold text-${TYPE_COLOR[c.type] || 'slate'}-700 bg-${TYPE_COLOR[c.type] || 'slate'}-100">${TYPE_LABEL[c.type] || c.type}</span></td>
            <td class="p-2 font-mono text-slate-500">${esc(c.rif)}</td>
            <td class="p-2 text-slate-500">${esc(c.email)}</td>
            <td class="p-2 text-slate-500">${esc(c.phone)}</td>
            <td class="p-2 text-center"><button data-del="${c.id}" class="text-red-500 hover:text-red-700 font-bold px-1">🗑</button></td>
          </tr>
        `).join('');

      tbody.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => removeContact(btn.dataset.del)));
    };

    const removeContact = (id) => {
      if (!confirm('¿Eliminar este contacto del directorio?')) return;
      Store.remove('contacts', id);
      contacts = Store.getAll('contacts');
      renderList();
    };

    const saveContact = () => {
      const name = document.getElementById('f-name').value.trim();
      const rif = document.getElementById('f-rif').value.trim();
      const type = document.getElementById('f-type').value;
      const email = document.getElementById('f-email').value.trim();
      const phone = document.getElementById('f-phone').value.trim();
      const address = document.getElementById('f-address').value.trim();
      const msgEl = document.getElementById('contact-msg');
      msgEl.textContent = '';

      if (!name) { msgEl.textContent = 'El nombre es obligatorio.'; return; }
      if (rif && !Store.isContactRifUnique(rif)) { msgEl.textContent = 'Ya existe un contacto con ese RIF.'; return; }

      Store.insert('contacts', Store.newContact({ name, rif, type, email, phone, address }));
      contacts = Store.getAll('contacts');

      document.getElementById('f-name').value = '';
      document.getElementById('f-rif').value = '';
      document.getElementById('f-email').value = '';
      document.getElementById('f-phone').value = '';
      document.getElementById('f-address').value = '';
      renderList();
    };

    const body = `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="${card} space-y-3">
          <h2 class="text-sm font-bold text-slate-700">Nuevo Contacto</h2>
          <div>
            <label class="${label}">Nombre / Razón Social *</label>
            <input id="f-name" type="text" class="${input}">
          </div>
          <div>
            <label class="${label}">Rol *</label>
            <select id="f-type" class="${input}">
              <option value="cliente">Cliente (para Ventas)</option>
              <option value="proveedor">Proveedor (para Gastos/Costos)</option>
              <option value="ambos">Cliente y Proveedor</option>
            </select>
          </div>
          <div>
            <label class="${label}">Cédula / RIF</label>
            <input id="f-rif" type="text" placeholder="V-12345678" class="${input}">
          </div>
          <div>
            <label class="${label}">Correo</label>
            <input id="f-email" type="email" class="${input}">
          </div>
          <div>
            <label class="${label}">Teléfono</label>
            <input id="f-phone" type="text" class="${input}">
          </div>
          <div>
            <label class="${label}">Dirección</label>
            <input id="f-address" type="text" class="${input}">
          </div>
          <div id="contact-msg" class="text-xs text-red-600"></div>
          <button id="btn-save-contact" class="${btnPrimary}">Guardar Contacto</button>
        </div>

        <div class="${card} lg:col-span-2">
          <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
            <h2 class="text-sm font-bold text-slate-700">Directorio <span class="text-slate-400" id="contacts-count"></span></h2>
            <div class="flex items-center gap-2 flex-wrap">
              <input id="contacts-search" type="text" placeholder="Buscar por nombre, RIF, correo…" class="${input}" style="width:220px">
              <select id="contacts-type-filter" class="${input}" style="width:180px">
                <option value="">Todos los roles</option>
                <option value="cliente">Clientes</option>
                <option value="proveedor">Proveedores</option>
                <option value="ambos">Cliente y Proveedor</option>
              </select>
            </div>
          </div>
          <table class="w-full text-left text-xs">
            <thead><tr class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
              <th class="p-2">Nombre</th><th class="p-2">Rol</th><th class="p-2">RIF</th><th class="p-2">Correo</th><th class="p-2">Teléfono</th><th class="p-2"></th>
            </tr></thead>
            <tbody id="contacts-tbody"></tbody>
          </table>
        </div>
      </div>
    `;

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('contacts'), body);

    document.getElementById('btn-save-contact').addEventListener('click', saveContact);
    document.getElementById('contacts-search').addEventListener('input', (e) => { query = e.target.value; renderList(); });
    document.getElementById('contacts-type-filter').addEventListener('change', (e) => { typeFilter = e.target.value; renderList(); });

    renderList();

    return () => destroy.abort();
  }
};

export default Contacts;
