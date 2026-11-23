// Manual — Gastos, Costos e Inventario.
export const GASTOS_COSTOS = [
  {
    id: 'gastos', section: 'Gastos', title: 'Gastos',
    path: '#/contabilidad/gastos', menu: 'Menú → Gastos → Gastos',
    buscar: 'gasto factura de gastos egreso pago proveedor bolivares compra libro de compras iva credito',
    resumen: 'Aquí se registran las facturas de gastos de la empresa (servicios, alquiler, etc.). Una factura puede tener varias líneas y cada una va a su cuenta de gasto. Cada factura genera su asiento contable. Lo que pagas por la mercancía importada no va aquí, va en Costos.',
    pantalla: [
      'Formulario "Registrar factura de gastos": fecha, beneficiario, método de pago, concepto general y total a pagar (se calcula solo con las líneas).',
      'Interruptor de moneda: US$ o Bs. En Bs aparece la casilla "Tasa USDT (Bs por US$)" y una vista previa del equivalente en US$.',
      'Tabla de "Líneas de la factura" (concepto, cuenta contable, IVA si aplica y monto) con el botón "+ Agregar línea" y el subtotal.',
      'Si el IVA está activado en la configuración fiscal, aparece la casilla "Registrar factura fiscal del proveedor (va al Libro de Compras)".',
      'Tabla "Gastos Registrados" con los últimos 30 (fecha, referencia, beneficiario, neto, IVA y total).'
    ],
    tareas: [
      {
        q: 'Cómo registrar un gasto',
        pasos: [
          'Entra a Menú → Gastos → Gastos.',
          'Elige la fecha y el "Beneficiario" (proveedor de la lista o "+ Nuevo contacto…" si no existe; es opcional).',
          'Elige el "Método de pago": una cuenta de Efectivo o de Banco si pagaste, o una de la sección "Crédito (CxP)" si lo debes.',
          'Escribe el "Concepto general".',
          'En "Líneas de la factura" escribe el concepto, elige la cuenta contable de gasto y el monto de cada línea. Usa "+ Agregar línea" para más líneas. Un descuento va en negativo (por ejemplo −150).',
          'Pulsa "Registrar factura". Se crea el asiento con referencia GST-… y aparece en "Gastos Registrados".'
        ],
        notas: [
          'La app avisa si falta la fecha, si alguna línea no tiene cuenta o monto, si no hay método de pago o si falta el concepto.',
          'Si lo registras a crédito (sección "Crédito (CxP)"), el gasto queda como deuda con el proveedor; la pantalla Proveedores por pagar muestra los saldos de la cuenta "Proveedores por Pagar".'
        ]
      },
      {
        q: 'Cómo registrar un gasto con factura fiscal e IVA',
        pasos: [
          'Llena el gasto como siempre (fecha, beneficiario, método de pago, concepto y líneas). En cada línea elige el tipo de IVA.',
          'Marca "Registrar factura fiscal del proveedor (va al Libro de Compras)".',
          'Escribe el "N.º factura" (obligatorio) y el "N.º de control". Revisa el exento, las bases imponibles y el IVA, que se calculan de las líneas.',
          'Pulsa "Registrar factura".'
        ],
        notas: [
          'El IVA va a la cuenta IVA crédito fiscal y la factura queda en el Libro de Compras (Menú → Impuestos → IVA).',
          'Esta opción solo aparece si el IVA está activado en la configuración fiscal.'
        ]
      },
      {
        q: 'Cómo registrar un gasto pagado en bolívares',
        pasos: [
          'En "Moneda del registro" pulsa "Bs".',
          'La "Tasa USDT (Bs por US$)" se llena con la tasa guardada para la fecha; puedes corregirla a mano.',
          'Escribe los montos de las líneas en bolívares. Debajo verás el equivalente en US$.',
          'Pulsa "Registrar factura".'
        ],
        notas: [
          'Los libros se llevan en USD (equivalente USDT): USD = Bs ÷ tasa USDT.',
          'Si la moneda es Bs y no hay tasa, la app pide escribirla.'
        ]
      }
    ],
    conecta: [
      'Contactos: de ahí salen los beneficiarios.',
      'Proveedores por pagar: los gastos a crédito se pagan ahí.',
      'IVA: la factura fiscal entra al Libro de Compras.',
      'Plan de cuentas, Libro diario y Reportes: los asientos y el reporte de gastos.'
    ]
  },
  {
    id: 'por-pagar', section: 'Gastos', title: 'Proveedores por pagar',
    path: '#/contabilidad/por-pagar', menu: 'Menú → Gastos → Proveedores por pagar',
    buscar: 'pagar proveedor deuda abono pago saldo cuentas por pagar',
    resumen: 'Muestra el saldo que se le debe a cada proveedor (lo registrado contra la cuenta "Proveedores por Pagar") y permite registrar los pagos.',
    pantalla: ['Tabla con cada proveedor, su saldo y la acción "Registrar Pago".'],
    tareas: [
      {
        q: 'Cómo pagarle a un proveedor',
        pasos: [
          'Entra a Menú → Gastos → Proveedores por pagar.',
          'En el renglón del proveedor pulsa "Registrar Pago".',
          'Completa la fecha, el monto (no puede pasar del saldo) y la cuenta de Efectivo o Banco de donde sale el dinero.',
          'Pulsa "Confirmar Pago". El saldo del proveedor baja y se crea el asiento.'
        ],
        notas: ['La app avisa si falta la fecha o la cuenta, o si el monto es inválido (mayor al saldo o cero).']
      }
    ],
    conecta: ['Gastos: los gastos registrados a crédito crean la deuda.', 'Resumen: la cifra "Debes" incluye estas cuentas.']
  },
  {
    id: 'costos', section: 'Costos', title: 'Costos de importación',
    path: '#/contabilidad/costos', menu: 'Menú → Costos → Costos de importación',
    buscar: 'costo importacion factura fob flete arancel aduana contenedor mercancia asignar',
    resumen: 'Aquí se registra lo que pagas por la mercancía importada: FOB, flete, seguro, arancel, tasa portuaria, agente aduanal y otros gastos. Cada factura puede tener varias líneas y se puede asignar a su contenedor para saber cuánto costó realmente. Esos costos reales alimentan el costo de los productos.',
    pantalla: [
      'Formulario "Registrar factura de costos": fecha, contenedor, proveedor o contraparte, método de pago, concepto general y total a pagar.',
      'Líneas de la factura (cuentas de costo) y, si el IVA está activado, el bloque de factura fiscal del proveedor.',
      'Tabla "Costos Registrados" con la fecha, referencia, contraparte, contenedor asignado (se puede cambiar desde la misma tabla) y montos.'
    ],
    tareas: [
      {
        q: 'Cómo registrar una factura de costos de importación',
        pasos: [
          'Entra a Menú → Costos → Costos de importación.',
          'Elige la fecha, el contenedor al que corresponde (o "— Sin contenedor —") y el proveedor o contraparte.',
          'Elige el método de pago: una cuenta de Efectivo o de Banco.',
          'Escribe el concepto general.',
          'En "Líneas de la factura" agrega cada concepto (FOB, flete, arancel…) con su cuenta de costo y su monto.',
          'Pulsa "Registrar factura".'
        ],
        notas: [
          'La app avisa si falta la fecha, el método de pago, el concepto o si una línea no tiene cuenta o monto.',
          'Si asignas la factura a un contenedor, el costo real de ese contenedor y de sus productos se recalcula.',
          'Con IVA activado puedes marcar "Registrar factura fiscal del proveedor" para que entre al Libro de Compras.'
        ]
      },
      {
        q: 'Cómo asignar un costo a un contenedor',
        pasos: [
          'En la tabla "Costos Registrados" busca la factura.',
          'En la columna "Contenedor" elige el contenedor en la lista desplegable del propio renglón.'
        ],
        notas: ['El costo asignado se compara con el estimado en Análisis de costos.']
      }
    ],
    conecta: [
      'Análisis de costos: compara lo estimado del contenedor con lo registrado aquí.',
      'Catálogo: el costo de los productos sale de los contenedores.',
      'IVA: la factura fiscal del proveedor entra al Libro de Compras.'
    ]
  },
  {
    id: 'analisis-costos', section: 'Costos', title: 'Análisis de costos',
    path: '#/contabilidad/analisis-costos', menu: 'Menú → Costos → Análisis de costos',
    buscar: 'analisis costos estimado registrado diferencia contenedor rubro costo unitario',
    resumen: 'Compara, por contenedor, lo que se estimó en la calculadora de Contenedores con lo que realmente se registró en Costos. Muestra la comparación por rubro y el costo unitario por producto.',
    pantalla: [
      'Lista de contenedores en proceso o completos con el estimado, lo registrado, la diferencia y el avance del registro.',
      'Al tocar un contenedor se ve el detalle: por rubro (estimado, registrado y diferencia), los pagos asignados y el costo unitario por producto (estimado frente a real, con la variación).',
      'Los rubros son: FOB mercancía, Flete marítimo, Seguro, Arancel, Tasa portuaria, Agente aduanal y Otros.'
    ],
    tareas: [
      {
        q: 'Cómo ver si un contenedor costó más o menos de lo estimado',
        pasos: [
          'Entra a Menú → Costos → Análisis de costos.',
          'Toca el contenedor en la lista.',
          'En "Por rubro" compara el Estimado con lo Registrado. Lo que falta por pagar sale como "pendiente"; una diferencia en rojo es sobrecosto y en verde es ahorro.',
          'En "Costo unitario por producto" mira el estimado y el costo real de cada producto.'
        ],
        notas: [
          'La diferencia solo compara los rubros que ya tienen algo registrado, y es sin IVA.',
          'En un contenedor en proceso, lo que falta por pagar se toma del estimado.'
        ]
      },
      {
        q: 'Cómo eliminar los asientos de contenedores del modelo anterior',
        pasos: [
          'Si hay asientos de cierre o pago de contenedores del modelo anterior, aparece un aviso arriba con el botón "Eliminar del diario".',
          'Pulsa el botón y confirma. Los costos registrados en Costos no se tocan.'
        ]
      }
    ],
    conecta: ['Costos de importación: de ahí sale lo registrado.', 'Contenedores: de ahí sale el estimado; hay un enlace "Abrir en Contenedores".']
  },
  {
    id: 'catalogo', section: 'Inventario', title: 'Catálogo',
    path: '#/contabilidad/catalogo', menu: 'Menú → Inventario → Catálogo',
    buscar: 'catalogo precios lista de precios nivel distribuidor retail maximo margen costo estimado descargar excel pdf consolidado',
    resumen: 'Muestra todos los productos con su costo estimado (del contenedor más reciente donde vienen) y su precio de venta por nivel. Desde aquí se definen los niveles de precio y se descargan las listas de precios.',
    pantalla: [
      'Arriba, el botón "Descargar lista de precios" y el enlace "Agregar o editar productos".',
      'Editor de niveles de precio: nombre, margen % y "Sobre" (Costo, o el precio del primer nivel). Botón "+ Nivel" (hasta 6) y ✕ para quitar.',
      'Tabla con foto, producto y código, categoría, costo estimado (con el contenedor del que sale), un precio por cada nivel, el precio de venta fijo (editable) y el margen.',
      'Buscador (nombre, código, colección o color) y filtros por categoría y por forma (Redondo, Cuadrado, Mixto, Sin forma).'
    ],
    tareas: [
      {
        q: 'Cómo cambiar los márgenes de los niveles de precio',
        pasos: [
          'Entra a Menú → Inventario → Catálogo.',
          'En el editor de niveles cambia el "Nombre" o el "Margen %" del nivel.',
          'En los niveles después del primero, elige en "Sobre" si el margen se calcula sobre el costo o sobre el precio del primer nivel.',
          'Los precios de la tabla se recalculan al instante.'
        ],
        notas: [
          'El precio se calcula como base ÷ (1 − margen %). Por ejemplo, con 35 % de margen sobre un costo de $100: 100 ÷ 0,65 = $153,85.',
          'Si un producto no tiene costo (no vino en la compra), su precio sale vacío y en las listas aparece "Consultar".'
        ]
      },
      {
        q: 'Cómo descargar la lista de precios',
        pasos: [
          'En el Catálogo pulsa "Descargar lista de precios".',
          'Elige el nivel de precio: el archivo llevará solo los precios de ese nivel.',
          'Elige el formato: PDF, Excel o Consolidado.',
          'Pulsa "Descargar".'
        ],
        notas: [
          'PDF: se abre la vista de impresión; elige "Guardar como PDF". Tiene el mismo diseño simple del Excel.',
          'Excel: una fila por producto y acabado, con su foto cuadrada. Puede tardar unos segundos por las fotos.',
          'Consolidado: un solo Excel con una pestaña por cada nivel de precio. En ese caso no se elige nivel.',
          'Los acabados salen siempre en el orden Cromado, Steel Gray, Rose Gold.'
        ]
      },
      {
        q: 'Cómo poner o corregir el precio de venta de un producto',
        pasos: [
          'En la tabla del Catálogo, en la columna "Precio de venta", escribe el precio en la casilla del producto.',
          'Si hay un "Sugerido $…" debajo, tócalo para usar ese valor.'
        ],
        notas: ['Este es el precio fijo del producto. Los presupuestos usan los precios por nivel; el precio fijo se usa cuando el producto no tiene costo.']
      },
      {
        q: 'Cómo ver el costo estimado de un producto',
        pasos: [
          'Busca el producto en el Catálogo.',
          'La columna "Costo estimado" muestra el costo del contenedor más reciente donde viene el producto, con el BL y el estado del contenedor debajo.'
        ]
      }
    ],
    conecta: [
      'Contenedores: de ahí salen los costos estimados.',
      'Productos: para agregar o editar productos, usa el enlace "Agregar o editar productos".',
      'Presupuestos: los precios por nivel se usan al cotizar.',
      'Clientes: cada cliente puede tener un nivel de precio asignado.'
    ]
  },
  {
    id: 'existencias', section: 'Inventario', title: 'Existencias',
    path: '#/contabilidad/inventario', menu: 'Menú → Inventario → Existencias',
    buscar: 'existencias inventario stock recepcion salida ajuste despacho movimientos almacen conteo',
    resumen: 'Controla solo el inventario, no la contabilidad. La mercancía entra con las recepciones y sale con los despachos de las órdenes de venta, o con salidas y ajustes manuales.',
    pantalla: [
      'Botones arriba: "Ajuste", "Despacho" y "Registrar recepción".',
      'Pestañas "Existencias" y "Movimientos".',
      'Existencias: tarjetas con productos con existencia, unidades en almacén y unidades por despachar (de las órdenes de venta). Tabla con En almacén, Por despachar y Disponible por producto, buscador y la casilla "Solo con existencia o por despachar".',
      'Movimientos: lista de recepciones, salidas, ajustes y despachos, con su número y los productos.',
      'Si la existencia de algún producto no coincide con lo que dicen los movimientos, aparece un aviso para revisarlo y corregirlo.'
    ],
    tareas: [
      {
        q: 'Cómo registrar la recepción de mercancía',
        pasos: [
          'Entra a Menú → Inventario → Existencias y pulsa "Registrar recepción".',
          'Elige la fecha. Opcional: un contenedor y "Cargar productos" para traer sus productos.',
          'Agrega los productos con el buscador (nombre o código) y escribe las cantidades que llegaron. Puedes escribir una referencia (guía, nota de entrega).',
          'Pulsa "Registrar recepción". La existencia sube.'
        ],
        notas: ['Si el contenedor no tiene productos vinculados al catálogo, la app lo avisa.']
      },
      {
        q: 'Cómo hacer un ajuste de inventario (conteo físico, avería)',
        pasos: [
          'Pulsa "Ajuste".',
          'Agrega los productos y escribe la cantidad: positiva suma y negativa resta.',
          'Escribe el motivo (conteo físico, avería, etc.) y pulsa "Registrar ajuste".'
        ]
      },
      {
        q: 'Cómo despachar mercancía de una orden de venta',
        pasos: [
          'Pulsa "Despacho".',
          'Elige la orden de venta con mercancía por despachar.',
          'Se abre la orden con el formulario de despacho: indica las unidades que salen y confirma.'
        ],
        notas: ['Si no hay órdenes con mercancía por despachar, la app lo indica.']
      },
      {
        q: 'Cómo anular un movimiento de inventario',
        pasos: [
          'Entra a la pestaña "Movimientos".',
          'En el movimiento (recepción, salida o ajuste) pulsa "Anular" y confirma. La existencia vuelve a como estaba.'
        ],
        notas: ['Los despachos no se anulan aquí; se manejan desde la orden de venta.']
      },
      {
        q: 'Cómo saber cuánto tengo disponible de un producto',
        pasos: [
          'Entra a la pestaña "Existencias" y busca el producto.',
          '"En almacén" es lo que hay, "Por despachar" es lo pedido en órdenes de venta abiertas, y "Disponible" es la diferencia (en rojo si es negativa).'
        ]
      }
    ],
    conecta: ['Órdenes de venta: los despachos bajan la existencia.', 'Catálogo: ahí están el costo y el precio.', 'Contenedores: una recepción puede cargar los productos de un contenedor.']
  }
];
