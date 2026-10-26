# Catálogo Briggs (`/catalogo/`)

Tienda pública dentro de CIFCalc. Sitio estático (HTML + ES modules, sin build): se abre en `<tu-sitio>/catalogo/`.

**Regla de inventario:** solo se muestran productos con `stock > 0`. Los que tienen existencia pero no `sale_price` aparecen con "Consultar precio" y no se pueden agregar al pedido.

## Fuentes de datos (`js/data.js`)
| `?fuente=` | Qué muestra |
|---|---|
| `demo` (por defecto sin API) | `mock/catalog.json`: tus productos reales (SKU, nombre, foto) con **existencias y precios ficticios**. |
| `prueba` (por defecto si el Modo prueba de CIFCalc está activo en ese navegador) | Los productos del Modo prueba (`localStorage` `sbx_cif_*`, mismo origen que la app). Solo los ve quien los tiene. |
| `vivo` (por defecto cuando `CONFIG.API_URL` tiene valor) | Rutas públicas del Apps Script — **fase B, aún no implementadas**. |

## Seguridad
- Nada de `js/config.js` es secreto. **No importar `js/sheets-config.js`** (token interno).
- Fase A: el pedido no escribe en ninguna base; arma el resumen y abre WhatsApp del asesor (`CONFIG.ADVISOR_WHATSAPP`).

## Datos que faltan en la hoja `products`
`category`, `collection`, `color`, `iva_tipo` están vacíos: la tienda los deriva del SKU (`BRG-<tipo>-<serie>-<nn>-<acabado>`, ver `js/normalize.js`). Si se llenan, mandan los de la hoja.

## Imágenes
`assets/img/` se extrajo del catálogo PDF de Briggs (fotos de ambiente y logo). Las fotos de producto vienen de Drive (`foto_url`).
