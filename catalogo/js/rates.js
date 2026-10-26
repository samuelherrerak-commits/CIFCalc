// Tasa USDT (Binance P2P vía CriptoYa), la misma fuente que usa CIFCalc en js/rates.js.
// El catálogo calcula los bolívares a esta tasa, NO a la oficial del BCV.
// Se consulta una vez al día por navegador; si la fuente falla se usa la última
// guardada o la de respaldo que traiga el catálogo. Sin tasa no se muestran Bs.
const SOURCE = 'https://criptoya.com/api/binancep2p/usdt/ves/1';
const KEY = 'cat_usdt';

const today = () => new Date().toISOString().slice(0, 10);
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };

export async function loadUsdt(fallback = 0) {
  const saved = read();
  if (saved && saved.day === today() && saved.value > 0) return { value: saved.value, day: saved.day, live: true };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(SOURCE, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    const ask = Number(d.ask), bid = Number(d.bid);
    const value = ask && bid ? (ask + bid) / 2 : (ask || bid || 0);   // promedio compra/venta, igual que la app
    if (!(value > 0)) throw new Error('Tasa inválida');
    try { localStorage.setItem(KEY, JSON.stringify({ day: today(), value })); } catch { /* sin almacenamiento */ }
    return { value, day: today(), live: true };
  } catch {
    if (saved && saved.value > 0) return { value: saved.value, day: saved.day, live: false };
    return { value: Number(fallback) || 0, day: '', live: false };
  } finally {
    clearTimeout(t);
  }
}
