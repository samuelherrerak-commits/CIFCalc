import Store from '../store.js';
import { esc, fmtNum, fmtInt } from '../utils.js';
import { salesLines, expenseLines } from '../analytics.js';
import AccountingTabs from '../components/accounting-tabs.js';
import AccountingShell, { card, input, label } from '../components/accounting-shell.js';

// Reportes interactivos de Ventas y de Gastos/Costos: se elige el periodo, los
// filtros, cómo agrupar y qué medir; se ve en tarjetas, gráfico (con detalle al
// pasar el mouse), tabla ordenable y se puede descargar en CSV. La última
// configuración de cada reporte se recuerda en este navegador.

const PERIODS = [
  ['mes', 'Este mes'], ['mes_ant', 'Mes pasado'], ['30', 'Últimos 30 días'], ['90', 'Últimos 90 días'],
  ['anio', 'Este año'], ['todo', 'Todo'], ['custom', 'Personalizado']
];
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const daysIn = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000) + 1;

function periodRange(p, from, to, allDates) {
  const t = iso(new Date());
  const [y, m] = t.split('-').map(Number);
  if (p === 'mes') return [`${t.slice(0, 7)}-01`, t];
  if (p === 'mes_ant') { const d = new Date(Date.UTC(y, m - 2, 1)); const e = new Date(Date.UTC(y, m - 1, 0)); return [iso(d), iso(e)]; }
  if (p === '30') return [addDays(t, -29), t];
  if (p === '90') return [addDays(t, -89), t];
  if (p === 'anio') return [`${y}-01-01`, t];
  if (p === 'custom') return [from || t, to || t];
  const sorted = allDates.filter(Boolean).sort();
  return [sorted[0] || t, sorted[sorted.length - 1] || t];
}

// Semana que empieza el lunes.
function weekOf(date) {
  const d = new Date(date + 'T00:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return iso(d);
}
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function timeKey(date, unit) { return unit === 'dia' ? date : unit === 'semana' ? weekOf(date) : date.slice(0, 7); }
function timeLabel(key, unit) {
  if (unit === 'mes') { const [yy, mm] = key.split('-'); return `${MONTHS[Number(mm) - 1]} ${yy.slice(2)}`; }
  const [, mm, dd] = key.split('-');
  return unit === 'semana' ? `Sem ${dd}/${mm}` : `${dd}/${mm}`;
}
function timeBuckets(from, to, unit) {
  const keys = [];
  let cur = from;
  while (cur <= to && keys.length < 800) {
    const k = timeKey(cur, unit);
    if (!keys.includes(k)) keys.push(k);
    cur = addDays(cur, 1);
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Definición de cada reporte
// ---------------------------------------------------------------------------
const SALES = {
  key: 'ventas', title: 'Ventas', rows: () => salesLines(),
  filters: [
    ['entidad', 'Cliente'], ['category', 'Categoría'], ['collection', 'Colección'], ['productName', 'Producto'], ['payment', 'Forma de pago']
  ],
  groups: [
    ['mes', 'Mes', 'time'], ['semana', 'Semana', 'time'], ['dia', 'Día', 'time'],
    ['entidad', 'Cliente'], ['productName', 'Producto'], ['category', 'Categoría'], ['collection', 'Colección'], ['payment', 'Forma de pago']
  ],
  metrics: [
    ['revenue', 'Ventas ($)', 'money'], ['margin', 'Margen ($)', 'money'], ['marginPct', 'Margen (%)', 'pct'],
    ['qty', 'Unidades', 'int'], ['orders', 'N.º de ventas', 'int'], ['ticket', 'Ticket promedio ($)', 'money'], ['discount', 'Descuentos dados ($)', 'money']
  ],
  defaults: { period: 'mes', group: 'mes', metric: 'revenue' },
  aggregate(rows) {
    const revenue = rows.reduce((s, r) => s + r.revenue, 0);
    const margin = rows.reduce((s, r) => s + r.margin, 0);
    const orders = new Set(rows.map(r => r.refDoc)).size;
    return {
      revenue, margin, marginPct: revenue > 0 ? margin / revenue * 100 : 0,
      qty: rows.reduce((s, r) => s + r.qty, 0), orders, ticket: orders ? revenue / orders : 0,
      discount: rows.reduce((s, r) => s + r.discount, 0), customers: new Set(rows.map(r => r.entidad)).size
    };
  },
  kpis: [['revenue', 'Ventas', 'money'], ['margin', 'Margen', 'money'], ['marginPct', 'Margen %', 'pct'], ['orders', 'Ventas', 'int'], ['ticket', 'Ticket promedio', 'money'], ['customers', 'Clientes', 'int']],
  detailCols: [['date', 'Fecha'], ['refDoc', 'Venta'], ['entidad', 'Cliente'], ['productName', 'Producto'], ['category', 'Categoría'], ['payment', 'Pago'], ['qty', 'Unid.', 'int'], ['unitPrice', 'Precio', 'money'], ['revenue', 'Total', 'money'], ['margin', 'Margen', 'money']]
};

const EXPENSES = {
  key: 'gastos', title: 'Gastos y Costos', rows: () => expenseLines(),
  filters: [['tipo', 'Tipo'], ['account', 'Cuenta'], ['entidad', 'Beneficiario'], ['origin', 'Origen'], ['payment', 'Pagado con / cargado a']],
  groups: [
    ['mes', 'Mes', 'time'], ['semana', 'Semana', 'time'], ['dia', 'Día', 'time'],
    ['account', 'Cuenta'], ['tipo', 'Tipo (gasto o costo)'], ['entidad', 'Beneficiario'], ['origin', 'Origen'], ['payment', 'Pagado con / cargado a']
  ],
  metrics: [['amount', 'Monto ($)', 'money'], ['count', 'N.º de registros', 'int'], ['avg', 'Promedio por registro ($)', 'money']],
  defaults: { period: 'anio', group: 'account', metric: 'amount' },
  aggregate(rows) {
    const amount = rows.reduce((s, r) => s + r.amount, 0);
    return {
      amount, count: rows.length, avg: rows.length ? amount / rows.length : 0,
      gastos: rows.filter(r => r.tipo === 'Gasto').reduce((s, r) => s + r.amount, 0),
      costos: rows.filter(r => r.tipo === 'Costo').reduce((s, r) => s + r.amount, 0)
    };
  },
  kpis: [['amount', 'Total', 'money'], ['gastos', 'Gastos', 'money'], ['costos', 'Costos', 'money'], ['count', 'Registros', 'int'], ['avg', 'Promedio', 'money']],
  detailCols: [['date', 'Fecha'], ['refDoc', 'Documento'], ['tipo', 'Tipo'], ['account', 'Cuenta'], ['entidad', 'Beneficiario'], ['concepto', 'Concepto'], ['origin', 'Origen'], ['payment', 'Pagado con'], ['amount', 'Monto', 'money']]
};

const fmt = (v, kind) => kind === 'money' ? '$' + fmtNum(v) : kind === 'pct' ? fmtNum(v) + '%' : kind === 'int' ? fmtInt(v) : esc(v);

function loadState(def) {
  try { return { filters: {}, compare: true, from: '', to: '', sort: { col: 'value', dir: -1 }, ...def.defaults, ...JSON.parse(localStorage.getItem('cif_report_' + def.key) || '{}') }; }
  catch { return { filters: {}, compare: true, from: '', to: '', sort: { col: 'value', dir: -1 }, ...def.defaults }; }
}
function saveState(def, st) { try { localStorage.setItem('cif_report_' + def.key, JSON.stringify(st)); } catch { /* sin almacenamiento */ } }

function csvDownload(filename, header, rows) {
  const q = (v) => { const s = String(v == null ? '' : v); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const text = '﻿' + [header, ...rows].map(r => r.map(q).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------------------
// Gráficos SVG (marcas finas, extremo redondeado, eje recesivo, tooltip)
// ---------------------------------------------------------------------------
const C_CUR = '#2a78d6';
const C_PREV = '#eb6834';

function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
const short = (v) => Math.abs(v) >= 1e6 ? fmtNum(v / 1e6).replace(/\.00$/, '') + 'M' : Math.abs(v) >= 1e3 ? fmtNum(v / 1e3).replace(/\.00$/, '') + 'k' : fmtNum(v).replace(/\.00$/, '');
// Barra con el extremo de dato redondeado (4px) y la base recta.
function barPath(x, y, w, h, vertical = true) {
  const r = Math.min(4, w / 2, h);
  if (h <= 0) return '';
  return vertical
    ? `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
    : `M${x},${y}H${x + h - r}Q${x + h},${y} ${x + h},${y + r}V${y + w - r}Q${x + h},${y + w} ${x + h - r},${y + w}H${x}Z`;
}

function columnChart(points, metricKind, width, withPrev) {
  const H = 260, padL = 52, padB = 34, padT = 12, padR = 8;
  const max = niceMax(Math.max(...points.map(p => Math.max(p.value, withPrev ? p.prev || 0 : 0)), 0));
  const plotW = Math.max(100, width - padL - padR), plotH = H - padT - padB;
  const slot = plotW / Math.max(1, points.length);
  const gap = 2;
  const bw = Math.max(2, Math.min(36, (slot - 6) / (withPrev ? 2 : 1) - (withPrev ? gap / 2 : 0)));
  const y = (v) => padT + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * max);
  const every = Math.ceil(points.length / Math.max(1, Math.floor(plotW / 56)));
  let marks = '';
  points.forEach((p, i) => {
    const cx = padL + slot * i + slot / 2;
    const groupW = withPrev ? bw * 2 + gap : bw;
    const x0 = cx - groupW / 2;
    if (withPrev) marks += `<path d="${barPath(x0, y(p.prev || 0), bw, plotH + padT - y(p.prev || 0))}" fill="${C_PREV}"/>`;
    marks += `<path d="${barPath(withPrev ? x0 + bw + gap : x0, y(p.value), bw, plotH + padT - y(p.value))}" fill="${C_CUR}"/>`;
    marks += `<rect data-tip="${i}" x="${padL + slot * i}" y="${padT}" width="${slot}" height="${plotH}" fill="transparent"/>`;
  });
  return `
    <svg viewBox="0 0 ${width} ${H}" width="100%" height="${H}" role="img" aria-label="Gráfico de columnas" class="overflow-visible">
      ${ticks.map(t => `<line x1="${padL}" x2="${width - padR}" y1="${y(t)}" y2="${y(t)}" stroke="#e2e8f0" stroke-width="1"/>
        <text x="${padL - 6}" y="${y(t) + 3}" text-anchor="end" font-size="10" fill="#64748b">${metricKind === 'pct' ? short(t) + '%' : metricKind === 'money' ? '$' + short(t) : short(t)}</text>`).join('')}
      ${marks}
      <line x1="${padL}" x2="${width - padR}" y1="${padT + plotH}" y2="${padT + plotH}" stroke="#94a3b8" stroke-width="1"/>
      ${points.map((p, i) => i % every === 0 ? `<text x="${padL + slot * i + slot / 2}" y="${H - padB + 16}" text-anchor="middle" font-size="10" fill="#64748b">${esc(p.label)}</text>` : '').join('')}
    </svg>`;
}

function barChart(points, metricKind, width, withPrev) {
  const rowH = withPrev ? 30 : 24, padL = Math.min(220, Math.max(110, width * 0.32)), padR = 70, padT = 4;
  const H = padT + points.length * rowH + 8;
  const max = niceMax(Math.max(...points.map(p => Math.max(p.value, withPrev ? p.prev || 0 : 0)), 0));
  const plotW = Math.max(60, width - padL - padR);
  const bh = withPrev ? 10 : 14;
  let out = '';
  points.forEach((p, i) => {
    const top = padT + i * rowH + (rowH - (withPrev ? bh * 2 + 2 : bh)) / 2;
    const w = Math.max(0, (p.value / max) * plotW);
    out += `<text x="${padL - 8}" y="${padT + i * rowH + rowH / 2 + 4}" text-anchor="end" font-size="11" fill="#334155">${esc(String(p.label).length > 34 ? String(p.label).slice(0, 33) + '…' : p.label)}</text>`;
    out += `<path d="${barPath(padL, top, bh, w, false)}" fill="${C_CUR}"/>`;
    if (withPrev) out += `<path d="${barPath(padL, top + bh + 2, bh, Math.max(0, ((p.prev || 0) / max) * plotW), false)}" fill="${C_PREV}"/>`;
    out += `<text x="${padL + w + 6}" y="${top + bh - 2}" font-size="10" fill="#475569">${fmt(p.value, metricKind)}</text>`;
    out += `<rect data-tip="${i}" x="0" y="${padT + i * rowH}" width="${width}" height="${rowH}" fill="transparent"/>`;
  });
  return `<svg viewBox="0 0 ${width} ${H}" width="100%" height="${H}" role="img" aria-label="Gráfico de barras">
    <line x1="${padL}" x2="${padL}" y1="${padT}" y2="${H - 8}" stroke="#94a3b8" stroke-width="1"/>${out}</svg>`;
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
const Reports = {
  async render(app, params) {
    const destroy = new AbortController();
    const { signal } = destroy;
    const def = (params && params[0]) === 'gastos' ? EXPENSES : SALES;
    const st = loadState(def);
    const all = def.rows();
    const groupDef = () => def.groups.find(g => g[0] === st.group) || def.groups[0];
    const metricDef = () => def.metrics.find(m => m[0] === st.metric) || def.metrics[0];
    const options = (key) => [...new Set(all.map(r => r[key]).filter(v => v !== '' && v != null))].sort((a, b) => String(a).localeCompare(String(b)));
    let showDetail = false;

    const compute = () => {
      const [from, to] = periodRange(st.period, st.from, st.to, all.map(r => r.date));
      const passFilters = (r) => Object.entries(st.filters).every(([k, v]) => !v || r[k] === v);
      const cur = all.filter(r => r.date >= from && r.date <= to && passFilters(r));
      const len = daysIn(from, to);
      const pFrom = addDays(from, -len), pTo = addDays(from, -1);
      const canCompare = st.period !== 'todo';
      const prev = canCompare ? all.filter(r => r.date >= pFrom && r.date <= pTo && passFilters(r)) : [];
      const [gKey, , gType] = groupDef();
      const mKey = metricDef()[0];
      let points;
      if (gType === 'time') {
        const keys = timeBuckets(from, to, gKey);
        const pKeys = timeBuckets(pFrom, pTo, gKey);
        points = keys.map((k, i) => {
          const rows = cur.filter(r => timeKey(r.date, gKey) === k);
          const prows = pKeys[i] ? prev.filter(r => timeKey(r.date, gKey) === pKeys[i]) : [];
          const a = def.aggregate(rows);
          return { key: k, label: timeLabel(k, gKey), value: a[mKey], prev: def.aggregate(prows)[mKey], agg: a, rows };
        });
      } else {
        const groups = new Map();
        for (const r of cur) { const k = r[gKey] || '—'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
        const pgroups = new Map();
        for (const r of prev) { const k = r[gKey] || '—'; if (!pgroups.has(k)) pgroups.set(k, []); pgroups.get(k).push(r); }
        points = [...groups.entries()].map(([k, rows]) => {
          const a = def.aggregate(rows);
          return { key: k, label: k, value: a[mKey], prev: def.aggregate(pgroups.get(k) || [])[mKey], agg: a, rows };
        }).sort((a, b) => b.value - a.value);
      }
      return { from, to, pFrom, pTo, canCompare, cur, prev, points, totals: def.aggregate(cur), ptotals: def.aggregate(prev) };
    };

    const delta = (cur, prev, kind) => {
      if (!(prev > 0) && !(cur > 0)) return '';
      if (!(prev > 0)) return '<span class="text-[10px] font-bold text-slate-400">nuevo</span>';
      const d = kind === 'pct' ? cur - prev : (cur - prev) / Math.abs(prev) * 100;
      const up = d >= 0;
      // Más gasto no es "bueno": en Gastos, subir se pinta en rojo.
      const good = def.key === 'gastos' ? !up : up;
      return `<span class="text-[10px] font-bold ${good ? 'text-emerald-600' : 'text-rose-600'}">${up ? '▲' : '▼'} ${fmtNum(Math.abs(d)).replace(/\.00$/, '')}${kind === 'pct' ? ' pts' : '%'}</span>`;
    };

    const draw = () => {
      saveState(def, st);
      const r = compute();
      const [, gLabel, gType] = groupDef();
      const [, mLabel, mKind] = metricDef();
      const cmpAsked = st.compare && r.canCompare;
      // Solo se compara (gráfico, tarjetas, tabla) si el periodo anterior tiene datos.
      const cmp = cmpAsked && r.prev.length > 0;

      document.getElementById('rep-range').textContent = `${r.from} → ${r.to}${cmpAsked ? ` · comparado con ${r.pFrom} → ${r.pTo}${cmp ? '' : ' (sin datos en ese periodo)'}` : ''}`;
      document.getElementById('rep-kpis').innerHTML = def.kpis.map(([k, lbl, kind]) => `
        <div class="bg-white border border-slate-200 rounded-2xl p-3">
          <div class="text-[10px] font-bold uppercase tracking-wide text-slate-400">${lbl}</div>
          <div class="text-lg font-semibold text-slate-900">${fmt(r.totals[k], kind)}</div>
          ${cmp ? `<div class="flex items-center gap-1.5">${delta(r.totals[k], r.ptotals[k], kind)}<span class="text-[10px] text-slate-400">antes ${fmt(r.ptotals[k], kind)}</span></div>` : ''}
        </div>`).join('');

      // Gráfico: dimensiones con muchos valores se cortan en 15 + "Otros".
      let pts = r.points;
      if (gType !== 'time' && pts.length > 15) {
        const rest = pts.slice(14);
        const restRows = rest.flatMap(p => p.rows);
        const a = def.aggregate(restRows);
        pts = [...pts.slice(0, 14), { key: '__otros', label: `Otros (${rest.length})`, value: a[metricDef()[0]], prev: rest.reduce((s, p) => s + (p.prev || 0), 0), agg: a, rows: restRows }];
      }
      const box = document.getElementById('rep-chart');
      const width = Math.max(320, box.clientWidth || 800);
      box.innerHTML = r.cur.length === 0
        ? '<div class="py-16 text-center text-slate-400"><p class="text-sm font-semibold">No hay datos para este periodo y filtros.</p><p class="text-xs">Prueba con otro periodo (por ejemplo "Todo") o quita filtros.</p></div>'
        : (gType === 'time' ? columnChart(pts, mKind, width, cmp) : barChart(pts, mKind, width, cmp));
      document.getElementById('rep-legend').innerHTML = cmp && r.cur.length
        ? `<span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm" style="background:${C_CUR}"></span>Periodo elegido</span><span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm" style="background:${C_PREV}"></span>Periodo anterior</span>`
        : '';
      document.getElementById('rep-chart-title').textContent = `${mLabel} por ${gLabel.toLowerCase()}`;

      // Tooltip
      const tip = document.getElementById('rep-tip');
      box.querySelectorAll('[data-tip]').forEach(el => {
        el.addEventListener('mousemove', (e) => {
          const p = pts[Number(el.dataset.tip)];
          tip.innerHTML = `<div class="font-bold text-slate-900 mb-1">${esc(p.label)}</div>
            ${def.kpis.slice(0, 4).map(([k, lbl, kind]) => `<div class="flex justify-between gap-4"><span class="text-slate-500">${lbl}</span><span class="font-semibold text-slate-800">${fmt(p.agg[k], kind)}</span></div>`).join('')}
            ${cmp ? `<div class="flex justify-between gap-4 mt-1 pt-1 border-t border-slate-100"><span class="text-slate-500">${mLabel} antes</span><span class="font-semibold text-slate-800">${fmt(p.prev || 0, mKind)}</span></div>` : ''}`;
          tip.classList.remove('hidden');
          const rect = box.getBoundingClientRect();
          let x = e.clientX - rect.left + 14;
          if (x + 220 > rect.width) x = e.clientX - rect.left - 230;
          tip.style.left = x + 'px';
          tip.style.top = (e.clientY - rect.top + 10) + 'px';
        });
        el.addEventListener('mouseleave', () => tip.classList.add('hidden'));
      });

      // Tabla agrupada (ordenable)
      const total = r.totals[metricDef()[0]] || 0;
      const cols = [['label', gLabel, 'text'], ...def.metrics.map(([k, l, kind]) => [k, l, kind]), ...(mKind !== 'pct' ? [['share', '% del total', 'pct']] : []), ...(cmp ? [['prev', `${mLabel} antes`, mKind]] : [])];
      const rows = r.points.map(p => ({ label: p.label, ...p.agg, share: total ? p.value / total * 100 : 0, prev: p.prev || 0, _key: p.key }));
      const { col, dir } = st.sort;
      if (gType === 'time' && col === 'value') rows.sort((a, b) => String(a._key).localeCompare(String(b._key)));
      else rows.sort((a, b) => {
        const av = col === 'value' ? a[metricDef()[0]] : a[col]; const bv = col === 'value' ? b[metricDef()[0]] : b[col];
        return typeof av === 'string' ? dir * String(av).localeCompare(String(bv)) : dir * ((av || 0) - (bv || 0));
      });
      document.getElementById('rep-table').innerHTML = `
        <table class="w-full text-xs">
          <thead><tr class="text-[10px] uppercase tracking-wide text-slate-400">${cols.map(([k, l, kind]) => `<th data-sort="${k}" class="p-2 cursor-pointer hover:text-slate-700 select-none ${kind === 'text' ? 'text-left' : 'text-right'}">${l}${col === k ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(rw => `<tr class="border-t border-slate-100 hover:bg-slate-50">${cols.map(([k, , kind]) => `<td class="p-2 ${kind === 'text' ? 'text-left font-semibold text-slate-700' : 'text-right font-mono'}">${kind === 'text' ? esc(gType === 'time' ? rw.label : rw[k]) : fmt(rw[k] || 0, kind)}</td>`).join('')}</tr>`).join('')}</tbody>
          ${rows.length ? `<tfoot><tr class="border-t-2 border-slate-200 font-bold">${cols.map(([k, , kind], i) => `<td class="p-2 ${i === 0 ? 'text-left' : 'text-right font-mono'}">${i === 0 ? 'Total' : k === 'share' ? '100%' : k === 'prev' ? fmt(r.ptotals[metricDef()[0]] || 0, kind) : fmt(r.totals[k] || 0, kind)}</td>`).join('')}</tr></tfoot>` : ''}
        </table>`;
      document.querySelectorAll('#rep-table [data-sort]').forEach(th => th.addEventListener('click', () => {
        const k = th.dataset.sort;
        st.sort = { col: k, dir: st.sort.col === k ? -st.sort.dir : (k === 'label' ? 1 : -1) };
        draw();
      }));

      // Detalle línea por línea
      const det = document.getElementById('rep-detail');
      det.classList.toggle('hidden', !showDetail);
      if (showDetail) {
        const lines = [...r.cur].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 500);
        det.innerHTML = `<div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-[10px] uppercase tracking-wide text-slate-400">${def.detailCols.map(([, l, kind]) => `<th class="p-2 ${kind ? 'text-right' : 'text-left'}">${l}</th>`).join('')}</tr></thead>
          <tbody>${lines.map(rw => `<tr class="border-t border-slate-100">${def.detailCols.map(([k, , kind]) => `<td class="p-2 ${kind ? 'text-right font-mono' : ''}">${kind ? fmt(rw[k], kind) : esc(rw[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
          ${r.cur.length > 500 ? `<p class="text-[11px] text-slate-400 mt-2">Mostrando 500 de ${r.cur.length}. Descarga el CSV para verlas todas.</p>` : ''}`;
      }
      document.getElementById('rep-detail-btn').textContent = showDetail ? 'Ocultar detalle' : `Ver detalle (${r.cur.length} líneas)`;
      const estimated = def.key === 'ventas' && r.cur.some(x => x.costEstimated);
      document.getElementById('rep-note').textContent = estimated
        ? 'Nota: algunas ventas anteriores no guardaban su costo; su margen se estima con el costo promedio actual del producto.'
        : '';
      window.__repLast = r;
    };

    const selectHtml = (id, opts, value, placeholder) => `<select id="${id}" class="${input} !py-1.5 text-xs">${placeholder ? `<option value="">${placeholder}</option>` : ''}${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

    const body = `
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-slate-900">Reportes</h1>
          <p class="text-xs text-slate-500">Elige el periodo, filtra, agrupa y mide lo que quieras. Pasa el mouse por el gráfico para ver el detalle.</p>
        </div>
        <div class="flex gap-1 bg-slate-100 p-1 rounded-xl">
          <a href="#/contabilidad/reportes/ventas" class="px-4 py-1.5 rounded-lg text-xs font-bold ${def.key === 'ventas' ? 'bg-white shadow text-emerald-700' : 'text-slate-500'}">Ventas</a>
          <a href="#/contabilidad/reportes/gastos" class="px-4 py-1.5 rounded-lg text-xs font-bold ${def.key === 'gastos' ? 'bg-white shadow text-rose-700' : 'text-slate-500'}">Gastos y Costos</a>
        </div>
      </div>

      <div class="${card} space-y-3">
        <div class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2 items-end">
          <div><label class="${label}">Periodo</label>${selectHtml('rep-period', PERIODS, st.period)}</div>
          <div id="rep-custom" class="col-span-2 grid grid-cols-2 gap-2 ${st.period === 'custom' ? '' : 'hidden'}">
            <div><label class="${label}">Desde</label><input id="rep-from" type="date" value="${esc(st.from)}" class="${input} !py-1.5 text-xs"></div>
            <div><label class="${label}">Hasta</label><input id="rep-to" type="date" value="${esc(st.to)}" class="${input} !py-1.5 text-xs"></div>
          </div>
          <div><label class="${label}">Agrupar por</label>${selectHtml('rep-group', def.groups.map(g => [g[0], g[1]]), st.group)}</div>
          <div><label class="${label}">Medir</label>${selectHtml('rep-metric', def.metrics.map(m => [m[0], m[1]]), st.metric)}</div>
          <label class="flex items-center gap-2 text-xs font-semibold text-slate-600 pb-2"><input id="rep-compare" type="checkbox" ${st.compare ? 'checked' : ''}> Comparar con el periodo anterior</label>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2 pt-2 border-t border-slate-100">
          ${def.filters.map(([k, l]) => `<div><label class="${label}">${l}</label>${selectHtml('rep-f-' + k, options(k).map(v => [v, v]), st.filters[k] || '', 'Todos')}</div>`).join('')}
        </div>
        <div class="flex justify-between items-center text-[11px] text-slate-400">
          <span id="rep-range"></span>
          <button id="rep-clear" class="font-semibold text-blue-600 hover:text-blue-800">Quitar filtros</button>
        </div>
      </div>

      <div id="rep-kpis" class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3"></div>

      <div class="${card}">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 id="rep-chart-title" class="text-sm font-semibold text-slate-900"></h2>
          <div id="rep-legend" class="flex gap-3 text-[11px] text-slate-500"></div>
        </div>
        <div class="relative">
          <div id="rep-chart"></div>
          <div id="rep-tip" class="hidden absolute z-20 pointer-events-none bg-white border border-slate-200 shadow-lg rounded-xl p-2.5 text-[11px] w-56"></div>
        </div>
      </div>

      <div class="${card}">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 class="text-sm font-semibold text-slate-900">Tabla <span class="font-normal text-slate-400 text-xs">· toca un encabezado para ordenar</span></h2>
          <div class="flex gap-2">
            <button id="rep-csv" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700">⬇ CSV de la tabla</button>
            <button id="rep-csv-lines" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700">⬇ CSV del detalle</button>
            <button id="rep-detail-btn" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700"></button>
          </div>
        </div>
        <div id="rep-table" class="overflow-x-auto"></div>
        <p id="rep-note" class="text-[11px] text-amber-600 mt-2"></p>
        <div id="rep-detail" class="hidden mt-4 pt-4 border-t border-slate-100"></div>
      </div>`;
    app.innerHTML = AccountingShell.wrap(AccountingTabs.render('reports'), body);

    const on = (id, ev, fn) => document.getElementById(id).addEventListener(ev, fn, { signal });
    on('rep-period', 'change', (e) => { st.period = e.target.value; document.getElementById('rep-custom').classList.toggle('hidden', st.period !== 'custom'); draw(); });
    on('rep-from', 'change', (e) => { st.from = e.target.value; draw(); });
    on('rep-to', 'change', (e) => { st.to = e.target.value; draw(); });
    on('rep-group', 'change', (e) => { st.group = e.target.value; st.sort = { col: 'value', dir: -1 }; draw(); });
    on('rep-metric', 'change', (e) => { st.metric = e.target.value; st.sort = { col: 'value', dir: -1 }; draw(); });
    on('rep-compare', 'change', (e) => { st.compare = e.target.checked; draw(); });
    def.filters.forEach(([k]) => on('rep-f-' + k, 'change', (e) => { st.filters[k] = e.target.value; draw(); }));
    on('rep-clear', 'click', () => { st.filters = {}; def.filters.forEach(([k]) => { document.getElementById('rep-f-' + k).value = ''; }); draw(); });
    on('rep-detail-btn', 'click', () => { showDetail = !showDetail; draw(); });
    on('rep-csv', 'click', () => {
      const r = window.__repLast;
      const [, gLabel] = groupDef();
      csvDownload(`reporte-${def.key}-${r.from}_${r.to}.csv`, [gLabel, ...def.metrics.map(m => m[1])],
        r.points.map(p => [p.label, ...def.metrics.map(m => Math.round((p.agg[m[0]] || 0) * 100) / 100)]));
    });
    on('rep-csv-lines', 'click', () => {
      const r = window.__repLast;
      csvDownload(`detalle-${def.key}-${r.from}_${r.to}.csv`, def.detailCols.map(c => c[1]),
        r.cur.map(rw => def.detailCols.map(([k, , kind]) => kind ? Math.round((rw[k] || 0) * 100) / 100 : rw[k])));
    });
    let resizeTimer;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(draw, 150); }, { signal });

    draw();
    return () => destroy.abort();
  }
};

export default Reports;
