import Auth from '../auth.js';
import { esc } from '../utils.js';

// Pantalla de inicio de sesión y de cambio de contraseña (obligatorio la
// primera vez que se entra con una contraseña temporal).
const inputCls = 'w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none';
const shell = (inner) => `
  <div class="min-h-screen flex items-center justify-center p-4 bg-slate-100">
    <div class="w-full max-w-sm">
      <div class="flex items-center justify-center gap-2.5 mb-6">
        <span class="w-9 h-9 rounded-xl bg-[#0f1d3a] text-white flex items-center justify-center">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>
        </span>
        <span class="text-lg font-semibold text-slate-900">Maestro de Costo</span>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">${inner}</div>
      <p class="text-center text-[11px] text-slate-400 mt-4">Briggs · Gestión financiera</p>
    </div>
  </div>`;

export function showLogin(message = '') {
  document.getElementById('topbar').classList.add('hidden');
  const app = document.getElementById('app');
  app.className = '';
  app.innerHTML = shell(`
    <div>
      <h1 class="text-base font-semibold text-slate-900">Iniciar sesión</h1>
      <p class="text-xs text-slate-500 mt-0.5">Entra con tu usuario y contraseña.</p>
    </div>
    <form id="login-form" class="space-y-3" autocomplete="on">
      <div><label class="block text-xs font-medium text-slate-600 mb-1" for="lg-user">Usuario</label>
        <input id="lg-user" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" class="${inputCls}" required></div>
      <div><label class="block text-xs font-medium text-slate-600 mb-1" for="lg-pass">Contraseña</label>
        <input id="lg-pass" name="password" type="password" autocomplete="current-password" class="${inputCls}" required></div>
      <p id="lg-msg" class="text-xs text-red-600 min-h-[1rem]">${esc(message)}</p>
      <button id="lg-btn" class="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60">Entrar</button>
    </form>`);
  const form = document.getElementById('login-form');
  document.getElementById('lg-user').focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('lg-btn');
    const msg = document.getElementById('lg-msg');
    msg.textContent = '';
    btn.disabled = true; btn.textContent = 'Entrando…';
    try {
      const user = await Auth.login(document.getElementById('lg-user').value, document.getElementById('lg-pass').value);
      if (user.must_change) showChangePassword({ forced: true });
      else location.reload();
    } catch (err) {
      msg.textContent = err.message === 'Failed to fetch' ? 'No hay conexión con el servidor. Revisa tu internet.'
        : /acción desconocida/.test(err.message) ? 'El servidor todavía no tiene el inicio de sesión: hay que implementar la nueva versión del Apps Script.'
        : err.message;
      btn.disabled = false; btn.textContent = 'Entrar';
    }
  });
}

// forced: primera entrada con contraseña temporal (no se puede saltar).
export function showChangePassword({ forced = false, onDone = null } = {}) {
  const user = Auth.user() || {};
  const body = `
    <div>
      <h1 class="text-base font-semibold text-slate-900">${forced ? `Hola, ${esc(user.name || '')}` : 'Cambiar contraseña'}</h1>
      <p class="text-xs text-slate-500 mt-0.5">${forced ? 'Es tu primera vez: crea tu contraseña personal para continuar.' : 'Escribe tu contraseña actual y la nueva.'}</p>
    </div>
    <form id="cp-form" class="space-y-3">
      <div><label class="block text-xs font-medium text-slate-600 mb-1">${forced ? 'Contraseña temporal' : 'Contraseña actual'}</label>
        <input id="cp-cur" type="password" autocomplete="current-password" class="${inputCls}" required></div>
      <div><label class="block text-xs font-medium text-slate-600 mb-1">Nueva contraseña <span class="text-slate-400">(mínimo 6 caracteres)</span></label>
        <input id="cp-new" type="password" autocomplete="new-password" class="${inputCls}" required minlength="6"></div>
      <div><label class="block text-xs font-medium text-slate-600 mb-1">Repite la nueva contraseña</label>
        <input id="cp-new2" type="password" autocomplete="new-password" class="${inputCls}" required></div>
      <p id="cp-msg" class="text-xs text-red-600 min-h-[1rem]"></p>
      <div class="flex gap-2">
        ${forced ? '' : '<button type="button" id="cp-cancel" class="flex-1 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50">Cancelar</button>'}
        <button id="cp-btn" class="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60">Guardar contraseña</button>
      </div>
    </form>`;

  let wrap = null;
  if (forced) {
    document.getElementById('topbar').classList.add('hidden');
    const app = document.getElementById('app');
    app.className = '';
    app.innerHTML = shell(body);
  } else {
    wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4';
    wrap.innerHTML = `<div class="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 space-y-4">${body}</div>`;
    document.body.appendChild(wrap);
    wrap.querySelector('#cp-cancel').addEventListener('click', () => wrap.remove());
  }
  const root = wrap || document;
  root.querySelector('#cp-cur').focus();
  root.querySelector('#cp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = root.querySelector('#cp-msg');
    const next = root.querySelector('#cp-new').value;
    if (next !== root.querySelector('#cp-new2').value) { msg.textContent = 'Las contraseñas nuevas no coinciden.'; return; }
    const btn = root.querySelector('#cp-btn');
    btn.disabled = true;
    try {
      await Auth.changePassword(root.querySelector('#cp-cur').value, next);
      if (forced) location.reload();
      else { wrap.remove(); alert('Listo: tu contraseña quedó cambiada.'); if (onDone) onDone(); }
    } catch (err) {
      msg.textContent = err.message;
      btn.disabled = false;
    }
  });
}
