import Auth from '../auth.js';
import { authCall } from '../sheets.js';
import { esc } from '../utils.js';
import AccountingTabs, { ACCOUNTING_SECTIONS } from '../components/accounting-tabs.js';
import AccountingShell, { card, input, label, btnPrimary, btnSecondary } from '../components/accounting-shell.js';

// Usuarios (solo administradores): crear usuarios con usuario y contraseña
// temporal, y tildar a qué módulos tiene acceso cada uno. Los administradores
// tienen acceso a todo. Todo se guarda en el Apps Script (hoja "users"); las
// contraseñas nunca se ven ni se guardan en el navegador.
export function permissionGroups() {
  return [
    { title: 'Contenedores y productos', items: [
      { key: 'containers', label: 'Dashboard y contenedores (calculadora)' },
      { key: 'products', label: 'Productos' }
    ] },
    ...ACCOUNTING_SECTIONS.filter(s => s.title !== 'Administración').map(s => ({
      title: s.title ? `Gestión financiera · ${s.title}` : 'Gestión financiera',
      items: s.items.map(it => ({ key: it.key, label: it.label }))
    }))
  ];
}

const Users = {
  async render(app) {
    let users = [];
    let error = '';
    const load = async () => {
      try { users = (await authCall('listUsers')).data || []; error = ''; } catch (e) { error = e.message; }
    };

    const allKeys = () => permissionGroups().flatMap(g => g.items.map(i => i.key));
    const labelOf = new Map(permissionGroups().flatMap(g => g.items.map(i => [i.key, i.label])));

    const draw = () => {
      const me = Auth.user() || {};
      const body = `
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 class="text-xl font-semibold text-slate-900">Usuarios</h1>
            <p class="text-xs text-slate-400">Quién entra al sistema y a qué módulos. Los administradores pueden todo.</p>
          </div>
          <button id="u-new" class="${btnPrimary}">Nuevo usuario</button>
        </div>
        ${error ? `<div class="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">${esc(error)}</div>` : ''}
        <div class="${card} !p-0 overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="text-[10px] uppercase tracking-wide text-slate-400 bg-slate-50">
              <th class="text-left px-3 py-2">Nombre</th><th class="text-left px-3 py-2">Usuario</th><th class="text-left px-3 py-2">Rol</th>
              <th class="text-left px-3 py-2">Acceso</th><th class="text-left px-3 py-2">Estado</th><th class="px-3 py-2"></th>
            </tr></thead>
            <tbody>${users.map(u => `
              <tr class="border-t border-slate-100 ${u.active ? '' : 'opacity-50'}">
                <td class="px-3 py-2.5 text-slate-900">${esc(u.name)}${u.id === me.id ? ' <span class="text-[10px] text-slate-400">(tú)</span>' : ''}</td>
                <td class="px-3 py-2.5 font-mono text-xs text-slate-600">${esc(u.username)}</td>
                <td class="px-3 py-2.5">${u.role === 'admin' ? '<span class="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#0f1d3a] text-white">Administrador</span>' : '<span class="text-xs text-slate-600">Usuario</span>'}</td>
                <td class="px-3 py-2.5 text-xs text-slate-500">${u.role === 'admin' ? 'Todo' : (u.permissions.length ? `${u.permissions.length} módulo(s): ${u.permissions.slice(0, 3).map(k => esc(labelOf.get(k) || k)).join(', ')}${u.permissions.length > 3 ? '…' : ''}` : '<span class="text-amber-600">Ninguno</span>')}</td>
                <td class="px-3 py-2.5 text-xs">${u.active ? (u.must_change ? '<span class="text-amber-600">Contraseña temporal</span>' : '<span class="text-emerald-700">Activo</span>') : '<span class="text-slate-500">Desactivado</span>'}</td>
                <td class="px-3 py-2.5 text-right"><button data-edit="${esc(u.id)}" class="text-xs font-semibold text-blue-600 hover:text-blue-800">Editar</button></td>
              </tr>`).join('')}</tbody>
          </table>
        </div>
        <p class="text-[11px] text-slate-400">Al crear un usuario o cambiarle la contraseña, la contraseña es temporal: el sistema le pide crear la suya la primera vez que entre.</p>`;
      app.innerHTML = AccountingShell.wrap(AccountingTabs.render('users'), body);
      document.getElementById('u-new').addEventListener('click', () => editModal(null));
      app.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => editModal(users.find(u => u.id === b.dataset.edit))));
    };

    const editModal = (u) => {
      const isNew = !u;
      const perms = new Set(u ? u.permissions : []);
      const wrap = document.createElement('div');
      wrap.className = 'fixed inset-0 z-50 bg-black/30 flex items-start sm:items-center justify-center p-3 overflow-y-auto';
      wrap.innerHTML = `
        <div class="bg-white rounded-xl shadow-xl w-full max-w-2xl p-5 space-y-4 my-6">
          <div class="flex justify-between items-center">
            <h2 class="text-base font-semibold text-slate-900">${isNew ? 'Nuevo usuario' : `Editar · ${esc(u.name)}`}</h2>
            <button data-close class="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label class="${label}">Nombre y apellido *</label><input id="u-name" value="${esc(u ? u.name : '')}" class="${input}" placeholder="María Pérez"></div>
            <div><label class="${label}">Usuario *</label><input id="u-username" value="${esc(u ? u.username : '')}" autocapitalize="none" spellcheck="false" class="${input} font-mono" placeholder="maria.perez"></div>
            <div><label class="${label}">${isNew ? 'Contraseña temporal *' : 'Nueva contraseña temporal'}</label><input id="u-pass" type="text" autocomplete="off" class="${input}" placeholder="${isNew ? 'Mínimo 6 caracteres' : 'Déjala vacía para no cambiarla'}"></div>
            <div class="flex items-end gap-4 pb-1">
              <label class="flex items-center gap-2 text-sm text-slate-700"><input id="u-admin" type="checkbox" ${u && u.role === 'admin' ? 'checked' : ''}> Administrador</label>
              <label class="flex items-center gap-2 text-sm text-slate-700"><input id="u-active" type="checkbox" ${!u || u.active ? 'checked' : ''}> Activo</label>
            </div>
          </div>
          <div id="u-perms" class="space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-slate-900">Módulos a los que tiene acceso</h3>
              <div class="flex gap-3 text-xs"><button data-all="1" class="text-blue-600 hover:text-blue-800">Marcar todo</button><button data-all="0" class="text-slate-500 hover:text-slate-800">Quitar todo</button></div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              ${permissionGroups().map(g => `
                <div class="rounded-lg border border-slate-200 p-3">
                  <label class="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-1.5"><input type="checkbox" data-group="${esc(g.title)}" ${g.items.every(i => perms.has(i.key)) ? 'checked' : ''}> ${esc(g.title)}</label>
                  <div class="space-y-1 pl-5">${g.items.map(i => `
                    <label class="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" data-perm="${esc(i.key)}" data-in="${esc(g.title)}" ${perms.has(i.key) ? 'checked' : ''}> ${esc(i.label)}</label>`).join('')}
                  </div>
                </div>`).join('')}
            </div>
          </div>
          <p id="u-admin-note" class="hidden text-xs text-slate-500">Un administrador tiene acceso a todos los módulos y puede administrar usuarios.</p>
          <div id="u-msg" class="text-xs text-red-600"></div>
          <div class="flex justify-end gap-2">
            <button data-close class="${btnSecondary}">Cancelar</button>
            <button id="u-save" class="${btnPrimary}">${isNew ? 'Crear usuario' : 'Guardar cambios'}</button>
          </div>
        </div>`;
      document.body.appendChild(wrap);
      const $ = (id) => wrap.querySelector('#' + id);
      const syncAdmin = () => {
        const admin = $('u-admin').checked;
        $('u-perms').classList.toggle('opacity-40', admin);
        $('u-perms').classList.toggle('pointer-events-none', admin);
        $('u-admin-note').classList.toggle('hidden', !admin);
      };
      const syncGroups = () => wrap.querySelectorAll('[data-group]').forEach(g => {
        const boxes = [...wrap.querySelectorAll(`[data-in="${CSS.escape(g.dataset.group)}"]`)];
        g.checked = boxes.every(b => b.checked);
        g.indeterminate = !g.checked && boxes.some(b => b.checked);
      });
      syncAdmin(); syncGroups();
      $('u-admin').addEventListener('change', syncAdmin);
      wrap.addEventListener('change', (e) => {
        if (e.target.dataset.group) {
          wrap.querySelectorAll(`[data-in="${CSS.escape(e.target.dataset.group)}"]`).forEach(b => { b.checked = e.target.checked; });
        }
        syncGroups();
      });
      wrap.addEventListener('click', async (e) => {
        if (e.target === wrap || e.target.closest('[data-close]')) { wrap.remove(); return; }
        const all = e.target.closest('[data-all]');
        if (all) { wrap.querySelectorAll('[data-perm]').forEach(b => { b.checked = all.dataset.all === '1'; }); syncGroups(); return; }
        if (!e.target.closest('#u-save')) return;
        const btn = $('u-save');
        const payload = {
          id: u ? u.id : undefined,
          name: $('u-name').value.trim(),
          username: $('u-username').value.trim().toLowerCase(),
          role: $('u-admin').checked ? 'admin' : 'usuario',
          active: $('u-active').checked,
          permissions: [...wrap.querySelectorAll('[data-perm]:checked')].map(b => b.dataset.perm).filter(k => allKeys().includes(k)),
          password: $('u-pass').value || undefined
        };
        btn.disabled = true; $('u-msg').textContent = '';
        try {
          const res = await authCall('saveUser', { user: payload });
          if (res.user.id === (Auth.user() || {}).id) Auth.setUser({ ...Auth.user(), ...res.user });
          wrap.remove();
          await load();
          draw();
          if (payload.password) alert(`Listo. Entrega a ${res.user.name} su usuario "${res.user.username}" y la contraseña temporal; el sistema le pedirá cambiarla al entrar.`);
        } catch (err) {
          $('u-msg').textContent = err.message;
          btn.disabled = false;
        }
      });
    };

    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('users'), '<div class="text-center py-20 text-slate-400">Cargando usuarios…</div>');
    await load();
    draw();
    return () => {};
  }
};

export default Users;
