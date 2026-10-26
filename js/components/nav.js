import { icon } from './icons.js';

const Nav = {
  render(active = '') {
    const links = [
      { path: '#/', key: 'dashboard', label: 'Dashboard', icon: 'chart' },
      { path: '#/productos', key: 'products', label: 'Productos', icon: 'box' },
      { path: '#/contabilidad/resumen', key: 'contabilidad', label: 'Contabilidad', icon: 'book' }
    ];
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
          </ul>
        </div>
      </nav>
    `;
  }
};

export default Nav;
