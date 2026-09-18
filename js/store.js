import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
import { computeContainer } from './utils.js';
import { validateJournalBalance, buildContainerClosingLines, isClosingMappingComplete } from './accounting.js';

// ============================================
// Supabase client (singleton)
// ============================================
let sb = null;
try {
  if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.warn('Maestro de Costo: No se pudo conectar a Supabase, usando localStorage.', e.message);
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
  journal_entries: 'cif_journal_entries',
  journal_lines: 'cif_journal_lines',
  accounting_settings: 'cif_accounting_settings',
  expense_categories: 'cif_expense_categories',
  sale_concepts: 'cif_sale_concepts',
  module_settings: 'cif_module_settings'
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
      console.warn(`Maestro de Costo: retry #${op.attempts} fallo para ${op.type} en ${op.table}:`, e.message);
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
    console.warn(`Maestro de Costo: sync upsert fallo en ${table}, encolando retry:`, e.message);
    pushRetry({ type: 'upsert', table, record });
  }
}

async function sbDelete(table, id) {
  if (!sb) return;
  try {
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) throw error;
  } catch (e) {
    console.warn(`Maestro de Costo: sync delete fallo en ${table}, encolando retry:`, e.message);
    pushRetry({ type: 'delete', table, column: 'id', value: id });
  }
}

async function sbDeleteWhere(table, column, value) {
  if (!sb) return;
  try {
    const { error } = await sb.from(table).delete().eq(column, value);
    if (error) throw error;
  } catch (e) {
    console.warn(`Maestro de Costo: sync deleteWhere fallo en ${table}, encolando retry:`, e.message);
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
    console.warn(`Maestro de Costo: sync select fallo en ${table}:`, e.message);
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
    console.warn(`Maestro de Costo: sync container items fallo:`, e.message);
    pushRetry({ type: 'upsert', table: 'items', record: newItems });
  }
}

// Atomic per-journal-entry line sync with generation counter (mismo patrón que sbSyncContainerItems)
const _journalSyncGeneration = new Map();

async function sbSyncJournalLines(entryId, newLines) {
  if (!sb) return;
  const gen = (_journalSyncGeneration.get(entryId) || 0) + 1;
  _journalSyncGeneration.set(entryId, gen);
  try {
    await sb.from('journal_lines').delete().eq('entry_id', entryId);
    if (_journalSyncGeneration.get(entryId) !== gen) return;
    if (newLines.length) {
      const { error } = await sb.from('journal_lines').upsert(newLines, { onConflict: 'id' });
      if (error) throw error;
    }
  } catch (e) {
    console.warn(`Maestro de Costo: sync journal lines fallo:`, e.message);
    pushRetry({ type: 'upsert', table: 'journal_lines', record: newLines });
  }
}

// ============================================
// Bidirectional sync with cloud
// ============================================
const ENTITIES = ['companies', 'suppliers', 'containers', 'items', 'products', 'accounts', 'journal_entries', 'journal_lines', 'accounting_settings', 'expense_categories', 'sale_concepts', 'module_settings'];

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
    console.error('Maestro de Costo: Error en sync:', e.message);
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
  if (!localStorage.getItem(STORE_KEYS.products)) writeAll(STORE_KEYS.products, []);
  if (!localStorage.getItem(STORE_KEYS.accounts)) writeAll(STORE_KEYS.accounts, []);
  if (!localStorage.getItem(STORE_KEYS.journal_entries)) writeAll(STORE_KEYS.journal_entries, []);
  if (!localStorage.getItem(STORE_KEYS.journal_lines)) writeAll(STORE_KEYS.journal_lines, []);
  if (!localStorage.getItem(STORE_KEYS.accounting_settings)) writeAll(STORE_KEYS.accounting_settings, []);
  if (!localStorage.getItem(STORE_KEYS.expense_categories)) writeAll(STORE_KEYS.expense_categories, []);
  if (!localStorage.getItem(STORE_KEYS.sale_concepts)) writeAll(STORE_KEYS.sale_concepts, []);
  if (!localStorage.getItem(STORE_KEYS.module_settings)) writeAll(STORE_KEYS.module_settings, []);

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
    sbUpsert(entity, rec);
    return rec;
  },

  update(entity, record) {
    let list = readAll(STORE_KEYS[entity]);
    const ts = now();
    list = list.map(x => (x.id === record.id ? { ...x, ...record, updated_at: ts } : x));
    writeAll(STORE_KEYS[entity], list);
    sbUpsert(entity, { ...record, updated_at: ts });
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
    sbDelete(entity, id);
  },

  saveContainerWithItems(container, items) {
    const prev = container.id ? readAll(STORE_KEYS.containers).find(x => x.id === container.id) : null;
    const prevStatus = prev ? prev.status : null;

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

    if (prevStatus !== 'closed' && c.status === 'closed') {
      this.generateClosingEntryForContainer(c, newItems);
    }

    return { container: c, items: newItems };
  },

  // Genera automáticamente el asiento contable de cierre de un contenedor.
  // Nunca lanza: un error aquí no debe romper el guardado del contenedor.
  generateClosingEntryForContainer(container, items) {
    try {
      const already = readAll(STORE_KEYS.journal_entries)
        .some(e => e.source === 'container_close' && e.source_ref === container.id);
      if (already) return;

      const { summary } = computeContainer(container, items);
      if (!summary.landed || summary.landed <= 0) return;

      const mapping = this.getAccountMapping();
      if (!isClosingMappingComplete(mapping)) {
        console.warn('Maestro de Costo: no se generó el asiento de cierre — falta configurar el mapeo contable en Contabilidad > Cuentas.');
        return;
      }

      const lines = buildContainerClosingLines(container, summary, mapping);
      const check = validateJournalBalance(lines);
      const status = check.balanced ? 'posted' : 'draft';
      if (status === 'draft') {
        console.warn('Maestro de Costo: asiento de cierre generado como borrador (no balanceó). Revísala en el Diario.');
      }

      this.saveJournalEntryWithLines({
        entry_date: container.operation_date,
        description: `Cierre de contenedor ${container.bl_number || container.id}`,
        source: 'container_close',
        source_ref: container.id,
        status
      }, lines);
    } catch (e) {
      console.error('Maestro de Costo: error generando asiento de cierre (el contenedor se guardó igual).', e);
    }
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
      status: 'draft'
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
      units_per_box: 1,
      box_volume: 0,
      weight_kg: 0,
      hs_code: '',
      fob_unit: 0,
      tariff_rate: 0
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
  // Contabilidad (plan de cuentas + asientos)
  // ============================================
  isAccountCodeUnique(code, excludeId = null) {
    const normalized = String(code || '').trim();
    if (!normalized) return true;
    return !readAll(STORE_KEYS.accounts).some(a =>
      a.id !== excludeId && String(a.code || '').trim() === normalized
    );
  },

  getJournalLinesByEntry(entryId) {
    return readAll(STORE_KEYS.journal_lines).filter(l => l.entry_id === entryId);
  },

  // Upsert de la cabecera + reemplazo atómico de sus líneas, análogo a saveContainerWithItems.
  saveJournalEntryWithLines(entry, lines) {
    let e;
    if (entry.id && readAll(STORE_KEYS.journal_entries).some(x => x.id === entry.id)) {
      e = this.update('journal_entries', entry);
    } else {
      e = this.insert('journal_entries', entry);
    }
    const remaining = readAll(STORE_KEYS.journal_lines).filter(l => l.entry_id !== e.id);
    const ts = now();
    const newLines = lines.map((l, i) => ({ ...l, entry_id: e.id, id: l.id || uid(), line_order: i, updated_at: ts }));
    writeAll(STORE_KEYS.journal_lines, [...remaining, ...newLines]);
    sbUpsert('journal_entries', e);
    sbSyncJournalLines(e.id, newLines);
    return { entry: e, lines: newLines };
  },

  // Marca un asiento como contabilizado (inmutable). Vuelve a validar el balance en el Store,
  // sin confiar en el estado de la UI. Idempotente si ya estaba posted.
  postJournalEntry(entryId) {
    const entry = this.getById('journal_entries', entryId);
    if (!entry) return { ok: false, error: 'El asiento no existe.' };
    if (entry.status === 'posted') return { ok: true, entry };
    const lines = this.getJournalLinesByEntry(entryId);
    const check = validateJournalBalance(lines);
    if (!check.balanced) return { ok: false, error: check.reason };
    return { ok: true, entry: this.update('journal_entries', { id: entryId, status: 'posted' }) };
  },

  removeJournalEntry(id) {
    const entry = this.getById('journal_entries', id);
    if (entry && entry.status === 'posted') {
      return { ok: false, error: 'No se puede eliminar un asiento contabilizado.' };
    }
    this.remove('journal_entries', id);
    const remaining = readAll(STORE_KEYS.journal_lines).filter(l => l.entry_id !== id);
    writeAll(STORE_KEYS.journal_lines, remaining);
    sbDeleteWhere('journal_lines', 'entry_id', id);
    return { ok: true };
  },

  // Fila única de configuración (id fijo 'default'), excepción documentada al uso normal de uuid.
  getAccountMapping() {
    return this.getById('accounting_settings', 'default');
  },

  saveAccountMapping(map) {
    return this.upsert('accounting_settings', { ...map, id: 'default' });
  },

  // Configuración de los módulos de Ventas/Gastos (tasa de IVA + cuenta de IVA), una fila por módulo
  // con id fijo ('sales_module' / 'expense_module'), mismo patrón de fila única que getAccountMapping.
  getModuleSettings(moduleId) {
    return this.getById('module_settings', moduleId);
  },

  saveModuleSettings(moduleId, data) {
    return this.upsert('module_settings', { ...data, id: moduleId });
  }
};

export default Store;
