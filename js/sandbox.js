// Modo prueba: la app trabaja sobre una copia de los datos guardada solo en
// este navegador (claves "sbx_…" de localStorage). No lee ni escribe en Google
// Sheets ni en Supabase, así que nada de lo que se haga llega a la base de datos.
const FLAG = 'cif_sandbox';

export function isSandbox() {
  try { return localStorage.getItem(FLAG) === '1'; } catch { return false; }
}

export function setSandboxFlag(on) {
  if (on) localStorage.setItem(FLAG, '1');
  else localStorage.removeItem(FLAG);
}

// Clave de localStorage para una tabla según el modo activo.
export function storageKey(key) {
  return isSandbox() ? 'sbx_' + key : key;
}
