import { priceFor } from './pricing.js';
import { sortForList, groupOf } from './catalog-xlsx.js';
import { fmtNum } from './utils.js';

// Lista de precios en PDF: mismo diseño simple que el Excel (Foto, Código, Producto, Serie / Genérico,
// Categoría, Acabado, Precio) con un renglón por producto y acabado. Se imprime desde una ventana
// ya abierta (w) para que el navegador no la bloquee; el usuario elige "Guardar como PDF".
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderPriceListPdf(w, products, costOf, tier, tiers) {
  const list = sortForList(products);
  const rows = list.map(p => {
    const price = priceFor(costOf(p), tier, tiers);
    const foto = p.foto_url ? new URL(p.foto_url, window.location.href).href : '';
    return `<tr>
      <td class="ph">${foto ? `<img src="${esc(foto)}" alt="">` : ''}</td>
      <td class="code">${esc(p.sku_briggs)}</td>
      <td>${esc(p.name)}</td>
      <td>${esc(groupOf(p))}</td>
      <td>${esc(p.category)}</td>
      <td>${esc(p.color)}</td>
      <td class="pr${price > 0 ? '' : ' na'}">${price > 0 ? 'US$ ' + fmtNum(price) : 'Consultar'}</td>
    </tr>`;
  }).join('');
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Lista de precios Briggs · ${esc(tier.name)}</title>
<style>
@page{size:A4 portrait;margin:10mm}
*{box-sizing:border-box}
html,body{margin:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-family:Calibri,Carlito,Arial,sans-serif;color:#111}
h1{font-size:18pt;margin:0 0 1mm}
.sub{font-size:9pt;font-style:italic;color:#666;margin-bottom:4mm}
table{width:100%;border-collapse:collapse;table-layout:fixed}
thead{display:table-header-group}
th{background:#1b365d;color:#fff;font-size:8.5pt;padding:2.2mm 1.5mm;text-align:center}
tr{break-inside:avoid;page-break-inside:avoid}
td{height:19mm;padding:1mm 1.5mm;font-size:8.5pt;border-bottom:.25mm solid #e5e7eb;vertical-align:middle;word-wrap:break-word}
td.ph{padding:.8mm;text-align:center}
td.ph img{width:17mm;height:17mm;object-fit:contain;display:block;margin:0 auto}
td.code{font-weight:700;color:#1b365d}
td.pr{text-align:right;font-weight:700;font-size:9.5pt;white-space:nowrap}
td.na{font-weight:400;font-style:italic;color:#888;font-size:8.5pt}
col.c1{width:19mm}col.c2{width:31mm}col.c3{width:46mm}col.c4{width:25mm}col.c5{width:29mm}col.c6{width:17mm}col.c7{width:23mm}
@media screen{body{padding:8mm;max-width:210mm;margin:0 auto}}
</style></head><body>
<h1>BRIGGS — Lista de precios · ${esc(tier.name)}</h1>
<div class="sub">Fecha: ${new Date().toLocaleDateString('es-VE')} · precios en US$</div>
<table><colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"><col class="c5"><col class="c6"><col class="c7"></colgroup>
<thead><tr><th>Foto</th><th>Código</th><th>Producto</th><th>Serie / Genérico</th><th>Categoría</th><th>Acabado</th><th>Precio US$</th></tr></thead>
<tbody>${rows}</tbody></table></body></html>`;
  w.document.open(); w.document.write(html); w.document.close();
  const go = () => setTimeout(() => { try { w.focus(); w.print(); } catch { /* el usuario puede imprimir manualmente */ } }, 300);
  const ready = () => {
    const imgs = [...w.document.images].filter(i => !i.complete);
    Promise.all(imgs.map(i => new Promise(r => { i.onload = i.onerror = r; }))).then(go, go);
  };
  if (w.document.readyState === 'complete') ready(); else w.addEventListener('load', ready);
}
