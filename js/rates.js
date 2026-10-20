// Tasas de cambio del día (Bs por unidad):
//   • USD y EUR oficiales del BCV — DolarAPI (ve.dolarapi.com), que replica
//     la publicación del BCV; sin clave y con CORS abierto.
//   • USDT — promedio compra/venta de Binance P2P vía CriptoYa.
// Se consultan una vez por día y se guardan en la tabla exchange_rates
// (id = fecha), así todos los equipos usan la misma tasa para ese día y cada
// asiento/factura queda con la tasa con la que se registró.
const SOURCES = {
  usd: 'https://ve.dolarapi.com/v1/dolares/oficial',
  eur: 'https://ve.dolarapi.com/v1/euros/oficial',
  usdt: 'https://criptoya.com/api/binancep2p/usdt/ves/1'
};

async function getJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Devuelve { usd_bcv, eur_bcv, usdt, bcv_date } con lo que se haya podido
// leer (una fuente caída no anula las otras).
export async function fetchLiveRates() {
  const [usd, eur, usdt] = await Promise.allSettled([getJson(SOURCES.usd), getJson(SOURCES.eur), getJson(SOURCES.usdt)]);
  const val = (r, f) => (r.status === 'fulfilled' ? Number(f(r.value)) || 0 : 0);
  const out = {
    usd_bcv: val(usd, v => v.promedio),
    eur_bcv: val(eur, v => v.promedio),
    usdt: val(usdt, v => (Number(v.ask) && Number(v.bid)) ? (Number(v.ask) + Number(v.bid)) / 2 : (v.ask || v.bid)),
    bcv_date: usd.status === 'fulfilled' ? String(usd.value.fechaActualizacion || '').slice(0, 10) : ''
  };
  if (!out.usd_bcv && !out.eur_bcv && !out.usdt) throw new Error('No se pudo consultar ninguna tasa (sin conexión o fuentes caídas).');
  return out;
}

let inflight = null;

// Trae las tasas de hoy si aún no están guardadas (o si force). La tasa
// manual escrita para hoy no se pisa salvo con force.
export function ensureTodayRates(Store, { force = false } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const saved = (Store.getAll('exchange_rates') || []).find(r => r.id === today);
  if (saved && !force) return Promise.resolve(saved);
  if (inflight) return inflight;
  inflight = fetchLiveRates()
    .then(r => {
      const keep = saved || {};
      return Store.saveRates(today, {
        usd_bcv: r.usd_bcv || keep.usd_bcv,
        eur_bcv: r.eur_bcv || keep.eur_bcv,
        usdt: r.usdt || keep.usdt
      }, 'DolarAPI (BCV) + Binance P2P');
    })
    .finally(() => { inflight = null; });
  return inflight;
}

export const fmtBs = (n) => 'Bs ' + (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
