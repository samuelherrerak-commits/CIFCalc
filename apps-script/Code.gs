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

/**
 * Token compartido del modelo anterior (sin login). Con ALLOW_SHARED_TOKEN en
 * false ya NO da acceso: cada petición necesita la sesión ("st") de un
 * usuario que inició sesión con su usuario y contraseña.
 */
const TOKEN = 'MAESTRO_DE_COSTOS_V1';
const ALLOW_SHARED_TOKEN = false;

/** Duración de una sesión sin uso (segundos; máximo 6 h por CacheService). */
const SESSION_TTL = 21600;
/** Vueltas de SHA-256 para guardar contraseñas (con sal por usuario). */
const PASSWORD_ROUNDS = 300;
/** Intentos fallidos permitidos antes de bloquear el usuario 10 minutos. */
const MAX_LOGIN_FAILS = 5;

/**
 * Administradores iniciales (se crean solos si la hoja users está vacía).
 * Entran con una contraseña temporal y el sistema les pide cambiarla.
 * Aquí solo hay el hash (SHA-256 con sal), nunca la contraseña.
 */
const SEED_ADMINS = [
  {
    "username": "orlando",
    "name": "Orlando Venturini",
    "salt": "f0152f0511193e04b9aba12d7d45e37c",
    "hash": "b066e34e94b2f14149781bd2c73521297a8692cb8b6dc5025dee3e6428eae017"
  },
  {
    "username": "samuel",
    "name": "Samuel Herrera",
    "salt": "830f5b849bcac96aee86496624602ee1",
    "hash": "a6d2d3d26e3a8da658b6244ae55c99cd2c97b17a7c6cfc4dd450e12df71fe6b4"
  }
];

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
    'brand', 'collection', 'category', 'color',
    // IVA del producto: 'general' (vacío = general), 'reducida' o 'exento'.
    'iva_tipo',
    // Prompts para generar las fotos del producto con Nano Banana (Gemini):
    // _1 = primer plano, _2 = el producto en uso. Se rellenan con
    // catalogo/tools/prompts-fotos.mjs y se copian a mano; la app no los usa.
    'prompt_foto_1', 'prompt_foto_2'
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
    'created_at', 'updated_at', 'cantidad', 'unidad', 'precio_venta', 'codigo_barra',
    // Venta: costo unitario del producto al momento de vender (para el margen)
    // y precio de lista antes de promociones o descuento del cliente.
    'costo_unitario', 'precio_lista',
    // Tasa BCV (Bs por USD) del día del asiento, para llevar los libros en Bs.
    'tasa_bcv',
    // Número consecutivo del asiento (reinicia cada año): 2026-0001.
    'entry_number'
  ],
  // Directorio único de clientes/proveedores (CRM) — lo usan los selectores de
  // Ventas, Gastos, Costos, Inventario (Recepción) y las nuevas Cuentas por
  // Cobrar/Pagar en vez de escribir el nombre a mano.
  contacts: [
    'id', 'rif', 'name', 'type', 'email', 'phone', 'address',
    'created_at', 'updated_at',
    // CRM: etapa (prospecto/activo/inactivo/perdido), etiquetas, notas,
    // descuento especial del cliente (%) y próximo seguimiento.
    'stage', 'tags', 'notes', 'discount_pct', 'next_followup_date',
    // % de IVA que nos retiene el cliente (0, 75 o 100) si es contribuyente especial.
    'iva_retention_pct'
  ],
  // Bitácora del CRM: actividades (llamada, visita, WhatsApp, correo, nota) y
  // tareas de seguimiento con fecha (kind = 'tarea', done = true/false).
  crm_activities: [
    'id', 'contact_id', 'kind', 'channel', 'date', 'due_date', 'note', 'done',
    'created_at', 'updated_at'
  ],
  // Promociones generales: % de descuento sobre el precio de venta para un
  // producto, una categoría o todo el catálogo, con vigencia.
  promotions: [
    'id', 'name', 'scope', 'target', 'discount_pct', 'start_date', 'end_date',
    'active', 'created_at', 'updated_at'
  ],
  // Presupuestos (cotizaciones) para ventas al mayor — sin impacto contable
  // hasta que se confirman desde Ventas ("Convertir en Venta"). items es un
  // JSON string con las líneas del carrito (producto, cantidad, precio).
  quotes: [
    'id', 'quote_number', 'date', 'contact_id', 'contact_name', 'concepto',
    'items', 'total', 'status', 'converted_ref', 'created_at', 'updated_at',
    'valid_until',
    // 'presupuesto' u 'oferta' (oferta personalizada desde el CRM).
    'kind',
    // Con factura (IVA) o sin factura: pasa a la orden de venta al convertir.
    'fiscal',
    // Forma de pago: 'divisas' (USD efectivo / USDT) o 'bs' (bolívares a tasa
    // BCV). En 'bs' los precios van en $ a tasa BCV = precio × (USDT ÷ BCV).
    'payment_currency', 'fx_bcv', 'fx_usdt', 'fx_factor'
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
    'issuer_email', 'issuer_logo', 'quote_terms', 'issuer_instagram',
    // Configuración fiscal (IVA). iva_enabled vacío = activo.
    'iva_enabled', 'iva_rate_general', 'iva_rate_reducida', 'prices_include_iva'
  ],
  // Registro fiscal de facturas para los Libros de Compras y Ventas del SENIAT.
  // book = 'ventas' | 'compras'; doc_type = factura | nota_credito |
  // nota_debito | importacion. Montos en USD; tasa_bcv convierte a Bs.
  fiscal_docs: [
    'id', 'book', 'date', 'doc_type', 'invoice_number', 'control_number',
    'affected_invoice', 'rif', 'name', 'total', 'exempt',
    'base_general', 'tax_general', 'base_reducida', 'tax_reducida',
    'withheld', 'withholding_number', 'withholding_date',
    'import_form', 'import_file', 'ref_doc', 'source_ref', 'tasa_bcv',
    'status', 'notes', 'created_at', 'updated_at'
  ],
  // Tasas de cambio del día (id = fecha AAAA-MM-DD): oficiales del BCV para
  // USD y EUR, y USDT (Binance P2P). Bs por unidad de moneda.
  exchange_rates: [
    'id', 'date', 'usd_bcv', 'eur_bcv', 'usdt', 'source', 'fetched_at',
    'created_at', 'updated_at'
  ],
  // Órdenes de venta (presupuesto aprobado → orden → anticipos → despachos →
  // factura). items es un JSON con las líneas: producto, cantidad, precio de
  // lista, % de descuento, precio neto y cantidad ya despachada.
  sales_orders: [
    'id', 'order_number', 'date', 'quote_id', 'contact_id', 'contact_name',
    'items', 'subtotal', 'tax', 'total', 'fiscal', 'status', 'notes',
    'invoice_ref', 'invoice_number', 'control_number', 'invoice_date',
    'created_at', 'updated_at',
    // Forma de pago: 'divisas' (USD efectivo / USDT) o 'bs' (bolívares a tasa
    // BCV). En 'bs' los precios van en $ a tasa BCV = precio × (USDT ÷ BCV).
    'payment_currency', 'fx_bcv', 'fx_usdt', 'fx_factor',
    // Factura digital: proveedor ('simulador' o 'cachicamo'), uuid del
    // documento allá y enlace al PDF.
    'einvoice_provider', 'einvoice_uuid', 'einvoice_pdf_url'
  ],
  // Anticipos (antes de facturar) y cobros (después) de una orden, con la
  // foto del comprobante en Drive (foto_url / foto_file_id).
  order_payments: [
    'id', 'order_id', 'contact_id', 'kind', 'date', 'amount', 'method',
    'account_codigo', 'ref_doc', 'reference', 'notes', 'foto_url', 'foto_file_id',
    'created_at', 'updated_at'
  ],
  // Despachos de una orden (pueden ser parciales); bajan el inventario.
  dispatches: [
    'id', 'order_id', 'dispatch_number', 'date', 'items', 'notes',
    'created_at', 'updated_at'
  ],
  // Usuarios de la app. La contraseña nunca se guarda: solo su hash con sal.
  // Esta hoja NO se puede leer ni escribir con las acciones genéricas; solo
  // con las acciones de usuarios (login, saveUser…), y nunca devuelve el hash.
  users: [
    'id', 'username', 'name', 'role', 'permissions', 'active',
    'password_hash', 'salt', 'must_change', 'created_at', 'updated_at'
  ],
  // Movimientos de existencias (solo inventario, nada contable): recepciones
  // de mercancía, salidas manuales y ajustes. items = JSON [{productId, name, sku, qty}].
  stock_moves: [
    'id', 'move_number', 'kind', 'date', 'container_id', 'reference', 'items', 'notes',
    'created_at', 'updated_at'
  ],
  // Facturas digitales emitidas (registro del servidor; la app solo lo lee).
  // Lo escribe la acción einvoiceEmit, nunca el upsert genérico.
  einvoices: [
    'id', 'order_id', 'order_number', 'provider', 'document_uuid',
    'invoice_number', 'control_number', 'issue_date', 'customer_rif', 'customer_name',
    'subtotal', 'tax', 'total', 'rate', 'pdf_url', 'status', 'user', 'response',
    'created_at', 'updated_at',
    // Factura enviada por la app (para el PDF del simulador) y envío por correo.
    'request', 'emailed_to', 'emailed_at'
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
const COMPROBANTES_FOLDER_NAME = 'comprobantes_pagos';

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

    if (REQUIRE_TOKEN_ON_GET && !isAuthorized_(p.pt) && !sessionUser_(p.st)) {
      return json_({ ok: false, error: 'unauthorized', code: 401 });
    }

    const table = p.table;
    const tableErr = validateTable_(table);
    if (tableErr) return json_({ ok: false, error: tableErr, code: 400 });
    if (table === 'users') return json_({ ok: false, error: 'forbidden', code: 403 });

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

    // Inicio de sesión y administración de usuarios.
    if (AUTH_ACTIONS.indexOf(body.action) >= 0) return json_(handleAuth_(body));

    // El token puede venir en el cuerpo o como parámetro de la URL.
    const pt = body.pt !== undefined ? body.pt : (e && e.parameter && e.parameter.pt);
    if (!isAuthorized_(pt) && !sessionUser_(body.st)) {
      return json_({ ok: false, error: 'unauthorized', code: 401 });
    }
    if (body.table === 'users' || body.table === 'einvoices') return json_({ ok: false, error: 'forbidden', code: 403 });

    // Factura digital (imprenta digital vía Cachicamo, o el simulador).
    if (EINVOICE_ACTIONS.indexOf(body.action) >= 0) return json_(handleEinvoice_(body, sessionUser_(body.st)));

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
  const file = carpetaFotos_(table).createFile(blob);
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

/** Carpeta de destino: la fijada por ID, o una por nombre (se crea si falta).
 *  Los comprobantes de pago (tabla order_payments) van a su propia carpeta. */
function carpetaFotos_(table) {
  if (table === 'order_payments') {
    const c = DriveApp.getFoldersByName(COMPROBANTES_FOLDER_NAME);
    return c.hasNext() ? c.next() : DriveApp.createFolder(COMPROBANTES_FOLDER_NAME);
  }
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
  return ALLOW_SHARED_TOKEN && typeof pt === 'string' && pt.length > 0 && pt === TOKEN;
}

// ---------------------------------------------------------------------------
// USUARIOS Y SESIONES
// ---------------------------------------------------------------------------

const AUTH_ACTIONS = ['login', 'logout', 'me', 'changePassword', 'listUsers', 'saveUser'];

function hex_(bytes) {
  return bytes.map(function (b) { const v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}

function hashPassword_(password, salt) {
  let h = String(password);
  for (let i = 0; i < PASSWORD_ROUNDS; i++) {
    h = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + h, Utilities.Charset.UTF_8));
  }
  return h;
}

function newSalt_() {
  return Utilities.getUuid().replace(/-/g, '');
}

const norm_ = function (s) { return String(s || '').trim().toLowerCase(); };
const isTrue_ = function (v) { return v === true || String(v).toLowerCase() === 'true'; };

function publicUser_(u) {
  let perms = [];
  try { perms = JSON.parse(u.permissions || '[]'); } catch (e) { perms = []; }
  return {
    id: u.id, username: u.username, name: u.name, role: u.role === 'admin' ? 'admin' : 'usuario',
    permissions: Array.isArray(perms) ? perms : [], active: isTrue_(u.active), must_change: isTrue_(u.must_change),
    updated_at: u.updated_at
  };
}

function readUsers_() {
  let users = readTable_('users');
  if (users.length === 0) {
    const now = new Date().toISOString();
    upsert_('users', SEED_ADMINS.map(function (a) {
      return {
        id: Utilities.getUuid(), username: a.username, name: a.name, role: 'admin', permissions: '[]',
        active: 'true', password_hash: a.hash, salt: a.salt, must_change: 'true', created_at: now, updated_at: now
      };
    }));
    users = readTable_('users');
  }
  return users;
}

/** Usuario de una sesión válida (o null). Renueva la sesión en cada uso. */
function sessionUser_(st) {
  if (typeof st !== 'string' || st.length < 20) return null;
  const cache = CacheService.getScriptCache();
  const userId = cache.get('sess_' + st);
  if (!userId) return null;
  const cached = cache.get('user_' + userId);
  let u = cached ? JSON.parse(cached) : null;
  if (!u) {
    const row = readTable_('users').filter(function (x) { return x.id === userId; })[0];
    if (!row) return null;
    u = publicUser_(row);
    cache.put('user_' + userId, JSON.stringify(u), 300);
  }
  if (!u.active) return null;
  cache.put('sess_' + st, userId, SESSION_TTL);
  return u;
}

function handleAuth_(body) {
  const cache = CacheService.getScriptCache();
  const fail = function (msg, code) { return { ok: false, error: msg, code: code || 400 }; };

  if (body.action === 'login') {
    const username = norm_(body.username);
    const lockKey = 'fails_' + username;
    const fails = Number(cache.get(lockKey) || 0);
    if (fails >= MAX_LOGIN_FAILS) return fail('Demasiados intentos. Espera 10 minutos e inténtalo de nuevo.', 429);
    const row = readUsers_().filter(function (u) { return norm_(u.username) === username; })[0];
    if (!row || !isTrue_(row.active) || hashPassword_(body.password || '', row.salt) !== row.password_hash) {
      cache.put(lockKey, String(fails + 1), 600);
      return fail('Usuario o contraseña incorrectos.', 401);
    }
    cache.remove(lockKey);
    const token = Utilities.getUuid() + Utilities.getUuid();
    cache.put('sess_' + token, row.id, SESSION_TTL);
    return { ok: true, token: token, user: publicUser_(row) };
  }

  const me = sessionUser_(body.st);
  if (!me) return fail('unauthorized', 401);

  if (body.action === 'logout') {
    cache.remove('sess_' + body.st);
    return { ok: true };
  }
  if (body.action === 'me') return { ok: true, user: me };

  if (body.action === 'changePassword') {
    const row = readTable_('users').filter(function (u) { return u.id === me.id; })[0];
    if (!row || hashPassword_(body.current || '', row.salt) !== row.password_hash) return fail('La contraseña actual no es correcta.', 400);
    const next = String(body.next || '');
    if (next.length < 6) return fail('La nueva contraseña debe tener al menos 6 caracteres.', 400);
    const salt = newSalt_();
    upsert_('users', [{ id: me.id, password_hash: hashPassword_(next, salt), salt: salt, must_change: 'false', updated_at: '' }]);
    cache.remove('user_' + me.id);
    return { ok: true, user: publicUser_(readTable_('users').filter(function (u) { return u.id === me.id; })[0]) };
  }

  if (me.role !== 'admin') return fail('Solo un administrador puede administrar usuarios.', 403);

  if (body.action === 'listUsers') {
    return { ok: true, data: readUsers_().map(publicUser_) };
  }

  if (body.action === 'saveUser') {
    const u = body.user || {};
    const users = readUsers_();
    const username = norm_(u.username);
    if (!username || !/^[a-z0-9._-]{3,30}$/.test(username)) return fail('El usuario debe tener de 3 a 30 letras, números, punto, guion o guion bajo, sin espacios.', 400);
    if (!String(u.name || '').trim()) return fail('Escribe el nombre de la persona.', 400);
    if (users.some(function (x) { return norm_(x.username) === username && x.id !== u.id; })) return fail('Ya existe un usuario "' + username + '".', 400);
    const existing = u.id ? users.filter(function (x) { return x.id === u.id; })[0] : null;
    if (u.id && !existing) return fail('Usuario no encontrado.', 404);
    const role = u.role === 'admin' ? 'admin' : 'usuario';
    const active = u.active !== false;
    // Nunca quedarse sin administradores activos, ni quitarse el acceso a uno mismo.
    if (existing && existing.id === me.id && (role !== 'admin' || !active)) return fail('No puedes quitarte tu propio acceso de administrador.', 400);
    const adminsLeft = users.filter(function (x) { return x.id !== u.id && x.role === 'admin' && isTrue_(x.active); }).length + (role === 'admin' && active ? 1 : 0);
    if (adminsLeft === 0) return fail('Debe quedar al menos un administrador activo.', 400);
    const row = {
      id: existing ? existing.id : Utilities.getUuid(), username: username, name: String(u.name).trim(), role: role,
      permissions: JSON.stringify(Array.isArray(u.permissions) ? u.permissions : []), active: String(active), updated_at: ''
    };
    if (u.password) {
      if (String(u.password).length < 6) return fail('La contraseña debe tener al menos 6 caracteres.', 400);
      row.salt = newSalt_();
      row.password_hash = hashPassword_(u.password, row.salt);
      row.must_change = 'true'; // contraseña temporal: se cambia al entrar
    } else if (!existing) {
      return fail('Indica una contraseña temporal para el usuario nuevo.', 400);
    }
    if (!existing) row.created_at = '';
    upsert_('users', [row]);
    cache.remove('user_' + row.id);
    return { ok: true, user: publicUser_(readTable_('users').filter(function (x) { return x.id === row.id; })[0]) };
  }

  return fail('acción desconocida: ' + body.action, 400);
}

// ---------------------------------------------------------------------------
// FACTURA DIGITAL (imprenta digital vía Cachicamo, o el simulador interno)
// ---------------------------------------------------------------------------
//
// La app manda la factura en un formato propio (cliente, líneas con su base
// sin IVA y su tipo de IVA, totales esperados). Este código la traduce al
// cuerpo que pide la API de Cachicamo (POST /documents/preview y
// /documents/save_preview) y lee el número de factura y el número de control
// de la respuesta.
//
// Mientras no haya cuenta en Cachicamo, las peticiones las contesta
// simulatedCachicamo_, que imita esa API: valida el cuerpo igual, calcula los
// totales y asigna números correlativos propios. Las facturas simuladas NO
// tienen validez fiscal.
//
// Para pasar a Cachicamo de verdad: Configuración del proyecto (engranaje) →
// Propiedades del script, agrega:
//   EINVOICE_PROVIDER               cachicamo
//   CACHICAMO_API_TOKEN             (Cachicamo → Configuración → Integraciones)
//   CACHICAMO_STORE_UUID            (uuid de la tienda)
//   CACHICAMO_PRINTER_DOCUMENT_UUID (dispositivo: la imprenta digital, GET /printer_documents)
//   CACHICAMO_CURRENCY_USD_UUID     (moneda USD, GET /currencies)
//   CACHICAMO_TAX_GENERAL_UUID      (IVA 16 %, GET /taxes)
//   CACHICAMO_TAX_REDUCIDA_UUID     (IVA 8 %)
//   CACHICAMO_TAX_EXENTO_UUID       (exento)
// El token se queda en el servidor: nunca viaja a la página.

/**
 * Ejecútala UNA vez desde el editor (menú de funciones → autorizarPermisos →
 * Ejecutar) para aceptar los permisos de correo, Drive y conexiones externas.
 * Después publica una Nueva versión. Devuelve cuántos correos quedan hoy.
 */
function autorizarPermisos() {
  const quota = MailApp.getRemainingDailyQuota();
  DriveApp.getRootFolder();
  UrlFetchApp.getRequest('https://api.cachicamo.app');
  Logger.log('Permisos aceptados. Correos disponibles hoy: ' + quota);
  return quota;
}

const EINVOICE_ACTIONS = ['einvoiceInfo', 'einvoiceEmit', 'einvoiceSend', 'einvoiceLink'];
const CACHICAMO_API_URL = 'https://api.cachicamo.app';
const EINV_SCALE = 10000; // Cachicamo manda los montos como enteros × 10.000

// Identificadores fijos del simulador (en Cachicamo salen de su API).
const SIM_IDS = {
  printer: 'sim-printer-imprenta-digital', usd: 'sim-currency-usd',
  taxG: 'sim-tax-iva-16', taxR: 'sim-tax-iva-8', taxE: 'sim-tax-exento'
};
const SIM_TAX_RATES = { 'sim-tax-iva-16': 16, 'sim-tax-iva-8': 8, 'sim-tax-exento': 0 };

function einvConfig_() {
  const p = PropertiesService.getScriptProperties();
  const g = function (k) { return String(p.getProperty(k) || '').trim(); };
  if (g('EINVOICE_PROVIDER').toLowerCase() !== 'cachicamo') {
    return { provider: 'simulador', printer: SIM_IDS.printer, usd: SIM_IDS.usd, taxG: SIM_IDS.taxG, taxR: SIM_IDS.taxR, taxE: SIM_IDS.taxE };
  }
  return {
    provider: 'cachicamo', token: g('CACHICAMO_API_TOKEN'), store: g('CACHICAMO_STORE_UUID'),
    printer: g('CACHICAMO_PRINTER_DOCUMENT_UUID'), usd: g('CACHICAMO_CURRENCY_USD_UUID'),
    taxG: g('CACHICAMO_TAX_GENERAL_UUID'), taxR: g('CACHICAMO_TAX_REDUCIDA_UUID'), taxE: g('CACHICAMO_TAX_EXENTO_UUID')
  };
}

/** Datos de configuración que faltan (vacío = listo para emitir). */
function einvMissing_(cfg) {
  if (cfg.provider !== 'cachicamo') return [];
  const names = {
    token: 'CACHICAMO_API_TOKEN', store: 'CACHICAMO_STORE_UUID', printer: 'CACHICAMO_PRINTER_DOCUMENT_UUID',
    usd: 'CACHICAMO_CURRENCY_USD_UUID', taxG: 'CACHICAMO_TAX_GENERAL_UUID', taxR: 'CACHICAMO_TAX_REDUCIDA_UUID',
    taxE: 'CACHICAMO_TAX_EXENTO_UUID'
  };
  return Object.keys(names).filter(function (k) { return !cfg[k]; }).map(function (k) { return names[k]; });
}

function handleEinvoice_(body, user) {
  if (!user) return { ok: false, error: 'unauthorized', code: 401 };
  const allowed = user.role === 'admin' || (user.permissions || []).indexOf('orders') >= 0;
  if (!allowed) return { ok: false, error: 'No tienes permiso para facturar órdenes de venta.', code: 403 };
  const cfg = einvConfig_();
  if (body.action === 'einvoiceInfo') {
    return { ok: true, provider: cfg.provider, simulated: cfg.provider === 'simulador', missing: einvMissing_(cfg) };
  }
  if (body.action === 'einvoiceEmit') return einvoiceEmit_(cfg, body.invoice || {}, user, body.sandbox === true);
  if (body.action === 'einvoiceSend') return einvoiceSend_(body, body.sandbox === true);
  if (body.action === 'einvoiceLink') return einvoiceLink_(body, body.sandbox === true);
  return { ok: false, error: 'acción desconocida: ' + body.action, code: 400 };
}

const r2_ = function (n) { return Math.round((Number(n) || 0) * 100) / 100; };

/** Revisa la factura que manda la app. Devuelve el texto del error o ''. */
function einvValidate_(inv) {
  if (!inv.order_id || !inv.order_number) return 'Falta la orden de venta.';
  const c = inv.customer || {};
  if (!String(c.rif || '').trim()) return 'El cliente no tiene RIF o cédula: agrégalo en Clientes antes de facturar.';
  if (!/^[VEJPGC]\d{5,9}$/.test(einvDni_(c.rif))) {
    return 'El RIF o cédula del cliente (' + c.rif + ') no es válido. Corrígelo en Clientes: por ejemplo J-12345678-9 o V-12345678.';
  }
  if (!String(c.name || '').trim()) return 'El cliente no tiene nombre.';
  if (!Array.isArray(inv.lines) || inv.lines.length === 0) return 'La orden no tiene productos.';
  for (let i = 0; i < inv.lines.length; i++) {
    const l = inv.lines[i];
    if (!(Number(l.qty) > 0)) return 'Línea ' + (i + 1) + ': cantidad inválida.';
    if (!(Number(l.unit_price) >= 0)) return 'Línea ' + (i + 1) + ': precio inválido.';
    if (['G', 'R', 'E'].indexOf(l.iva) < 0) return 'Línea ' + (i + 1) + ': tipo de IVA inválido.';
  }
  return '';
}

/**
 * RIF/cédula como lo guarda Cachicamo: J123456784 (sin guiones ni espacios).
 * Una cédula escrita solo con números (30580323) se toma como venezolana: V30580323.
 */
function einvDni_(rif) {
  const s = String(rif || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^\d{5,9}$/.test(s) ? 'V' + s : s;
}

/** Cuerpo de POST /documents/preview y /documents/save_preview. */
function einvDocumentBody_(cfg, inv, customerUuid) {
  const taxOf = { G: cfg.taxG, R: cfg.taxR, E: cfg.taxE };
  return {
    document_type: 'INVOICE',
    customer_uuid: customerUuid,
    printer_document_uuid: cfg.printer,
    products: inv.lines.map(function (l) {
      return {
        custom_product_name: String(l.sku ? l.sku + ' · ' + l.name : l.name).slice(0, 200),
        custom_unit_price: Math.round(Number(l.unit_price) * EINV_SCALE),
        custom_currency_uuid: cfg.usd,
        qty: Number(l.qty),
        taxes_uuid: [taxOf[l.iva]],
        request_reference: String(l.ref || '')
      };
    }),
    // Sin pagos: los anticipos y cobros se controlan en la app, y la
    // retención de IVA se registra cuando el cliente entrega el comprobante.
    metadata: { origen: 'CIFCalc', order_id: inv.order_id, order_number: inv.order_number }
  };
}

/** Totales en USD, número y control de una respuesta DocumentPreview. */
function einvReadDocument_(resp) {
  const d = resp || {};
  const doc = d.document || d.invoice || {};
  const usd = function (f, raw) {
    if (f && typeof f.amount_float === 'number') return r2_(f.amount_float);
    return r2_(Number(raw || 0) / EINV_SCALE);
  };
  return {
    uuid: doc.uuid || '',
    number: doc.document_number_format || doc.document_number || '',
    control: doc.manual_control_number_format || doc.manual_control_number || '',
    issueDate: String(doc.issue_date || '').slice(0, 10),
    subtotal: usd(d.total_products_usd_format, d.total_products),
    tax: usd(d.total_taxes_usd_format, d.total_taxes),
    total: usd(d.total_invoice_usd_format, d.total_invoice),
    rate: Number(d.currency_rate_invoice) || 0
  };
}

/** Una petición a la API de Cachicamo (o al simulador). Devuelve { status, body }. */
function cachicamoRequest_(cfg, method, path, payload, sandbox) {
  if (cfg.provider !== 'cachicamo') return simulatedCachicamo_(method, path, payload, sandbox);
  const opts = {
    method: method.toLowerCase(), muteHttpExceptions: true, contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + cfg.token, 'X-Store-Uuid': cfg.store, Accept: 'application/json' }
  };
  if (payload) opts.payload = JSON.stringify(payload);
  const res = UrlFetchApp.fetch(CACHICAMO_API_URL + path, opts);
  let body = null;
  try { body = JSON.parse(res.getContentText() || 'null'); } catch (e) { body = { message: res.getContentText() }; }
  return { status: res.getResponseCode(), body: body };
}

function einvError_(step, r) {
  const b = r.body || {};
  return 'Cachicamo (' + step + ', ' + r.status + '): ' + (b.message || b.error_code || 'error sin detalle');
}

/** Busca el cliente por RIF; si no existe lo crea. Devuelve su uuid. */
function einvCustomer_(cfg, c, sandbox) {
  const dni = einvDni_(c.rif);
  const found = cachicamoRequest_(cfg, 'GET', '/customers/dni/' + encodeURIComponent(dni), null, sandbox);
  if (found.status === 200 && found.body && found.body.uuid) return found.body.uuid;
  if (found.status !== 404) throw fail_(502, einvError_('buscar cliente', found));
  const created = cachicamoRequest_(cfg, 'POST', '/customers', {
    country: 'VE', dni: dni, name: String(c.name).trim(), address: c.address || '',
    phone: c.phone || '', email: c.email || ''
  }, sandbox);
  if (created.status !== 200 && created.status !== 201) throw fail_(502, einvError_('crear cliente', created));
  return created.body.uuid;
}

function einvoiceEmit_(cfg, inv, user, sandbox) {
  if (sandbox && cfg.provider !== 'simulador') {
    return { ok: false, error: 'En modo prueba solo se usa el simulador: no se emiten facturas reales.', code: 400 };
  }
  const missing = einvMissing_(cfg);
  if (missing.length) return { ok: false, error: 'Falta configurar en el Apps Script: ' + missing.join(', '), code: 400 };
  const invalid = einvValidate_(inv);
  if (invalid) return { ok: false, error: invalid, code: 400 };

  // Una orden se factura una sola vez: si ya tiene factura digital se
  // devuelve la misma (p. ej. si la app perdió la respuesta y reintenta).
  const props = PropertiesService.getScriptProperties();
  const busyKey = 'EINV_BUSY_' + inv.order_id;
  if (!sandbox) {
    const lock = LockService.getScriptLock();
    lock.waitLock(LOCK_WAIT_MS);
    try {
      const prev = readTable_('einvoices').filter(function (r) { return r.order_id === inv.order_id && r.status === 'emitida'; })[0];
      if (prev) return { ok: true, already: true, invoice: einvPublic_(prev) };
      const busy = Number(props.getProperty(busyKey) || 0);
      if (busy && Date.now() - busy < 5 * 60 * 1000) return { ok: false, error: 'Esta orden ya se está facturando. Espera un momento y revisa.', code: 409 };
      props.setProperty(busyKey, String(Date.now()));
    } finally {
      lock.releaseLock();
    }
  }

  try {
    const customerUuid = einvCustomer_(cfg, inv.customer, sandbox);
    const docBody = einvDocumentBody_(cfg, inv, customerUuid);

    // 1) Vista previa: Cachicamo calcula los totales sin emitir nada.
    const pre = cachicamoRequest_(cfg, 'POST', '/documents/preview', docBody, sandbox);
    if (pre.status !== 200) throw fail_(502, einvError_('vista previa', pre));
    const p = einvReadDocument_(pre.body);
    const exp = inv.expected || {};
    const qtys = inv.lines.reduce(function (s, l) { return s + Number(l.qty); }, 0);
    const tol = 0.01 + qtys * 0.00005; // redondeo del precio unitario a 4 decimales
    if (Math.abs(p.total - Number(exp.total || 0)) > tol) {
      return {
        ok: false, code: 409,
        error: 'El total de la imprenta ($' + p.total.toFixed(2) + ') no coincide con el de la orden ($' + Number(exp.total || 0).toFixed(2) + '). No se emitió la factura.'
      };
    }

    // 2) Emisión: número de factura y de control de la imprenta digital.
    const saved = cachicamoRequest_(cfg, 'POST', '/documents/save_preview', docBody, sandbox);
    if (saved.status !== 200 && saved.status !== 201) throw fail_(502, einvError_('emitir', saved));
    const s = einvReadDocument_(saved.body);
    if (!s.uuid || !s.number) throw fail_(502, 'Cachicamo emitió el documento pero no devolvió su número. Revisa en Cachicamo antes de reintentar.');

    const now = new Date().toISOString();
    const row = {
      id: Utilities.getUuid(), order_id: inv.order_id, order_number: inv.order_number, provider: cfg.provider,
      document_uuid: s.uuid, invoice_number: s.number, control_number: s.control,
      issue_date: s.issueDate || now.slice(0, 10), customer_rif: einvDni_(inv.customer.rif), customer_name: inv.customer.name,
      subtotal: s.subtotal, tax: s.tax, total: s.total, rate: s.rate, pdf_url: '', status: 'emitida',
      user: user.username, response: JSON.stringify(saved.body).slice(0, 40000), request: JSON.stringify(inv).slice(0, 40000),
      emailed_to: '', emailed_at: '', created_at: now, updated_at: now
    };
    if (cfg.provider === 'cachicamo') row.pdf_url = einvSavePdf_(cfg, s.uuid, s.number);
    if (!sandbox) upsert_('einvoices', [row]);
    return { ok: true, invoice: einvPublic_(row) };
  } finally {
    if (!sandbox) props.deleteProperty(busyKey);
  }
}

function einvPublic_(r) {
  return {
    provider: r.provider, uuid: r.document_uuid, number: r.invoice_number, control: r.control_number,
    issueDate: String(r.issue_date || '').slice(0, 10), subtotal: Number(r.subtotal) || 0, tax: Number(r.tax) || 0,
    total: Number(r.total) || 0, rate: Number(r.rate) || 0, pdfUrl: r.pdf_url || '',
    emailedTo: r.emailed_to || '', emailedAt: r.emailed_at || ''
  };
}

/** Guarda el PDF sellado en Drive (carpeta facturas_digitales, privada). */
function einvSavePdf_(cfg, uuid, number) {
  try {
    const res = UrlFetchApp.fetch(CACHICAMO_API_URL + '/documents/' + encodeURIComponent(uuid) + '/render', {
      method: 'get', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + cfg.token, 'X-Store-Uuid': cfg.store }
    });
    if (res.getResponseCode() !== 200) return '';
    const it = DriveApp.getFoldersByName('facturas_digitales');
    const folder = it.hasNext() ? it.next() : DriveApp.createFolder('facturas_digitales');
    const file = folder.createFile(res.getBlob().setName('Factura_' + number + '.pdf'));
    return file.getUrl();
  } catch (e) {
    return ''; // la factura ya está emitida; el PDF se puede bajar desde Cachicamo
  }
}

// ---------- Envío al cliente (correo y WhatsApp) ----------

/**
 * Factura del modo prueba de la app: no está en la hoja einvoices (el modo
 * prueba no registra nada), así que la app manda sus datos. Solo se aceptan
 * facturas simuladas de prueba (número PRUEBA-…).
 */
function einvSandboxRow_(inv) {
  inv = inv || {};
  if (!/^PRUEBA-\d+$/.test(String(inv.number || ''))) return null;
  const c = inv.customer || {};
  return {
    id: '', order_id: inv.order_id, order_number: inv.order_number, provider: 'simulador', document_uuid: '',
    invoice_number: inv.number, control_number: inv.control || '', issue_date: inv.issue_date || '',
    customer_rif: einvDni_(c.rif), customer_name: c.name || '', subtotal: Number(inv.subtotal) || 0, tax: Number(inv.tax) || 0,
    total: Number(inv.total) || 0, rate: 0, pdf_url: '', status: 'emitida',
    request: JSON.stringify({
      customer: { address: c.address || '', phone: c.phone || '' }, lines: inv.lines || [], rate_bcv: Number(inv.rate_bcv) || 0,
      retention_pct: Number(inv.retention_pct) || 0, conditions: inv.conditions || '', credit_days: Number(inv.credit_days) || 0, seller: inv.seller || ''
    })
  };
}

function einvFind_(orderId) {
  return readTable_('einvoices').filter(function (r) { return r.order_id === orderId && r.status === 'emitida'; })[0] || null;
}

function einvIssuer_() {
  const s = readTable_('accounting_settings').filter(function (r) { return r.id === 'default'; })[0] || {};
  return { name: s.issuer_name || '', rif: s.issuer_rif || '', address: s.issuer_address || '', phone: s.issuer_phone || '', email: s.issuer_email || '', logo: s.issuer_logo || '', instagram: s.issuer_instagram || '' };
}

const einvEsc_ = function (s) {
  return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
};
const einvMoney_ = function (n) { return '$' + (Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };

/** PDF de la factura: el de la imprenta (Drive) o, en el simulador, uno armado aquí. */
function einvPdfBlob_(row) {
  const m = String(row.pdf_url || '').match(/\/d\/([A-Za-z0-9_-]+)/);
  if (m) return DriveApp.getFileById(m[1]).getBlob().setName('Factura_' + row.invoice_number + '.pdf');
  let inv = {};
  try { inv = JSON.parse(row.request || '{}'); } catch (e) { inv = {}; }
  return Utilities.newBlob(einvInvoiceHtml_(row, inv), 'text/html', 'factura.html').getAs('application/pdf').setName('Factura_' + row.invoice_number + '.pdf');
}

/**
 * Factura simulada con la distribución habitual de una factura de imprenta
 * digital venezolana (datos del cliente y del documento arriba, renglones,
 * retenciones a la izquierda y totales en Bs a la derecha). Lleva los datos
 * de la empresa emisora; el QR y la leyenda de la providencia los pone la
 * imprenta real.
 */
function einvInvoiceHtml_(row, inv) {
  const is = einvIssuer_();
  const c = inv.customer || {};
  const rate = Number(inv.rate_bcv) || 0;
  const tz = 'America/Caracas';
  const created = row.created_at ? new Date(row.created_at) : new Date();
  const fecha = Utilities.formatDate(created, tz, 'dd-MM-yyyy');
  const hora = Utilities.formatDate(created, tz, 'hh:mm:ss a').toLowerCase();
  // Montos en Bs a tasa BCV (sin tasa cargada quedan en $).
  const num = function (n) {
    const v = (Number(n) || 0) * (rate || 1);
    const p = v.toFixed(2).split('.');
    return p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + p[1];
  };
  const cur = rate ? 'Bs.' : '$';
  const alic = { G: '(G)', R: '(R)', E: '(E)' };
  const lines = (inv.lines || []).map(function (l) {
    return '<tr><td>' + einvEsc_(l.sku) + '</td><td>' + einvEsc_(l.name) + '</td><td class="c">' + einvEsc_(l.qty) +
      '</td><td class="c">' + cur + ' ' + num(l.unit_price) + '</td><td class="c">' + (alic[l.iva] || '') + '</td><td class="c">' + cur + ' ' + num(Number(l.qty) * Number(l.unit_price)) + '</td></tr>';
  }).join('');
  const exento = (inv.lines || []).filter(function (l) { return l.iva === 'E'; }).reduce(function (s, l) { return s + Number(l.qty) * Number(l.unit_price); }, 0);
  const retPct = Number(inv.retention_pct) || 0;
  const retIva = r2_(Number(row.tax) * retPct / 100);
  const sim = row.provider === 'simulador';
  const logoOk = /^(data:image\/|https:\/\/)/.test(String(is.logo || ''));
  const logo = logoOk ? '<img src="' + einvEsc_(is.logo) + '" style="max-height:92px;max-width:230px">' : '<div style="font-size:22px;font-weight:bold;font-style:italic">' + einvEsc_(is.name) + '</div>';
  const wm = logoOk && (inv.lines || []).length <= 8 ? '<div class="wm"><img src="' + einvEsc_(is.logo) + '" style="width:420px;opacity:0.08"></div>' : '';
  const kv = function (k, v, cls) { return '<tr><td class="k">' + k + '</td><td' + (cls ? ' class="' + cls + '"' : '') + '>' + v + '</td></tr>'; };
  const tot = function (k, v, strong) { return '<tr><td class="k">' + k + '</td><td class="cur">' + cur + '</td><td class="r">' + (strong ? '<b>' + v + '</b>' : v) + '</td></tr>'; };
  const social = [is.phone ? 'WhatsApp ' + einvEsc_(is.phone) : '', is.instagram ? 'Instagram ' + einvEsc_(is.instagram) : '', is.email ? einvEsc_(is.email) : '']
    .filter(String).map(function (t) { return '<span class="pill">' + t + '</span>'; }).join(' ');
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    '@page{size:letter;margin:0}' +
    'body{font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#222;margin:0}' +
    'table{border-collapse:collapse;font-size:10px}td,th{vertical-align:top;padding:1.5px 3px}' +
    // Página carta completa: arriba encabezado y renglones, abajo totales y pie.
    '.page{position:relative;width:740px;height:1010px;margin:0 auto;padding-top:26px;overflow:hidden}' +
    '.bottom{position:absolute;left:0;right:0;bottom:0}' +
    '.wm{position:absolute;left:0;right:0;top:400px;text-align:center}' +
    '.k{font-weight:bold;white-space:nowrap;padding-right:4px}.r{text-align:right}.c{text-align:center}' +
    '.red{color:#e00000;font-weight:bold;font-size:13px}' +
    '.items{width:100%;margin-top:14px}.items th{background:#e6e7e9;font-weight:normal;color:#444;padding:6px 3px;text-align:center}' +
    '.items th.l,.items td.l{text-align:left}.items td{padding:5px 3px}' +
    '.cur{padding:1px 10px;color:#333}' +
    '.pill{display:inline-block;border:1px solid #1f8fd1;color:#1f8fd1;border-radius:10px;padding:2px 9px;margin:0 3px;font-size:8.5px}' +
    '.legal{font-size:7.5px;color:#333;text-align:center;line-height:1.4}' +
    '.bar{height:7px;background:#0b2a4a;border-top:3px solid #1f8fd1;margin-top:8px}' +
    '.sim{position:absolute;left:0;right:0;top:6px;color:#c2410c;font-weight:bold;font-size:9px;text-align:center;letter-spacing:.5px}' +
    '</style></head><body><div class="page">' +
    (sim ? '<div class="sim">EJEMPLO · FACTURA SIMULADA · SIN VALIDEZ FISCAL</div>' : '') +
    // Encabezado: logo a la izquierda, datos del emisor a la derecha.
    '<table style="width:100%"><tr><td style="width:50%;padding-top:4px">' + logo + '</td>' +
    '<td style="padding-left:10px"><div style="font-size:12.5px;font-weight:bold">' + einvEsc_(is.name) + '</div>' +
    '<div style="font-size:12px;font-weight:bold">R.I.F.: ' + einvEsc_(is.rif) + '</div>' +
    '<div style="font-size:8.5px;line-height:1.4;margin-top:2px">Dirección: ' + einvEsc_(is.address) + '<br>Teléfono: ' + einvEsc_(is.phone) +
    (is.email ? ' · ' + einvEsc_(is.email) : '') + (is.instagram ? '<br>' + einvEsc_(is.instagram) : '') + '</div></td></tr></table>' +
    // Cliente a la izquierda, documento a la derecha.
    '<table style="width:100%;margin-top:34px"><tr><td style="width:58%"><table>' +
    kv('Nombre o Razón Social:', einvEsc_(row.customer_name)) + kv('Teléfono:', einvEsc_(c.phone)) +
    kv('Domicilio Fiscal:', einvEsc_(c.address)) + kv('N° Identificación:', einvEsc_(row.customer_rif)) +
    '<tr><td colspan="2" style="height:8px"></td></tr>' +
    kv('Vendedor:', einvEsc_(inv.seller || row.user || '')) + kv('Días de Créditos:', String(Number(inv.credit_days) || 0)) +
    kv('Condiciones de pago:', einvEsc_(inv.conditions || 'CONTADO')) + '</table></td>' +
    '<td><div style="font-size:12px;font-weight:bold;margin-bottom:2px">FACTURA</div><table>' +
    kv('N° de Documento:', einvEsc_(row.invoice_number)) + kv('Fecha de Emisión:', fecha) + kv('Hora de Emisión:', hora) +
    kv('N° de Control:', einvEsc_(row.control_number), 'red') + kv('Fecha de Asignación:', fecha) +
    '<tr><td colspan="2" style="height:8px"></td></tr>' + kv('Orden de venta:', einvEsc_(row.order_number)) + '</table></td></tr></table>' +
    // Renglones.
    '<table class="items" style="margin-top:22px"><tr><th class="l" style="width:11%">Código</th><th style="width:33%">Descripción</th><th>Cantidad</th><th>Precio Unitario</th><th>Alícuota I.V.A</th><th>Total</th></tr>' +
    lines + '</table>' +
    wm +
    '<div class="bottom">' +
    // Retenciones y totales.
    '<table style="width:100%"><tr><td style="width:42%"><table style="width:88%">' +
    '<tr><td class="k">Retención I.V.A.' + (retPct ? ' (' + retPct + '%)' : '') + ':</td><td class="r">' + num(retIva) + '</td></tr>' +
    '<tr><td class="k">Retención I.S.L.R.:</td><td class="r">' + num(0) + '</td></tr>' +
    '<tr><td class="k">Total a Pagar:</td><td class="r"><b>' + num(Number(row.total) - retIva) + '</b></td></tr></table></td>' +
    '<td><table style="width:100%">' +
    tot('Subtotal:', num(row.subtotal)) + tot('Descuento:', num(0)) + tot('Exento:', num(exento)) +
    tot('Base Imponible:', num(Number(row.subtotal) - exento)) + tot('Alícuota IVA (16,00%):', num(row.tax)) +
    tot('Total Operación', num(row.total)) + tot('IGTF Percibido 3,00% Sobre 0,00:', num(0)) + tot('Total A Pagar:', num(row.total), true) +
    '</table></td></tr></table>' +
    '<div style="margin-top:14px"><b><u>Observaciones:</u></b> ' +
    (rate ? 'Tasa BCV Bs. ' + rate.toFixed(4).replace('.', ',') + ' por USD. Total en divisas: $ ' + Number(row.total).toFixed(2).replace('.', ',') + '.' : '') + '</div>' +
    // Pie: redes, QR y leyenda de la imprenta.
    '<div style="text-align:center;margin-top:16px">' + social + '</div>' +
    '<table style="width:100%;margin-top:8px;border-top:1px solid #ccc"><tr>' +
    '<td style="width:70px;padding-top:6px"><div style="width:56px;height:56px;border:1px dashed #999;color:#999;font-size:6.5px;text-align:center;line-height:1.3;padding-top:18px;box-sizing:border-box">QR DE LA<br>IMPRENTA</div></td>' +
    '<td class="legal" style="padding-top:6px"><b>DOCUMENTO EMITIDO CONFORME A LA PROVIDENCIA ADMINISTRATIVA [N.º DE PROVIDENCIA DE LA IMPRENTA]</b><br>' +
    '[RAZÓN SOCIAL Y RIF DE LA IMPRENTA DIGITAL] · [DIRECCIÓN DE LA IMPRENTA] · Imprenta Digital autorizada mediante Providencia SENIAT [N.º] de fecha [FECHA].<br>' +
    'Nros. de Control desde el [00-00000001] hasta el [00-00000000] generados digitalmente en fecha [FECHA].' +
    (sim ? '<br><b style="color:#c2410c">Ejemplo generado por CIFCalc con el simulador: no es una factura fiscal.</b>' : '') + '</td></tr></table>' +
    '<div class="bar"></div></div></div></body></html>';
}

/** Envía la factura por correo al cliente, con el PDF adjunto. */
function einvoiceSend_(body, sandbox) {
  const to = String(body.to || '').trim();
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)) return { ok: false, error: 'El correo del cliente no es válido.', code: 400 };
  const row = sandbox ? einvSandboxRow_(body.invoice) : einvFind_(body.order_id);
  if (!row) return { ok: false, error: 'Esa orden no tiene factura digital.', code: 404 };
  const is = einvIssuer_();
  const sim = row.provider === 'simulador';
  const subject = (sim ? '[PRUEBA] ' : '') + 'Factura N.º ' + row.invoice_number + (is.name ? ' · ' + is.name : '');
  const html = '<p>Estimado(a) ' + einvEsc_(row.customer_name) + ':</p>' +
    '<p>Le enviamos adjunta su factura digital <b>N.º ' + einvEsc_(row.invoice_number) + '</b> (N.º de control ' + einvEsc_(row.control_number) +
    ') de fecha ' + einvEsc_(row.issue_date) + ', por un total de <b>' + einvMoney_(row.total) + '</b>.</p>' +
    (sim ? '<p style="color:#b45309"><b>Este es un envío de prueba: la factura es simulada y no tiene validez fiscal.</b></p>' : '') +
    '<p>Gracias por su compra.<br>' + einvEsc_(is.name) + (is.phone ? '<br>' + einvEsc_(is.phone) : '') + '</p>';
  const opts = { to: to, subject: subject, htmlBody: html, attachments: [einvPdfBlob_(row)] };
  if (is.name) opts.name = is.name;
  if (is.email) opts.replyTo = is.email;
  MailApp.sendEmail(opts);
  const now = new Date().toISOString();
  if (sandbox) return { ok: true, sentTo: to, emailedAt: now };
  upsert_('einvoices', [{ id: row.id, emailed_to: to, emailed_at: now, updated_at: now }]);
  return { ok: true, sentTo: to, emailedAt: now };
}

/** Enlace al PDF (cualquiera con el enlace puede verlo) para mandarlo por WhatsApp. */
function einvoiceLink_(body, sandbox) {
  const row = sandbox ? einvSandboxRow_(body.invoice) : einvFind_(body.order_id);
  if (!row) return { ok: false, error: 'Esa orden no tiene factura digital.', code: 404 };
  let id = (String(row.pdf_url || '').match(/\/d\/([A-Za-z0-9_-]+)/) || [])[1];
  if (!id) {
    const folderName = sandbox ? 'facturas_digitales_prueba' : 'facturas_digitales';
    const it = DriveApp.getFoldersByName(folderName);
    const folder = it.hasNext() ? it.next() : DriveApp.createFolder(folderName);
    id = folder.createFile(einvPdfBlob_(row)).getId();
  }
  const file = DriveApp.getFileById(id);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const url = file.getUrl();
  if (sandbox) return { ok: true, url: url, invoice: einvPublic_(Object.assign({}, row, { pdf_url: url })) };
  if (url !== row.pdf_url) upsert_('einvoices', [{ id: row.id, pdf_url: url, updated_at: new Date().toISOString() }]);
  return { ok: true, url: url, invoice: einvPublic_(Object.assign({}, row, { pdf_url: url })) };
}

// ---------- Simulador de la API de Cachicamo ----------
// Contesta las mismas rutas con la misma forma de respuesta. Los clientes y
// los correlativos quedan en las Propiedades del script (SIM_*); en modo
// prueba de la app usa correlativos aparte (SIMTEST_*).

function simulatedCachicamo_(method, path, body, sandbox) {
  const props = PropertiesService.getScriptProperties();
  const pre = sandbox ? 'SIMTEST_' : 'SIM_';
  const err = function (status, message) { return { status: status, body: { message: message, error_code: 'SIMULADOR' } }; };

  let m = path.match(/^\/customers\/dni\/(.+)$/);
  if (method === 'GET' && m) {
    const c = props.getProperty(pre + 'CUST_' + decodeURIComponent(m[1]));
    return c ? { status: 200, body: JSON.parse(c) } : err(404, 'Customer not found');
  }
  if (method === 'POST' && path === '/customers') {
    if (!body || !body.country) return err(400, 'country is required');
    if (!body.dni || !body.name) return err(400, 'name+dni or company+company_vat is mandatory');
    if (!/^[VEJPGC]\d{5,9}$/.test(body.dni)) return err(400, 'invalid RIF: ' + body.dni);
    if (props.getProperty(pre + 'CUST_' + body.dni)) return err(400, 'duplicate dni');
    const c = { uuid: Utilities.getUuid(), country: body.country, dni: body.dni, name: body.name, address: body.address || '', phone: body.phone || '', email: body.email || '' };
    props.setProperty(pre + 'CUST_' + body.dni, JSON.stringify(c));
    return { status: 200, body: c };
  }
  if (method === 'POST' && (path === '/documents/preview' || path === '/documents/save_preview')) {
    const b = body || {};
    if (b.document_type !== 'INVOICE') return err(400, 'unsupported document_type');
    if (!b.customer_uuid) return err(400, 'customer_uuid is required');
    if (b.printer_document_uuid !== SIM_IDS.printer) return err(400, 'printer_document_uuid not found');
    if (!Array.isArray(b.products) || b.products.length === 0) return err(400, 'products: at least one line');
    let base = 0, exempt = 0, taxes = 0;
    for (let i = 0; i < b.products.length; i++) {
      const l = b.products[i];
      if (!(Number(l.qty) > 0)) return err(400, 'products[' + i + '].qty must be > 0');
      if (!l.product_uuid && !(l.custom_product_name && l.custom_unit_price !== undefined && l.custom_currency_uuid)) {
        return err(400, 'products[' + i + ']: product_uuid or custom_product_name+custom_unit_price+custom_currency_uuid');
      }
      if (l.custom_currency_uuid && l.custom_currency_uuid !== SIM_IDS.usd) return err(400, 'currency not found');
      if (!Array.isArray(l.taxes_uuid) || l.taxes_uuid.length !== 1 || !(l.taxes_uuid[0] in SIM_TAX_RATES)) return err(400, 'products[' + i + ']: tax not found');
      const amount = Number(l.qty) * Number(l.custom_unit_price) / EINV_SCALE;
      const rate = SIM_TAX_RATES[l.taxes_uuid[0]];
      if (rate === 0) exempt += amount; else base += amount;
      taxes += r2_(amount * rate / 100);
    }
    const subtotal = r2_(base + exempt);
    const total = r2_(subtotal + taxes);
    const fmt = function (n) { return { amount_float: r2_(n), amount_format: '$ ' + r2_(n).toFixed(2), currency_iso: 'USD' }; };
    const out = {
      document: { uuid: '', document_number: '', manual_control_number: '', issue_date: new Date().toISOString(), customer_uuid: b.customer_uuid, document_status: 'PREVIEW' },
      total_products: Math.round(subtotal * EINV_SCALE), total_taxes: Math.round(taxes * EINV_SCALE), total_invoice: Math.round(total * EINV_SCALE),
      exempt_base: Math.round(r2_(exempt) * EINV_SCALE), taxable_base: Math.round(r2_(base) * EINV_SCALE),
      total_products_usd_format: fmt(subtotal), total_taxes_usd_format: fmt(taxes), total_invoice_usd_format: fmt(total),
      currency_rate_invoice: 0
    };
    if (path === '/documents/save_preview') {
      const lock = LockService.getScriptLock();
      lock.waitLock(LOCK_WAIT_MS);
      try {
        const n = Number(props.getProperty(pre + 'NEXT_INVOICE') || 1);
        props.setProperty(pre + 'NEXT_INVOICE', String(n + 1));
        const pad = ('00000000' + n).slice(-8);
        out.document.uuid = Utilities.getUuid();
        out.document.document_number = pad;
        out.document.document_number_format = (sandbox ? 'PRUEBA-' : 'SIM-') + pad;
        out.document.manual_control_number = '00-' + pad;
        out.document.manual_control_number_format = '00-' + pad;
        out.document.document_status = 'EMITTED';
      } finally {
        lock.releaseLock();
      }
    }
    return { status: 200, body: out };
  }
  return err(404, 'ruta no simulada: ' + method + ' ' + path);
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
