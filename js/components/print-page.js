import { esc } from '../utils.js';

// Documento imprimible simple con el membrete de la empresa (orden de
// despacho, estado de una orden…). Se imprime desde un iframe oculto; el
// diálogo del navegador permite "Guardar como PDF".
const fmtDate = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : esc(iso || ''); };

export function printPage({ title, number, date, client = {}, meta = [], bodyHtml, signatures = [] }, issuer = {}) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)} ${esc(number || '')}</title><style>
    @page { size: letter; margin: 14mm; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #0f172a; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f1d3a; padding-bottom: 10px; }
    .biz { font-size: 15px; font-weight: bold; } .muted { color: #64748b; }
    .doc { text-align: right; } .doc h1 { margin: 0; font-size: 18px; color: #0f1d3a; }
    .parties { display: flex; justify-content: space-between; gap: 20px; margin: 14px 0; }
    .box { flex: 1; } .box h4 { margin: 0 0 4px; font-size: 9px; text-transform: uppercase; color: #64748b; letter-spacing: .05em; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th { background: #f1f5f9; text-align: left; font-size: 9px; text-transform: uppercase; padding: 6px; }
    td { padding: 6px; border-bottom: 1px solid #e2e8f0; } td.n, th.n { text-align: right; }
    tr.tot td { font-weight: bold; background: #f8fafc; }
    .sum { width: 55%; margin-left: auto; } .sum td { border: none; padding: 3px 6px; } .sum tr.grand td { border-top: 1px solid #94a3b8; font-weight: bold; font-size: 12px; }
    h3 { font-size: 11px; margin: 16px 0 4px; text-transform: uppercase; color: #334155; letter-spacing: .04em; }
    .signs { display: flex; gap: 30px; margin-top: 50px; } .sign { flex: 1; border-top: 1px solid #334155; padding-top: 4px; text-align: center; font-size: 10px; }
    .img { width: 60px; height: 60px; object-fit: contain; }
  </style></head><body>
    <div class="head">
      <div style="display:flex;gap:10px;align-items:center">
        ${issuer.logo ? `<img class="img" src="${esc(issuer.logo)}" alt="">` : ''}
        <div><div class="biz">${esc(issuer.name || 'Empresa')}</div>
          <div class="muted">${[issuer.rif && 'RIF: ' + esc(issuer.rif), issuer.address && esc(issuer.address), issuer.phone && esc(issuer.phone)].filter(Boolean).join(' · ')}</div></div>
      </div>
      <div class="doc"><h1>${esc(title)}</h1><div>N.º ${esc(number || '')}</div><div>Fecha: ${fmtDate(date)}</div></div>
    </div>
    <div class="parties">
      <div class="box"><h4>Cliente</h4><div><strong>${esc(client.name || '—')}</strong></div>
        <div class="muted">${[client.rif && 'RIF/C.I.: ' + esc(client.rif), client.address && esc(client.address), client.phone && esc(client.phone)].filter(Boolean).join('<br>')}</div></div>
      <div class="box" style="text-align:right">${meta.map(([k, v]) => `<div><span class="muted">${esc(k)}:</span> ${esc(v)}</div>`).join('')}</div>
    </div>
    ${bodyHtml}
    ${signatures.length ? `<div class="signs">${signatures.map(s => `<div class="sign">${esc(s)}<br><span class="muted">Nombre, C.I. y firma</span></div>`).join('')}</div>` : ''}
  </body></html>`;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const w = frame.contentWindow;
  w.document.open();
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); setTimeout(() => frame.remove(), 1000); }, 300);
}
