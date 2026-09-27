import { SHEETS_URL, SHEETS_TOKEN } from './sheets-config.js';

// ============================================
// Proveedor de respaldo sobre Google Sheets
// Mismo contrato que Supabase (select / upsert / delete / deleteWhere).
// Todo se guarda como texto; al leer se restauran los tipos reales.
// ============================================

const NUMERIC_FIELDS = {
  containers: [
    'container_capacity', 'container_max_weight',
    'insurance_rate', 'port_fee_rate', 'vat_rate',
    'ocean_freight', 'inland_freight', 'customs_expenses',
    'customs_broker_fee', 'op_expenses'
  ],
  items: [
    'qty', 'units_per_box', 'box_volume', 'weight_kg',
    'fob_unit', 'tariff_rate', 'gain_margin'
  ],
  products: [
    'units_per_box', 'box_volume', 'weight_kg', 'fob_unit', 'tariff_rate'
  ]
};

const BOOL_FIELDS = {
  containers: ['insurance_enabled']
};

const MAX_SEARCH = 100;

function normalizeRow(table, row) {
  const numFields = NUMERIC_FIELDS[table] || [];
  const boolFields = BOOL_FIELDS[table] || [];
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    if (numFields.includes(k)) {
      out[k] = v === '' || v === null || v === undefined ? 0 : Number(v) || 0;
    } else if (boolFields.includes(k)) {
      out[k] = v === 'true';
    } else {
      out[k] = v === null || v === undefined ? '' : String(v);
    }
  }
  return out;
}

async function request(method, query, body) {
  if (!SHEETS_URL) throw new Error('SHEETS_URL no configurada');
  const base = SHEETS_URL.endsWith('/') ? SHEETS_URL.slice(0, -1) : SHEETS_URL;
  const params = new URLSearchParams(query || {});
  const target = `${base}?${params.toString()}`;

  const opts = { method };
  if (body) {
    // text/plain evita el preflight CORS de Apps Script
    opts.headers = { 'Content-Type': 'text/plain' };
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(target, opts);
  const json = await res.json().catch(() => null);
  if (!json || json.ok !== true) {
    const msg = json && json.error ? json.error : `respuesta HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

export async function select(table) {
  const json = await request('GET', { table, pt: SHEETS_TOKEN });
  return (json.data || []).map(r => normalizeRow(table, r));
}

export async function upsert(table, rows) {
  const arr = Array.isArray(rows) ? rows : [rows];
  for (let i = 0; i < arr.length; i += MAX_SEARCH) {
    const chunk = arr.slice(i, i + MAX_SEARCH);
    await request('POST', null, { action: 'upsert', table, rows: chunk, pt: SHEETS_TOKEN });
  }
}

export async function remove(table, id) {
  await request('POST', null, { action: 'delete', table, id, pt: SHEETS_TOKEN });
}

export async function removeWhere(table, column, value) {
  await request('POST', null, { action: 'deleteWhere', table, column, value, pt: SHEETS_TOKEN });
}