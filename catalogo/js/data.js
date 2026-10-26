// Fuentes de datos del catálogo. Una sola interfaz, tres adaptadores:
//   vivo   → rutas públicas del Apps Script (fase B; requiere CONFIG.API_URL)
//   prueba → productos del Modo prueba de CIFCalc (mismo origen: localStorage "sbx_cif_*")
//   demo   → catalogo/mock/catalog.json (productos reales, existencias y precios ficticios)
// Elegir manualmente con ?fuente=vivo|prueba|demo.
import { CONFIG } from './config.js';
import { normalizeProduct, enInventario } from './normalize.js';
import { fiscalOf } from './price.js';

const readSbx = (table) => {
  try {
    const raw = localStorage.getItem('sbx_cif_' + table);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch { return []; }
};
const sandboxOn = () => { try { return localStorage.getItem('cif_sandbox') === '1'; } catch { return false; } };

async function fromDemo() {
  const res = await fetch(new URL('../mock/catalog.json', import.meta.url));
  if (!res.ok) throw new Error('No se pudo cargar el catálogo de demostración');
  const d = await res.json();
  return { raw: d.products, store: d.store, rate: d.rate, promos: d.promotions || [],
    banner: 'Datos de demostración: existencias y precios ficticios.' };
}

function fromPrueba() {
  const settings = readSbx('accounting_settings').find((s) => s.id === 'default') || {};
  const flag = (v, def) => (v === undefined || v === null || v === '' ? def : (v === true || String(v).toLowerCase() === 'true'));
  const rates = readSbx('exchange_rates').sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return {
    raw: readSbx('products'),
    store: {
      iva_enabled: flag(settings.iva_enabled, true), iva_rate_general: settings.iva_rate_general,
      iva_rate_reducida: settings.iva_rate_reducida, prices_include_iva: flag(settings.prices_include_iva, false),
      terms: settings.quote_terms || ''
    },
    rate: rates.length ? { date: rates[rates.length - 1].date, usd_bcv: rates[rates.length - 1].usd_bcv } : {},
    promos: readSbx('promotions'),
    banner: 'Modo prueba: estás viendo los productos de prueba de CIFCalc. Solo tú los ves.'
  };
}

async function fromVivo() {
  const res = await fetch(CONFIG.API_URL + (CONFIG.API_URL.includes('?') ? '&' : '?') + 'public=catalog');
  const d = await res.json();
  if (!d.ok) throw new Error(d.error || 'Catálogo no disponible');
  return { raw: d.data.products, store: d.data.store || {}, rate: d.data.rate || {}, promos: d.data.promotions || [], banner: '' };
}

export function pickMode() {
  const forced = new URLSearchParams(location.search).get('fuente');
  if (['vivo', 'prueba', 'demo'].includes(forced)) return forced;
  if (CONFIG.API_URL) return 'vivo';
  return sandboxOn() ? 'prueba' : 'demo';
}

export async function loadCatalog() {
  const mode = pickMode();
  const src = mode === 'vivo' ? await fromVivo() : mode === 'prueba' ? fromPrueba() : await fromDemo();
  const all = src.raw.map(normalizeProduct);
  const products = all.filter(enInventario);   // regla: solo lo que está en inventario
  return {
    mode, banner: src.banner, products, hiddenCount: all.length - products.length,
    fs: fiscalOf(src.store), promos: src.promos, usd: Number(src.rate && src.rate.usd_bcv) || 0,
    terms: (src.store && src.store.terms) || ''
  };
}

// ---- Reuniones de Meet ------------------------------------------------------
export async function loadSlots(mode) {
  if (mode === 'vivo') {
    const res = await fetch(CONFIG.API_URL + (CONFIG.API_URL.includes('?') ? '&' : '?') + 'public=slots');
    const d = await res.json();
    if (!d.ok) throw new Error(d.error || 'Horarios no disponibles');
    return d.data;
  }
  const { days, startHour, endHour, minutes, skipWeekdays } = CONFIG.MEET;
  const out = [];
  const now = new Date();
  for (let i = 0; out.length < days && i < days * 2; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (skipWeekdays.includes(d.getDay())) continue;
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const times = [];
    for (let m = startHour * 60; m < endHour * 60; m += minutes * 2) {
      const t = new Date(d); t.setHours(0, m, 0, 0);
      if (t.getTime() > now.getTime() + 2 * 3600e3) times.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    }
    if (times.length) out.push({ date: iso, times });
  }
  return out;
}

// ---- Pedido ------------------------------------------------------------------
// vivo: POST text/plain (sin preflight CORS) a la ruta publicOrder; el servidor
// recalcula precios y devuelve el número de presupuesto.
// demo/prueba: no se escribe nada en la base; el pedido solo queda en este navegador.
export async function createOrder(mode, payload, summary) {
  if (mode === 'vivo') {
    const res = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify({ action: 'publicOrder', ...payload }) });
    const d = await res.json();
    if (!d.ok) throw new Error(d.error || 'No se pudo registrar el pedido');
    return { quote_number: d.quote_number, total: d.total, meet_link: d.meet_link || '', saved: true };
  }
  let seq = 1;
  try { seq = (Number(localStorage.getItem('cat_order_seq')) || 0) + 1; localStorage.setItem('cat_order_seq', String(seq)); } catch { /* sin almacenamiento */ }
  const quote_number = 'WEB-' + String(seq).padStart(4, '0');
  try {
    const list = JSON.parse(localStorage.getItem('cat_orders') || '[]');
    list.push({ quote_number, at: new Date().toISOString(), ...summary });
    localStorage.setItem('cat_orders', JSON.stringify(list.slice(-20)));
  } catch { /* sin almacenamiento */ }
  return { quote_number, total: summary.total, meet_link: '', saved: false };
}
