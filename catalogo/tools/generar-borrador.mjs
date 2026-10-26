// Genera catalogo/mock/borrador.json para /catalogo/prueba/: TODOS los productos del
// módulo de productos (hoja `products`) con precio de venta y existencias FICTICIOS.
//
// Uso (desde la raíz del repo, Node 22+):   node catalogo/tools/generar-borrador.mjs
//
// Lee la hoja con el token interno de js/sheets-config.js SOLO en esta máquina; el
// resultado no lleva costos, proveedores ni el token: únicamente los campos públicos.
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { SHEETS_URL, SHEETS_TOKEN } from '../../js/sheets-config.js';

const get = async (table) => {
  const res = await fetch(`${SHEETS_URL}?table=${table}&pt=${encodeURIComponent(SHEETS_TOKEN)}`);
  const d = await res.json();
  if (!d.ok) throw new Error(`${table}: ${d.error}`);
  return d.data;
};

const BASE = { BL: 95, MD: 180, VA: 140, TD: 210, SD: 260, FRG: 540, RD: 70, BD: 28, RM: 32, AC: 22 };
const FINISH = { SG: 1.08, BB: 1.12, RG: 1.12 };
const hash = (s) => parseInt(createHash('md5').update(s).digest('hex').slice(0, 8), 16);

const products = (await get('products')).map((p) => {
  const sku = String(p.sku_briggs || '').trim();
  const parts = sku.split('-');
  const h = hash(sku || p.id);
  const price = Math.round((BASE[parts[1]] || 60) * (0.85 + (h % 40) / 100) * (FINISH[parts[parts.length - 1]] || 1)) + (h % 7);
  const stock = h % 12 === 0 ? 2 + (h % 4) : 8 + (h % 33);        // algunos con "últimas unidades"
  return {
    id: p.id, sku_briggs: sku, sku: p.sku, name: p.name, foto_url: p.foto_url,
    brand: p.brand, collection: p.collection, category: p.category, color: p.color, iva_tipo: p.iva_tipo,
    weight_kg: p.weight_kg, units_per_box: p.units_per_box,
    stock, sale_price: price                                      // ficticios
  };
});

// Respaldo de la tasa USDT por si la fuente en vivo no responde (la tienda consulta CriptoYa al abrir).
let usdt = 0;
try { const r = (await get('exchange_rates')).filter((x) => Number(x.usdt) > 0).sort((a, b) => a.date.localeCompare(b.date)).pop(); usdt = r ? Number(r.usdt) : 0; } catch { /* sin respaldo */ }
if (!usdt) {
  try { const d = await (await fetch('https://criptoya.com/api/binancep2p/usdt/ves/1')).json(); usdt = Math.round(((d.ask + d.bid) / 2) * 100) / 100; } catch { /* sin respaldo */ }
}

const out = {
  draft: true,
  store: { name: 'BRIGGS', whatsapp: '584120298203', iva_enabled: true, iva_rate_general: 16, iva_rate_reducida: 8, prices_include_iva: false, terms: '' },
  rate: { usdt },
  products
};
await writeFile(new URL('../mock/borrador.json', import.meta.url), JSON.stringify(out));
console.log(`${products.length} productos · USDT de respaldo: ${usdt || 'sin dato'}`);
