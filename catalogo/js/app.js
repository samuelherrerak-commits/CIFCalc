import { CONFIG } from './config.js';
import { loadCatalog, loadSlots, createOrder } from './data.js';
import { searchKey } from './normalize.js';
import { money, bs, shownUnit, computeTax, unitPrice, ivaTipoOf } from './price.js';
import { cart } from './cart.js';
import { waLink, orderMessage, productMessage } from './whatsapp.js';
import { SORTS, parseFilters, toQuery, filterProducts, facetCounts, sortProducts, paginate, pageWindow } from './filters.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Absoluta respecto a este módulo: sirve igual desde /catalogo/ y /catalogo/prueba/.
const IMG = new URL('../assets/img/', import.meta.url).href;

const SERIE_IMG = {
  equinox: 'ecl-banco', eclipse: 'eclipse', selene: 'grifo-agua', callisto: 'lavabo', luna: 'lluvia',
  zenith: 'empotrado', triton: 'mar', accesorios: 'toallero', gravity: 'textura'
};

let ctx = null;                      // catálogo cargado (+ names, byId, priceOf al arrancar)
let lastOrder = null;
try { lastOrder = JSON.parse(sessionStorage.getItem('cat_last_order') || 'null'); } catch { /* sin almacenamiento */ }

/* ------------------------------------------------------------------ helpers */
const photo = (p, w) => (p.foto ? p.foto.replace(/sz=w\d+/, 'sz=w' + w) : '');
const imgTag = (p, w, extra = '') => p.foto
  ? `<img src="${esc(photo(p, w))}" alt="${esc(p.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${extra}>`
  : `<img src="${IMG}logo-dark.png" alt="" data-failed>`;

document.addEventListener('error', (e) => {
  const t = e.target;
  if (t && t.tagName === 'IMG' && t.closest('.card__img, .pimg, .line__img') && !t.dataset.failed) {
    t.dataset.failed = '1'; t.src = IMG + 'logo-dark.png'; t.alt = '';
  }
}, true);

const ctxFor = () => ({ fs: ctx.fs, promos: ctx.promos });

function priceHtml(p) {
  if (!(p.price > 0)) return '<span class="price">Consultar precio</span>';
  const u = shownUnit(p, ctxFor());
  const old = u.pct > 0 ? `<s>${money(u.shownList)}</s>` : '';
  const note = u.exento ? 'Exento de IVA' : (ctx.fs.ivaEnabled ? 'IVA incluido' : '');
  const bsLine = ctx.usdt ? `<span class="bsv">${bs(u.shown * ctx.usdt)}</span>` : '';
  return `<span class="price">${old}${money(u.shown)}<small>${note}${bsLine}</small></span>`;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2200);
}

const plusIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const checkIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

/* ------------------------------------------------------------------ carrito */
function resolveCart() {
  const byId = new Map(ctx.products.map((p) => [p.id, p]));
  const lines = cart.lines().map((l) => {
    const product = byId.get(l.id);
    if (!product || !(product.price > 0)) return null;
    const u = shownUnit(product, ctxFor());
    return { product, qty: l.qty, unit: u.shown, base: u.unit, exento: u.exento };
  }).filter(Boolean);
  const t = computeTax(lines.map((l) => ({ amount: l.qty * l.base, tipo: ivaTipoOf(l.product) })), ctx.fs);
  return { lines, totals: { ...t, iva: ctx.fs.ivaEnabled && (t.tax > 0 || t.exempt < t.subtotal) } };
}

function updateBadge(bump) {
  const n = cart.count();
  $('#cart-count').textContent = String(n);
  if (bump) { const b = $('#cart-open'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
}

function addToCart(id, qty = 1) {
  const p = ctx.products.find((x) => x.id === id);
  if (!p || !(p.price > 0)) return false;
  const have = cart.qtyOf(id);
  if (have + qty > p.stock) { toast(`Solo hay ${p.stock} en existencia de este producto.`); return false; }
  cart.add(id, qty, p.stock);
  updateBadge(true);
  return true;
}

/* ------------------------------------------------------------------ drawer */
let lastFocus = null;
function openDrawer() {
  lastFocus = document.activeElement;
  $('#toast').classList.remove('on');
  renderDrawer();
  const d = $('#drawer'), s = $('#scrim');
  d.removeAttribute('inert'); d.setAttribute('aria-hidden', 'false'); s.hidden = false;
  requestAnimationFrame(() => { d.classList.add('on'); s.classList.add('on'); });
  document.body.style.overflow = 'hidden';
  setTimeout(() => ($('#drawer .iconbtn') || d).focus(), 30);
}
function closeDrawer() {
  const d = $('#drawer'), s = $('#scrim');
  d.classList.remove('on'); s.classList.remove('on'); d.setAttribute('aria-hidden', 'true'); d.setAttribute('inert', '');
  document.body.style.overflow = '';
  setTimeout(() => { s.hidden = true; }, 260);
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

function lineHtml(l, controls) {
  return `<div class="line">
    <div class="line__img">${imgTag(l.product, 200)}</div>
    <div class="line__t"><a href="#/p/${esc(l.product.id)}" data-close style="text-decoration:none">${esc(l.product.name)}</a>
      <small>${esc(l.product.sku)}${l.product.finish ? ' · ' + esc(l.product.finish) : ''}</small>
      ${controls ? `<div class="line__ctl">
        <div class="qty" role="group" aria-label="Cantidad de ${esc(l.product.name)}">
          <button type="button" data-dec="${esc(l.product.id)}" aria-label="Quitar una unidad">−</button>
          <input type="text" inputmode="numeric" value="${l.qty}" data-qty="${esc(l.product.id)}" aria-label="Cantidad">
          <button type="button" data-inc="${esc(l.product.id)}" aria-label="Agregar una unidad" ${l.qty >= l.product.stock ? 'disabled' : ''}>+</button>
        </div>
        <span class="price">${money(l.unit * l.qty)}</span>
      </div><button type="button" class="rm" data-rm="${esc(l.product.id)}">Quitar</button>` : ''}
    </div>
    ${controls ? '' : `<div class="line__p">${money(l.unit * l.qty)}</div>`}
  </div>`;
}

function totalsHtml(t) {
  const rows = [];
  if (ctx.fs.ivaEnabled && t.tax > 0 || t.exempt > 0) {
    rows.push(`<div><span>Subtotal</span><span>${money(t.subtotal)}</span></div>`);
    if (t.tax_general) rows.push(`<div><span>IVA ${ctx.fs.rateGeneral}%</span><span>${money(t.tax_general)}</span></div>`);
    if (t.tax_reducida) rows.push(`<div><span>IVA ${ctx.fs.rateReducida}%</span><span>${money(t.tax_reducida)}</span></div>`);
  }
  rows.push(`<div class="grand"><span>Total</span><span>${money(t.total)}</span></div>`);
  if (ctx.usdt) rows.push(`<div><span>Referencia en bolívares (USDT)</span><span>${bs(t.total * ctx.usdt)}</span></div>`);
  return rows.join('');
}

function renderDrawer() {
  const { lines, totals } = resolveCart();
  const d = $('#drawer');
  d.innerHTML = `
    <div class="drawer__head"><h2 id="drawer-title">Tu pedido</h2>
      <button class="iconbtn" type="button" data-close aria-label="Cerrar pedido"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="drawer__body">${lines.length ? `<div class="lines">${lines.map((l) => lineHtml(l, true)).join('')}</div>` :
      `<div class="empty"><p class="display" style="font-size:2rem;margin-bottom:8px">Aún no hay productos</p><p>Agrega grifería, duchas o accesorios y arma tu pedido.</p><button class="btn" type="button" data-close>Seguir viendo</button></div>`}</div>
    ${lines.length ? `<div class="drawer__foot">
      <div class="drawer__total"><span>Total<small>${ctx.fs.ivaEnabled ? 'IVA incluido' : ''}</small></span><span>${money(totals.total)}</span></div>
      <a class="btn btn--block" href="#/pedido" data-close>Finalizar pedido</a>
      <button class="btn btn--ghost btn--block" type="button" data-close>Seguir viendo</button></div>` : ''}`;
}

/* ------------------------------------------------------------------ catálogo: datos derivados */
const unique = (key, labelKey) => {
  const m = new Map();
  ctx.products.forEach((p) => { if (p[labelKey]) m.set(p[key], p[labelKey]); });
  return [...m].sort((a, b) => a[1].localeCompare(b[1]));
};
const countBy = (key) => {
  const m = new Map();
  ctx.products.forEach((p) => m.set(p[key], (m.get(p[key]) || 0) + 1));
  return m;
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const nameOf = (kind, key) => (ctx.names[kind].get(key) || key);

// Tarjeta de producto. `i >= 0` → entra con animación escalonada (solo en la carga de la página).
function cardHtml(p, i = -1) {
  const low = p.stock <= 5;
  return `<article class="card${i >= 0 ? ' enter' : ''}"${i >= 0 ? ` style="--i:${Math.min(i, 14)}"` : ''}>
    <div class="card__img">${low ? `<span class="tag tag--low">Últimas ${p.stock}</span>` : ''}${imgTag(p, 600)}</div>
    <div class="card__body">
      <span class="sku">${esc(p.sku)}</span>
      <h3><a href="#/p/${esc(p.id)}">${esc(p.name)}</a></h3>
      <p class="meta">${esc(p.series)}${p.finish ? ' · ' + esc(p.finish) : ''}</p>
      <div class="card__foot">${priceHtml(p)}
        ${p.price > 0 ? `<button class="quick" type="button" data-add="${esc(p.id)}" aria-label="Agregar ${esc(p.name)} al pedido">${plusIcon}</button>` : ''}</div>
    </div></article>`;
}

/* ------------------------------------------------------------------ recientes */
const RKEY = 'cat_recent';
const recentIds = () => { try { const l = JSON.parse(localStorage.getItem(RKEY) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; } };
function pushRecent(id) {
  const l = [id, ...recentIds().filter((x) => x !== id)].slice(0, 12);
  try { localStorage.setItem(RKEY, JSON.stringify(l)); } catch { /* sin almacenamiento */ }
}
const recentProducts = (exclude = '') => recentIds().filter((x) => x !== exclude).map((id) => ctx.byId.get(id)).filter(Boolean);

/* ------------------------------------------------------------------ cabecera */
const searchIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';

function renderHeader() {
  const cats = [...countBy('categoryKey')].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k);
  $('#top').innerHTML = `
    <div class="wrap top__main">
      <a class="brand" href="#/" aria-label="Briggs, inicio"><img src="${IMG}logo-light.png" alt="Briggs" width="234" height="40"></a>
      <form class="hsearch" id="hsearch" role="search" autocomplete="off">
        <label class="sr" for="hq">Buscar productos</label>
        ${searchIcon}
        <input id="hq" type="search" role="combobox" aria-expanded="false" aria-controls="hs-list" aria-autocomplete="list" placeholder="Busca por nombre, código o serie" enterkeyhint="search">
        <ul class="hs__list" id="hs-list" role="listbox" aria-label="Sugerencias" hidden></ul>
      </form>
      <a class="hlink" href="#/catalogo" data-nav="catalogo">Catálogo</a>
      <button class="cartbtn" id="cart-open" type="button" aria-haspopup="dialog" aria-controls="drawer"><span>Pedido</span><b id="cart-count" aria-label="productos en el pedido">0</b></button>
    </div>
    <nav class="top__cats" aria-label="Categorías"><div class="wrap top__cats-in">
      <a href="#/catalogo" data-nav="todo">Todo el catálogo</a>
      ${cats.map((k) => `<a href="#/catalogo?cat=${esc(k)}" data-nav-cat="${esc(k)}">${esc(nameOf('cat', k))}</a>`).join('')}
    </div></nav>`;
}

function setHeaderH() {
  document.documentElement.style.setProperty('--header-h', ($('#top').offsetHeight || 68) + 'px');
}

// Sugerencias mientras se escribe (combobox accesible).
function bindHeaderSearch() {
  const form = $('#hsearch'), input = $('#hq'), listEl = $('#hs-list');
  let idx = -1, t;
  const close = () => { listEl.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); idx = -1; };
  const go = (href) => { close(); input.blur(); location.hash = href; };
  const optionEls = () => [...listEl.querySelectorAll('[role="option"]')];
  const mark = (n) => {
    const els = optionEls(); if (!els.length) return;
    idx = (n + els.length) % els.length;
    els.forEach((el, i) => el.setAttribute('aria-selected', String(i === idx)));
    input.setAttribute('aria-activedescendant', els[idx].id);
  };
  const open = () => {
    const q = input.value.trim();
    if (q.length < 2) return close();
    const f = { ...parseFilters(new URLSearchParams()), q };
    const found = sortProducts(filterProducts(ctx.products, f, ctx.priceOf), 'relevancia', ctx.priceOf, q);
    if (!found.length) {
      listEl.innerHTML = `<li class="hs__none" role="presentation">Sin resultados para «${esc(q)}»</li>`;
    } else {
      listEl.innerHTML = found.slice(0, 6).map((p, i) => `<li role="option" id="hs-o${i}" aria-selected="false" data-href="#/p/${esc(p.id)}">
          <span class="hs__img">${imgTag(p, 200).replace('loading="lazy"', 'loading="eager"')}</span>
          <span class="hs__t"><b>${esc(p.name)}</b><small>${esc(p.sku)} · ${esc(p.series)}</small></span>
          <span class="hs__p">${p.price > 0 ? money(shownUnit(p, ctxFor()).shown) : ''}</span></li>`).join('')
        + `<li role="option" id="hs-all" aria-selected="false" class="hs__all" data-href="#/catalogo?q=${encodeURIComponent(q)}">Ver los ${plural(found.length, 'resultado', 'resultados')} de «${esc(q)}»</li>`;
    }
    listEl.hidden = false; input.setAttribute('aria-expanded', 'true'); idx = -1;
  };
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(open, 80); });
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2) open(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (listEl.hidden) open(); mark(idx + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mark(idx - 1); }
    else if (e.key === 'Escape') { close(); }
    else if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); const el = optionEls()[idx]; if (el) go(el.dataset.href); }
  });
  input.addEventListener('blur', () => setTimeout(close, 140));
  listEl.addEventListener('mousedown', (e) => { const li = e.target.closest('[data-href]'); if (li) { e.preventDefault(); go(li.dataset.href); } });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    go(q ? '#/catalogo?q=' + encodeURIComponent(q) : '#/catalogo');
  });
}

/* ------------------------------------------------------------------ página de catálogo */
const CAT_IMG = {
  lavamanos: 'lavabo', 'mezcladores-de-ducha': 'empotrado', 'sistemas-de-ducha': 'ducha-pared', 'cabezales-de-ducha': 'lluvia',
  'regaderas-de-mano': 'lluvia-cuadrada', 'accesorios-de-bano': 'toallero', 'brazos-de-ducha': 'lluvia-cuadrada',
  valvulas: 'textura', 'griferia-de-piso': 'grifo-agua', 'trim-de-ducha': 'empotrado'
};
const PRICE_PRESETS = [[null, 50, 'Hasta $50'], [50, 100, '$50 a $100'], [100, 200, '$100 a $200'], [200, null, 'Más de $200']];

let cf = parseFilters(new URLSearchParams());

function chipsOf() {
  const c = [];
  if (cf.q) c.push({ k: 'q', v: '', t: `Búsqueda: «${cf.q}»` });
  if (cf.cat) c.push({ k: 'cat', v: cf.cat, t: nameOf('cat', cf.cat) });
  cf.serie.forEach((s) => c.push({ k: 'serie', v: s, t: nameOf('serie', s) }));
  cf.acab.forEach((s) => c.push({ k: 'acab', v: s, t: nameOf('acab', s) }));
  if (cf.min !== null || cf.max !== null) {
    c.push({ k: 'precio', v: '', t: cf.min !== null && cf.max !== null ? `${money(cf.min)} a ${money(cf.max)}` : cf.min !== null ? `Desde ${money(cf.min)}` : `Hasta ${money(cf.max)}` });
  }
  return c;
}

function panelHtml(counts) {
  const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
  const group = (title, body) => `<details class="fgroup" open><summary>${title}</summary><div class="fgroup__b">${body}</div></details>`;
  const cats = [...ctx.names.cat].filter(([k]) => counts.cat.get(k) || cf.cat === k).sort((a, b) => a[1].localeCompare(b[1]));
  const catBody = `<ul class="flist"><li><button type="button" class="fopt${cf.cat ? '' : ' on'}" data-f="cat" data-v="" data-fkey="cat-" aria-pressed="${!cf.cat}">Todas<em>${sum(counts.cat)}</em></button></li>
    ${cats.map(([k, n]) => `<li><button type="button" class="fopt${cf.cat === k ? ' on' : ''}" data-f="cat" data-v="${esc(k)}" data-fkey="cat-${esc(k)}" aria-pressed="${cf.cat === k}">${esc(n)}<em>${counts.cat.get(k) || 0}</em></button></li>`).join('')}</ul>`;
  const checks = (kind, map) => {
    const rows = [...ctx.names[kind]].filter(([k]) => map.get(k) || cf[kind].includes(k)).sort((a, b) => a[1].localeCompare(b[1]));
    return rows.length ? `<ul class="flist">${rows.map(([k, n]) => `<li><label class="fcheck"><input type="checkbox" data-f="${kind}" data-v="${esc(k)}" data-fkey="${kind}-${esc(k)}" ${cf[kind].includes(k) ? 'checked' : ''}><span>${esc(n)}</span><em>${map.get(k) || 0}</em></label></li>`).join('')}</ul>` : '<p class="count">Sin opciones</p>';
  };
  const presets = PRICE_PRESETS.map(([min, max, label]) => {
    const on = cf.min === min && cf.max === max;
    return `<li><button type="button" class="fopt${on ? ' on' : ''}" data-f="precio" data-min="${min ?? ''}" data-max="${max ?? ''}" data-fkey="precio-${min ?? 0}-${max ?? 0}" aria-pressed="${on}">${label}</button></li>`;
  }).join('');
  const priceBody = `<ul class="flist">${presets}</ul>
    <form class="fprice" data-fprice><label class="sr">Precio mínimo</label><input name="min" inputmode="decimal" placeholder="Mín." value="${cf.min ?? ''}" aria-label="Precio mínimo">
      <span aria-hidden="true">–</span><label class="sr">Precio máximo</label><input name="max" inputmode="decimal" placeholder="Máx." value="${cf.max ?? ''}" aria-label="Precio máximo">
      <button class="btn btn--ghost" type="submit" data-fkey="precio-go">Ir</button></form>
    <p class="count" style="margin-top:8px">Precios en dólares${ctx.fs.ivaEnabled ? ' con IVA' : ''}.</p>`;
  return group('Categoría', catBody) + group('Colección', checks('serie', counts.serie)) + (ctx.names.acab.size ? group('Acabado', checks('acab', counts.acab)) : '') + group('Precio', priceBody);
}

function viewCatalog() {
  return `<div class="wrap">
    <nav class="crumbs" aria-label="Ruta"><a href="#/">Inicio</a><span aria-hidden="true">/</span><span id="cat-crumb" aria-current="page">Catálogo</span></nav>
    <div class="cat">
      <aside class="cat__side" id="cat-side" aria-label="Filtros"></aside>
      <div class="cat__main">
        <div class="cat__head">
          <div><h1 class="display" id="cat-title">Catálogo</h1><p class="count" id="cat-count" aria-live="polite"></p></div>
          <div class="cat__tools">
            <button class="btn btn--ghost cat__fbtn" id="cat-fopen" type="button" aria-haspopup="dialog" aria-controls="fsheet">Filtros<b id="cat-fn" hidden></b></button>
            <label class="field field--inline"><span class="lbl">Ordenar por</span><select id="cat-sort">${SORTS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
          </div>
        </div>
        <div class="achips" id="cat-chips"></div>
        <div id="cat-results"></div>
        <nav class="pager" id="cat-pager" aria-label="Páginas de resultados"></nav>
      </div>
    </div>
    <div class="fsheet" id="fsheet" role="dialog" aria-modal="true" aria-labelledby="fsheet-t" aria-hidden="true" inert>
      <div class="fsheet__scrim" data-fclose></div>
      <div class="fsheet__panel">
        <div class="fsheet__head"><h2 id="fsheet-t">Filtros</h2><button class="iconbtn" type="button" data-fclose aria-label="Cerrar filtros"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
        <div class="fsheet__body" id="fsheet-body"></div>
        <div class="fsheet__foot"><button class="btn btn--ghost" type="button" data-f="clear">Limpiar</button><button class="btn" type="button" data-fclose id="fsheet-apply">Ver productos</button></div>
      </div>
    </div></div>`;
}

// Repinta el catálogo con el estado `cf`. `animate` solo en la primera carga de la página.
function updateCatalog(animate = false) {
  if (!$('#cat-results')) return;
  const found = filterProducts(ctx.products, cf, ctx.priceOf);
  const sorted = sortProducts(found, cf.orden, ctx.priceOf, cf.q);
  const pg = paginate(sorted, cf.p); cf.p = pg.page;
  const counts = facetCounts(ctx.products, cf, ctx.priceOf);

  const title = cf.q ? `Resultados para «${cf.q}»` : cf.cat ? nameOf('cat', cf.cat) : 'Catálogo';
  $('#cat-title').textContent = title;
  $('#cat-crumb').textContent = cf.cat && !cf.q ? `Catálogo / ${nameOf('cat', cf.cat)}` : (cf.q ? 'Búsqueda' : 'Catálogo');
  $('#cat-count').textContent = found.length ? `${plural(found.length, 'producto', 'productos')}${pg.pages > 1 ? ` · mostrando ${pg.from}–${pg.to}` : ''}` : '';
  document.title = `${title} · ${ctx.mode === 'borrador' ? 'Borrador · ' : ''}Briggs`;
  $('#cat-sort').value = cf.orden;
  const hq = $('#hq'); if (hq && document.activeElement !== hq) hq.value = cf.q;

  // Los filtros se repintan: se devuelve el foco al mismo control para quien navega con teclado.
  const ae = document.activeElement;
  const focusKey = ae && ae.dataset ? ae.dataset.fkey : '';
  const inSheet = ae && ae.closest ? !!ae.closest('#fsheet') : false;
  const html = panelHtml(counts);
  $('#cat-side').innerHTML = `<h2 class="fside__t">Filtrar</h2>${html}`;
  $('#fsheet-body').innerHTML = html;
  if (focusKey) { const el = $(`${inSheet ? '#fsheet-body' : '#cat-side'} [data-fkey="${focusKey}"]`); if (el) el.focus({ preventScroll: true }); }

  const chips = chipsOf();
  $('#cat-chips').innerHTML = chips.length ? `${chips.map((c) => `<button type="button" class="achip" data-f="rm" data-k="${c.k}" data-v="${esc(c.v)}">${esc(c.t)}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg><span class="sr"> Quitar</span></button>`).join('')}<button type="button" class="link" data-f="clear">Limpiar todo</button>` : '';
  const nF = chips.filter((c) => c.k !== 'q').length;
  const fn = $('#cat-fn'); fn.hidden = !nF; fn.textContent = String(nF);
  $('#fsheet-apply').textContent = found.length ? `Ver ${plural(found.length, 'producto', 'productos')}` : 'Sin resultados';

  $('#cat-results').innerHTML = pg.items.length
    ? `<h2 class="sr">Productos</h2><div class="grid">${pg.items.map((p, i) => cardHtml(p, animate ? i : -1)).join('')}</div>`
    : `<div class="empty"><p class="display">Sin resultados</p><p>No encontramos productos en existencia con esos filtros. Quita alguno o escríbenos y lo buscamos por ti.</p>
       <div class="empty__act"><button class="btn" type="button" data-f="clear">Limpiar filtros</button>
       <a class="btn btn--ghost" href="${waLink(`Hola ${CONFIG.STORE_NAME}, busco: ${cf.q || 'un producto'}. ¿Me ayudan?`)}" target="_blank" rel="noopener">Consultar por WhatsApp</a></div></div>`;

  const link = (n) => `#/catalogo${toQuery({ ...cf, p: n })}`;
  $('#cat-pager').innerHTML = pg.pages > 1
    ? `${pg.page > 1 ? `<a class="pg" href="${link(pg.page - 1)}" rel="prev">Anterior</a>` : ''}
       ${pageWindow(pg.page, pg.pages).map((n) => n === '…' ? '<span class="pg pg--gap" aria-hidden="true">…</span>' : `<a class="pg${n === pg.page ? ' on' : ''}" href="${link(n)}" ${n === pg.page ? 'aria-current="page"' : ''} aria-label="Página ${n}">${n}</a>`).join('')}
       ${pg.page < pg.pages ? `<a class="pg" href="${link(pg.page + 1)}" rel="next">Siguiente</a>` : ''}` : '';

  history.replaceState(null, '', '#/catalogo' + toQuery(cf));    // no dispara hashchange
  document.querySelectorAll('.top__cats a').forEach((a) => a.removeAttribute('aria-current'));
  const act = cf.cat ? $(`[data-nav-cat="${cf.cat}"]`) : $('[data-nav="todo"]');
  if (act) act.setAttribute('aria-current', 'page');
}

function openSheet() {
  const s = $('#fsheet'); if (!s) return;
  lastFocus = document.activeElement;
  s.removeAttribute('inert'); s.setAttribute('aria-hidden', 'false'); s.classList.add('on'); document.body.style.overflow = 'hidden';
  setTimeout(() => { const c = s.querySelector('.iconbtn'); if (c) c.focus(); }, 30);
}
function closeSheet() {
  const s = $('#fsheet'); if (!s || !s.classList.contains('on')) return;
  s.classList.remove('on'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('inert', ''); document.body.style.overflow = '';
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

// Un clic en un filtro cambia `cf` y repinta; vuelve a la página 1.
function handleFilter(el) {
  const f = el.dataset.f;
  const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  if (f === 'cat') cf.cat = el.dataset.v;
  else if (f === 'serie' || f === 'acab') cf[f] = toggle(cf[f], el.dataset.v);
  else if (f === 'precio') {
    const same = String(cf.min ?? '') === el.dataset.min && String(cf.max ?? '') === el.dataset.max;
    cf.min = same || el.dataset.min === '' ? null : Number(el.dataset.min);
    cf.max = same || el.dataset.max === '' ? null : Number(el.dataset.max);
  } else if (f === 'rm') {
    const k = el.dataset.k, v = el.dataset.v;
    if (k === 'q') { cf.q = ''; const hq = $('#hq'); if (hq) hq.value = ''; }
    else if (k === 'cat') cf.cat = '';
    else if (k === 'serie' || k === 'acab') cf[k] = cf[k].filter((x) => x !== v);
    else if (k === 'precio') { cf.min = null; cf.max = null; }
  } else if (f === 'clear') {
    cf = { ...parseFilters(new URLSearchParams()), orden: cf.orden };
    const hq = $('#hq'); if (hq) hq.value = '';
  } else return;
  cf.p = 1;
  updateCatalog();
}

/* ------------------------------------------------------------------ portada */
function featured() {
  const buy = ctx.products.filter((p) => p.price > 0 && p.foto);
  const pick = [], seen = new Set();
  const add = (p) => { if (p && !seen.has(p.id)) { seen.add(p.id); pick.push(p); } };
  for (const [k] of ctx.names.serie) add(buy.find((p) => p.seriesKey === k && p.categoryKey === 'lavamanos') || buy.find((p) => p.seriesKey === k));
  for (const [k] of ctx.names.cat) add(buy.find((p) => p.categoryKey === k));
  return pick.slice(0, 12);
}

function viewHome() {
  const cats = [...countBy('categoryKey')].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const series = unique('seriesKey', 'series');
  const counts = countBy('seriesKey');
  const rec = recentProducts();
  return `
  <section class="hero"><div class="hero__in">
    <div class="hero__text">
      <p class="runhead">The Premium Bath Collection</p>
      <h1 class="display h1">Grifería que da carácter al baño</h1>
      <p class="lead">Monomandos, duchas y accesorios Briggs en existencia. Arma tu pedido y un asesor lo confirma contigo por WhatsApp o en videollamada.</p>
      <div class="hero__actions"><a class="btn btn--light" href="#/catalogo">Ver el catálogo</a>
        <a class="btn btn--ghost" href="${waLink('Hola ' + CONFIG.STORE_NAME + ', quisiera asesoría para elegir productos.')}" target="_blank" rel="noopener">Hablar con un asesor</a></div>
    </div>
    <div class="hero__img"><img src="${IMG}hero-cover.webp" alt="Tres monomandos Briggs en acabados negro, steel grey y cromado sobre roca oscura" fetchpriority="high"></div>
  </div></section>

  <section class="trust" aria-label="Cómo comprar"><div class="wrap trust__in">
    <div><b>Solo en existencia</b><span>Lo que ves está disponible hoy.</span></div>
    <div><b>Precios con IVA incluido</b><span>Con referencia en bolívares a tasa USDT.</span></div>
    <div><b>Atención por WhatsApp</b><span>Un asesor confirma tu pedido.</span></div>
    <div><b>Videollamada por Meet</b><span>Agenda al hacer tu pedido.</span></div>
  </div></section>

  <section class="section section--tight"><div class="wrap">
    <div class="shead"><h2 class="display h2">Compra por categoría</h2><a class="link" href="#/catalogo">Ver todo el catálogo</a></div>
    <div class="cats">${cats.map(([k, n]) => `<a class="cattile" href="#/catalogo?cat=${esc(k)}"><span class="cattile__img"><img src="${IMG}${CAT_IMG[k] || 'textura'}.webp" alt="" loading="lazy"></span>
      <span class="cattile__t">${esc(nameOf('cat', k))}</span><span class="count">${plural(n, 'producto', 'productos')}</span></a>`).join('')}</div>
  </div></section>

  ${series.length > 1 ? `<section id="series" aria-label="Colecciones"><div class="wrap shead" style="padding-bottom:20px"><h2 class="display h2">Colecciones</h2></div><div class="series">${series.map(([k, name]) => `
    <a class="serie" href="#/catalogo?serie=${esc(k)}"><img src="${IMG}${SERIE_IMG[k] || 'textura'}.webp" alt="" loading="lazy">
      <div class="serie__txt"><span class="display">${esc(name)}</span><span>${plural(counts.get(k), 'producto', 'productos')}</span></div></a>`).join('')}</div></section>` : ''}

  <section class="section section--tight"><div class="wrap">
    ${railHtml('feat', 'Productos destacados', 'Una selección de cada colección', featured())}
    ${rec.length ? railHtml('rec', 'Vistos recientemente', 'Para que retomes donde lo dejaste', rec) : ''}
  </div></section>

  <section class="story" id="nosotros">
    <div class="story__img"><img src="${IMG}roca.webp" alt="Roca oscura junto al agua" loading="lazy"></div>
    <div class="story__txt">
      <h2 class="display h2">Desde 1908, el diseño como forma de mejorar la vida diaria</h2>
      <p>Briggs desarrolla soluciones para baño y cocina donde la innovación, la funcionalidad y la estética conviven en armonía. Cada pieza está pensada para integrarse con elegancia en el día a día y durar.</p>
    </div>
  </section>

  <section class="section"><div class="wrap">
    <h2 class="display h2">Pedir es sencillo</h2>
    <div class="steps">
      <div><h3>Elige lo que necesitas</h3><p>Busca por serie, acabado o código y agrega al pedido solo lo que está en existencia.</p></div>
      <div><h3>Confirma por WhatsApp</h3><p>Tu pedido queda registrado como presupuesto y se abre una conversación con un asesor con el resumen listo.</p></div>
      <div><h3>Agenda tu reunión</h3><p>Si prefieres, reserva una videollamada por Google Meet para resolver dudas antes de pagar.</p></div>
    </div>
  </div></section>`;
}

function viewProduct(id) {
  const p = ctx.products.find((x) => x.id === id);
  if (!p) return `<div class="wrap"><div class="empty"><p class="display">Producto no disponible</p><p>Este producto ya no está en existencia o no existe.</p><a class="btn" href="#/catalogo">Volver al catálogo</a></div></div>`;
  document.title = `${p.name} · ${p.sku} · Briggs`;
  const sibs = ctx.products.filter((x) => x.family === p.family && x.finish);
  const sug = suggestions(p);
  const buyable = p.price > 0;
  const inCart = cart.qtyOf(p.id);
  const rec = recentProducts(p.id);
  return `<div class="wrap pdp-page${buyable ? ' has-buybar' : ''}">
    <nav class="crumbs" aria-label="Ruta"><a href="#/">Inicio</a><span aria-hidden="true">/</span><a href="#/catalogo">Catálogo</a><span aria-hidden="true">/</span><a href="#/catalogo?cat=${esc(p.categoryKey)}">${esc(p.category)}</a><span aria-hidden="true">/</span><span aria-current="page">${esc(p.sku)}</span></nav>
    <div class="pdp">
      <div class="pimg">${imgTag(p, 1000, 'loading="eager" fetchpriority="high"').replace('loading="lazy" ', '')}</div>
      <div class="pinfo">
        <div><p class="runhead">Serie ${esc(p.series)}</p><h1 class="display" style="margin-top:8px">${esc(p.name)}</h1></div>
        <p class="sku" style="font-size:.9375rem">${esc(p.sku)}</p>
        ${priceHtml(p)}
        ${p.price > 0 && ctx.usdt ? `<p class="stocknote" style="margin-top:-12px">Bolívares a tasa USDT: Bs ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2 }).format(ctx.usdt)} por USDT.</p>` : ''}
        ${sibs.length > 1 ? `<div><p class="stocknote" style="margin-bottom:8px">Acabado</p><div class="finishes">${sibs.map((s) => s.id === p.id
          ? `<span aria-current="true">${esc(s.finish)}</span>` : `<a href="#/p/${esc(s.id)}">${esc(s.finish)}</a>`).join('')}</div></div>` : (p.finish ? `<p class="stocknote">Acabado: ${esc(p.finish)}</p>` : '')}
        ${buyable ? `<div class="buyrow">
          <div class="qty" role="group" aria-label="Cantidad"><button type="button" id="q-dec" aria-label="Menos">−</button>
            <input id="q-val" type="text" inputmode="numeric" value="1" aria-label="Cantidad"><button type="button" id="q-inc" aria-label="Más">+</button></div>
          <button class="btn js-padd" type="button" style="flex:1;min-width:200px">Agregar al pedido</button></div>
          <p class="stocknote">${p.stock <= 5 ? `Últimas ${p.stock} unidades disponibles.` : `${p.stock} unidades disponibles.`}${inCart ? ` Ya tienes ${inCart} en tu pedido.` : ''}</p>`
        : `<a class="btn btn--wa" href="${waLink(productMessage(p))}" target="_blank" rel="noopener">Consultar precio por WhatsApp</a>
           <p class="stocknote">Este producto está en existencia; el precio lo confirma un asesor.</p>`}
        <div><h2>Ficha técnica</h2><table class="spec"><tbody>${p.specs.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table></div>
        ${p.description ? `<p>${esc(p.description)}</p>` : ''}
        <a class="link" href="${waLink(productMessage(p))}" target="_blank" rel="noopener" style="font-size:.9375rem">¿Dudas con este producto? Escríbenos por WhatsApp</a>
      </div>
    </div>
    ${railHtml('serie', p.series === 'Accesorios' ? 'Más accesorios de baño' : `De la colección ${p.series}`, 'Productos de la misma serie para completar tu baño', sug.serie)}
    ${railHtml('rel', 'Productos relacionados', 'Otras opciones que también podrían interesarte', sug.related)}
    ${rec.length ? railHtml('rec', 'Vistos recientemente', 'Para que retomes donde lo dejaste', rec) : ''}
    ${buyable ? `<div class="buybar" role="region" aria-label="Comprar"><div>${priceHtml(p)}</div><button class="btn js-padd" type="button">Agregar al pedido</button></div>` : ''}
  </div>`;
}

// Sugerencias tipo "comprados juntos": misma colección (complementos primero) y relacionados de otras series.
function suggestions(p) {
  const others = ctx.products.filter((x) => x.id !== p.id && x.family !== p.family);   // las variantes de acabado ya se ven arriba
  const byCode = (x, y) => x.sku.localeCompare(y.sku, undefined, { numeric: true });
  const serie = others.filter((x) => x.seriesKey === p.seriesKey)
    .sort((x, y) => (x.categoryKey === p.categoryKey) - (y.categoryKey === p.categoryKey) || byCode(x, y)).slice(0, 16);
  const used = new Set(serie.map((x) => x.id));
  let related = others.filter((x) => !used.has(x.id) && x.categoryKey === p.categoryKey).sort(byCode);
  if (related.length < 4) related = related.concat(others.filter((x) => !used.has(x.id) && x.categoryKey !== p.categoryKey).sort(byCode));
  return { serie, related: related.slice(0, 16) };
}

const chev = (d) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="${d < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}"/></svg>`;
function railHtml(id, title, sub, list) {
  if (!list.length) return '';
  return `<section class="related" aria-labelledby="r-${id}">
    <div class="rail__head"><div><h2 class="display h2" id="r-${id}">${esc(title)}</h2><p class="count">${esc(sub)}</p></div>
      <div class="rail__ctl"><button class="iconbtn rail__btn" type="button" data-rail="${id}" data-dir="-1" aria-label="Ver anteriores">${chev(-1)}</button>
        <button class="iconbtn rail__btn" type="button" data-rail="${id}" data-dir="1" aria-label="Ver siguientes">${chev(1)}</button></div></div>
    <div class="rail" id="rail-${id}" role="region" aria-label="${esc(title)}" tabindex="0">${list.map((x) => cardHtml(x)).join('')}</div></section>`;
}

let slotData = [];
function viewCheckout() {
  const { lines, totals } = resolveCart();
  document.title = 'Tu pedido · Briggs';
  if (!lines.length) return `<div class="wrap"><div class="empty"><p class="display">Tu pedido está vacío</p><p>Agrega productos desde el catálogo para continuar.</p><a class="btn" href="#/catalogo">Ver el catálogo</a></div></div>`;
  return `<div class="wrap"><nav class="crumbs" aria-label="Ruta"><a href="#/">Inicio</a><span aria-hidden="true">/</span><a href="#/catalogo">Catálogo</a><span aria-hidden="true">/</span><span aria-current="page">Pedido</span></nav>
  <div class="checkout">
    <div><h1 class="display">Confirma tu pedido</h1>
      <form class="form" id="order-form" novalidate>
        <label class="field">Nombre y apellido *<input name="name" autocomplete="name" required maxlength="80"><span class="err" data-err="name"></span></label>
        <div class="two">
          <label class="field">WhatsApp o teléfono *<input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="0412-0000000" required maxlength="20"><span class="err" data-err="phone"></span></label>
          <label class="field">Correo (opcional)<input name="email" type="email" autocomplete="email" maxlength="80"><span class="err" data-err="email"></span></label>
        </div>
        <label class="field">Ciudad o dirección de entrega<input name="address" autocomplete="street-address" maxlength="160"></label>
        <label class="field">Notas para el asesor<textarea name="notes" maxlength="400"></textarea></label>
        <div class="hp" aria-hidden="true"><label>Sitio web<input name="website" tabindex="-1" autocomplete="off"></label></div>
        <fieldset class="meet" style="margin:0"><legend class="meet__head" style="padding:0 6px">Reunión por Google Meet</legend>
          <label class="toggle"><input type="checkbox" id="meet-on"><span>Quiero agendar una videollamada con un asesor para revisar mi pedido.<br><span class="stocknote">Recibirás el enlace de Meet por correo y por WhatsApp.</span></span></label>
          <div id="meet-box" hidden><div class="days" id="days" role="group" aria-label="Día"></div><div class="times" id="times" role="group" aria-label="Hora"></div><span class="err" data-err="meet" style="font-size:.8125rem;color:var(--danger)"></span></div>
        </fieldset>
        <p class="err" id="form-err" role="alert" style="color:var(--danger)"></p>
        <button class="btn btn--wa btn--block" type="submit" id="submit">Confirmar y abrir WhatsApp</button>
        <p class="stocknote">Al confirmar se registra tu pedido como presupuesto pendiente (válido ${CONFIG.QUOTE_VALID_DAYS} días) y se abre WhatsApp con el resumen. No se cobra nada en línea.</p>
      </form></div>
    <aside class="summary" aria-label="Resumen del pedido"><h2>Resumen</h2>
      <div class="lines">${lines.map((l) => lineHtml(l, false).replace(/<small>/, `<small>${l.qty} × ${money(l.unit)} · `)).join('')}</div>
      <div class="totals">${totalsHtml(totals)}</div>
      <p class="note">Precios en dólares${ctx.fs.ivaEnabled ? ' con IVA incluido' : ''}. El asesor confirma disponibilidad, entrega y forma de pago.</p>
      <button class="btn btn--ghost" type="button" data-open-cart>Editar pedido</button>
    </aside></div></div>`;
}

function viewThanks(n) {
  const o = lastOrder && lastOrder.number === n ? lastOrder : null;
  document.title = `Pedido ${n} · Briggs`;
  if (!o) return `<div class="wrap thanks"><h1 class="display">Pedido ${esc(n)}</h1><p class="lead">Si acabas de confirmarlo, un asesor te escribirá por WhatsApp. Si no, empieza de nuevo desde el catálogo.</p><a class="btn" href="#/catalogo">Ver el catálogo</a></div>`;
  const fecha = o.meetStart ? new Date(o.meetStart).toLocaleString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
  return `<div class="wrap thanks">
    <p class="runhead">Gracias, ${esc(o.name.split(' ')[0])}</p>
    <h1 class="display">Pedido ${esc(n)} recibido</h1>
    <p class="lead">Quedó registrado como presupuesto pendiente por <strong>${money(o.total)}</strong>. Para avanzar, envía el resumen a tu asesor por WhatsApp.</p>
    <div><a class="btn btn--wa" id="wa-open" href="${esc(waLink(o.text))}" target="_blank" rel="noopener">Abrir WhatsApp con el asesor</a></div>
    ${fecha ? `<p>Reunión por Google Meet solicitada para <strong>${esc(fecha)}</strong>.${o.meetLink ? ` <a class="link" href="${esc(o.meetLink)}" target="_blank" rel="noopener">Enlace de Meet</a>` : ' El asesor te confirmará el enlace.'}</p>` : ''}
    ${o.saved ? '' : '<p class="note">Modo demostración: este pedido no se guardó en CIFCalc.</p>'}
    <a class="link" href="#/catalogo">Seguir viendo el catálogo</a></div>`;
}

function renderFooter() {
  $('#foot').innerHTML = `<div class="wrap">
    <div class="foot__top">
      <div><img src="${IMG}logo-light.png" alt="Briggs"><p>The Premium Bath Collection.<br>Grifería, duchas y accesorios de baño.</p></div>
      <div><h2>Catálogo</h2><a href="#/catalogo">Todos los productos</a><a href="#/series">Colecciones</a><a href="#/nosotros">Nosotros</a></div>
      <div><h2>Categorías</h2>${ctx ? [...countBy('categoryKey')].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k]) => `<a href="#/catalogo?cat=${esc(k)}">${esc(nameOf('cat', k))}</a>`).join('') : ''}</div>
      <div><h2>Contacto</h2><a href="${waLink('Hola ' + CONFIG.STORE_NAME + ', quisiera información.')}" target="_blank" rel="noopener">WhatsApp 0412-0298203</a><p>Atención con asesor y videollamada por Google Meet.</p></div>
    </div>
    <div class="foot__bot"><span>© ${new Date().getFullYear()} Briggs. Todos los derechos reservados.</span><span>Precios en USD${ctx && ctx.fs.ivaEnabled ? ' con IVA incluido' : ''}.</span></div></div>`;
}

/* ------------------------------------------------------------------ enrutador */
function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path: path || '/', params: new URLSearchParams(qs || '') };
}

function route() {
  const { path, params } = parseHash();
  const main = $('#main');
  // Enlaces antiguos (#/?serie=…) → página de catálogo.
  if (path === '/' && (params.has('serie') || params.has('cat') || params.has('q'))) { location.replace('#/catalogo?' + params.toString()); return; }
  document.querySelectorAll('[data-nav]').forEach((x) => x.removeAttribute('aria-current'));
  let anchor = '';
  document.title = ctx.mode === 'borrador' ? 'Borrador · Tienda online Briggs' : 'Briggs · Catálogo de grifería y accesorios de baño';
  document.body.classList.toggle('on-catalog', path === '/catalogo');
  if (path === '/' || path === '/series' || path === '/nosotros') {
    main.innerHTML = viewHome();
    anchor = path === '/series' ? 'series' : path === '/nosotros' ? 'nosotros' : '';
  } else if (path === '/catalogo') {
    cf = parseFilters(params);
    main.innerHTML = viewCatalog();
    updateCatalog(true);
    const a = $('.hlink[data-nav="catalogo"]'); if (a) a.setAttribute('aria-current', 'page');
  } else if (path.startsWith('/p/')) {
    const id = decodeURIComponent(path.slice(3));
    main.innerHTML = viewProduct(id);
    bindProduct(id);
    if (ctx.byId.has(id)) pushRecent(id);
  } else if (path === '/pedido') {
    main.innerHTML = viewCheckout();
    bindCheckout();
  } else if (path.startsWith('/gracias/')) {
    main.innerHTML = viewThanks(decodeURIComponent(path.slice(9)));
  } else {
    main.innerHTML = `<div class="wrap"><div class="empty"><p class="display">Página no encontrada</p><a class="btn" href="#/catalogo">Ir al catálogo</a></div></div>`;
  }
  const target = anchor && document.getElementById(anchor);
  if (target) target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  else window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

/* ------------------------------------------------------------------ enlaces de eventos */
function bindProduct(id) {
  const p = ctx.byId.get(id);
  if (!p || !(p.price > 0)) return;
  const val = $('#q-val');
  const clamp = () => { let n = Math.floor(Number(val.value) || 1); n = Math.max(1, Math.min(n, Math.max(1, p.stock - cart.qtyOf(id)))); val.value = String(n); return n; };
  $('#q-dec').addEventListener('click', () => { val.value = String((Number(val.value) || 1) - 1); clamp(); });
  $('#q-inc').addEventListener('click', () => { val.value = String((Number(val.value) || 1) + 1); clamp(); });
  val.addEventListener('change', clamp);
  const btns = document.querySelectorAll('.js-padd');
  btns.forEach((b) => { b.dataset.t = b.textContent; });
  btns.forEach((b) => b.addEventListener('click', () => {
    if (!addToCart(id, clamp())) return;
    toast('Agregado a tu pedido');
    btns.forEach((x) => { x.textContent = 'Agregado ✓'; });
    setTimeout(() => btns.forEach((x) => { x.textContent = x.dataset.t; }), 1400);
  }));
}

function bindCheckout() {
  const form = $('#order-form');
  if (!form) return;
  const on = $('#meet-on'), box = $('#meet-box');
  let chosen = { day: '', time: '' };
  const drawDays = () => {
    $('#days').innerHTML = slotData.map((d) => {
      const dt = new Date(d.date + 'T12:00:00');
      return `<button type="button" class="day" data-day="${d.date}" aria-pressed="${chosen.day === d.date}"><span>${dt.toLocaleDateString('es-VE', { weekday: 'short' })}</span><b>${dt.getDate()}</b><span>${dt.toLocaleDateString('es-VE', { month: 'short' })}</span></button>`;
    }).join('');
    const day = slotData.find((d) => d.date === chosen.day);
    $('#times').innerHTML = day ? day.times.map((t) => `<button type="button" class="time" data-time="${t}" aria-pressed="${chosen.time === t}">${t}</button>`).join('') : '<span class="stocknote">Elige un día para ver los horarios.</span>';
  };
  on.addEventListener('change', async () => {
    box.hidden = !on.checked;
    if (on.checked && !slotData.length) {
      try { slotData = await loadSlots(ctx.mode); } catch { $('#form-err').textContent = 'No pudimos cargar los horarios. Puedes continuar sin reunión.'; on.checked = false; box.hidden = true; return; }
      drawDays();
    }
  });
  box.addEventListener('click', (e) => {
    const d = e.target.closest('[data-day]'), t = e.target.closest('[data-time]');
    if (d) { chosen = { day: d.dataset.day, time: '' }; drawDays(); }
    if (t) { chosen.time = t.dataset.time; drawDays(); }
  });
  $('[data-open-cart]').addEventListener('click', openDrawer);

  const setErr = (k, m) => { const el = form.querySelector(`[data-err="${k}"]`); if (el) el.textContent = m; const i = form.elements[k]; if (i && i.setAttribute) i.setAttribute('aria-invalid', m ? 'true' : 'false'); };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    ['name', 'phone', 'email', 'meet'].forEach((k) => setErr(k, ''));
    $('#form-err').textContent = '';
    const f = Object.fromEntries(new FormData(form));
    if (f.website) return;                         // honeypot
    const digits = String(f.phone || '').replace(/\D/g, '');
    let bad = false;
    if (String(f.name || '').trim().length < 2) { setErr('name', 'Escribe tu nombre.'); bad = true; }
    if (digits.length < 10 || digits.length > 14) { setErr('phone', 'Escribe un teléfono válido, por ejemplo 0412-0000000.'); bad = true; }
    if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) { setErr('email', 'Revisa el correo.'); bad = true; }
    if (on.checked && !(chosen.day && chosen.time)) { setErr('meet', 'Elige día y hora para la reunión.'); bad = true; }
    if (bad) { const first = form.querySelector('[aria-invalid="true"]'); if (first) first.focus(); return; }

    const { lines, totals } = resolveCart();
    if (!lines.length) { location.hash = '#/catalogo'; return; }
    const meetStart = on.checked ? new Date(`${chosen.day}T${chosen.time}:00`).toISOString() : '';
    const customer = { name: f.name.trim(), phone: f.phone.trim(), email: (f.email || '').trim(), address: (f.address || '').trim(), notes: (f.notes || '').trim() };
    const btn = $('#submit'); btn.disabled = true; btn.textContent = 'Registrando pedido…';
    const win = window.open('about:blank', '_blank');   // se abre dentro del clic para que no lo bloquee el navegador
    try {
      const res = await createOrder(ctx.mode, {
        items: lines.map((l) => ({ id: l.product.id, qty: l.qty })), customer,
        meet: meetStart ? { start: meetStart } : null, website: ''
      }, { total: totals.total, items: lines.map((l) => ({ sku: l.product.sku, qty: l.qty })), customer });
      const text = orderMessage({ number: res.quote_number, lines, totals, customer, meetStart, meetLink: res.meet_link, draft: ctx.mode === 'borrador' });
      lastOrder = { number: res.quote_number, total: res.total ?? totals.total, name: customer.name, text, meetStart, meetLink: res.meet_link, saved: res.saved };
      try { sessionStorage.setItem('cat_last_order', JSON.stringify(lastOrder)); } catch { /* sin almacenamiento */ }
      cart.clear(); updateBadge(false);
      if (win) win.location.href = waLink(text);
      location.hash = '#/gracias/' + encodeURIComponent(res.quote_number);
    } catch (err) {
      if (win) win.close();
      $('#form-err').textContent = (err && err.message) || 'No pudimos registrar tu pedido. Inténtalo de nuevo o escríbenos por WhatsApp.';
      btn.disabled = false; btn.textContent = 'Confirmar y abrir WhatsApp';
    }
  });
}

/* ------------------------------------------------------------------ arranque */
function bindGlobal() {
  $('#cart-open').addEventListener('click', openDrawer);
  $('#scrim').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('#drawer').classList.contains('on')) closeDrawer(); else closeSheet();
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('#cat-fopen')) { openSheet(); return; }
    if (e.target.closest('[data-fclose]')) { closeSheet(); return; }
    const fe = e.target.closest('[data-f]');
    if (fe && fe.tagName !== 'INPUT') { handleFilter(fe); return; }
    const rb = e.target.closest('[data-rail]');
    if (rb) {
      const r = $('#rail-' + rb.dataset.rail);
      if (r) r.scrollBy({ left: Number(rb.dataset.dir) * r.clientWidth * 0.85, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      return;
    }
    const add = e.target.closest('[data-add]');
    if (add) {
      if (addToCart(add.dataset.add)) {
        add.classList.add('done'); add.innerHTML = checkIcon; toast('Agregado a tu pedido');
        setTimeout(() => { add.classList.remove('done'); add.innerHTML = plusIcon; }, 1200);
      }
      return;
    }
    if (e.target.closest('[data-close]')) { if (e.target.closest('a')) setTimeout(closeDrawer, 0); else closeDrawer(); return; }
    const id = (k) => { const el = e.target.closest(`[data-${k}]`); return el && el.dataset[k]; };
    const inc = id('inc'), dec = id('dec'), rm = id('rm');
    const p = (x) => ctx.products.find((y) => y.id === x);
    if (inc) { cart.set(inc, cart.qtyOf(inc) + 1, p(inc).stock); }
    else if (dec) { cart.set(dec, cart.qtyOf(dec) - 1); }
    else if (rm) { cart.set(rm, 0); }
    else return;
    updateBadge(false); renderDrawer(); if (parseHash().path === '/pedido') route();
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-fprice]');
    if (!f) return;
    e.preventDefault();
    const n = (v) => { const x = Number(String(v).replace(',', '.')); return String(v).trim() !== '' && Number.isFinite(x) && x >= 0 ? x : null; };
    let min = n(f.elements.min.value), max = n(f.elements.max.value);
    if (min !== null && max !== null && min > max) [min, max] = [max, min];
    cf.min = min; cf.max = max; cf.p = 1; updateCatalog();
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'cat-sort') { cf.orden = e.target.value; cf.p = 1; updateCatalog(); return; }
    const ck = e.target.closest('input[data-f]');
    if (ck) { handleFilter(ck); return; }
    const el = e.target.closest('[data-qty]');
    if (!el) return;
    const prod = ctx.products.find((y) => y.id === el.dataset.qty);
    cart.set(el.dataset.qty, Math.floor(Number(el.value) || 0), prod ? prod.stock : 999);
    updateBadge(false); renderDrawer(); if (parseHash().path === '/pedido') route();
  });
  window.addEventListener('hashchange', () => { if ($('#drawer').classList.contains('on')) closeDrawer(); route(); });
}

async function init() {
  $('#main').innerHTML = `<div class="wrap section"><div class="grid">${'<div class="skel"></div>'.repeat(8)}</div></div>`;
  try {
    ctx = await loadCatalog();
  } catch (err) {
    $('#main').innerHTML = `<div class="wrap"><div class="empty"><p class="display">Catálogo no disponible</p><p>No pudimos cargar los productos en este momento. Escríbenos y te atendemos directamente.</p><a class="btn btn--wa" href="${waLink('Hola ' + CONFIG.STORE_NAME + ', el catálogo no cargó. ¿Me ayudan?')}">Escribir por WhatsApp</a></div></div>`;
    console.error(err);
    return;
  }
  ctx.byId = new Map(ctx.products.map((p) => [p.id, p]));
  ctx.names = { cat: new Map(unique('categoryKey', 'category')), serie: new Map(unique('seriesKey', 'series')), acab: new Map(unique('finishKey', 'finish')) };
  const memo = new Map();
  ctx.priceOf = (p) => { if (!memo.has(p.id)) memo.set(p.id, p.price > 0 ? shownUnit(p, ctxFor()).shown : 0); return memo.get(p.id); };
  cart.reconcile(ctx.products);
  if (ctx.banner) { const b = $('#banner'); b.textContent = ctx.banner; b.hidden = false; }
  const setBannerH = () => document.documentElement.style.setProperty('--banner-h', ctx.banner ? $('#banner').offsetHeight + 'px' : '0px');
  renderHeader(); bindHeaderSearch();
  // En móvil la cabecera se oculta al bajar y reaparece al subir (más espacio para los productos).
  let lastY = 0;
  window.addEventListener('scroll', () => {
    if (!matchMedia('(max-width: 760px)').matches) return;
    const y = window.scrollY, top = $('#top');
    if (y > lastY + 6 && y > 160 && !top.contains(document.activeElement)) top.classList.add('top--hide');
    else if (y < lastY - 6 || y < 80) top.classList.remove('top--hide');
    lastY = y;
  }, { passive: true });
  setBannerH(); setHeaderH();
  window.addEventListener('resize', () => { setBannerH(); setHeaderH(); });
  renderFooter(); updateBadge(false); bindGlobal(); route();
}
init();
