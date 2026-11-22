// Recolorea la foto de un producto cromado para simular los acabados Steel Gray y Rose Gold
// cuando no existe foto propia. El fondo blanco se conserva; solo se tiñe el producto.
const MAPS = {
  'cromado': [[34, 37, 42], [150, 156, 164], [252, 252, 254]],
  // sombras → medios → luces
  'steel gray': [[16, 18, 21], [76, 80, 86], [168, 171, 177]],
  'rose gold': [[70, 34, 32], [190, 118, 108], [250, 220, 205]]
};
export const tintKind = (color) => { const c = String(color || '').trim().toLowerCase(); return MAPS[c] ? c : ''; };

const lerp = (a, b, t) => a + (b - a) * t;
function ramp(stops, t) {
  const [lo, mid, hi] = stops;
  const [a, b, u] = t < 0.5 ? [lo, mid, t * 2] : [mid, hi, (t - 0.5) * 2];
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
}

const cache = new Map();
// Devuelve un data URL PNG con la foto teñida; si falla, devuelve la url original.
export async function tintPhoto(url, color) {
  const kind = tintKind(color);
  if (!kind || !url) return url;
  const key = kind + '|' + url;
  if (cache.has(key)) return cache.get(key);
  try {
    const res = await fetch(new URL(url, window.location.href).href);
    if (!res.ok) return url;
    const bmp = await createImageBitmap(await res.blob());
    const w = bmp.width, h = bmp.height;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    // Fondo = píxeles casi blancos conectados con el borde (así las luces del cromo no se pierden).
    const isBg = new Uint8Array(w * h);
    const near = (i) => d[i] > 208 && d[i + 1] > 208 && d[i + 2] > 208;
    const stack = [];
    const push = (x, y) => { const p = y * w + x; if (!isBg[p] && near(p * 4)) { isBg[p] = 1; stack.push(p); } };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p / w) | 0;
      if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1);
    }
    for (let p = 0; p < w * h; p++) {
      if (isBg[p]) continue;
      const i = p * 4;
      const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      // El cromo es muy claro: se estira el contraste para que el tono se note.
      const t = Math.min(1, Math.max(0, (lum - 0.15) / 0.8));
      const [r, g, b] = ramp(MAPS[kind], t);
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
    ctx.putImageData(img, 0, 0);
    const out = canvas.toDataURL('image/png');
    cache.set(key, out);
    return out;
  } catch { return url; }
}
