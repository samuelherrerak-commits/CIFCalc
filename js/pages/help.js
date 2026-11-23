import { MANUAL } from '../data/manual.js';
import { esc } from '../utils.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { card, input } from '../components/accounting-shell.js';

// Manual de uso: lee js/data/manual.js. Rutas: #/contabilidad/ayuda (índice) y
// #/contabilidad/ayuda/<id> (una pantalla). Los pasos llevan la ruta del menú y un botón "Ir a la pantalla".
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const sectionsOf = () => [...new Set(MANUAL.map(e => e.section))];

const Help = {
  async render(app, params = []) {
    const destroy = new AbortController();
    const { signal } = destroy;
    const current = MANUAL.find(e => e.id === params[0]) || null;
    let query = '';

    const toc = () => {
      const q = norm(query);
      const secs = sectionsOf().map(s => {
        const items = MANUAL.filter(e => e.section === s && (!q || norm([e.title, e.resumen, e.buscar, ...e.tareas.map(t => t.q)].join(' ')).includes(q)));
        return items.length ? `<div><p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">${esc(s)}</p>
          ${items.map(e => `<a href="#/contabilidad/ayuda/${e.id}" class="block px-2.5 py-1.5 rounded-lg text-sm ${current && current.id === e.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}">${esc(e.title)}</a>`).join('')}</div>` : '';
      }).join('');
      return secs || '<p class="text-sm text-slate-400">Sin resultados.</p>';
    };

    const task = (t) => `
      <details class="rounded-xl border border-slate-200 bg-white" ${current && current.tareas.length === 1 ? 'open' : ''}>
        <summary class="px-4 py-3 cursor-pointer text-sm font-semibold text-slate-800">${esc(t.q)}</summary>
        <div class="px-4 pb-4 space-y-2">
          <ol class="list-decimal pl-5 space-y-1.5 text-sm text-slate-700">${t.pasos.map(p => `<li>${esc(p)}</li>`).join('')}</ol>
          ${(t.notas || []).length ? `<div class="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 space-y-1">${t.notas.map(n => `<p>• ${esc(n)}</p>`).join('')}</div>` : ''}
        </div>
      </details>`;

    const page = (e) => `
      <div class="space-y-4">
        <div>
          <p class="text-xs text-slate-400">${esc(e.section)}</p>
          <h2 class="text-xl font-bold text-slate-800">${esc(e.title)}</h2>
          <p class="text-xs text-slate-500 mt-1">Cómo llegar: <strong>${esc(e.menu)}</strong></p>
          <a href="${e.path}" class="inline-block mt-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold">Ir a la pantalla →</a>
        </div>
        <div class="${card}"><p class="text-sm text-slate-700 leading-relaxed">${esc(e.resumen)}</p></div>
        ${(e.pantalla || []).length ? `<div class="${card}"><p class="text-sm font-semibold text-slate-800 mb-1">Qué hay en la pantalla</p><ul class="list-disc pl-5 space-y-1 text-sm text-slate-700">${e.pantalla.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
        <div class="space-y-2"><p class="text-sm font-semibold text-slate-800">Cómo se hace</p>${e.tareas.map(task).join('')}</div>
        ${(e.conecta || []).length ? `<div class="${card}"><p class="text-sm font-semibold text-slate-800 mb-1">Se conecta con</p><ul class="list-disc pl-5 space-y-1 text-sm text-slate-700">${e.conecta.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}
        ${(e.pendiente || []).length ? `<div class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"><p class="font-semibold mb-1">Sin verificar todavía</p>${e.pendiente.map(c => `<p>• ${esc(c)}</p>`).join('')}</div>` : ''}
      </div>`;

    const home = () => `
      <div class="space-y-4">
        <div><h2 class="text-xl font-bold text-slate-800">Manual de uso</h2>
          <p class="text-sm text-slate-500 mt-1">Cómo funciona cada pantalla de Gestión financiera y cómo llegar a ella. Elige una a la izquierda o usa el buscador.</p></div>
        <div class="grid sm:grid-cols-2 gap-3">${MANUAL.map(e => `<a href="#/contabilidad/ayuda/${e.id}" class="${card} hover:border-blue-300 transition block"><p class="text-[10px] uppercase tracking-wider text-slate-400">${esc(e.section)}</p><p class="font-semibold text-slate-800">${esc(e.title)}</p><p class="text-xs text-slate-500 mt-1 line-clamp-2">${esc(e.resumen)}</p></a>`).join('')}</div>
      </div>`;

    const body = `
      <div class="grid lg:grid-cols-[15rem_minmax(0,1fr)] gap-4 items-start">
        <aside class="${card} lg:sticky lg:top-4 space-y-3">
          <input id="help-q" type="search" placeholder="Buscar en el manual…" class="${input}">
          <div id="help-toc" class="space-y-3">${toc()}</div>
        </aside>
        <main class="min-w-0">${current ? page(current) : home()}</main>
      </div>`;
    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('help'), body);
    document.getElementById('help-q').addEventListener('input', (ev) => { query = ev.target.value; document.getElementById('help-toc').innerHTML = toc(); }, { signal });
    return () => destroy.abort();
  }
};
export default Help;
