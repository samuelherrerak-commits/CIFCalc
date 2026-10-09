import { fmtNum, esc } from '../utils.js';

// Documento imprimible de Presupuesto / Nota de venta, con el formato de un
// presupuesto formal: logo y datos de la empresa arriba, cliente a la
// izquierda y número/fecha a la derecha, tabla de productos, totales y
// condiciones. Se imprime desde un iframe oculto (el diálogo del navegador
// permite "Guardar como PDF"), así no depende de los estilos de la app.
//
// doc = {
//   kind: 'quote' | 'sale', number, date, validUntil?,
//   client: { name, rif, address, phone, email },
//   items: [{ name, sku, qty, unit, unitPrice }],
//   paymentMethod?, notes?, terms?
// }
// issuer = { name, rif, address, phone, email, logo }

const fmtDate = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : esc(iso || '');
};

export function buildSalesDocumentHtml(doc, issuer = {}) {
  const isQuote = doc.kind === 'quote';
  const title = isQuote ? 'Presupuesto' : 'Nota de venta';
  const numberLabel = isQuote ? 'N.º de presupuesto' : 'N.º de venta';
  const items = doc.items || [];
  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);
  const client = doc.client || {};
  const lines = (arr) => arr.filter(Boolean).map(v => `<div>${v}</div>`).join('');

  const issuerLines = lines([
    issuer.rif && `RIF: ${esc(issuer.rif)}`,
    issuer.address && esc(issuer.address),
    [issuer.email && `<b>E-mail:</b> ${esc(issuer.email)}`, issuer.phone && `<b>Teléfono:</b> ${esc(issuer.phone)}`].filter(Boolean).join(' &nbsp;&nbsp; ')
  ]);

  const bottomBlocks = [
    !isQuote && doc.paymentMethod && `<div class="block"><h4>Forma de pago</h4><p>${esc(doc.paymentMethod)}</p></div>`,
    doc.notes && `<div class="block"><h4>${isQuote ? 'Notas' : 'Concepto'}</h4><p>${esc(doc.notes)}</p></div>`,
    doc.terms && `<div class="block"><h4>Términos y condiciones</h4><p>${esc(doc.terms).replace(/\n/g, '<br>')}</p></div>`
  ].filter(Boolean).join('');

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${title} ${esc(doc.number)}</title>
<style>
  @page { size: letter; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Helvetica Neue", Arial, sans-serif; color: #1f2937; font-size: 12px; }
  .page { min-height: calc(100vh - 2px); display: flex; flex-direction: column; border: 1px solid #d1d5db; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 24px; padding: 22px 32px; border-bottom: 1px solid #d1d5db; }
  .logo img { max-height: 80px; max-width: 200px; object-fit: contain; }
  .logo .ph { font-size: 22px; font-weight: 800; color: #1e3a8a; }
  .issuer { text-align: right; line-height: 1.6; }
  .issuer .name { font-weight: 700; font-size: 14px; }
  .body { padding: 24px 48px; flex: 1; }
  .parties { display: flex; justify-content: space-between; gap: 24px; line-height: 1.65; }
  .client .name { font-weight: 700; }
  .meta { text-align: right; }
  .meta h1 { margin: 0 0 6px; font-size: 16px; }
  table { width: 100%; border-collapse: collapse; margin-top: 26px; }
  thead th { font-weight: 500; color: #4b5563; text-align: right; padding: 10px 6px; border-top: 1px solid #94a3b8; border-bottom: 1px solid #94a3b8; }
  thead th:first-child, tbody td:first-child { text-align: left; }
  tbody td { padding: 12px 6px; text-align: right; vertical-align: top; }
  tbody tr:last-child td { border-bottom: 1px solid #94a3b8; }
  .sku { color: #6b7280; font-size: 11px; margin-top: 2px; }
  .totals { margin-left: auto; width: 50%; margin-top: 18px; }
  .totals div { display: flex; justify-content: space-between; padding: 5px 6px; }
  .totals .grand { font-weight: 700; font-size: 13px; border-top: 1px solid #94a3b8; margin-top: 4px; padding-top: 8px; }
  .block { margin-top: 26px; }
  .block h4 { margin: 0 0 4px; font-size: 12px; }
  .block p { margin: 0; line-height: 1.5; }
  .foot { display: flex; justify-content: flex-end; padding: 14px 32px; border-top: 1px solid #d1d5db; color: #6b7280; font-size: 10px; }
</style></head>
<body><div class="page">
  <div class="head">
    <div class="logo">${issuer.logo ? `<img src="${esc(issuer.logo)}" alt="">` : `<div class="ph">${esc(issuer.name || 'Mi Empresa')}</div>`}</div>
    <div class="issuer"><div class="name">${esc(issuer.name || '')}</div>${issuerLines}</div>
  </div>
  <div class="body">
    <div class="parties">
      <div class="client">
        <div class="name">${esc(client.name || 'Cliente')}</div>
        ${lines([client.address && esc(client.address), client.rif && `RIF/C.I.: ${esc(client.rif)}`, client.phone && esc(client.phone), client.email && esc(client.email)])}
      </div>
      <div class="meta">
        <h1>${title}</h1>
        <div>${numberLabel}: ${esc(doc.number)}</div>
        <div>Fecha: ${fmtDate(doc.date)}</div>
        ${isQuote && doc.validUntil ? `<div>Válido hasta: ${fmtDate(doc.validUntil)}</div>` : ''}
      </div>
    </div>

    <table>
      <thead><tr><th>Descripción</th><th>Cantidad</th><th>Unidad</th><th>Precio</th><th>Importe</th></tr></thead>
      <tbody>
        ${items.map(it => `
          <tr>
            <td>${esc(it.name)}${it.sku ? `<div class="sku">${esc(it.sku)}</div>` : ''}</td>
            <td>${fmtNum(it.qty).replace(/\.00$/, '')}</td>
            <td>${esc(it.unit || 'unidad')}</td>
            <td>${fmtNum(it.unitPrice)}</td>
            <td>${fmtNum((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))}</td>
          </tr>`).join('')}
      </tbody>
    </table>

    <div class="totals">
      <div><span>Subtotal</span><span>${fmtNum(subtotal)}</span></div>
      <div class="grand"><span>Total USD</span><span>$${fmtNum(subtotal)}</span></div>
    </div>

    ${bottomBlocks}
  </div>
  <div class="foot">Página 1 de 1 &nbsp;·&nbsp; #${esc(doc.number)}</div>
</div></body></html>`;
}

export function printSalesDocument(doc, issuer) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const w = frame.contentWindow;
  w.document.open();
  w.document.write(buildSalesDocumentHtml(doc, issuer));
  w.document.close();

  // Espera a que cargue el logo antes de abrir el diálogo de impresión.
  const imgs = [...w.document.images];
  Promise.all(imgs.map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })))
    .then(() => {
      w.focus();
      w.print();
      setTimeout(() => frame.remove(), 1000);
    });
}
