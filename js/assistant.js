import { authCall } from './sheets.js';
import { searchManual, buildContext, screensOf, manualAnswer, NOT_IN_MANUAL } from './assistant-core.js';
import { esc } from './utils.js';

// Asistente de Gestión financiera: un botón flotante abre un chat. Responde con la ruta y los pasos del
// manual (js/data/manual.js) y un botón "Ir ahí". La IA solo redacta con el texto del manual que se le
// manda; si el servidor no tiene IA configurada o falla, se muestran los pasos del manual tal cual.
let panel = null;
const history = []; // { role, content } de esta sesión de chat
const SUGGESTED = ['¿Cómo creo un presupuesto?', '¿Dónde registro un gasto?', '¿Cómo cobro a un cliente?', '¿Cómo descargo la lista de precios?'];

// Texto simple → HTML seguro (negritas, listas numeradas y saltos de línea).
const fmt = (txt) => esc(txt)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\n/g, '<br>');

const bubble = (role, html) => `<div class="flex ${role === 'user' ? 'justify-end' : 'justify-start'}"><div class="${role === 'user'
  ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'} rounded-2xl px-3 py-2 text-sm max-w-[88%] leading-relaxed">${html}</div></div>`;

function screenButtons(screens) {
  if (!screens.length) return '';
  return `<div class="flex flex-wrap gap-1.5 mt-2">${screens.map(s => `<a href="${s.path}" data-asst-go class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-blue-200 text-blue-700 hover:bg-blue-50">Ir a ${esc(s.title)} →</a>`).join('')}</div>`;
}

function ensurePanel() {
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = 'asst-panel';
  panel.className = 'hidden fixed z-50 bottom-20 md:bottom-5 right-3 md:right-5 w-[calc(100vw-1.5rem)] sm:w-[24rem] max-h-[75vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col';
  panel.innerHTML = `
    <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100">
      <div><p class="text-sm font-semibold text-slate-900">Asistente</p><p class="text-[11px] text-slate-400">Te digo cómo llegar y qué pasos seguir</p></div>
      <div class="flex items-center gap-3"><button data-asst-clear class="text-[11px] text-slate-400 hover:text-slate-700">Limpiar</button><button data-asst-close class="text-slate-400 hover:text-slate-700 text-xl leading-none">✕</button></div>
    </div>
    <div id="asst-log" class="flex-1 overflow-y-auto p-3 space-y-2 min-h-[10rem]"></div>
    <div id="asst-chips" class="px-3 pb-2 flex flex-wrap gap-1.5"></div>
    <form id="asst-form" class="flex gap-2 p-3 border-t border-slate-100">
      <input id="asst-input" maxlength="300" autocomplete="off" placeholder="Escribe tu pregunta…" class="flex-1 p-2 border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none">
      <button class="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">Enviar</button>
    </form>`;
  document.body.appendChild(panel);
  reset();
  return panel;
}

function reset() {
  history.length = 0;
  document.getElementById('asst-log').innerHTML = bubble('assistant', fmt('Hola. Pregúntame cómo hacer algo en Gestión financiera y te digo la ruta y los pasos. Por ejemplo: "¿cómo creo un presupuesto?".'));
  document.getElementById('asst-chips').innerHTML = SUGGESTED.map(q => `<button type="button" data-asst-q class="px-2.5 py-1 rounded-full text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-600">${esc(q)}</button>`).join('');
}

async function ask(question) {
  const log = document.getElementById('asst-log');
  document.getElementById('asst-chips').innerHTML = '';
  log.insertAdjacentHTML('beforeend', bubble('user', esc(question)));
  const pending = document.createElement('div');
  pending.innerHTML = bubble('assistant', '<span class="text-slate-400">Buscando en el manual…</span>');
  log.appendChild(pending);
  log.scrollTop = log.scrollHeight;

  const hits = searchManual(question);
  let answer, screens = screensOf(hits), viaAi = false;
  if (!hits.length) { answer = NOT_IN_MANUAL; screens = []; }
  else {
    try {
      const res = await authCall('assistantAsk', { question, context: buildContext(hits), history: history.slice(-4) });
      answer = (res.answer || '').trim();
      viaAi = !!answer;
      if (!answer) answer = manualAnswer(hits);
    } catch (e) {
      // Sin IA (no configurada, límite o sin conexión): se muestran los pasos del manual tal cual.
      answer = manualAnswer(hits);
    }
  }
  // Si la IA dice que no está en el manual, no se ofrecen botones de pantallas.
  if (/^\W*no est[aá] en el manual/i.test(answer) && !/ruta|men[uú]/i.test(answer)) screens = screens.slice(0, 1);
  history.push({ role: 'user', content: question }, { role: 'assistant', content: answer.slice(0, 600) });
  pending.innerHTML = bubble('assistant', fmt(answer) + screenButtons(screens) + (viaAi || answer === NOT_IN_MANUAL ? '' : '<p class="text-[10px] text-slate-400 mt-2">Respuesta tomada directo del manual.</p>'));
  log.scrollTop = log.scrollHeight;
}

// Un solo juego de listeners (el botón se repinta con cada vista).
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-assistant-open]')) {
    const p = ensurePanel();
    p.classList.toggle('hidden');
    if (!p.classList.contains('hidden')) document.getElementById('asst-input').focus();
    return;
  }
  if (!panel) return;
  if (e.target.closest('[data-asst-close]')) panel.classList.add('hidden');
  else if (e.target.closest('[data-asst-clear]')) reset();
  else if (e.target.closest('[data-asst-go]')) { if (window.matchMedia('(max-width: 767px)').matches) panel.classList.add('hidden'); }
  else { const q = e.target.closest('[data-asst-q]'); if (q) ask(q.textContent); }
});
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'asst-form') return;
  e.preventDefault();
  const inp = document.getElementById('asst-input');
  const q = inp.value.trim();
  if (q) { inp.value = ''; ask(q); }
});

export const assistantButton = () => `
  <button data-assistant-open title="¿Necesitas ayuda?" class="fixed z-40 bottom-20 md:bottom-5 right-3 md:right-5 flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-lg">
    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
    <span class="hidden sm:inline">¿Necesitas ayuda?</span>
  </button>`;
