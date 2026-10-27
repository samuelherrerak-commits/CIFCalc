// Pruebas rápidas de js/filters.js:  node catalogo/tools/probar-filtros.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeProduct } from '../js/normalize.js';
import { parseFilters, toQuery, filterProducts, facetCounts, sortProducts, paginate, pageWindow } from '../js/filters.js';

const raw = JSON.parse(await readFile(new URL('../mock/borrador.json', import.meta.url), 'utf8')).products;
const products = raw.map(normalizeProduct).filter((p) => p.stock > 0);
const priceOf = (p) => p.price;
const F = (qs) => parseFilters(new URLSearchParams(qs));

// ida y vuelta de la URL
const f0 = F('cat=lavamanos&serie=equinox,eclipse&acab=cromado&min=50&max=200&orden=precio-asc&p=2&q=monomando');
assert.deepEqual(F(toQuery(f0).slice(1)), f0);
assert.equal(toQuery(F('')), '');
assert.equal(F('orden=raro').orden, 'relevancia');
assert.equal(F('p=-3').p, 1);

// filtros
const all = filterProducts(products, F(''), priceOf);
assert.equal(all.length, products.length);
const lav = filterProducts(products, F('cat=lavamanos'), priceOf);
assert.ok(lav.length > 0 && lav.every((p) => p.categoryKey === 'lavamanos'));
const eq = filterProducts(products, F('serie=equinox,eclipse'), priceOf);
assert.ok(eq.every((p) => ['equinox', 'eclipse'].includes(p.seriesKey)));
const caro = filterProducts(products, F('min=150'), priceOf);
assert.ok(caro.length > 0 && caro.every((p) => p.price >= 150));
const busca = filterProducts(products, F('q=Monomando LAVAMANOS'), priceOf);   // sin acentos ni mayúsculas
assert.ok(busca.length > 0 && busca.every((p) => /monomando/i.test(p.name)));

// cuentas por filtro: ignoran el propio filtro pero respetan los demás
const fc = facetCounts(products, F('cat=lavamanos'), priceOf);
assert.equal([...fc.cat.values()].reduce((a, b) => a + b, 0), products.length);     // categoría: no se estrecha a sí misma
assert.equal([...fc.serie.values()].reduce((a, b) => a + b, 0), lav.length);        // serie: sí respeta la categoría

// orden
const asc = sortProducts(all, 'precio-asc', priceOf);
assert.ok(asc.every((p, i) => i === 0 || asc[i - 1].price <= p.price));
const rel = sortProducts(filterProducts(products, F('q=BRG-BL'), priceOf), 'relevancia', priceOf, 'BRG-BL');
assert.ok(rel[0].sku.startsWith('BRG-BL'));

// páginas
const pg = paginate(all, 99);
assert.equal(pg.page, pg.pages);
assert.deepEqual(pageWindow(1, 1), [1]);
assert.deepEqual(pageWindow(6, 12), [1, '…', 5, 6, 7, '…', 12]);

console.log(`filters.js OK · ${products.length} productos`);
