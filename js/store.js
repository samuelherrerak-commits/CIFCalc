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
// localStorage helpers (sin cambios)
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

// ============================================
// Supabase sync helpers (background)
// ============================================
async function sbUpsert(table, record) {
  if (!sb) return;
  try {
    await sb.from(table).upsert(record, { onConflict: 'id' });
  } catch (e) {
    console.warn(`CIFCalc: sync upsert fallo en ${table}:`, e.message);
  }
}

async function sbDelete(table, id) {
  if (!sb) return;
  try {
    await sb.from(table).delete().eq('id', id);
  } catch (e) {
    console.warn(`CIFCalc: sync delete fallo en ${table}:`, e.message);
  }
}

async function sbDeleteWhere(table, column, value) {
  if (!sb) return;
  try {
    await sb.from(table).delete().eq(column, value);
  } catch (e) {
    console.warn(`CIFCalc: sync deleteWhere fallo en ${table}:`, e.message);
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

// ============================================
// Seed + Migración automática
// ============================================
let seedDone = false;

async function migrateLocalToCloud() {
  if (!sb) return;
  try {
    // Verificar si la BD ya tiene datos
    const existing = await sbSelect('containers');
    if (existing.length > 0) {
      log('BD remota tiene datos, usando Supabase como fuente');
      // Descargar datos de Supabase y copiar a localStorage
      const remoteCompanies = await sbSelect('companies');
      const remoteSuppliers = await sbSelect('suppliers');
      const remoteContainers = await sbSelect('containers');
      const remoteItems = await sbSelect('items');
      if (remoteCompanies.length) writeAll(STORE_KEYS.companies, remoteCompanies);
      if (remoteSuppliers.length) writeAll(STORE_KEYS.suppliers, remoteSuppliers);
      if (remoteContainers.length) writeAll(STORE_KEYS.containers, remoteContainers);
      if (remoteItems.length) writeAll(STORE_KEYS.items, remoteItems);
      localStorage.setItem('cif_cloud_synced', '1');
      return;
    }

    // BD vacía, migrar datos locales a la nube
    const localCompanies = readAll(STORE_KEYS.companies);
    const localSuppliers = readAll(STORE_KEYS.suppliers);
    const localContainers = readAll(STORE_KEYS.containers);
    const localItems = readAll(STORE_KEYS.items);

    if (localCompanies.length || localSuppliers.length || localContainers.length || localItems.length) {
      log('Migrando datos locales a la nube...');
      if (localCompanies.length) await sb.from('companies').upsert(localCompanies, { onConflict: 'id' });
      if (localSuppliers.length) await sb.from('suppliers').upsert(localSuppliers, { onConflict: 'id' });
      if (localContainers.length) await sb.from('containers').upsert(localContainers, { onConflict: 'id' });
      if (localItems.length) await sb.from('items').upsert(localItems, { onConflict: 'id' });
      localStorage.setItem('cif_cloud_synced', '1');
      log(`${localCompanies.length} compañías, ${localSuppliers.length} proveedores, ${localContainers.length} contenedores, ${localItems.length} items migrados a la nube`);
    } else {
      log('Sin datos locales, nada que migrar');
      localStorage.setItem('cif_cloud_synced', '1');
    }
  } catch (e) {
    console.error('CIFCalc: Error en migración:', e.message);
  }
}

function seed() {
  if (!localStorage.getItem(STORE_KEYS.companies)) writeAll(STORE_KEYS.companies, []);
  if (!localStorage.getItem(STORE_KEYS.suppliers)) writeAll(STORE_KEYS.suppliers, []);
  if (!localStorage.getItem(STORE_KEYS.containers)) writeAll(STORE_KEYS.containers, []);
  if (!localStorage.getItem(STORE_KEYS.items)) writeAll(STORE_KEYS.items, []);

  // Migración a Supabase (solo una vez)
  if (!seedDone) {
    seedDone = true;
    migrateLocalToCloud();
  }
}

// ============================================
// Store API (sin cambios en firma ni comportamiento)
// ============================================
const Store = {
  uid,
  seed,

  getAll(key) { return readAll(STORE_KEYS[key]); },

  getById(entity, id) {
    return readAll(STORE_KEYS[entity]).find(x => x.id === id) || null;
  },

  insert(entity, record) {
    const list = readAll(STORE_KEYS[entity]);
    const rec = { ...record, id: record.id || uid(), created_at: new Date().toISOString() };
    list.push(rec);
    writeAll(STORE_KEYS[entity], list);
    // Sync a Supabase en background
    sbUpsert(STORE_KEYS[entity], rec);
    return rec;
  },

  update(entity, record) {
    let list = readAll(STORE_KEYS[entity]);
    list = list.map(x => (x.id === record.id ? { ...x, ...record } : x));
    writeAll(STORE_KEYS[entity], list);
    // Sync a Supabase en background
    sbUpsert(STORE_KEYS[entity], record);
    return record;
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
    // Sync a Supabase en background
    sbDelete(STORE_KEYS[entity], id);
  },

  // Containers con sus items (patrón crítico)
  saveContainerWithItems(container, items) {
    let c;
    if (container.id && readAll(STORE_KEYS.containers).some(x => x.id === container.id)) {
      c = this.update('containers', container);
    } else {
      c = this.insert('containers', container);
    }
    // Guardar items: eliminar items previos del contenedor y reinsertar
    const remaining = readAll(STORE_KEYS.items).filter(it => it.container_id !== c.id);
    const newItems = items.map(it => ({ ...it, container_id: c.id, id: it.id || uid() }));
    writeAll(STORE_KEYS.items, [...remaining, ...newItems]);
    // Sync a Supabase en background
    sbUpsert('containers', c);
    sbDeleteWhere('items', 'container_id', c.id).then(() => {
      if (newItems.length) sb.from('items').upsert(newItems, { onConflict: 'id' });
    });
    return { container: c, items: newItems };
  },

  getItemsByContainer(containerId) {
    return readAll(STORE_KEYS.items).filter(it => it.container_id === containerId);
  },

  removeContainer(id) {
    this.remove('containers', id);
    const items = readAll(STORE_KEYS.items).filter(it => it.container_id !== id);
    writeAll(STORE_KEYS.items, items);
    // Sync a Supabase en background
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
