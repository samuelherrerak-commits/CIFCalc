/**
 * ============================================================================
 *  BACKEND REST DE RESPALDO SOBRE GOOGLE SHEETS
 *  App interna de costos de importación
 * ----------------------------------------------------------------------------
 *  Replica el contrato de datos de Supabase (Postgres) usando esta hoja de
 *  cálculo como almacenamiento. Una hoja = una tabla.
 *
 *  Tablas: companies, suppliers, containers, items, products, accounts, movements, contacts, quotes,
 *          accounting_settings
 *
 *  GET  ?table=<t>[&column=<c>&value=<v>]&pt=<token>
 *  POST (body JSON, enviado como text/plain para evitar preflight CORS):
 *       { action: "upsert",      table, rows: [...], pt }
 *       { action: "delete",      table, id, pt }
 *       { action: "deleteWhere", table, column, value, pt }
 *
 *  NOTA IMPORTANTE: Apps Script (ContentService) SIEMPRE responde HTTP 200;
 *  no permite fijar otro código de estado. Por eso cada respuesta de error
 *  incluye el campo "code" (400, 401, 404, 500...) dentro del JSON. El
 *  cliente debe revisar "ok" y "code", no el status HTTP.
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// CONFIGURACIÓN
// ---------------------------------------------------------------------------

/** Token compartido. Debe ser idéntico al que use la app en "pt". */
const TOKEN = 'MAESTRO_DE_COSTOS_V1';

/**
 * Si es true, las lecturas (GET) también exigen el token "pt".
 * Ponlo en false solo si la URL se usa exclusivamente de forma interna
 * y aceptas que cualquiera con la URL pueda LEER los datos.
 */
const REQUIRE_TOKEN_ON_GET = true;

/** Máximo de filas por lote en un upsert. */
const MAX_ROWS_PER_BATCH = 100;

/** Tiempo máximo (ms) de espera para obtener el candado de escritura. */
const LOCK_WAIT_MS = 30000;

/**
 * Esquemas exactos (orden de columnas = orden en la hoja).
 * Los encabezados son case-sensitive y deben coincidir con la app.
 */
const SCHEMAS = {
  companies: [
    'id', 'name', 'tax_id', 'created_at', 'updated_at'
  ],
  suppliers: [
    'id', 'name', 'country', 'contact_email', 'contact_phone',
    'created_at', 'updated_at'
  ],
  // inventory_posted va al final a propósito (mismo motivo que foto_url en
  // products): marca si ya se registró el stock de este contenedor en el
  // catálogo, independiente de si el asiento contable se generó o no.
  containers: [
    'id', 'company_id', 'bl_number', 'operation_date',
    'container_capacity', 'container_max_weight',
    'insurance_rate', 'insurance_enabled', 'port_fee_rate', 'vat_rate',
    'ocean_freight', 'inland_freight', 'customs_expenses',
    'customs_broker_fee', 'op_expenses', 'status',
    'created_at', 'updated_at', 'inventory_posted'
  ],
  items: [
    'id', 'container_id', 'product_id', 'supplier_id', 'origin_country',
    'sku', 'sku_briggs', 'name', 'qty', 'units_per_box', 'box_volume',
    'weight_kg', 'fob_unit', 'hs_code', 'tariff_rate', 'gain_margin',
    'created_at', 'updated_at'
  ],
  // Catálogo maestro: SIN qty, gain_margin ni weight_lbs.
  // foto_url / foto_file_id van AL FINAL a propósito: las columnas nuevas
  // deben añadirse siempre después de las existentes, porque las filas que
  // ya están en la hoja se leen por posición. Insertarlas en medio
  // desalinearía todo el catálogo actual.
  products: [
    'id', 'sku_briggs', 'sku', 'name', 'supplier_id', 'origin_country',
    'units_per_box', 'box_volume', 'weight_kg', 'hs_code', 'fob_unit',
    'tariff_rate', 'created_at', 'updated_at', 'foto_url', 'foto_file_id',
    'stock', 'avg_cost', 'sale_price',
    'brand', 'collection', 'category', 'color'
  ],
  // Catálogo de cuentas unificado (estilo LegalYa): códigos jerárquicos con punto,
  // tipo inferido del primer dígito (1=Activo..6=Gasto). tipo_especifico es lo que
  // usan Ingresos/Gastos/Inventario para filtrar cuentas de pago (Efectivo/Banco),
  // por cobrar (Clientes) y por pagar (Proveedores).
  accounts: [
    'id', 'codigo', 'nombre', 'tipo', 'tipo_especifico', 'naturaleza', 'is_active',
    'created_at', 'updated_at'
  ],
  // Diario plano: una fila = una línea de Debe o Haber, sin encabezado de asiento.
  // Las filas de un mismo evento se correlacionan solo por ref_doc.
  // cantidad/unidad/precio_venta/codigo_barra van AL FINAL a propósito (mismo
  // motivo que foto_url/foto_file_id en products): columnas nuevas siempre
  // después de las existentes para no desalinear las filas ya guardadas.
  movements: [
    'id', 'entry_date', 'codigo_cuenta', 'cuenta_contable', 'concepto',
    'debit', 'credit', 'ref_doc', 'entidad', 'source', 'source_ref',
    'created_at', 'updated_at', 'cantidad', 'unidad', 'precio_venta', 'codigo_barra'
  ],
  // Directorio único de clientes/proveedores (CRM) — lo usan los selectores de
  // Ventas, Gastos, Costos, Inventario (Recepción) y las nuevas Cuentas por
  // Cobrar/Pagar en vez de escribir el nombre a mano.
  contacts: [
    'id', 'rif', 'name', 'type', 'email', 'phone', 'address',
    'created_at', 'updated_at'
  ],
  // Presupuestos (cotizaciones) para ventas al mayor — sin impacto contable
  // hasta que se confirman desde Ventas ("Convertir en Venta"). items es un
  // JSON string con las líneas del carrito (producto, cantidad, precio).
  quotes: [
    'id', 'quote_number', 'date', 'contact_id', 'contact_name', 'concepto',
    'items', 'total', 'status', 'converted_ref', 'created_at', 'updated_at',
    'valid_until'
  ],
  // Mapeo contable del cierre de contenedores (una sola fila, id = 'default').
  // Cada columna guarda el id de la cuenta a la que va ese concepto; si una
  // columna está vacía, la app usa la cuenta por defecto del catálogo sugerido.
  accounting_settings: [
    'id', 'fob_account_id', 'ocean_freight_account_id', 'insurance_account_id',
    'tariff_account_id', 'port_fee_account_id', 'customs_broker_account_id',
    'other_account_id', 'vat_account_id', 'payable_account_id',
    'created_at', 'updated_at',
    // Datos de la empresa para los presupuestos y notas de venta impresos.
    'issuer_name', 'issuer_rif', 'issuer_address', 'issuer_phone',
    'issuer_email', 'issuer_logo', 'quote_terms'
  ]
};

/** Columnas donde se guarda la foto. Cambia aquí si la app usa otros nombres. */
const FOTO_URL_COL = 'foto_url';
const FOTO_ID_COL = 'foto_file_id';

/**
 * Carpeta de Drive donde se guardan las fotos.
 * Si dejas FOTOS_FOLDER_ID vacío, el script busca (o crea) una carpeta con
 * el nombre de abajo en tu Drive. Para fijarla, pega aquí el ID de la
 * carpeta (está en su URL, después de /folders/).
 */
const FOTOS_FOLDER_ID = '';
const FOTOS_FOLDER_NAME = 'fotos_productos';

/** Tamaño máximo de imagen aceptado, ya decodificada (8 MB). */
const MAX_FOTO_BYTES = 8 * 1024 * 1024;

// ---------------------------------------------------------------------------
// ENTRADAS DEL WEB APP
// ---------------------------------------------------------------------------

/**
 * Lectura de una tabla completa (o filtrada por columna=valor).
 */
function doGet(e) {
  const p = (e && e.parameter) || {};

  try {
    ensureSheets();

    if (REQUIRE_TOKEN_ON_GET && !isAuthorized_(p.pt)) {
      return json_({ ok: false, error: 'unauthorized', code: 401 });
    }

    const table = p.table;
    const tableErr = validateTable_(table);
    if (tableErr) return json_({ ok: false, error: tableErr, code: 400 });

    let data = readTable_(table);

    // Filtro opcional: ?column=container_id&value=<uuid>
    if (p.column !== undefined && p.column !== '') {
      if (SCHEMAS[table].indexOf(p.column) === -1) {
        return json_({ ok: false, error: 'columna desconocida: ' + p.column, code: 400 });
      }
      const value = toText_(p.value);
      data = data.filter(function (r) { return r[p.column] === value; });
    }

    return json_({ ok: true, data: data });
  } catch (err) {
    return json_({ ok: false, error: errorMessage_(err), code: errorCode_(err) });
  }
}

/**
 * Escritura y borrado. El cuerpo se lee como texto plano y se parsea como
 * JSON, sin importar el Content-Type (el cliente enviará text/plain).
 */
function doPost(e) {
  try {
    ensureSheets();

    let body;
    try {
      const raw = (e && e.postData && e.postData.contents) || '';
      body = raw ? JSON.parse(raw) : {};
    } catch (parseErr) {
      return json_({ ok: false, error: 'JSON inválido en el cuerpo', code: 400 });
    }

    // El token puede venir en el cuerpo o como parámetro de la URL.
    const pt = body.pt !== undefined ? body.pt : (e && e.parameter && e.parameter.pt);
    if (!isAuthorized_(pt)) {
      return json_({ ok: false, error: 'unauthorized', code: 401 });
    }

    // Subida de fotos: se resuelve antes de validar "table" porque el cuerpo
    // trae un archivo, no filas de tabla.
    if (body.action === 'uploadFoto') return jsonOk_(handleFotoUpload_(body));

    const tableErr = validateTable_(body.table);
    if (tableErr) return json_({ ok: false, error: tableErr, code: 400 });

    switch (body.action) {
      case 'upsert':
        return json_(upsert_(body.table, body.rows));
      case 'delete':
        return json_(deleteById_(body.table, body.id));
      case 'deleteWhere':
        return json_(deleteWhere_(body.table, body.column, body.value));
      default:
        return json_({ ok: false, error: 'acción desconocida: ' + body.action, code: 400 });
    }
  } catch (err) {
    return json_({ ok: false, error: errorMessage_(err), code: errorCode_(err) });
  }
}

// ---------------------------------------------------------------------------
// ESTRUCTURA DE HOJAS
// ---------------------------------------------------------------------------

/**
 * Crea las hojas de SCHEMAS con sus encabezados si no existen. Idempotente.
 * Si la fila 1 fue renombrada/borrada, la recrea con los encabezados
 * correctos.
 *
 * Se llama al inicio de cada petición, pero solo trabaja de verdad una vez
 * cada 6 horas por versión del esquema (CacheService): recorrer las 10 hojas
 * en cada petición, con la app pidiendo varias tablas a la vez, agotaba el
 * límite de Google ("Demasiadas invocaciones simultáneas: Hojas de cálculo").
 * Si cambias SCHEMAS, la firma cambia y se vuelve a ejecutar sola.
 */
function ensureSheets() {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'ensureSheets_' + schemasSignature_();
  if (cache.get(cacheKey)) return;

  ensureSheetsNow_();
  cache.put(cacheKey, '1', 21600);
}

function schemasSignature_() {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(SCHEMAS));
  return Utilities.base64EncodeWebSafe(digest).slice(0, 22);
}

function ensureSheetsNow_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  Object.keys(SCHEMAS).forEach(function (name) {
    const headers = SCHEMAS[name];
    let sheet = ss.getSheetByName(name);
    let isNew = false;

    if (!sheet) {
      sheet = ss.insertSheet(name);
      isNew = true;
    }

    // Asegurar suficientes columnas.
    const maxCols = sheet.getMaxColumns();
    if (maxCols < headers.length) {
      sheet.insertColumnsAfter(maxCols, headers.length - maxCols);
    }

    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    const current = headerRange.getDisplayValues()[0];
    const matches = headers.every(function (h, i) { return current[i] === h; });

    if (!matches) {
      headerRange.setNumberFormat('@').setValues([headers]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    if (isNew) {
      // Toda la hoja en formato texto para que Sheets no convierta nada.
      sheet.getRange(1, 1, sheet.getMaxRows(), headers.length).setNumberFormat('@');
      sheet.setFrozenRows(1);
    }
  });
}

// ---------------------------------------------------------------------------
// OPERACIONES CRUD
// ---------------------------------------------------------------------------

/**
 * Lee todas las filas de una tabla como objetos {columna: valor}.
 * Ignora filas sin id. Todos los valores se devuelven como texto.
 */
function readTable_(table) {
  const sheet = getSheet_(table);
  const headers = SCHEMAS[table];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getDisplayValues();
  const out = [];
  for (let r = 0; r < values.length; r++) {
    if (values[r][0] === '') continue;
    const obj = {};
    for (let c = 0; c < headers.length; c++) obj[headers[c]] = values[r][c];
    out.push(obj);
  }
  return out;
}

/**
 * Inserta o actualiza filas por id.
 * - id existente → actualiza esa fila.
 * - id nuevo     → agrega al final.
 * - id repetido en el mismo lote → gana el último.
 * - Columnas ausentes en el objeto conservan su valor actual.
 * - created_at / updated_at del payload NUNCA se sobrescriben; solo si
 *   updated_at viene vacío se pone la fecha actual (y created_at vacío en
 *   una fila existente conserva el valor que ya tenía; en una fila nueva
 *   se completa con la fecha actual).
 */
function upsert_(table, rows) {
  if (!Array.isArray(rows)) {
    return { ok: false, error: '"rows" debe ser un arreglo', code: 400 };
  }
  if (rows.length === 0) return { ok: true, count: 0 };
  if (rows.length > MAX_ROWS_PER_BATCH) {
    return {
      ok: false,
      error: 'máximo ' + MAX_ROWS_PER_BATCH + ' filas por petición (recibidas: ' + rows.length + ')',
      code: 400
    };
  }

  // Deduplicar por id: gana el último, conservando el orden de aparición.
  const byId = {};
  const order = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== 'object') {
      return { ok: false, error: 'fila ' + i + ' no es un objeto', code: 400 };
    }
    const id = toText_(row.id);
    if (id === '') {
      return { ok: false, error: 'fila ' + i + ' sin id', code: 400 };
    }
    if (!Object.prototype.hasOwnProperty.call(byId, id)) order.push(id);
    byId[id] = row;
  }

  const headers = SCHEMAS[table];
  const colCount = headers.length;
  const idxCreated = headers.indexOf('created_at');
  const idxUpdated = headers.indexOf('updated_at');
  const nowIso = new Date().toISOString();

  const lock = LockService.getScriptLock();
  lock.waitLock(LOCK_WAIT_MS);
  try {
    const sheet = getSheet_(table);
    const lastRow = sheet.getLastRow();
    const n = Math.max(lastRow - 1, 0);
    const data = n > 0 ? sheet.getRange(2, 1, n, colCount).getDisplayValues() : [];

    // Mapa id → índice en data.
    const indexById = {};
    for (let r = 0; r < data.length; r++) {
      if (data[r][0] !== '') indexById[data[r][0]] = r;
    }

    const appends = [];
    let minUpd = Infinity;
    let maxUpd = -1;

    order.forEach(function (id) {
      const src = byId[id];
      const existingIdx = Object.prototype.hasOwnProperty.call(indexById, id) ? indexById[id] : -1;
      const existing = existingIdx >= 0 ? data[existingIdx] : null;

      const arr = headers.map(function (h, c) {
        if (Object.prototype.hasOwnProperty.call(src, h)) return toText_(src[h]);
        return existing ? existing[c] : '';
      });
      arr[0] = id;

      if (idxCreated >= 0 && arr[idxCreated] === '') {
        arr[idxCreated] = (existing && existing[idxCreated]) ? existing[idxCreated] : nowIso;
      }
      if (idxUpdated >= 0 && arr[idxUpdated] === '') {
        arr[idxUpdated] = nowIso;
      }

      if (existingIdx >= 0) {
        data[existingIdx] = arr;
        if (existingIdx < minUpd) minUpd = existingIdx;
        if (existingIdx > maxUpd) maxUpd = existingIdx;
      } else {
        appends.push(arr);
      }
    });

    // Escribir el bloque contiguo de filas actualizadas (una sola llamada).
    if (maxUpd >= 0) {
      const block = data.slice(minUpd, maxUpd + 1);
      sheet.getRange(2 + minUpd, 1, block.length, colCount)
        .setNumberFormat('@')
        .setValues(block);
    }

    // Agregar filas nuevas al final (una sola llamada).
    if (appends.length > 0) {
      const startRow = lastRow + 1;
      const needed = startRow + appends.length - 1;
      const maxRows = sheet.getMaxRows();
      if (needed > maxRows) sheet.insertRowsAfter(maxRows, needed - maxRows);
      sheet.getRange(startRow, 1, appends.length, colCount)
        .setNumberFormat('@')
        .setValues(appends);
    }

    SpreadsheetApp.flush();
    return { ok: true, count: order.length };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Borra la fila con el id indicado. Si no existe, responde ok igualmente
 * (borrado idempotente).
 */
function deleteById_(table, id) {
  const target = toText_(id);
  if (target === '') return { ok: false, error: '"id" requerido', code: 400 };

  const lock = LockService.getScriptLock();
  lock.waitLock(LOCK_WAIT_MS);
  try {
    const sheet = getSheet_(table);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: true };

    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
    for (let r = ids.length - 1; r >= 0; r--) {
      if (ids[r][0] === target) {
        sheet.deleteRow(r + 2);
        break; // id es único
      }
    }
    SpreadsheetApp.flush();
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Borra TODAS las filas donde column === value.
 * Por seguridad se rechaza value vacío (evita borrar masivamente todas las
 * filas con la columna vacía por un error del cliente).
 */
function deleteWhere_(table, column, value) {
  const headers = SCHEMAS[table];
  const colIdx = headers.indexOf(column);
  if (colIdx === -1) {
    return { ok: false, error: 'columna desconocida: ' + column, code: 400 };
  }
  const target = toText_(value);
  if (target === '') return { ok: false, error: '"value" requerido', code: 400 };

  const lock = LockService.getScriptLock();
  lock.waitLock(LOCK_WAIT_MS);
  try {
    const sheet = getSheet_(table);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: true, count: 0 };

    const n = lastRow - 1;
    const range = sheet.getRange(2, 1, n, headers.length);
    const data = range.getDisplayValues();
    const keep = data.filter(function (r) { return r[colIdx] !== target; });
    const removed = data.length - keep.length;

    if (removed > 0) {
      // Reescribir el bloque compactado en una sola operación.
      range.clearContent();
      if (keep.length > 0) {
        sheet.getRange(2, 1, keep.length, headers.length)
          .setNumberFormat('@')
          .setValues(keep);
      }
      SpreadsheetApp.flush();
    }
    return { ok: true, count: removed };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// FOTOS DE PRODUCTOS
// ---------------------------------------------------------------------------

/**
 * Sube la foto de un producto a Drive y guarda el enlace en su fila.
 *
 * Cuerpo esperado:
 *   {
 *     "action": "uploadFoto",
 *     "pt": "<token>",
 *     "table": "products",          // opcional, por defecto products
 *     "id": "<uuid del producto>",  // la fila debe existir ya
 *     "filename": "foto.jpg",       // opcional
 *     "mimeType": "image/jpeg",     // opcional, por defecto image/jpeg
 *     "data": "<base64>"            // admite también el data URL completo
 *   }
 *
 * Respuesta: { ok: true, id, foto_url, foto_file_id, updated_at }
 *
 * La imagen NO se guarda en la celda: una celda de Sheets admite 50.000
 * caracteres y cualquier foto en base64 los supera. En la hoja solo queda
 * el enlace y el id del archivo de Drive.
 */
function handleFotoUpload_(body) {
  const table = toText_(body.table) || 'products';
  if (!Object.prototype.hasOwnProperty.call(SCHEMAS, table)) {
    throw fail_(400, 'tabla desconocida: ' + table);
  }
  const headers = SCHEMAS[table];
  const idxUrl = headers.indexOf(FOTO_URL_COL);
  const idxFile = headers.indexOf(FOTO_ID_COL);
  const idxUpdated = headers.indexOf('updated_at');
  if (idxUrl === -1 || idxFile === -1) {
    throw fail_(400, 'la tabla ' + table + ' no tiene columnas de foto');
  }

  const id = toText_(body.id);
  if (id === '') throw fail_(400, '"id" requerido');

  // Acepta el base64 pelado o el data URL que devuelve FileReader.
  let base64 = toText_(body.data);
  if (base64 === '') throw fail_(400, '"data" (base64) requerido');
  const marca = base64.indexOf('base64,');
  if (marca > -1) base64 = base64.substring(marca + 7);
  base64 = base64.replace(/\s/g, '');

  const mimeType = toText_(body.mimeType) || 'image/jpeg';
  if (mimeType.indexOf('image/') !== 0) {
    throw fail_(400, 'mimeType debe ser una imagen, recibido: ' + mimeType);
  }
  const filename = toText_(body.filename) || (id + extensionPara_(mimeType));

  let bytes;
  try {
    bytes = Utilities.base64Decode(base64);
  } catch (err) {
    throw fail_(400, 'base64 inválido');
  }
  if (bytes.length > MAX_FOTO_BYTES) {
    throw fail_(400, 'la imagen pesa ' + Math.round(bytes.length / 1048576 * 10) / 10 +
      ' MB; el máximo es ' + (MAX_FOTO_BYTES / 1048576) + ' MB. Redimensiónala en el cliente.');
  }

  // 1) Subida a Drive: fuera del candado, porque es la parte lenta.
  const blob = Utilities.newBlob(bytes, mimeType, filename);
  const file = carpetaFotos_().createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    // Algunos dominios de Workspace prohíben compartir con "cualquiera con
    // el enlace". El archivo queda subido pero solo visible para la cuenta.
  }
  const fileId = file.getId();
  // Enlace directo utilizable en un <img>. Alternativa:
  // https://drive.google.com/uc?export=view&id=<ID>
  const fotoUrl = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1000';
  const nowIso = new Date().toISOString();

  // 2) Escritura en la hoja: aquí sí con candado.
  let anteriorFileId = '';
  const lock = LockService.getScriptLock();
  lock.waitLock(LOCK_WAIT_MS);
  try {
    const sheet = getSheet_(table);
    const lastRow = sheet.getLastRow();
    let fila = -1;
    if (lastRow >= 2) {
      const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
      for (let r = 0; r < ids.length; r++) {
        if (ids[r][0] === id) { fila = r + 2; break; }
      }
    }
    if (fila === -1) {
      file.setTrashed(true); // no dejar huérfano el archivo recién subido
      throw fail_(404, 'no existe el registro ' + id + ' en ' + table);
    }

    anteriorFileId = toText_(sheet.getRange(fila, idxFile + 1).getDisplayValue());

    sheet.getRange(fila, idxUrl + 1).setNumberFormat('@').setValue(fotoUrl);
    sheet.getRange(fila, idxFile + 1).setNumberFormat('@').setValue(fileId);
    // El cambio lo hace el servidor, no el cliente: aquí sí se toca updated_at.
    if (idxUpdated >= 0) {
      sheet.getRange(fila, idxUpdated + 1).setNumberFormat('@').setValue(nowIso);
    }
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  // 3) Reemplazo: la foto anterior se manda a la papelera de Drive.
  if (anteriorFileId && anteriorFileId !== fileId) {
    try { DriveApp.getFileById(anteriorFileId).setTrashed(true); } catch (err) {}
  }

  const out = { id: id, updated_at: nowIso };
  out[FOTO_URL_COL] = fotoUrl;
  out[FOTO_ID_COL] = fileId;
  return out;
}

/** Carpeta de destino: la fijada por ID, o una por nombre (se crea si falta). */
function carpetaFotos_() {
  if (FOTOS_FOLDER_ID) return DriveApp.getFolderById(FOTOS_FOLDER_ID);
  const it = DriveApp.getFoldersByName(FOTOS_FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOTOS_FOLDER_NAME);
}

function extensionPara_(mimeType) {
  const mapa = {
    'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png',
    'image/webp': '.webp', 'image/gif': '.gif', 'image/heic': '.heic'
  };
  return mapa[mimeType] || '';
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function getSheet_(table) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(table);
  if (!sheet) throw new Error('hoja no encontrada: ' + table);
  return sheet;
}

function validateTable_(table) {
  if (!table) return 'parámetro "table" requerido';
  if (!Object.prototype.hasOwnProperty.call(SCHEMAS, table)) {
    return 'tabla desconocida: ' + table;
  }
  return null;
}

function isAuthorized_(pt) {
  return typeof pt === 'string' && pt.length > 0 && pt === TOKEN;
}

/**
 * Convierte cualquier valor a texto para guardarlo tal cual.
 * null/undefined → '', boolean → 'true'/'false', Date → ISO,
 * objetos → JSON, resto → String().
 */
function toText_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function errorMessage_(err) {
  return (err && err.message) ? err.message : String(err);
}

/** Código de error transportado en el Error, o 500 por defecto. */
function errorCode_(err) {
  return (err && err.code) ? err.code : 500;
}

/** Crea un Error que lleva su propio código de respuesta. */
function fail_(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Respuesta de éxito: añade ok:true a los campos devueltos. */
function jsonOk_(obj) {
  const out = { ok: true };
  Object.keys(obj || {}).forEach(function (k) { out[k] = obj[k]; });
  return json_(out);
}

/*
 * ============================================================================
 *  PASOS DE PUBLICACIÓN
 * ============================================================================
 *
 *  1) Abre (o crea) la hoja de cálculo de Google que servirá de base de
 *     datos. Ve a  Extensiones → Apps Script. Borra el contenido del archivo
 *     Code.gs que aparece y pega este archivo completo. Guarda (Ctrl+S).
 *
 *  2) El TOKEN ya está puesto: MAESTRO_DE_COSTOS_V1 (constante TOKEN al
 *     inicio del archivo). Usa guiones bajos en vez de espacios porque el
 *     token viaja en la URL. La app debe enviar exactamente ese valor en "pt".
 *
 *  3) Función a ejecutar: ninguna. Las 5 hojas (companies, suppliers,
 *     containers, items, products) se crean solas en la primera petición.
 *     (Opcional: puedes ejecutar ensureSheets una vez desde el editor para
 *     crearlas ya y aceptar los permisos.)
 *
 *  4) Implementar → Nueva implementación → ícono de engranaje → tipo
 *     "Aplicación web".
 *
 *  5) "Ejecutar como": Yo (tu cuenta).
 *
 *  6) "Quién tiene acceso": Cualquier persona. La protección la da el token
 *     "pt"; sin él, todas las peticiones responden "unauthorized".
 *
 *  7) Pulsa "Implementar", autoriza los permisos que pida Google y copia la
 *     URL del Web App. Debe terminar en  /exec  (no uses la que termina en
 *     /dev, esa solo funciona para ti estando logueado).
 *
 *  7-bis) AL AÑADIR LAS FOTOS: este código ahora usa Drive, que es un permiso
 *     nuevo. Google volverá a pedirte autorización la primera vez. Si ya
 *     tenías el Web App publicado, debes además publicar una versión nueva
 *     (paso 8) y ejecutar una vez cualquier función desde el editor para
 *     aceptar el permiso de Drive; si no, las subidas fallarán.
 *
 *     Las fotos se guardan en la carpeta "fotos_productos" de tu Drive y se
 *     comparten como "cualquiera con el enlace puede ver", para que la app
 *     pueda mostrarlas en un <img>. Es decir: los enlaces de las fotos NO
 *     están protegidos por el token. No subas ahí nada confidencial.
 *
 *  8) IMPORTANTE al modificar el código después: Implementar → Administrar
 *     implementaciones → lápiz (editar) → Versión: "Nueva versión" →
 *     Implementar. Así la URL /exec se mantiene igual pero sirve el código
 *     nuevo. Si no creas nueva versión, la URL sigue usando el código viejo.
 *
 *  9) Para cambiar el TOKEN: edita la constante TOKEN al inicio del archivo
 *     y publica una nueva versión (paso 8). Actualiza el mismo valor en la
 *     app.
 *
 *  Prueba rápida en el navegador:
 *     https://script.google.com/macros/s/XXXX/exec?table=companies&pt=TU_TOKEN
 *     → { "ok": true, "data": [] }
 * ============================================================================
 */
