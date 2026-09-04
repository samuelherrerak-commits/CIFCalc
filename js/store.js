import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

// ============================================
// Supabase client (singleton)
// ============================================
let sb = null;
try {
  if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.warn('CIFCalc: No se pudo conectar a Supabase, usando localStorage.', e.message);
}

const log = (msg) => console.log(`CIFCalc: ${msg}`);

// ============================================
// localStorage helpers
// ============================================
const STORE_KEYS = {
  companies: 'cif_companies',
  suppliers: 'cif_suppliers',
  containers: 'cif_containers',
  items: 'cif_items'
};

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
// Merge: combines local + remote, keeps newest
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
// Retry queue for failed Supabase operations
// ============================================
const RETRY_KEY = 'cif_retry_queue';
const MAX_RETRIES = 5;

function getRetryQueue() {
  try {
    const raw = localStorage.getItem(RETRY_KEY);
    return raw ? JSON.parse(raw) : [];
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
  if (!sb) return;
  const queue = getRetryQueue();
  if (queue.length === 0) return;
  const remaining = [];
  for (const op of queue) {
    try {
      op.attempts++;
      if (op.type === 'upsert') {
        const records = Array.isArray(op.record) ? op.record : [op.record];
        const { error } = await sb.from(op.table).upsert(records, { onConflict: 'id' });
        if (error) throw error;
      } else if (op.type === 'delete') {
        const { error } = await sb.from(op.table).delete().eq(op.column, op.value);
        if (error) throw error;
      }
    } catch (e) {
      console.warn(`CIFCalc: retry #${op.attempts} fallo para ${op.type} en ${op.table}:`, e.message);
      if (op.attempts < MAX_RETRIES) remaining.push(op);
    }
  }
  localStorage.setItem(RETRY_KEY, JSON.stringify(remaining));
}

// ============================================
// Supabase sync helpers (background)
// ============================================
async function sbUpsert(table, record) {
  if (!sb) return;
  try {
    const records = Array.isArray(record) ? record : [record];
    const { error } = await sb.from(table).upsert(records, { onConflict: 'id' });
    if (error) throw error;
  } catch (e) {
    console.warn(`CIFCalc: sync upsert fallo en ${table}, encolando retry:`, e.message);
    pushRetry({ type: 'upsert', table, record });
  }
}

async function sbDelete(table, id) {
  if (!sb) return;
  try {
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) throw error;
  } catch (e) {
    console.warn(`CIFCalc: sync delete fallo en ${table}, encolando retry:`, e.message);
    pushRetry({ type: 'delete', table, column: 'id', value: id });
  }
}

async function sbDeleteWhere(table, column, value) {
  if (!sb) return;
  try {
    const { error } = await sb.from(table).delete().eq(column, value);
    if (error) throw error;
  } catch (e) {
    console.warn(`CIFCalc: sync deleteWhere fallo en ${table}, encolando retry:`, e.message);
    pushRetry({ type: 'delete', table, column, value });
  }
}

async function sbSelect(table, filters = {}) {
  if (!sb) return [];
  try {
    let q = sb.from(table).select('*');
    for (const [col, val] of Object.entries(filters)) {
      q = q.eq(col, val);
    }
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn(`CIFCalc: sync select fallo en ${table}:`, e.message);
    return [];
  }
}

// Atomic per-container item sync with generation counter
const _syncGeneration = new Map();

async function sbSyncContainerItems(containerId, newItems) {
  if (!sb) return;
  const gen = (_syncGeneration.get(containerId) || 0) + 1;
  _syncGeneration.set(containerId, gen);
  try {
    await sb.from('items').delete().eq('container_id', containerId);
    if (_syncGeneration.get(containerId) !== gen) return;
    if (newItems.length) {
      const { error } = await sb.from('items').upsert(newItems, { onConflict: 'id' });
      if (error) throw error;
    }
  } catch (e) {
    console.warn(`CIFCalc: sync container items fallo:`, e.message);
    pushRetry({ type: 'upsert', table: 'items', record: newItems });
  }
}

// ============================================
// Bidirectional sync with cloud
// ============================================
const ENTITIES = ['companies', 'suppliers', 'containers', 'items'];

async function syncWithCloud() {
  if (!sb) return;
  try {
    const remoteAll = {};
    for (const entity of ENTITIES) {
      remoteAll[entity] = await sbSelect(entity);
    }

    const hasRemoteData = ENTITIES.some(e => remoteAll[e].length > 0);

    if (!hasRemoteData) {
      const localAll = {};
      for (const entity of ENTITIES) {
        localAll[entity] = readAll(STORE_KEYS[entity]);
      }
      const hasLocalData = ENTITIES.some(e => localAll[e].length > 0);

      if (hasLocalData) {
        log('BD remota vacía, subiendo datos locales...');
        for (const entity of ENTITIES) {
          if (localAll[entity].length) await sbUpsert(entity, localAll[entity]);
        }
        log('Datos locales subidos a la nube');
      } else {
        log('Sin datos en ninguna fuente');
      }
      localStorage.setItem('cif_cloud_synced', '1');
      return;
    }

    log('BD remota tiene datos, mergeando...');
    for (const entity of ENTITIES) {
      const local = readAll(STORE_KEYS[entity]);
      const remote = remoteAll[entity];
      const merged = mergeRecords(local, remote);
      writeAll(STORE_KEYS[entity], merged);

      const toUpload = merged.filter(m => {
        const r = remote.find(x => x.id === m.id);
        return !r || new Date(m.updated_at || m.created_at || 0) > new Date(r.updated_at || r.created_at || 0);
      });
      if (toUpload.length) await sbUpsert(entity, toUpload);
    }

    localStorage.setItem('cif_cloud_synced', '1');
    log('Sync completado');
  } catch (e) {
    console.error('CIFCalc: Error en sync:', e.message);
  }
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

  if (!seedDone) {
    seedDone = true;
    return syncWithCloud().then(() => processRetryQueue());
  }
  return Promise.resolve();
}

// ============================================
// Store API
// ============================================
const Store = {
  uid,
  seed,
  syncWithCloud,
  processRetryQueue,

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
    sbUpsert(STORE_KEYS[entity], rec);
    return rec;
  },

  update(entity, record) {
    let list = readAll(STORE_KEYS[entity]);
    const ts = now();
    list = list.map(x => (x.id === record.id ? { ...x, ...record, updated_at: ts } : x));
    writeAll(STORE_KEYS[entity], list);
    sbUpsert(STORE_KEYS[entity], { ...record, updated_at: ts });
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
    sbDelete(STORE_KEYS[entity], id);
  },

  saveContainerWithItems(container, items) {
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
    sbUpsert('containers', c);
    sbSyncContainerItems(c.id, newItems);
    return { container: c, items: newItems };
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
    sbDeleteWhere('items', 'container_id', id);
  },

  newContainer() {
    return this.insert('containers', {
      company_id: null,
      bl_number: '',
      operation_date: new Date().toISOString().slice(0, 10),
      container_capacity: 33,
      insurance_rate: 0,
      insurance_enabled: true,
      port_fee_rate: 0,
      vat_rate: 16,
      ocean_freight: 0,
      inland_freight: 0,
      customs_expenses: 0,
      customs_broker_fee: 0,
      op_expenses: 0,
      status: 'draft'
    });
  },

  newItem(containerId) {
    return this.insert('items', {
      container_id: containerId,
      supplier_id: null,
      origin_country: '',
      sku: '',
      name: '',
      qty: 0,
      units_per_box: 1,
      box_volume: 0,
      fob_unit: 0,
      hs_code: '',
      tariff_rate: 0,
      gain_margin: 0
    });
  }
};

export default Store;
