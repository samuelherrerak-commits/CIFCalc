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

function seed() {
  if (!localStorage.getItem(STORE_KEYS.companies)) writeAll(STORE_KEYS.companies, []);
  if (!localStorage.getItem(STORE_KEYS.suppliers)) writeAll(STORE_KEYS.suppliers, []);
  if (!localStorage.getItem(STORE_KEYS.containers)) writeAll(STORE_KEYS.containers, []);
  if (!localStorage.getItem(STORE_KEYS.items)) writeAll(STORE_KEYS.items, []);
}

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
    return rec;
  },

  update(entity, record) {
    let list = readAll(STORE_KEYS[entity]);
    list = list.map(x => (x.id === record.id ? { ...x, ...record } : x));
    writeAll(STORE_KEYS[entity], list);
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
  },

  // Containers con sus items
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
    return { container: c, items: newItems };
  },

  getItemsByContainer(containerId) {
    return readAll(STORE_KEYS.items).filter(it => it.container_id === containerId);
  },

  removeContainer(id) {
    this.remove('containers', id);
    const items = readAll(STORE_KEYS.items).filter(it => it.container_id !== id);
    writeAll(STORE_KEYS.items, items);
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
