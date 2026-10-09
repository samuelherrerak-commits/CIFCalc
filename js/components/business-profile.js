import { esc } from '../utils.js';
import { btnPrimary, btnSecondary, input, label } from './accounting-shell.js';

// Modal "Datos de la empresa" — lo que sale en el encabezado de los
// presupuestos y notas de venta. El logo se reduce en el navegador y se guarda
// como imagen embebida (data URL) para que viaje con la fila a Sheets, cuyo
// límite por celda es de 50.000 caracteres.
const MAX_LOGO_CHARS = 45000;

function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('El archivo no es una imagen válida.'));
      img.onload = () => {
        const tryEncode = (maxW, type, quality) => {
          const scale = Math.min(1, maxW / img.width, (maxW * 0.5) / img.height);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL(type, quality);
        };
        const attempts = [[400, 'image/png'], [300, 'image/png'], [400, 'image/jpeg', 0.85], [300, 'image/jpeg', 0.75], [200, 'image/jpeg', 0.7]];
        for (const [w, t, q] of attempts) {
          const url = tryEncode(w, t, q);
          if (url.length <= MAX_LOGO_CHARS) return resolve(url);
        }
        reject(new Error('El logo es demasiado pesado; prueba con una imagen más simple.'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function openBusinessProfileModal(Store, onSaved) {
  const p = Store.getBusinessProfile();
  let logo = p.logo;

  const wrap = document.createElement('div');
  wrap.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4';
  wrap.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <div class="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
        <div>
          <h3 class="text-base font-bold text-slate-800">Datos de la empresa</h3>
          <p class="text-xs text-slate-400">Aparecen en los presupuestos y notas de venta impresos.</p>
        </div>
        <button data-close class="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none">✕</button>
      </div>
      <div class="p-5 space-y-3">
        <div class="flex items-center gap-4">
          <div id="bp-logo-preview" class="w-28 h-16 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden text-[10px] text-slate-400"></div>
          <div class="space-y-1">
            <label class="${btnSecondary} inline-block cursor-pointer">Subir logo<input id="bp-logo" type="file" accept="image/*" class="hidden"></label>
            <button id="bp-logo-del" class="block text-xs text-red-500 hover:text-red-700">Quitar logo</button>
          </div>
        </div>
        <div><label class="${label}">Nombre / Razón social</label><input id="bp-name" class="${input}" value="${esc(p.name)}"></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="${label}">RIF</label><input id="bp-rif" class="${input}" value="${esc(p.rif)}"></div>
          <div><label class="${label}">Teléfono</label><input id="bp-phone" class="${input}" value="${esc(p.phone)}"></div>
        </div>
        <div><label class="${label}">E-mail</label><input id="bp-email" class="${input}" value="${esc(p.email)}"></div>
        <div><label class="${label}">Dirección</label><input id="bp-address" class="${input}" value="${esc(p.address)}"></div>
        <div><label class="${label}">Términos y condiciones (presupuestos)</label><textarea id="bp-terms" rows="3" class="${input}" placeholder="Precios en USD. Sujeto a disponibilidad de inventario.">${esc(p.terms)}</textarea></div>
        <div id="bp-msg" class="text-xs text-red-600"></div>
      </div>
      <div class="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
        <button data-close class="${btnSecondary}">Cancelar</button>
        <button id="bp-save" class="${btnPrimary}">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  const $ = (id) => wrap.querySelector('#' + id);
  const renderLogo = () => {
    $('bp-logo-preview').innerHTML = logo ? `<img src="${esc(logo)}" class="max-w-full max-h-full object-contain" alt="">` : 'Sin logo';
    $('bp-logo-del').classList.toggle('hidden', !logo);
  };
  const close = () => wrap.remove();

  wrap.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  $('bp-logo').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    $('bp-msg').textContent = '';
    try { logo = await shrinkImage(file); renderLogo(); } catch (err) { $('bp-msg').textContent = err.message; }
  });
  $('bp-logo-del').addEventListener('click', () => { logo = ''; renderLogo(); });
  $('bp-save').addEventListener('click', () => {
    Store.saveBusinessProfile({
      name: $('bp-name').value.trim(), rif: $('bp-rif').value.trim(), phone: $('bp-phone').value.trim(),
      email: $('bp-email').value.trim(), address: $('bp-address').value.trim(), terms: $('bp-terms').value.trim(), logo
    });
    close();
    if (onSaved) onSaved();
  });
  renderLogo();
}
