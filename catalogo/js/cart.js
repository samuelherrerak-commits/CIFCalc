// Carrito en localStorage ("cat_cart"): solo id + cantidad. Los precios se
// recalculan siempre desde el catálogo cargado, nunca se guardan.
const KEY = 'cat_cart';
const listeners = new Set();

const read = () => {
  try { const d = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(d) ? d : []; } catch { return []; }
};
let lines = read();

const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* sin almacenamiento */ }
  listeners.forEach((fn) => fn());
};

export const cart = {
  lines: () => lines.map((l) => ({ ...l })),
  count: () => lines.reduce((n, l) => n + l.qty, 0),
  qtyOf: (id) => (lines.find((l) => l.id === id) || { qty: 0 }).qty,
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  set(id, qty, max = 999) {
    const q = Math.max(0, Math.min(Math.floor(Number(qty) || 0), max));
    const i = lines.findIndex((l) => l.id === id);
    if (q === 0) { if (i >= 0) lines.splice(i, 1); } else if (i >= 0) lines[i].qty = q; else lines.push({ id, qty: q });
    save();
  },
  add(id, qty = 1, max = 999) { this.set(id, this.qtyOf(id) + qty, max); },
  clear() { lines = []; save(); },
  // Quita lo que ya no está en el catálogo y recorta cantidades al stock.
  reconcile(products) {
    const byId = new Map(products.map((p) => [p.id, p]));
    const next = lines.filter((l) => byId.has(l.id)).map((l) => ({ id: l.id, qty: Math.min(l.qty, byId.get(l.id).stock) }))
      .filter((l) => l.qty > 0);
    if (JSON.stringify(next) !== JSON.stringify(lines)) { lines = next; save(); }
  }
};
