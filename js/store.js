import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
import { SHEETS_URL } from './sheets-config.js';
import * as Sheets from './sheets.js';
import { computeContainer } from './utils.js';
import { withRoundingPlug, buildContainerClosingLines, isClosingMappingComplete, resolveClosingMapping } from './accounting.js';

// ============================================
// Supabase client (singleton) — backend primario
// ============================================
let sb = null;
try {
  if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.warn('Maestro de Costo: No se pudo conectar a Supabase, usando localStorage + respaldo Sheets.', e.message);
}

const log = (msg) => console.log(`Maestro de Costo: ${msg}`);

// ============================================
// localStorage helpers
// ============================================
const STORE_KEYS = {
  companies: 'cif_companies',
  suppliers: 'cif_suppliers',
  containers: 'cif_containers',
  items: 'cif_items',
  products: 'cif_products',
  accounts: 'cif_accounts',
  movements: 'cif_movements',
  journal_entries: 'cif_journal_entries',
  journal_lines: 'cif_journal_lines',
  accounting_settings: 'cif_accounting_settings',
  expense_categories: 'cif_expense_categories',
  sale_concepts: 'cif_sale_concepts',
  module_settings: 'cif_module_settings',
  contacts: 'cif_contacts',
  quotes: 'cif_quotes'
};

// Tablas que el Web App de Sheets respalda (schemas definidos en Code.gs).
// Las demás entidades (contabilidad, ventas, gastos) viven en Supabase.
const ENTITIES = ['companies', 'suppliers', 'containers', 'items', 'products', 'accounts', 'movements', 'journal_entries', 'journal_lines', 'accounting_settings', 'expense_categories', 'sale_concepts', 'module_settings', 'contacts', 'quotes'];
const SHEET_TABLES = ['companies', 'suppliers', 'containers', 'items', 'products', 'accounts', 'movements', 'contacts', 'quotes', 'accounting_settings'];

function readAll(key) {
  try {
    const raw = localStorage.getItem(key);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('Error leyendo localStorage:', key, e);
    return [];
  }
}

function writeAll(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
}

function now() {
  return new Date().toISOString();
}

// ============================================
// Columnas caídas de la BD (migracion_peso_kg.sql).
// Se depuran de los registros al subir/mergear para
// no enviarlas en el 'columns' de Supabase (400).
// ============================================
const DROPPED_FIELDS = {
  items: ['weight_lbs'],
  products: ['weight_lbs']
};

// Defaults por tabla para columnas NOT NULL. PostgREST arma el 'columns'
// con la unión de claves del array; si una fila no trae una columna listada
// (registros legacy), se inserta como null y viola NOT NULL. Rellenar con el
// default correcto hace el batch válido.
const TABLE_DEFAULTS = {
  companies: { name: '', tax_id: '', created_at: '', updated_at: '' },
  suppliers: { name: '', country: '', contact_email: '', contact_phone: '', created_at: '', updated_at: '' },
  containers: {
    company_id: null,
    bl_number: '',
    operation_date: '',
    container_capacity: 0, container_max_weight: 0,
    insurance_rate: 0, insurance_enabled: true,
    port_fee_rate: 0, vat_rate: 0,
    ocean_freight: 0, inland_freight: 0,
    customs_expenses: 0, customs_broker_fee: 0, op_expenses: 0,
    status: 'draft', created_at: '', updated_at: '', inventory_posted: false
  },
  items: {
    container_id: null,
    supplier_id: null,
    origin_country: '',
    sku: '', name: '', hs_code: '',
    qty: 0, units_per_box: 1, box_volume: 0,
    fob_unit: 0, tariff_rate: 0, gain_margin: 0,
    product_id: null, sku_briggs: '', weight_kg: 0,
    created_at: '', updated_at: ''
  },
  products: {
    sku_briggs: '', sku: '', name: '',
    supplier_id: null, origin_country: '',
    units_per_box: 1, box_volume: 0, weight_kg: 0,
    hs_code: '', fob_unit: 0, tariff_rate: 0,
    created_at: '', updated_at: ''
  }
};

function normalizeEntityRows(entity, rows) {
  if (!Array.isArray(rows)) rows = rows ? [rows] : [];
  const dropped = DROPPED_FIELDS[entity];
  const defaults = TABLE_DEFAULTS[entity];
  return rows.map(r => {
    if (!r || typeof r !== 'object') return r;
    const clean = { ...r };
    if (dropped) for (const k of dropped) delete clean[k];
    if (defaults) {
      for (const k of Object.keys(defaults)) {
        if (clean[k] === undefined) {
          clean[k] = (k === 'created_at' || k === 'updated_at') ? now() : defaults[k];
        }
      }
    }
    return clean;
  });
}

function purgeDroppedColumns() {
  for (const entity of Object.keys(DROPPED_FIELDS)) {
    const rows = readAll(STORE_KEYS[entity]);
    if (!rows.length) continue;
    const clean = normalizeEntityRows(entity, rows);
    writeAll(STORE_KEYS[entity], clean);
  }
}

// ============================================
// Merge: combina local + remoto, conserva el más nuevo
// ============================================
function mergeRecords(local, remote) {
  const map = new Map();
  for (const r of remote) map.set(r.id, r);
  for (const r of local) {
    const existing = map.get(r.id);
    if (!existing) {
      map.set(r.id, r);
    } else {
      const lt = new Date(r.updated_at || r.created_at || 0).getTime();
      const rt = new Date(existing.updated_at || existing.created_at || 0).getTime();
      map.set(r.id, lt >= rt ? r : existing);
    }
  }
  return [...map.values()];
}

// ============================================
// Backend activo (Google Sheets primario / Supabase respaldo)
// Solo aplica a las tablas con respaldo en Sheets (SHEET_TABLES); las
// entidades de contabilidad/ventas/gastos no tienen alternativa y siempre
// usan Supabase directo, sin importar este modo.
// ============================================
const MODE_KEY = 'cif_backend_mode';
let backendMode = localStorage.getItem(MODE_KEY) === 'supabase' ? 'supabase' : 'sheets';
let probeCount = 0;

function getBackend() {
  return backendMode;
}

function notifyBackend() {
  try {
    window.dispatchEvent(new CustomEvent('cif-backend', { detail: { backend: backendMode } }));
  } catch (e) { /* noop */ }
}

function enterSupabaseMode() {
  if (backendMode !== 'supabase') {
    backendMode = 'supabase';
    localStorage.setItem(MODE_KEY, 'supabase');
    log('Google Sheets no responde, activando respaldo en Supabase.');
    notifyBackend();
  }
}

function exitSupabaseMode() {
  if (backendMode !== 'sheets') {
    backendMode = 'sheets';
    localStorage.removeItem(MODE_KEY);
    log('Google Sheets responde de nuevo, recuperando modo primario.');
    notifyBackend();
  }
}

// ============================================
// Retry queue para operaciones fallidas
// ============================================
const RETRY_KEY = 'cif_retry_queue';
const MAX_RETRIES = 5;

// Errores de constraint/schema nunca se resuelven reintentando (not-null, FK,
// duplicados, esquema). Solo se re-intentan fallos transitorios de red/Bd.
function isRetryableError(e) {
  const msg = String((e && (e.message || e.details || '')) || '');
  if (e && e.code) {
    const c = String(e.code);
    if (c.startsWith('235') || c === '22P02' || c === 'PGRST301' ||
        /^PGRST\d{3}/.test(c) || /^42P\d{2}$/.test(c) || c === '28P01') return false;
  }
  if (/foreign key|not-null|null value|violates|duplicate key|schema cache|undefined table|PGRST|invalid input/gi.test(msg)) return false;
  if (/failed to fetch|networkerror|timeout|timed out|abort|5\d\d|429/gi.test(msg)) return true;
  return true;
}

function getRetryQueue() {
  try {
    const raw = localStorage.getItem(RETRY_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(queue)) return [];
    return queue.filter(op => op && ENTITIES.includes(op.table));
  } catch { return []; }
}

function pushRetry(operation) {
  const queue = getRetryQueue();
  operation.attempts = operation.attempts || 0;
  queue.push(operation);
  if (queue.length > 100) queue.splice(0, queue.length - 100);
  localStorage.setItem(RETRY_KEY, JSON.stringify(queue));
}

async function processRetryQueue() {
  if (!sb && !SHEETS_URL) return;
  const queue = getRetryQueue();
  if (queue.length === 0) return;
  const remaining = [];
  for (const op of queue) {
    try {
      if (op.target === 'sheets') {
        op.attempts++;
        if (op.type === 'upsert') {
          await Sheets.upsert(op.table, Array.isArray(op.record) ? op.record : [op.record]);
        } else if (op.type === 'delete') {
          await Sheets.remove(op.table, op.value);
        } else if (op.type === 'deleteWhere') {
          await Sheets.removeWhere(op.table, op.column, op.value);
        }
      } else {
        // Supabase: si está caído, esperar la reconexión sin quemar intentos.
        if (!sb || backendMode === 'sheets') {
          remaining.push(op);
          continue;
        }
        op.attempts++;
        if (op.type === 'upsert') {
          const records = normalizeEntityRows(op.table, Array.isArray(op.record) ? op.record : [op.record]);
          const { error } = await sb.from(op.table).upsert(records, { onConflict: 'id' });
          if (error) throw error;
        } else if (op.type === 'delete') {
          const { error } = await sb.from(op.table).delete().eq(op.column, op.value);
          if (error) throw error;
        } else if (op.type === 'deleteWhere') {
          const { error } = await sb.from(op.table).delete().eq(op.column, op.value);
          if (error) throw error;
        }
      }
    } catch (e) {
      const retryable = isRetryableError(e);
      if (retryable && op.attempts < MAX_RETRIES) {
        remaining.push(op);
        console.warn(`Maestro de Costo: retry #${op.attempts} fallo para ${op.type} en ${op.table} (${op.target || 'supabase'}):`, e.message);
      } else if (!retryable) {
        console.warn(`Maestro de Costo: op ${op.type} en ${op.table} descartada (error no re-intentable):`, e.message);
      }
    }
  }
  localStorage.setItem(RETRY_KEY, JSON.stringify(remaining));
}

// ============================================
// Supabase helpers (retorno nulo = error)
// ============================================
async function sbSelectAll(table) {
  if (!sb) return null;
  try {
    const { data, error } = await sb.from(table).select('*');
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn(`Maestro de Costo: sync select fallo en ${table}:`, e.message);
    return null;
  }
}

async function sbUpsert(table, record) {
  if (!sb) return;
  try {
    const records = normalizeEntityRows(table, Array.isArray(record) ? record : [record]);
    const { error } = await sb.from(table).upsert(records, { onConflict: 'id' });
    if (error) throw error;
  } catch (e) {
    if (isRetryableError(e)) {
      console.warn(`Maestro de Costo: sync upsert fallo en ${table}, encolando retry:`, e.message);
      pushRetry({ type: 'upsert', table, record: normalizeEntityRows(table, Array.isArray(record) ? record : [record]), target: 'supabase' });
    } else {
      console.warn(`Maestro de Costo: sync upsert en ${table} descartado (error no re-intentable):`, e.message);
    }
  }
}

async function sbDelete(table, id) {
  if (!sb) return;
  try {
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) throw error;
  } catch (e) {
    if (isRetryableError(e)) {
      console.warn(`Maestro de Costo: sync delete fallo en ${table}, encolando retry:`, e.message);
      pushRetry({ type: 'delete', table, column: 'id', value: id, target: 'supabase' });
    } else {
      console.warn(`Maestro de Costo: sync delete en ${table} descartado (error no re-intentable):`, e.message);
    }
  }
}

async function sbDeleteWhere(table, column, value) {
  if (!sb) return;
  try {
    const { error } = await sb.from(table).delete().eq(column, value);
    if (error) throw error;
  } catch (e) {
    if (isRetryableError(e)) {
      console.warn(`Maestro de Costo: sync deleteWhere fallo en ${table}, encolando retry:`, e.message);
      pushRetry({ type: 'deleteWhere', table, column, value, target: 'supabase' });
    } else {
      console.warn(`Maestro de Costo: sync deleteWhere en ${table} descartado (error no re-intentable):`, e.message);
    }
  }
}

async function sbSyncContainerItems(containerId, newItems) {
  if (!sb) return;
  const gen = (_syncGeneration.get(containerId) || 0) + 1;
  _syncGeneration.set(containerId, gen);
  try {
    await sb.from('items').delete().eq('container_id', containerId);
    if (_syncGeneration.get(containerId) !== gen) return;
    if (newItems.length) {
      const { error } = await sb.from('items').upsert(normalizeEntityRows('items', newItems), { onConflict: 'id' });
      if (error) throw error;
    }
  } catch (e) {
    if (isRetryableError(e)) {
      console.warn(`Maestro de Costo: sync container items fallo, encolando retry:`, e.message);
      pushRetry({ type: 'upsert', table: 'items', record: normalizeEntityRows('items', newItems), target: 'supabase' });
    } else {
      console.warn(`Maestro de Costo: sync container items descartado (error no re-intentable):`, e.message);
    }
  }
}

// Atomic per-container item sync with generation counter
const _syncGeneration = new Map();

// ============================================
// Respaldo Sheets helpers (nunca bloquean la app)
// ============================================
async function sheetsMirrorItems(containerId, newItems) {
  if (!SHEETS_URL) return;
  try {
    await Sheets.removeWhere('items', 'container_id', containerId);
    if (newItems.length) await Sheets.upsert('items', newItems);
  } catch (e) {
    console.warn('Maestro de Costo: respaldo Sheets (items) falló, encolando:', e.message);
    pushRetry({ type: 'deleteWhere', table: 'items', column: 'container_id', value: containerId, target: 'sheets' });
    if (newItems.length) pushRetry({ type: 'upsert', table: 'items', record: newItems, target: 'sheets' });
  }
}

// ============================================
// Adaptador cloud: doble escritura + failover de lectura
// ============================================
async function getRemoteTable(table) {
  // Contabilidad/ventas/gastos: sin respaldo en Sheets, siempre Supabase directo.
  if (!SHEETS_URL || !SHEET_TABLES.includes(table)) {
    const data = await sbSelectAll(table);
    return data === null ? [] : data;
  }

  // Ya estamos en modo respaldo (Sheets caído la última vez que se probó).
  if (backendMode === 'supabase') {
    probeCount++;
    if (probeCount % 5 === 1) {
      try {
        await Sheets.select('companies');
        exitSupabaseMode();
        return await Sheets.select(table);
      } catch (e) {
        // Sheets sigue sin responder, se queda en modo respaldo.
      }
    }
    const data = await sbSelectAll(table);
    return data === null ? [] : data;
  }

  // Modo normal: Sheets es la fuente primaria.
  try {
    return await Sheets.select(table);
  } catch (e) {
    console.warn(`Maestro de Costo: Sheets (${table}) falló, usando respaldo Supabase:`, e.message);
    enterSupabaseMode();
    const data = await sbSelectAll(table);
    return data === null ? [] : data;
  }
}

function cloudUpsert(table, record) {
  const records = normalizeEntityRows(table, Array.isArray(record) ? record : [record]);
  const sheetsCapable = SHEETS_URL && SHEET_TABLES.includes(table);

  // Contabilidad/ventas/gastos: sin respaldo en Sheets, solo Supabase.
  if (!sheetsCapable) {
    return sb ? sbUpsert(table, records) : Promise.resolve();
  }

  let p = Promise.resolve();
  if (backendMode === 'sheets') {
    p = sheetsUpsert(table, records);
  } else {
    pushRetry({ type: 'upsert', table, record: records, target: 'sheets' });
  }
  sbUpsertSafe(table, records);
  return p;
}

function cloudDelete(table, id) {
  const sheetsCapable = SHEETS_URL && SHEET_TABLES.includes(table);

  if (!sheetsCapable) {
    if (sb) sbDelete(table, id);
    return;
  }

  if (backendMode === 'sheets') {
    sheetsDelete(table, id);
  } else {
    pushRetry({ type: 'delete', table, column: 'id', value: id, target: 'sheets' });
  }
  sbDeleteSafe(table, id);
}

function cloudDeleteWhere(table, column, value) {
  const sheetsCapable = SHEETS_URL && SHEET_TABLES.includes(table);

  if (!sheetsCapable) {
    if (sb) sbDeleteWhere(table, column, value);
    return;
  }

  if (backendMode === 'sheets') {
    sheetsDeleteWhere(table, column, value);
  } else {
    pushRetry({ type: 'deleteWhere', table, column, value, target: 'sheets' });
  }
  sbDeleteWhereSafe(table, column, value);
}

async function cloudSyncContainerItems(containerId, newItems) {
  const cleanItems = normalizeEntityRows('items', newItems);
  if (backendMode === 'sheets') {
    await sheetsMirrorItems(containerId, cleanItems);
  } else {
    pushRetry({ type: 'deleteWhere', table: 'items', column: 'container_id', value: containerId, target: 'sheets' });
    if (cleanItems.length) pushRetry({ type: 'upsert', table: 'items', record: cleanItems, target: 'sheets' });
  }
  sbSyncContainerItems(containerId, cleanItems);
}

// ---- Sheets: escritura primaria (awaited, con retry propio si falla) ----
async function sheetsUpsert(table, records) {
  if (!SHEETS_URL) return;
  try {
    await Sheets.upsert(table, records);
  } catch (e) {
    console.warn(`Maestro de Costo: Sheets upsert falló en ${table}, encolando retry:`, e.message);
    pushRetry({ type: 'upsert', table, record: records, target: 'sheets' });
  }
}

async function sheetsDelete(table, id) {
  if (!SHEETS_URL) return;
  try {
    await Sheets.remove(table, id);
  } catch (e) {
    console.warn(`Maestro de Costo: Sheets delete falló en ${table}, encolando retry:`, e.message);
    pushRetry({ type: 'delete', table, column: 'id', value: id, target: 'sheets' });
  }
}

async function sheetsDeleteWhere(table, column, value) {
  if (!SHEETS_URL) return;
  try {
    await Sheets.removeWhere(table, column, value);
  } catch (e) {
    console.warn(`Maestro de Costo: Sheets deleteWhere falló en ${table}, encolando retry:`, e.message);
    pushRetry({ type: 'deleteWhere', table, column, value, target: 'sheets' });
  }
}

// ---- Supabase: espejo best-effort (nunca bloquea la escritura primaria) ----
function sbUpsertSafe(table, records) {
  if (!sb) return;
  sbUpsert(table, records);
}

function sbDeleteSafe(table, id) {
  if (!sb) return;
  sbDelete(table, id);
}

function sbDeleteWhereSafe(table, column, value) {
  if (!sb) return;
  sbDeleteWhere(table, column, value);
}

// ============================================
// Sync bidireccional con la nube (Sheets primario, Supabase respaldo)
// ============================================
async function syncWithCloud() {
  if (!sb && !SHEETS_URL) return;
  try {
    const remoteAll = {};
    const results = await Promise.all(ENTITIES.map(async entity => [entity, await getRemoteTable(entity)]));
    for (const [entity, data] of results) remoteAll[entity] = data;

    const hasRemoteData = ENTITIES.some(e => remoteAll[e].length > 0);

    if (!hasRemoteData) {
      const localAll = {};
      for (const entity of ENTITIES) {
        localAll[entity] = readAll(STORE_KEYS[entity]);
      }
      const hasLocalData = ENTITIES.some(e => localAll[e].length > 0);

      if (hasLocalData) {
        log('BD remota vacía, subiendo datos locales (Sheets + respaldo Supabase)...');
        // Subir en orden (padres antes que hijos) y esperar cada entidad para no romper FKs.
        for (const entity of ENTITIES) {
          if (localAll[entity].length) await cloudUpsert(entity, localAll[entity]);
        }
        log('Datos locales subidos a la nube');
      } else {
        log('Sin datos en ninguna fuente');
      }
      localStorage.setItem('cif_cloud_synced', '1');
      return;
    }

    log(`BD remota tiene datos (${backendMode}), mergeando...`);
    for (const entity of ENTITIES) {
      const local = readAll(STORE_KEYS[entity]);
      const remote = remoteAll[entity];
      let merged = mergeRecords(local, remote);
      merged = normalizeEntityRows(entity, merged);
      writeAll(STORE_KEYS[entity], merged);

      let toUpload = merged.filter(m => {
        const r = remote.find(x => x.id === m.id);
        return !r || new Date(m.updated_at || m.created_at || 0) > new Date(r.updated_at || r.created_at || 0);
      });

      // Items: solo subir los cuyo contenedor ya está en el consenso (nunca FKs colgados).
      if (entity === 'items' && toUpload.length) {
        const okIds = new Set(readAll(STORE_KEYS.containers).map(c => c.id));
        const orphanCount = toUpload.filter(m => m.container_id != null && !okIds.has(m.container_id)).length;
        if (orphanCount) log(`Sync: ${orphanCount} item(s) sin contenedor en la nube, se mantienen locales.`);
        toUpload = toUpload.filter(m => m.container_id == null || okIds.has(m.container_id));
      }

      if (toUpload.length) await cloudUpsert(entity, toUpload);
    }

    localStorage.setItem('cif_cloud_synced', '1');
    log('Sync completado');
  } catch (e) {
    console.error('Maestro de Costo: Error en sync:', e.message);
  }
}

// ============================================
// Espejo inicial: siembra el respaldo de Sheets
// una sola vez. El doble-espejo diario mantiene
// Sheets al día, así que el espejo completo no
// se repite en cada apertura (evita latencia).
// ============================================
const SHEETS_SEEDED_KEY = 'cif_sheets_seeded';

async function mirrorAllToSheets() {
  if (!SHEETS_URL) return;
  if (localStorage.getItem(SHEETS_SEEDED_KEY)) return;
  for (const entity of ENTITIES) {
    if (!SHEET_TABLES.includes(entity)) continue;
    try {
      const local = readAll(STORE_KEYS[entity]);
      if (!local.length) continue;
      const remote = await Sheets.select(entity);
      const remoteMap = new Map(remote.map(r => [r.id, r]));
      const toPush = local.filter(r => {
        const ex = remoteMap.get(r.id);
        if (!ex) return true;
        return new Date(r.updated_at || r.created_at || 0) > new Date(ex.updated_at || ex.created_at || 0);
      });
      if (toPush.length) {
        await Sheets.upsert(entity, toPush);
        log(`Respaldo Sheets: ${entity} sincronizado (${toPush.length} filas)`);
      }
    } catch (err) {
      console.warn(`Maestro de Costo: respaldo Sheets (${entity}) falló en el espejo inicial:`, err.message);
    }
  }
  localStorage.setItem(SHEETS_SEEDED_KEY, '1');
}

// ============================================
// Seed
// ============================================
let seedDone = false;

function seed() {
  if (!localStorage.getItem(STORE_KEYS.companies)) writeAll(STORE_KEYS.companies, []);
  if (!localStorage.getItem(STORE_KEYS.suppliers)) writeAll(STORE_KEYS.suppliers, []);
  if (!localStorage.getItem(STORE_KEYS.containers)) writeAll(STORE_KEYS.containers, []);
  if (!localStorage.getItem(STORE_KEYS.items)) writeAll(STORE_KEYS.items, []);
  if (!localStorage.getItem(STORE_KEYS.products)) writeAll(STORE_KEYS.products, []);
  if (!localStorage.getItem(STORE_KEYS.accounts)) writeAll(STORE_KEYS.accounts, []);
  if (!localStorage.getItem(STORE_KEYS.movements)) writeAll(STORE_KEYS.movements, []);
  if (!localStorage.getItem(STORE_KEYS.journal_entries)) writeAll(STORE_KEYS.journal_entries, []);
  if (!localStorage.getItem(STORE_KEYS.journal_lines)) writeAll(STORE_KEYS.journal_lines, []);
  if (!localStorage.getItem(STORE_KEYS.accounting_settings)) writeAll(STORE_KEYS.accounting_settings, []);
  if (!localStorage.getItem(STORE_KEYS.expense_categories)) writeAll(STORE_KEYS.expense_categories, []);
  if (!localStorage.getItem(STORE_KEYS.sale_concepts)) writeAll(STORE_KEYS.sale_concepts, []);
  if (!localStorage.getItem(STORE_KEYS.module_settings)) writeAll(STORE_KEYS.module_settings, []);
  if (!localStorage.getItem(STORE_KEYS.contacts)) writeAll(STORE_KEYS.contacts, []);
  if (!localStorage.getItem(STORE_KEYS.quotes)) writeAll(STORE_KEYS.quotes, []);

  purgeDroppedColumns();
  localStorage.setItem(RETRY_KEY, JSON.stringify(getRetryQueue()));

  if (!seedDone) {
    seedDone = true;
    // El primer render no espera a la nube: se pinta de inmediato con lo que
    // ya hay en localStorage, y la sincronización corre en segundo plano.
    // Al terminar, se avisa con un evento para que la vista activa se refresque sola.
    syncWithCloud().then(() => {
      setTimeout(() => {
        mirrorAllToSheets();
        processRetryQueue();
      }, 300);
      notifyDataUpdated();
    }).catch(() => { /* los errores ya quedan registrados dentro de syncWithCloud */ });
  }
  return Promise.resolve();
}

function notifyDataUpdated() {
  try {
    window.dispatchEvent(new CustomEvent('cif-data-updated'));
  } catch (e) { /* noop */ }
}

// ============================================
// Store API
// ============================================
const Store = {
  uid,
  seed,
  syncWithCloud,
  processRetryQueue,
  getBackend,

  getAll(key) { return readAll(STORE_KEYS[key]); },

  getById(entity, id) {
    return readAll(STORE_KEYS[entity]).find(x => x.id === id) || null;
  },

  insert(entity, record) {
    const list = readAll(STORE_KEYS[entity]);
    const ts = now();
    const rec = { ...record, id: record.id || uid(), created_at: record.created_at || ts, updated_at: ts };
    list.push(rec);
    writeAll(STORE_KEYS[entity], list);
    cloudUpsert(entity, rec);
    return rec;
  },

  update(entity, record) {
    let list = readAll(STORE_KEYS[entity]);
    const ts = now();
    list = list.map(x => (x.id === record.id ? { ...x, ...record, updated_at: ts } : x));
    writeAll(STORE_KEYS[entity], list);
    cloudUpsert(entity, { ...record, updated_at: ts });
    return { ...record, updated_at: ts };
  },

  upsert(entity, record) {
    if (record.id && readAll(STORE_KEYS[entity]).some(x => x.id === record.id)) {
      return this.update(entity, record);
    }
    return this.insert(entity, record);
  },

  remove(entity, id) {
    const list = readAll(STORE_KEYS[entity]);
    writeAll(STORE_KEYS[entity], list.filter(x => x.id !== id));
    cloudDelete(entity, id);
  },

  async saveContainerWithItems(container, items) {
    const prev = container.id ? readAll(STORE_KEYS.containers).find(x => x.id === container.id) : null;
    const prevStatus = prev ? prev.status : null;
    // La pantalla guarda su propia copia del contenedor; nunca debe pisar un
    // inventory_posted ya en true (si no, al reabrirlo se volvería a sumar el stock).
    if (prev && prev.inventory_posted) container = { ...container, inventory_posted: true };

    let c;
    if (container.id && readAll(STORE_KEYS.containers).some(x => x.id === container.id)) {
      c = this.update('containers', container);
    } else {
      c = this.insert('containers', container);
    }
    const remaining = readAll(STORE_KEYS.items).filter(it => it.container_id !== c.id);
    const ts = now();
    const newItems = items.map(it => ({ ...it, container_id: c.id, id: it.id || uid(), updated_at: ts }));
    writeAll(STORE_KEYS.items, [...remaining, ...newItems]);
    // Esperar el upsert del contenedor antes de los items para no romper el FK.
    await cloudUpsert('containers', c);
    await cloudSyncContainerItems(c.id, newItems);

    if (prevStatus !== 'closed' && c.status === 'closed') {
      this.generateClosingEntryForContainer(c, newItems);
    }

    return { container: c, items: newItems };
  },

  // Al completar un contenedor pasan 2 cosas independientes, cada una con su
  // propio guard de idempotencia — el inventario debe llenarse de stock
  // aunque el mapeo contable todavía no esté configurado (son cosas
  // separadas: la mercancía sí llegó, haya o no asiento contable todavía).
  // Nunca lanzan: un error aquí no debe romper el guardado del contenedor.
  generateClosingEntryForContainer(container, items) {
    this.postInventoryForContainer(container, items);
    this.postClosingJournalForContainer(container, items);
  },

  // Entrada de inventario: solo ítems vinculados a un producto del catálogo
  // (costNoVat porque el IVA se mapea aparte a una cuenta de IVA acreditable,
  // no forma parte del costo de inventario) — mismo promedio ponderado que
  // usa la Recepción manual de Inventario. Se guarda con container.inventory_posted
  // para no duplicar el stock si se vuelve a intentar el asiento contable después.
  postInventoryForContainer(container, items) {
    try {
      if (container.inventory_posted) return;
      const { calculated } = computeContainer(container, items);
      for (const c of calculated) {
        if (!c.item.product_id || c.qty <= 0) continue;
        const product = this.getById('products', c.item.product_id);
        if (!product) continue;
        const prevQty = Number(product.stock) || 0;
        const prevCost = Number(product.avg_cost) || 0;
        const newQty = prevQty + c.qty;
        const newAvgCost = newQty > 0 ? ((prevQty * prevCost) + (c.qty * c.costNoVat)) / newQty : 0;
        this.update('products', { id: product.id, stock: newQty, avg_cost: Math.round(newAvgCost * 100) / 100 });
      }
      this.update('containers', { id: container.id, inventory_posted: true });
    } catch (e) {
      console.error('Maestro de Costo: error registrando el inventario del contenedor (el contenedor se guardó igual).', e);
    }
  },

  // Asiento contable de cierre — requiere el mapeo de Contabilidad > Cuentas
  // completo. Si falta, no bloquea nada (el inventario ya se registró arriba);
  // queda pendiente y se puede reintentar llamando este método de nuevo una
  // vez el mapeo esté listo (p. ej. desde un botón "Generar asiento" en la
  // Calculadora para contenedores ya cerrados sin asiento todavía).
  postClosingJournalForContainer(container, items) {
    try {
      const already = readAll(STORE_KEYS.movements)
        .some(m => m.source === 'container_close' && m.source_ref === container.id);
      if (already) return { ok: true, already: true };

      const { summary } = computeContainer(container, items);
      if (!summary.landed || summary.landed <= 0) return { ok: false, reason: 'sin-landed' };

      const mapping = this.getAccountMapping();
      if (!isClosingMappingComplete(mapping)) {
        console.warn('Maestro de Costo: no se generó el asiento de cierre — falta configurar el mapeo contable en Contabilidad > Cuentas.');
        return { ok: false, reason: 'mapeo-incompleto' };
      }

      const accountsById = this.getAccountsById();
      const lines = buildContainerClosingLines(container, summary, mapping, accountsById);
      if (lines.length === 0) return { ok: false, reason: 'sin-lineas' };

      const diffAccount = readAll(STORE_KEYS.accounts).find(a => a.codigo === '6.9.01.01');
      const finalLines = withRoundingPlug(lines, diffAccount, container.operation_date, lines[0].ref_doc);
      this.postJournalRows(finalLines, { source: 'container_close', sourceRef: container.id });
      return { ok: true };
    } catch (e) {
      console.error('Maestro de Costo: error generando asiento de cierre (el contenedor se guardó igual).', e);
      return { ok: false, reason: 'error' };
    }
  },

  hasClosingJournal(containerId) {
    return readAll(STORE_KEYS.movements).some(m => m.source === 'container_close' && m.source_ref === containerId);
  },

  getItemsByContainer(containerId) {
    return readAll(STORE_KEYS.items).filter(it => it.container_id === containerId);
  },

  getItemsByContainerMap() {
    const allItems = readAll(STORE_KEYS.items);
    const map = new Map();
    for (const item of allItems) {
      const cid = item.container_id;
      if (!map.has(cid)) map.set(cid, []);
      map.get(cid).push(item);
    }
    return map;
  },

  removeContainer(id) {
    this.remove('containers', id);
    const items = readAll(STORE_KEYS.items).filter(it => it.container_id !== id);
    writeAll(STORE_KEYS.items, items);
    cloudDeleteWhere('items', 'container_id', id);
  },

  newContainer() {
    return this.insert('containers', {
      company_id: null,
      bl_number: '',
      operation_date: new Date().toISOString().slice(0, 10),
      container_capacity: 33,
      container_max_weight: 28200,
      insurance_rate: 0,
      insurance_enabled: true,
      port_fee_rate: 0,
      vat_rate: 16,
      ocean_freight: 0,
      inland_freight: 0,
      customs_expenses: 0,
      customs_broker_fee: 0,
      op_expenses: 0,
      status: 'draft',
      inventory_posted: false
    });
  },

  newItem(containerId) {
    return this.insert('items', {
      container_id: containerId,
      product_id: null,
      supplier_id: null,
      origin_country: '',
      sku: '',
      sku_briggs: '',
      name: '',
      qty: 0,
      units_per_box: 1,
      box_volume: 0,
      weight_kg: 0,
      fob_unit: 0,
      hs_code: '',
      tariff_rate: 0,
      gain_margin: 0
    });
  },

  productFromMaster(containerId, product, overrides = {}) {
    return this.insert('items', {
      container_id: containerId,
      product_id: product.id,
      supplier_id: product.supplier_id,
      origin_country: product.origin_country,
      sku: product.sku,
      sku_briggs: product.sku_briggs,
      name: product.name,
      qty: Number(overrides.qty != null ? overrides.qty : product.qty) || 0,
      units_per_box: Number(product.units_per_box) || 1,
      box_volume: Number(product.box_volume) || 0,
      weight_kg: Number(product.weight_kg) || 0,
      fob_unit: Number(overrides.fob_unit != null ? overrides.fob_unit : product.fob_unit) || 0,
      hs_code: overrides.hs_code != null ? overrides.hs_code : (product.hs_code || ''),
      tariff_rate: Number(overrides.tariff_rate != null ? overrides.tariff_rate : product.tariff_rate) || 0,
      gain_margin: Number(overrides.gain_margin != null ? overrides.gain_margin : product.gain_margin) || 0
    });
  },

  newProduct() {
    return {
      id: uid(),
      sku_briggs: '',
      sku: '',
      name: '',
      supplier_id: null,
      origin_country: '',
      brand: '',
      collection: '',
      category: '',
      color: '',
      foto_url: '',
      foto_file_id: '',
      units_per_box: 1,
      box_volume: 0,
      weight_kg: 0,
      hs_code: '',
      fob_unit: 0,
      tariff_rate: 0,
      stock: 0,
      avg_cost: 0
    };
  },

  isSkuBriggsUnique(skuBriggs, excludeId = null) {
    const normalized = String(skuBriggs || '').trim().toLowerCase();
    if (!normalized) return true;
    return !readAll(STORE_KEYS.products).some(p =>
      p.id !== excludeId && String(p.sku_briggs || '').trim().toLowerCase() === normalized
    );
  },

  // ============================================
  // Contabilidad — plan de cuentas unificado (estilo LegalYa) + diario plano
  // ============================================
  isAccountCodigoUnique(codigo, excludeId = null) {
    const normalized = String(codigo || '').trim();
    if (!normalized) return true;
    return !readAll(STORE_KEYS.accounts).some(a =>
      a.id !== excludeId && String(a.codigo || '').trim() === normalized
    );
  },

  getAccountsById() {
    return new Map(readAll(STORE_KEYS.accounts).map(a => [a.id, a]));
  },

  // Diario plano: cada fila es una línea de Debe o Haber, sin encabezado de asiento.
  // Las filas de un mismo evento se correlacionan solo por ref_doc (igual que LegalYa).
  // lines = [{ entry_date, codigo_cuenta, cuenta_contable, concepto, debit, credit, ref_doc, entidad }, ...]
  // opts = { source, sourceRef } — para marcar asientos autogenerados (p. ej. cierre de contenedor).
  postJournalRows(lines, opts = {}) {
    const ts = now();
    const rows = lines.map(l => ({
      id: uid(),
      entry_date: l.entry_date,
      codigo_cuenta: l.codigo_cuenta || '',
      cuenta_contable: l.cuenta_contable || '',
      concepto: l.concepto || '',
      debit: Math.round((Number(l.debit) || 0) * 100) / 100,
      credit: Math.round((Number(l.credit) || 0) * 100) / 100,
      ref_doc: l.ref_doc || '',
      entidad: l.entidad || '',
      cantidad: Number(l.cantidad) || 0,
      unidad: l.unidad || 'monto',
      precio_venta: Math.round((Number(l.precio_venta) || 0) * 100) / 100,
      codigo_barra: l.codigo_barra || '',
      source: opts.source || 'manual',
      source_ref: opts.sourceRef || null,
      created_at: ts,
      updated_at: ts
    }));
    const existing = readAll(STORE_KEYS.movements);
    writeAll(STORE_KEYS.movements, [...existing, ...rows]);
    cloudUpsert('movements', rows);
    return { ok: true, lines: rows };
  },

  removeJournalRowsByRef(refDoc) {
    const remaining = readAll(STORE_KEYS.movements).filter(m => m.ref_doc !== refDoc);
    writeAll(STORE_KEYS.movements, remaining);
    cloudDeleteWhere('movements', 'ref_doc', refDoc);
    return { ok: true };
  },

  // Fila única de configuración (id fijo 'default'), excepción documentada al uso normal de uuid.
  // Mapeo de cuentas para el asiento automático de cierre de contenedores — sin relación con el
  // catálogo unificado más allá de que ahora apunta a cuentas de ese mismo catálogo.
  // Lo guardado en Cuentas, completado campo por campo con el mapeo por
  // defecto del catálogo sugerido (ver DEFAULT_CLOSING_MAPPING_CODES).
  getAccountMapping() {
    return resolveClosingMapping(this.getById('accounting_settings', 'default'), readAll(STORE_KEYS.accounts));
  },

  saveAccountMapping(map) {
    return this.upsert('accounting_settings', { ...map, id: 'default' });
  },

  // ============================================
  // Contactos — directorio único de clientes/proveedores (CRM)
  // ============================================
  isContactRifUnique(rif, excludeId = null) {
    const normalized = String(rif || '').trim().toLowerCase();
    if (!normalized) return true;
    return !readAll(STORE_KEYS.contacts).some(c =>
      c.id !== excludeId && String(c.rif || '').trim().toLowerCase() === normalized
    );
  },

  newContact(overrides = {}) {
    return {
      rif: '', name: '', type: 'cliente', email: '', phone: '', address: '',
      ...overrides
    };
  },

  // ============================================
  // Presupuestos — cotizaciones para ventas al mayor, sin impacto contable
  // hasta que se confirman (ver "Convertir en Venta" en js/pages/quotes.js).
  // items se guarda siempre como string JSON (no array vivo) para que no
  // haya diferencia entre lo que trae localStorage y lo que vuelve de Sheets.
  // ============================================
  newQuote(overrides = {}) {
    return {
      quote_number: `COT-${Date.now().toString().slice(-6)}`,
      date: new Date().toISOString().slice(0, 10),
      contact_id: '', contact_name: '', concepto: '',
      items: '[]', total: 0, status: 'pendiente', converted_ref: '',
      ...overrides
    };
  },

  getQuoteItems(quote) {
    try {
      const parsed = JSON.parse(quote.items || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
};

export default Store;