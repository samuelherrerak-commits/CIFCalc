# Catálogo Briggs (`/catalogo/`)

Tienda pública dentro de CIFCalc. Sitio estático (HTML + ES modules, sin build): se abre en `<tu-sitio>/catalogo/`.

**Regla de inventario:** solo se muestran productos con `stock > 0`. Los que tienen existencia pero no `sale_price` aparecen con "Consultar precio" y no se pueden agregar al pedido.

## Fuentes de datos (`js/data.js`)
| `?fuente=` | Qué muestra |
|---|---|
| `demo` (por defecto sin API) | `mock/catalog.json`: tus productos reales (SKU, nombre, foto) con **existencias y precios ficticios**. |
| `prueba` (por defecto si el Modo prueba de CIFCalc está activo en ese navegador) | Los productos del Modo prueba (`localStorage` `sbx_cif_*`, mismo origen que la app). Solo los ve quien los tiene. |
| `borrador` (solo en `/catalogo/prueba/`) | `mock/borrador.json`: **todos** los productos del módulo de productos con precio y existencias **ficticios**, y un aviso fijo arriba. Para enseñar el borrador. |
| `vivo` (por defecto cuando `CONFIG.API_URL` tiene valor) | Rutas públicas del Apps Script — **fase B, aún no implementadas**. |

## Borrador para presentar: `/catalogo/prueba/`
Misma tienda, con los 88 productos y precios ficticios. Para regenerarlo cuando cambie el módulo de productos (desde la raíz del repo, Node 22+):
`NODE_USE_ENV_PROXY=1 node catalogo/tools/generar-borrador.mjs` (el token interno solo se usa en esa máquina; el JSON resultante no lleva costos ni proveedores).

## Bolívares
Se calculan a la tasa **USDT** (Binance P2P vía CriptoYa, la misma fuente de `js/rates.js`), nunca a la oficial del BCV. Se consulta en el navegador una vez al día; si falla, se usa la última guardada o el respaldo del JSON. Sin tasa no se muestran bolívares.

## Seguridad
- Nada de `js/config.js` es secreto. **No importar `js/sheets-config.js`** (token interno).
- Fase A: el pedido no escribe en ninguna base; arma el resumen y abre WhatsApp del asesor (`CONFIG.ADVISOR_WHATSAPP`).

## Datos que faltan en la hoja `products`
`category`, `collection` y `color` ya vienen llenos y mandan; `js/normalize.js` solo ajusta cómo se muestran (acentos, inglés → español). Si algún campo está vacío se deriva del SKU (`BRG-<tipo>-<serie>-<nn>-<acabado>`). `iva_tipo` sigue vacío (se asume IVA general).

## Imágenes
`assets/img/` se extrajo del catálogo PDF de Briggs (fotos de ambiente y logo). Las fotos de producto vienen de Drive (`foto_url`).
