import { icon } from './icons.js';
import Auth from '../auth.js';
import { ACCOUNTING_SECTIONS } from './accounting-tabs.js';
import { showChangePassword } from '../pages/login.js';
import { esc } from '../utils.js';

// Primera pantalla de Gestión financiera que el usuario puede abrir.
const firstFinance = () => { for (const s of ACCOUNTING_SECTIONS) for (const it of s.items) if (Auth.can(it.key)) return it.path; return null; };

const Nav = {
  render(active = '') {
    const fin = firstFinance();
    const links = [
      Auth.can('containers') && { path: '#/', key: 'dashboard', label: 'Dashboard', icon: 'chart' },
      Auth.can('products') && { path: '#/productos', key: 'products', label: 'Productos', icon: 'box' },
      fin && { path: fin, key: 'contabilidad', label: 'Gestión financiera', icon: 'book' }
    ].filter(Boolean);
    const user = Auth.user() || {};
    const initials = String(user.name || user.username || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    const nav = document.getElementById('navbar');
    nav.innerHTML = `
      <nav class="bg-white border-b border-slate-200">
        <div class="px-4 md:px-6 h-12 flex items-center justify-between">
          <a href="#/" class="flex items-center gap-2 font-semibold text-[15px] text-slate-900">
            <span class="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center">${icon('box', 'w-4 h-4')}</span>
            <span class="hidden sm:inline">Maestro de Costo</span>
            <span id="nav-respaldo" class="hidden text-[10px] bg-amber-500 text-white font-bold px-2 py-0.5 rounded-full" title="Se trabaja con los datos guardados en este navegador y se reintenta solo.">Sin conexión con Sheets</span>
          </a>
          <ul class="flex gap-1">
            ${links.map(l => `
              <li>
                <a href="${l.path}"
                   class="flex items-center px-3 py-1.5 rounded-lg text-sm transition
                          ${active === l.key ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-500 hover:text-slate-900'}">
                  <span class="sm:hidden">${icon(l.icon)}</span>
                  <span class="hidden sm:inline">${l.label}</span>
                </a>
              </li>
            `).join('')}
            <li class="relative ml-1">
              <button id="user-menu-btn" title="${esc(user.name || '')}" class="w-8 h-8 rounded-full bg-[#0f1d3a] text-white text-[11px] font-semibold flex items-center justify-center">${esc(initials)}</button>
              <div id="user-menu" class="hidden absolute right-0 top-10 w-56 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-50 text-sm">
                <div class="px-3 py-2 border-b border-slate-100">
                  <div class="font-medium text-slate-900 truncate">${esc(user.name || '')}</div>
                  <div class="text-xs text-slate-400">${esc(user.username || '')} · ${user.role === 'admin' ? 'Administrador' : 'Usuario'}</div>
                </div>
                ${Auth.isAdmin() ? '<a href="#/contabilidad/usuarios" class="block px-3 py-2 text-slate-700 hover:bg-slate-50">Usuarios</a>' : ''}
                <button data-um="password" class="w-full text-left px-3 py-2 text-slate-700 hover:bg-slate-50">Cambiar contraseña</button>
                <button data-um="logout" class="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50">Salir</button>
              </div>
            </li>
          </ul>
        </div>
      </nav>
    `;
  }
};

// Menú del usuario (un solo juego de listeners: el navbar se repinta en cada ruta).
document.addEventListener('click', async (e) => {
  const menu = document.getElementById('user-menu');
  if (!menu) return;
  if (e.target.closest('#user-menu-btn')) { menu.classList.toggle('hidden'); return; }
  const act = e.target.closest('[data-um]');
  if (!e.target.closest('#user-menu')) { menu.classList.add('hidden'); return; }
  if (!act) return;
  menu.classList.add('hidden');
  if (act.dataset.um === 'password') showChangePassword();
  if (act.dataset.um === 'logout') {
    const Store = (await import('../store.js')).default;
    try { await Store.processRetryQueue(); } catch { /* sin conexión */ }
    const pending = Store.pendingWrites ? Store.pendingWrites() : 0;
    if (pending && !confirm(`Hay ${pending} cambio(s) que todavía no se subieron a la base de datos. Si sales ahora se pierden. ¿Salir de todas formas?`)) return;
    await Auth.logout();
    // Salir de la página directo (sin pasar por el router, que volvería a
    // cargar datos antes de recargar).
    location.replace(location.pathname + location.search);
  }
});

export default Nav;
