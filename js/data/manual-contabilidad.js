// Manual — Impuestos, Contabilidad y Administración.
export const CONTABILIDAD = [
  {
    id: 'iva', section: 'Impuestos', title: 'IVA',
    path: '#/contabilidad/fiscal/ventas', menu: 'Menú → Impuestos → IVA',
    buscar: 'iva impuesto libro de ventas libro de compras declaracion seniat forma 30 tasa bcv dolar euro usdt retencion alicuota configuracion fiscal',
    resumen: 'Agrupa lo fiscal: el Libro de ventas, el Libro de compras, el resumen de la declaración mensual de IVA (Forma 30), las tasas de cambio BCV y USDT, y la configuración del IVA. Se organiza en cinco pestañas.',
    pantalla: [
      'Pestañas: Libro de ventas, Libro de compras, Declaración IVA, Tasas BCV y Configuración.',
      'En las tres primeras hay selector de Mes y un interruptor USD / Bs. En Bs los montos se convierten con la tasa BCV de cada documento.',
      'Libro de ventas y Libro de compras: tabla en orden cronológico con botones "Registro manual", "Exportar CSV" e "Imprimir", y un resumen con los totales.',
      'Declaración IVA: tarjetas con Débito fiscal, Crédito fiscal del mes, Excedente para el mes siguiente y Total a pagar; la tabla de la declaración y los asientos del IVA del mes.'
    ],
    tareas: [
      {
        q: 'Cómo activar el IVA y cambiar las alícuotas',
        pasos: [
          'Entra a Menú → Impuestos → IVA y abre la pestaña "Configuración".',
          'Marca "Calcular IVA en ventas y compras".',
          'Escribe la "Alícuota general (%)" y la "Alícuota reducida (%)".',
          'Elige si los precios de venta del catálogo "No incluyen IVA" o "Ya incluyen IVA".',
          'Pulsa "Guardar".'
        ],
        notas: [
          'Con el IVA desactivado, las facturas de gastos y de ventas no calculan IVA y la casilla de factura fiscal del proveedor no aparece.',
          'Los clientes que retienen IVA (75 % o 100 %) se marcan en Clientes y Contactos.'
        ]
      },
      {
        q: 'Cómo ver el libro de ventas o el libro de compras de un mes',
        pasos: [
          'Entra a Menú → Impuestos → IVA y elige la pestaña "Libro de ventas" o "Libro de compras".',
          'Elige el "Mes" arriba. Cambia entre USD y Bs si necesitas verlo en bolívares.',
          'Pulsa "Imprimir" para el documento o "Exportar CSV" para abrirlo en Excel.'
        ],
        notas: [
          'Las facturas de venta se agregan solas cuando facturas una orden con factura; las de compra, cuando registras una factura de proveedor en Gastos o Costos con "Registrar factura fiscal del proveedor".',
          'Las filas "auto" del Libro de compras son el IVA de importación de contenedores completados.',
          'Si algún documento no tiene tasa BCV, en Bs sale en 0 y aparece un aviso: edítalo para ponerle la tasa.'
        ]
      },
      {
        q: 'Cómo agregar o corregir un documento en un libro fiscal',
        pasos: [
          'Abre el Libro de ventas o el de compras.',
          'Para uno nuevo pulsa "Registro manual"; para corregir uno, pulsa "Editar" en su fila.',
          'Completa tipo de documento, fecha, tasa BCV, número de factura o nota, número de control, factura afectada, RIF, nombre y los montos (exento, base e IVA de la alícuota general y de la reducida). En ventas también el IVA retenido por el cliente y su comprobante.',
          'Marca "Documento anulado" si es el caso y pulsa "Guardar".'
        ],
        notas: [
          'El registro manual solo agrega la línea al libro (por ejemplo una nota de crédito o una factura de otro sistema); no genera asiento contable.',
          'Eliminar solo aparece en documentos manuales que no vienen de un asiento.'
        ]
      },
      {
        q: 'Cómo preparar la declaración mensual de IVA',
        pasos: [
          'Entra a la pestaña "Declaración IVA" y elige el mes.',
          'Cambia a "Bs" para ver los montos convertidos con la tasa BCV, porque la declaración se presenta en bolívares.',
          'Revisa Débito fiscal, Crédito fiscal, Excedente y Total a pagar, y la tabla con las casillas. Pulsa "Imprimir resumen" si lo necesitas.'
        ],
        notas: ['Es un resumen preparado para la Forma 30 (99030). La propia pantalla recomienda verificar los números de casilla con la planilla vigente antes de declarar.']
      },
      {
        q: 'Cómo registrar la liquidación y el pago del IVA al SENIAT',
        pasos: [
          'En "Declaración IVA", baja a "Asientos del IVA del mes".',
          'Paso 1: pulsa "Registrar liquidación" y confirma. El débito fiscal se compensa con el crédito fiscal y las retenciones, y el saldo queda en "IVA por Pagar (SENIAT)".',
          'Paso 2: elige la "Fecha de pago" y pulsa "Registrar pago" (solo se activa después de la liquidación).'
        ],
        notas: ['La liquidación solo se puede registrar si hay débito fiscal. Cuando está hecha aparece "✓ Registrada" y, tras el pago, "✓ Pagado".']
      },
      {
        q: 'Cómo consultar o guardar las tasas BCV y USDT',
        pasos: [
          'Entra a la pestaña "Tasas BCV". Arriba verás el Dólar BCV, el Euro BCV y el USDT vigentes.',
          'Pulsa "↻ Consultar tasas de hoy" para traerlas automáticamente (también hay un botón de actualizar en las tasas del menú lateral).',
          'Si no se pueden consultar, escribe la fecha y las tasas (USD BCV es obligatoria) y pulsa "Guardar a mano".'
        ],
        notas: [
          'Cada venta, gasto y asiento guarda la tasa BCV de su fecha.',
          'Los presupuestos en bolívares y los gastos en Bs necesitan las tasas USDT y BCV guardadas para la fecha.'
        ]
      }
    ],
    conecta: [
      'Órdenes de venta: la factura con IVA entra al Libro de ventas.',
      'Gastos y Costos: la factura fiscal del proveedor entra al Libro de compras.',
      'Clientes: la retención de IVA se marca en el cliente.',
      'Presupuestos y Gastos: usan las tasas para cotizar o registrar en bolívares.'
    ]
  },
  {
    id: 'plan-cuentas', section: 'Contabilidad', title: 'Plan de cuentas',
    path: '#/contabilidad/cuentas', menu: 'Menú → Contabilidad → Plan de cuentas',
    buscar: 'plan de cuentas cuenta contable catalogo codigo naturaleza activo pasivo patrimonio ingreso gasto costo moneda mapeo',
    resumen: 'Lista de las cuentas contables, agrupadas por tipo, con su código, nombre, tipo específico, naturaleza y estado. De aquí salen las cuentas que eliges en gastos, costos, ingresos y asientos.',
    pantalla: [
      'Botones: "Cargar / restablecer catálogo sugerido" y "+ Nueva Cuenta".',
      'Filtros por tipo (Todos y cada tipo de cuenta).',
      'Una tabla por tipo con código, nombre (con la marca "Bs" si es una cuenta en bolívares), tipo específico, naturaleza, estado y el botón de eliminar o desactivar.',
      'Cuadro "Mapeo Contable — Cierre de Contenedores".'
    ],
    tareas: [
      {
        q: 'Cómo crear una cuenta contable',
        pasos: [
          'Entra a Menú → Contabilidad → Plan de cuentas y pulsa "+ Nueva Cuenta".',
          'Escribe el código (obligatorio y único, por ejemplo 1.1.01.01) y el nombre (obligatorio).',
          'Elige el tipo, el tipo específico y la moneda de la cuenta: Dólares (USD) o Bolívares (Bs).',
          'Pulsa "Guardar".'
        ],
        notas: ['La app avisa si falta el código o el nombre, o si ya existe una cuenta con ese código.']
      },
      {
        q: 'Cómo eliminar o desactivar una cuenta',
        pasos: [
          'Busca la cuenta y pulsa el ícono de papelera.',
          'Si no tiene movimientos, confirma y se elimina del catálogo.',
          'Si ya tiene movimientos, no se puede eliminar: la app ofrece desactivarla, para que no aparezca en nuevos asientos.'
        ]
      },
      {
        q: 'Cómo restablecer el plan de cuentas al catálogo sugerido',
        pasos: [
          'Pulsa "Cargar / restablecer catálogo sugerido".',
          'Lee el resumen del aviso (cuentas a crear, a corregir, a quitar o a desactivar) y confirma.'
        ],
        notas: [
          'Las cuentas fuera del catálogo sin movimientos se quitan; las que ya tienen movimientos se desactivan para no romper el historial.',
          'Si el plan ya es igual al sugerido, la app lo avisa y no cambia nada.'
        ]
      }
    ],
    conecta: ['Todas las pantallas que generan asientos (Gastos, Costos, Otros ingresos, Órdenes, Cuentas por cobrar y por pagar) usan estas cuentas.']
  },
  {
    id: 'diario', section: 'Contabilidad', title: 'Libro diario',
    path: '#/contabilidad/diario', menu: 'Menú → Contabilidad → Libro diario',
    buscar: 'libro diario asiento asientos manual eliminar debe haber referencia concepto',
    resumen: 'Lista de todos los asientos contables, con su número, fecha, referencia, concepto y las cuentas con su Debe y Haber. Casi todo asiento nace solo de lo que haces en otras pantallas; aquí también puedes crear asientos manuales.',
    pantalla: [
      'Buscador (número, referencia, concepto o cliente) y filtro por cuenta.',
      'Totales de Debe y Haber del listado.',
      'Botón "+ Nuevo Asiento".',
      'Los administradores ven en cada asiento el botón "Eliminar".'
    ],
    tareas: [
      {
        q: 'Cómo registrar un asiento manual',
        pasos: [
          'Entra a Menú → Contabilidad → Libro diario y pulsa "+ Nuevo Asiento".',
          'Escribe la fecha (obligatoria) y, si quieres, una referencia.',
          'En cada línea elige la cuenta, escribe el concepto y el monto en Debe o en Haber. Usa "+ Agregar línea" para más líneas y ✕ para quitarlas.',
          'Pulsa "Registrar".'
        ],
        notas: [
          'Se necesitan al menos 2 líneas con cuenta y monto.',
          'Si el asiento queda con una diferencia de centavos, la app la ajusta con la cuenta de Diferencias de Redondeo.'
        ]
      },
      {
        q: 'Cómo buscar un asiento',
        pasos: [
          'En el Libro diario escribe en el buscador el número, la referencia (por ejemplo GST-, ING-, VTA-), el concepto o el cliente.',
          'También puedes filtrar por una cuenta en el selector.'
        ]
      },
      {
        q: 'Cómo eliminar un asiento (solo administradores)',
        pasos: [
          'Busca el asiento y pulsa "Eliminar" (aparece solo para administradores).',
          'Lee el aviso: indica qué más se borrará con él y confirma.'
        ],
        notas: [
          'Se borra junto con lo que depende de él: la factura del Libro de compras o ventas, el anticipo o cobro de una orden. Si era la factura de una orden, la orden vuelve a quedar abierta.',
          'No se puede eliminar la factura de una orden que tiene cobros registrados: primero hay que eliminar esos cobros.',
          'No se puede deshacer.'
        ]
      }
    ],
    conecta: ['Plan de cuentas: de ahí salen las cuentas.', 'Libro mayor y Estados financieros: se arman con estos asientos.']
  },
  {
    id: 'mayor', section: 'Contabilidad', title: 'Libro mayor',
    path: '#/contabilidad/mayor', menu: 'Menú → Contabilidad → Libro mayor',
    buscar: 'libro mayor cuenta saldo movimientos balance de comprobacion sobregirada exportar excel',
    resumen: 'Muestra los movimientos de una cuenta en un rango de fechas, con el saldo anterior, el saldo acumulado y los totales. Debajo trae el balance de comprobación de todas las cuentas.',
    pantalla: [
      'Selector de cuenta contable (marca las cuentas sin movimientos), fechas Desde y Hasta y botón "Exportar a Excel".',
      'Tabla de movimientos con Debe, Haber y Saldo.',
      'Balance de comprobación: todas las cuentas con Σ Debe, Σ Haber y saldo. Avisa en rojo si hay cuentas con saldo contrario a su naturaleza (sobregiradas) o mal clasificadas, con la opción "Ver solo esas" y el botón "Analizar".'
    ],
    tareas: [
      {
        q: 'Cómo ver el movimiento y el saldo de una cuenta',
        pasos: [
          'Entra a Menú → Contabilidad → Libro mayor.',
          'Elige la "Cuenta contable" y el rango Desde / Hasta.',
          'Revisa el saldo anterior, los movimientos con su saldo acumulado y los totales.'
        ],
        notas: ['También puedes tocar una cuenta en el balance de comprobación para abrir su mayor.']
      },
      {
        q: 'Cómo exportar el libro mayor a Excel',
        pasos: ['Elige la cuenta y las fechas y pulsa "Exportar a Excel".']
      },
      {
        q: 'Cómo revisar el balance de comprobación y las cuentas sobregiradas',
        pasos: [
          'Baja a "Balance de comprobación". Si todo está bien, verás "✓ Ninguna cuenta está sobregirada".',
          'Si hay cuentas con saldo contrario a su naturaleza, aparece un aviso rojo: marca "Ver solo esas" para filtrarlas.',
          'Pulsa "Analizar" en una cuenta para ver el detalle y encontrar el origen.'
        ]
      }
    ],
    conecta: ['Libro diario: los movimientos salen de los asientos.', 'Resumen: la cifra "Disponible" lleva aquí.']
  },
  {
    id: 'estados', section: 'Contabilidad', title: 'Estados financieros',
    path: '#/contabilidad/estados', menu: 'Menú → Contabilidad → Estados financieros',
    buscar: 'estados financieros balance situacion financiera resultados patrimonio flujos de efectivo notas ven-nif imprimir',
    resumen: 'Genera los estados financieros según VEN-NIF PYME, con cifras comparativas, a partir del Libro diario. Los montos negativos salen entre paréntesis.',
    pantalla: [
      'Pestañas: Situación Financiera, Resultados, Cambios en el Patrimonio, Flujos de Efectivo y Notas.',
      'Selector de periodo: Ejercicio anual (con el año), Mes (con año y mes) o Personalizado (Desde / Hasta).',
      'Botones "Imprimir este estado" e "Imprimir juego completo" (con firmas).'
    ],
    tareas: [
      {
        q: 'Cómo ver el balance o el estado de resultados',
        pasos: [
          'Entra a Menú → Contabilidad → Estados financieros.',
          'Elige el periodo: anual, mensual o personalizado.',
          'Abre la pestaña "Situación Financiera" (balance) o "Resultados".'
        ],
        notas: ['Se generan solos desde el Libro diario; no hay que escribir nada. La app incluye controles de cuadre.']
      },
      {
        q: 'Cómo imprimir los estados financieros',
        pasos: [
          'Para uno solo, abre su pestaña y pulsa "Imprimir este estado".',
          'Para todos, pulsa "Imprimir juego completo".',
          'En el diálogo del navegador elige "Guardar como PDF" si lo quieres en archivo.'
        ]
      }
    ],
    conecta: ['Libro diario y Plan de cuentas: de ahí salen las cifras.']
  },
  {
    id: 'reportes', section: 'Contabilidad', title: 'Reportes',
    path: '#/contabilidad/reportes', menu: 'Menú → Contabilidad → Reportes',
    buscar: 'reportes ventas gastos costos margen grafico csv periodo agrupar medir comparar cliente producto categoria',
    resumen: 'Reportes interactivos de Ventas y de Gastos y Costos: eliges el periodo, filtras, agrupas y mides lo que quieras, y lo ves en tarjetas, gráfico y tabla ordenable que puedes bajar en CSV. La última configuración de cada reporte se recuerda en este navegador.',
    pantalla: [
      'Selector entre "Ventas" y "Gastos y Costos".',
      'Periodo: Este mes, Mes pasado, Últimos 30 días, Últimos 90 días, Este año, Todo o Personalizado.',
      'Agrupar por y Medir; casilla "Comparar con el periodo anterior" y filtros (para Ventas: cliente, categoría, colección, producto y forma de pago; para Gastos y Costos: tipo, cuenta, beneficiario, origen y pagado con).',
      'Tarjetas de resumen, gráfico, y tabla ordenable (se toca el encabezado).'
    ],
    tareas: [
      {
        q: 'Cómo ver cuánto vendí en un periodo',
        pasos: [
          'Entra a Menú → Contabilidad → Reportes y elige "Ventas".',
          'Elige el Periodo, por ejemplo "Este mes".',
          'Elige "Agrupar por" (mes, semana, día, cliente, producto, categoría, colección o forma de pago) y "Medir" (ventas, margen, margen %, unidades, número de ventas, ticket promedio o descuentos dados).',
          'Mira las tarjetas, el gráfico y la tabla.'
        ],
        notas: ['Pasa el mouse por el gráfico para ver el detalle.']
      },
      {
        q: 'Cómo ver en qué gasto más',
        pasos: [
          'En Reportes elige "Gastos y Costos".',
          'Elige el periodo y agrupa por cuenta, tipo (gasto o costo), beneficiario, origen o forma de pago.',
          'Mide el monto, el número de registros o el promedio por registro.'
        ]
      },
      {
        q: 'Cómo filtrar un reporte y compararlo con el periodo anterior',
        pasos: [
          'Usa los filtros (por ejemplo Cliente o Categoría) y marca "Comparar con el periodo anterior".',
          'Pulsa "Quitar filtros" para volver a ver todo.'
        ]
      },
      {
        q: 'Cómo bajar un reporte a Excel',
        pasos: [
          'En la parte de la tabla pulsa "⬇ CSV de la tabla" (lo agrupado) o "⬇ CSV del detalle" (cada línea).',
          'Abre el archivo CSV con Excel.'
        ]
      }
    ],
    conecta: ['Resumen: las cifras de ventas y gastos del mes llevan a estos reportes.', 'Órdenes de venta, Gastos y Costos: de ahí salen los datos.']
  },
  {
    id: 'usuarios', section: 'Administración', title: 'Usuarios',
    path: '#/contabilidad/usuarios', menu: 'Menú → Administración → Usuarios',
    buscar: 'usuario usuarios acceso permisos modulos contrasena administrador crear desactivar',
    resumen: 'Solo para administradores. Aquí se crean los usuarios con una contraseña temporal y se marca a qué módulos puede entrar cada uno. Los administradores pueden todo.',
    pantalla: [
      'Tabla con nombre, usuario, rol (Administrador o Usuario), acceso (Todo o los módulos marcados) y estado (Activo, Contraseña temporal o Desactivado).',
      'Botón "Nuevo usuario" y "Editar" en cada fila.'
    ],
    tareas: [
      {
        q: 'Cómo crear un usuario',
        pasos: [
          'Entra a Menú → Administración → Usuarios y pulsa "Nuevo usuario".',
          'Escribe el nombre y apellido, el usuario y una contraseña temporal (mínimo 6 caracteres).',
          'Marca "Administrador" si debe poder todo; si no, marca los módulos a los que puede entrar (hay "Marcar todo", "Quitar todo" y casillas por grupo).',
          'Pulsa "Crear usuario". La app te recuerda entregarle su usuario y la contraseña temporal; el sistema le pedirá cambiarla al entrar.'
        ]
      },
      {
        q: 'Cómo cambiar los permisos o la contraseña de un usuario, o desactivarlo',
        pasos: [
          'En Usuarios pulsa "Editar" en su fila.',
          'Cambia los módulos marcados, escribe una "Nueva contraseña temporal" si hace falta, o desmarca "Activo" para desactivarlo.',
          'Pulsa "Guardar cambios".'
        ],
        notas: ['Las contraseñas nunca se ven ni se guardan en el navegador.']
      }
    ],
    conecta: ['Todos los módulos: el menú de cada usuario solo muestra lo que tiene permitido.']
  }
];
