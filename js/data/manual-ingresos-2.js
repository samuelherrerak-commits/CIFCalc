// Manual — Clientes, Cuentas por cobrar y Otros ingresos.
export const INGRESOS_2 = [
  {
    id: 'clientes', section: 'Ingresos', title: 'Clientes y Contactos',
    path: '#/contabilidad/contactos', menu: 'Menú → Ingresos → Clientes',
    buscar: 'cliente contacto proveedor crm seguimiento oferta nivel de precio descuento retencion rif telefono',
    resumen: 'Directorio de clientes y proveedores. De cada contacto guarda sus datos, su etapa, su historial de compras, los productos que compra, sus seguimientos y sus ofertas. Los selectores de Presupuestos, Gastos y otras pantallas usan este directorio.',
    pantalla: [
      'Cuatro tarjetas: Clientes activos, Prospectos, Seguimientos para hoy y Sin comprar +60 días. Las dos primeras filtran por etapa; las otras ordenan la lista.',
      'Buscador (nombre, RIF, teléfono, etiqueta) y filtros por rol (Clientes o Proveedores), etapa (Prospecto, Activo, Inactivo, Perdido) y orden (Mayor comprador, Compra más reciente, Próximo seguimiento, Nombre A-Z).',
      'Cada contacto muestra su etapa, el descuento especial si lo tiene, lo comprado, la última compra, lo que debe y su próximo seguimiento. Al tocarlo se abre su ficha.',
      'La ficha tiene tarjetas con total comprado, margen, ticket promedio, unidades, última compra, cada cuánto compra y cuánto te debe, y las pestañas Compras, Lo que compra, Seguimiento, Ofertas y Datos.'
    ],
    tareas: [
      {
        q: 'Cómo crear un cliente o un proveedor',
        pasos: [
          'Entra a Menú → Ingresos → Clientes y pulsa "+ Nuevo contacto".',
          'Completa el nombre o razón social (obligatorio) y el rol: Cliente, Proveedor o Cliente y Proveedor.',
          'Completa lo que tengas: etapa, cédula o RIF, teléfono o WhatsApp, correo, dirección, descuento especial (%), etiquetas, retención de IVA y notas.',
          'Pulsa "Guardar". Se abre la ficha del contacto.'
        ],
        notas: [
          'No se puede repetir el RIF: si ya existe otro contacto con ese RIF, la app avisa.',
          'También puedes crear un cliente desde un presupuesto, eligiendo "+ Nuevo contacto…" en la lista de clientes.'
        ]
      },
      {
        q: 'Cómo asignarle un nivel de precio a un cliente',
        pasos: [
          'Abre la ficha del cliente, pestaña "Datos", y pulsa "Editar datos".',
          'En "Nivel de precio" elige Distribuidor, Retail, Máximo ponderado o el nivel que hayas creado en el Catálogo. "Sin definir" lo deja para elegirlo en cada presupuesto.',
          'Pulsa "Guardar".'
        ],
        notas: ['Al crear un presupuesto para ese cliente, el nivel se elige solo y los precios salen del Catálogo con ese nivel.']
      },
      {
        q: 'Cómo darle un descuento especial a un cliente',
        pasos: [
          'Abre la ficha del cliente y pulsa "Editar datos" (pestaña Datos).',
          'Escribe el "Descuento especial %" (de 0 a 90).',
          'Guarda. El descuento se aplica solo en los presupuestos de ese cliente y se ve en la lista como -%.'
        ]
      },
      {
        q: 'Cómo marcar que un cliente retiene IVA',
        pasos: [
          'Abre la ficha y pulsa "Editar datos".',
          'En "Retención de IVA (contribuyente especial)" elige No retiene, Retiene el 75 % o Retiene el 100 % del IVA.',
          'Guarda.'
        ],
        notas: ['En las órdenes con factura de ese cliente, la retención se descuenta de lo que debe y se registra al facturar.']
      },
      {
        q: 'Cómo registrar una llamada, visita o nota con un cliente',
        pasos: [
          'Abre la ficha del cliente y entra a la pestaña "Seguimiento".',
          'En "Registrar contacto con el cliente" elige el canal: Llamada, WhatsApp, Visita, Correo o Nota.',
          'Escribe qué se habló, ajusta la fecha y pulsa "Guardar".'
        ],
        notas: ['Queda en el "Historial" del cliente, junto con sus compras, presupuestos y ofertas.']
      },
      {
        q: 'Cómo programar un seguimiento a un cliente',
        pasos: [
          'En la ficha del cliente pulsa "Seguimiento" (arriba) o entra a la pestaña "Seguimiento".',
          'En "Programar próximo seguimiento" escribe qué hay que hacer y elige la fecha.',
          'Pulsa "Programar". Queda en "Tareas pendientes".',
          'Cuando lo hagas, pulsa el círculo de la tarea para marcarla como hecha. Con la ✕ la eliminas.'
        ],
        notas: [
          'Las tareas vencidas o de hoy salen en rojo, en la tarjeta "Seguimientos para hoy" de la lista y en los Pendientes del Resumen.',
          'La fecha del próximo seguimiento del contacto es la de su tarea pendiente más próxima.'
        ]
      },
      {
        q: 'Cómo hacer una oferta especial para un cliente',
        pasos: [
          'En la ficha del cliente pulsa "Nueva oferta" (o entra a la pestaña "Ofertas" y úsalo ahí).',
          'Se abre el armado de presupuesto como Oferta, con ese cliente ya elegido. Arma la oferta con los productos que ya compra (filtro "⭐ Sugeridos") o los que te interese mover, con descuento.',
          'Pulsa "Emitir oferta".',
          'Después, desde la pestaña "Ofertas" o desde Presupuestos, puedes imprimirla o mandarla por WhatsApp.'
        ]
      },
      {
        q: 'Cómo ver qué ha comprado un cliente',
        pasos: [
          'Abre la ficha. La pestaña "Compras" lista sus ventas (fecha, orden, pago, productos, unidades, total, margen y saldo) con enlace "Ver orden".',
          'La pestaña "Lo que compra" muestra sus productos con la cantidad, la última compra y el último precio, y sugerencias de las categorías que compra y que tienen existencia.'
        ]
      },
      {
        q: 'Cómo cambiar la etapa de un cliente, editar o eliminar un contacto',
        pasos: [
          'Etapa: en la ficha, cambia el selector junto al nombre (Prospecto, Activo, Inactivo, Perdido).',
          'Editar: pestaña "Datos" → "Editar datos".',
          'Eliminar: pestaña "Datos" → "Eliminar contacto" y confirma.'
        ],
        notas: ['Al eliminar un contacto, sus ventas y asientos no se borran.']
      }
    ],
    conecta: [
      'Presupuestos: el cliente elegido aporta su nivel de precio, su descuento especial y su teléfono para WhatsApp.',
      'Órdenes de venta y Cuentas por cobrar: la ficha muestra lo que el cliente debe y su retención de IVA.',
      'Resumen: los seguimientos de hoy aparecen en los Pendientes.'
    ]
  },
  {
    id: 'por-cobrar', section: 'Ingresos', title: 'Cuentas por cobrar',
    path: '#/contabilidad/por-cobrar', menu: 'Menú → Ingresos → Cuentas por cobrar',
    buscar: 'cobrar cobranza deuda clientes saldo cobro anticipo me deben',
    resumen: 'Muestra lo que debe cada cliente según sus órdenes de venta: total de la orden menos anticipos, cobros y retención de IVA. Cuenta las órdenes facturadas y también las que aún no se facturan.',
    pantalla: [
      'Tres tarjetas: Total por cobrar, Ya facturado (lo que ya está en Cuentas por cobrar contable) y Por facturar (órdenes abiertas, descontando anticipos).',
      'Filtro: Con y sin factura, Con factura, Sin factura.',
      'Tabla agrupada por cliente, ordenada de mayor a menor saldo. Al tocar un cliente se despliegan sus órdenes con total, pagado, retención y saldo.',
      'Si hay saldos viejos de ventas registradas antes del módulo de órdenes, aparece un cuadro aparte: "Saldos anteriores sin orden de venta".'
    ],
    tareas: [
      {
        q: 'Cómo ver cuánto me debe un cliente',
        pasos: [
          'Entra a Menú → Ingresos → Cuentas por cobrar.',
          'Busca al cliente en la tabla: el saldo está a la derecha.',
          'Toca el renglón del cliente ("Ver órdenes") para ver el detalle por orden. El número de orden abre la orden.'
        ]
      },
      {
        q: 'Cómo registrar un cobro o un anticipo desde Cuentas por cobrar',
        pasos: [
          'Despliega al cliente con "Ver órdenes".',
          'En la orden, pulsa "Registrar cobro" (si ya está facturada) o "Registrar anticipo" (si todavía no).',
          'Completa fecha, monto en USD, forma de pago (Efectivo o Banco) y, si quieres, referencia, comprobante y notas, y confirma.'
        ],
        notas: ['Es el mismo formulario de la orden de venta. El dinero entra a Caja o Banco y el saldo de la orden baja.']
      },
      {
        q: 'Cómo cobrar un saldo anterior que no viene de una orden',
        pasos: [
          'En el cuadro "Saldos anteriores sin orden de venta", ubica al cliente.',
          'Ajusta la fecha, el monto (no puede pasar del saldo), y elige la cuenta de Efectivo o Banco donde entra el dinero.',
          'Pulsa "Registrar cobro".'
        ],
        notas: ['Si falta la fecha, la cuenta o el monto es mayor al saldo, la app lo avisa y no registra el cobro.']
      }
    ],
    conecta: [
      'Órdenes de venta: de ahí sale cada saldo; los anticipos, cobros y la retención se registran en la orden.',
      'Resumen: la cifra "Te deben" sale de aquí.',
      'Plan de cuentas y Libro diario: cada cobro genera un asiento (Debe Caja o Banco / Haber Cuentas por cobrar o Anticipos).'
    ]
  },
  {
    id: 'otros-ingresos', section: 'Ingresos', title: 'Otros ingresos',
    path: '#/contabilidad/ingresos', menu: 'Menú → Ingresos → Otros ingresos',
    buscar: 'ingreso prestamo deposito entrada de dinero',
    resumen: 'Para registrar entradas de dinero que NO son la venta de mercancía: por ejemplo un préstamo recibido u otro ingreso. Las ventas de productos no se registran aquí: van por Presupuestos y Órdenes de venta.',
    pantalla: [
      'Formulario "Registrar Ingreso" con fecha, cuenta de ingreso, monto total, forma de pago, cliente o contraparte y concepto.',
      'Tabla "Ingresos Registrados" con los últimos 30 (fecha, referencia, monto y contraparte).'
    ],
    tareas: [
      {
        q: 'Cómo registrar un ingreso que no es una venta (por ejemplo, un préstamo recibido)',
        pasos: [
          'Entra a Menú → Ingresos → Otros ingresos.',
          'Completa la fecha, la "Cuenta de Ingreso" y el "Monto Total".',
          'En "Forma de Pago" elige la cuenta donde entra el dinero: una de Efectivo, una de Banco o, si es a crédito, una de Clientes (Crédito CxC).',
          'Opcional: "Cliente / Contraparte". El "Concepto" es obligatorio.',
          'Pulsa "Registrar Ingreso". Se crea el asiento (referencia ING-…) y aparece en la tabla.'
        ],
        notas: [
          'La app avisa si falta la fecha, la cuenta de ingreso, la cuenta de pago, el concepto o si el monto no es mayor a 0.',
          'La cuenta "Ingresos por Ventas" no aparece en la lista: está reservada para las ventas facturadas desde las órdenes.',
          'Si el asiento descuadra por centavos, la app lo ajusta con una cuenta de diferencia de redondeo.'
        ]
      }
    ],
    conecta: ['Plan de cuentas: las cuentas de ingreso y de pago salen de ahí.', 'Libro diario y Libro mayor: el ingreso queda registrado como asiento.']
  }
];
