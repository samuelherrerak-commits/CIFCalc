import { esc } from '../utils.js';

// Selector de Contactos compartido por Ventas/Gastos/Costos/Inventario — filtra
// por rol (un contacto 'ambos' aparece en los dos lados) y ofrece un alta
// rápida inline sin salir del formulario.

export function contactsForRole(contacts, role) {
  return contacts
    .filter(c => c.type === role || c.type === 'ambos')
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function contactOptions(contacts, role, selectedId) {
  const list = contactsForRole(contacts, role);
  return `<option value="">— Sin contacto —</option>` +
    list.map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${esc(c.name)}${c.rif ? ' — ' + esc(c.rif) : ''}</option>`).join('') +
    `<option value="__new__">+ Nuevo contacto…</option>`;
}

// Alta rápida con prompt() (mismo patrón que "+ Nueva compañía" en calculator.js).
// role: 'cliente' | 'proveedor' — el contacto nuevo se crea con ese type.
export function quickAddContact(Store, role) {
  const name = prompt('Nombre del contacto:');
  if (!name || !name.trim()) return null;
  const rif = prompt('Cédula / RIF (opcional):') || '';
  if (rif.trim() && !Store.isContactRifUnique(rif.trim())) {
    alert('Ya existe un contacto con ese RIF.');
    return null;
  }
  return Store.insert('contacts', Store.newContact({ name: name.trim(), rif: rif.trim(), type: role }));
}
