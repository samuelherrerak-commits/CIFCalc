// Asistente del manual — parte sin pantalla (se prueba desde node).
// 1) Busca en el manual las tareas que se parecen a la pregunta.
// 2) Arma el contexto que se le manda a la IA: SOLO texto del manual.
// 3) Si el manual no tiene nada parecido, ni se llama a la IA: se contesta "No está en el manual".
import { MANUAL } from './data/manual.js';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const STOP = new Set('de la el en un una unos unas para como hago hacer hace quiero quieres puedo puede donde dónde que qué se me mi mis los las por con a y o del al lo es esta está ese esa este cual cuál cuales cuáles voy debo necesito ver veo hay tengo sobre desde hasta si no ya muy mas más pero le les su sus tu tus ir llego llegar encuentro encuentra pantalla modulo módulo opcion opción'.split(' ').map(norm));
const tokens = (s) => norm(s).replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/).filter(t => t.length >= 3 && !STOP.has(t));
// Coincidencia por raíz: "presupuestos" ~ "presupuesto", "cotizar" ~ "cotizacion".
const stem = (t) => t.slice(0, Math.max(4, Math.min(6, t.length - 1)));
const has = (words, qt) => words.some(w => w.startsWith(stem(qt)) || qt.startsWith(stem(w)));

const index = () => MANUAL.flatMap(e => e.tareas.map(t => ({
  e, t,
  fQ: tokens(t.q), fTitle: tokens(e.title + ' ' + e.section), fBuscar: tokens(e.buscar || ''),
  fPasos: tokens((t.pasos || []).join(' ') + ' ' + (t.notas || []).join(' ')), fResumen: tokens(e.resumen)
})));
let IDX = null;

// → [{ e, t, score }] de mayor a menor. Puntaje mínimo para considerarlo relacionado: 3.
export function searchManual(question, limit = 3) { // limit = cuántas pantallas
  const qt = [...new Set(tokens(question))];
  if (!qt.length) return [];
  IDX = IDX || index();
  const out = [];
  for (const d of IDX) {
    let score = 0;
    for (const w of qt) {
      if (has(d.fQ, w)) score += 3;
      if (has(d.fTitle, w)) score += 3;
      if (has(d.fBuscar, w)) score += 2;
      if (has(d.fPasos, w)) score += 1;
      if (has(d.fResumen, w)) score += 1;
    }
    if (score >= 3) out.push({ e: d.e, t: d.t, score });
  }
  out.sort((a, b) => b.score - a.score);
  // Variedad: las mejores tareas de la mejor pantalla y la mejor tarea de las siguientes pantallas
  // (así una palabra muy común, como "cliente", no tapa a las demás pantallas).
  const screens = [];
  for (const h of out) { let g = screens.find(s => s.id === h.e.id); if (!g) { g = { id: h.e.id, hits: [] }; screens.push(g); } g.hits.push(h); }
  const picked = [];
  screens.slice(0, limit).forEach((g, i) => picked.push(...g.hits.slice(0, i === 0 ? 2 : 1)));
  return picked;
}

const stepsText = (t) => t.pasos.map((p, i) => `${i + 1}. ${p}`).join('\n');

// Texto del manual que se le entrega a la IA (máx. ~8000 caracteres).
export function buildContext(hits) {
  const seen = new Set();
  const parts = [];
  for (const { e, t } of hits) {
    const head = seen.has(e.id) ? '' : `PANTALLA: ${e.title} (sección ${e.section})\nCÓMO LLEGAR: ${e.menu}\nPARA QUÉ SIRVE: ${e.resumen}\n`;
    seen.add(e.id);
    parts.push(`${head}TAREA: ${t.q}\nPASOS:\n${stepsText(t)}${(t.notas || []).length ? '\nNOTAS:\n' + t.notas.map(n => '- ' + n).join('\n') : ''}`);
  }
  return parts.join('\n\n---\n\n').slice(0, 8000);
}

// Pantallas a las que ofrecer "Ir ahí" (únicas, en orden de relevancia).
export function screensOf(hits, max = 2) {
  const out = [];
  for (const h of hits) if (!out.some(s => s.id === h.e.id)) out.push({ id: h.e.id, title: h.e.title, menu: h.e.menu, path: h.e.path });
  return out.slice(0, max);
}

// Respuesta sin IA: los pasos del manual tal cual.
export function manualAnswer(hits) {
  if (!hits.length) return NOT_IN_MANUAL;
  const { e, t } = hits[0];
  return `${t.q}\nRuta: ${e.menu}\n\n${stepsText(t)}`;
}

export const NOT_IN_MANUAL = 'No encontré eso en el manual de Gestión financiera. Prueba con otras palabras (por ejemplo "presupuesto", "gasto", "factura") o revisa el Manual de uso completo.';
