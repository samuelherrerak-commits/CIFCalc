// Verifica que el manual no se desactualice: cada pantalla del manual debe existir en el menú y en el router,
// y cada entrada debe tener ruta, resumen y al menos una tarea con pasos.
import fs from 'fs';
import { MANUAL } from '../js/data/manual.js';
const router = fs.readFileSync(new URL('../js/router.js', import.meta.url), 'utf8');
const tabs = fs.readFileSync(new URL('../js/components/accounting-tabs.js', import.meta.url), 'utf8');
let bad = 0;
const fail = (m) => { bad++; console.log('✗', m); };
const ids = new Set();
for (const e of MANUAL) {
  if (ids.has(e.id)) fail(`${e.id}: id repetido`);
  ids.add(e.id);
  if (!e.resumen || !e.path || !e.menu) fail(`${e.id}: falta resumen, ruta o cómo llegar`);
  if (!tabs.includes(`path: '${e.path}'`)) fail(`${e.id}: la ruta ${e.path} no está en el menú (accounting-tabs.js)`);
  const rp = e.path.replace('#/contabilidad/', '');
  if (!router.includes(rp.split('/')[0])) fail(`${e.id}: la ruta ${e.path} no existe en router.js`);
  if (!(e.tareas || []).length) fail(`${e.id}: sin tareas`);
  for (const t of e.tareas || []) if (!t.q || !(t.pasos || []).length) fail(`${e.id}: tarea sin pregunta o sin pasos`);
}
console.log(bad ? `${bad} problema(s)` : `Manual OK: ${MANUAL.length} pantalla(s), ${MANUAL.reduce((s, e) => s + e.tareas.length, 0)} tarea(s)`);
process.exit(bad ? 1 : 0);
