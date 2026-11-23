// Manual — Resumen y Órdenes de venta. Ver reglas en manual.js.
export const RESUMEN_Y_ORDENES = [
  {
    id: 'resumen', section: 'General', title: 'Resumen',
    path: '#/contabilidad/resumen', menu: 'Menú → Resumen',
    buscar: 'inicio panel tablero pendientes actividad',
    resumen: 'Es la pantalla de inicio de Gestión financiera. Muestra las cifras del mes, lo que está pendiente y la actividad reciente. Cada cifra y cada pendiente lleva a su pantalla.',
    pantalla: [
      'Botones arriba: "Registrar gasto" y "Nuevo presupuesto".',
      'Franja de cifras: Ventas del mes (con la cantidad de facturas), Gastos del mes (costos y gastos), Disponible (banco + caja), Te deben (lo que los clientes deben de sus órdenes de venta, con cuánto ya está facturado) y Debes (cuentas por pagar, incluye el IVA por pagar si lo hay).',
      'Pendientes: una lista con lo que necesita atención. Solo aparecen los que aplican hoy: seguimientos de clientes para hoy o vencidos, clientes que te deben, órdenes con mercancía por despachar, presupuestos pendientes, presupuestos aprobados por convertir y productos con existencia pero sin precio. Si no hay nada, dice "Todo al día".',
      'Actividad reciente: los últimos movimientos del libro diario (tipo, cliente o proveedor, fecha y monto). Lleva al Libro diario.'
    ],
    tareas: [
      {
        q: 'Cómo ver cuánto me deben y cuánto debo',
        pasos: [
          'Entra a Menú → Resumen.',
          'En la franja de cifras, mira "Te deben" (clientes) y "Debes" (proveedores e impuestos).',
          'Toca la cifra para abrir la pantalla con el detalle: "Te deben" abre Cuentas por cobrar y "Debes" abre Proveedores por pagar.'
        ]
      },
      {
        q: 'Cómo saber qué tengo pendiente por hacer',
        pasos: [
          'Entra a Menú → Resumen y mira el cuadro "Pendientes".',
          'Toca el renglón que te interese: te lleva a la pantalla donde se resuelve (por ejemplo, presupuestos aprobados lleva a Presupuestos para convertirlos en orden).'
        ]
      }
    ],
    conecta: ['Presupuestos, Órdenes de venta, Cuentas por cobrar, Proveedores por pagar, Libro mayor, Libro diario y Reportes: las cifras y pendientes llevan a ellos.']
  },
  {
    id: 'ordenes', section: 'Ingresos', title: 'Órdenes de venta',
    path: '#/contabilidad/ordenes', menu: 'Menú → Ingresos → Órdenes de venta',
    buscar: 'orden venta anticipo despacho factura nota de entrega cobro pedido',
    resumen: 'La orden de venta nace de un presupuesto aprobado. Sobre ella se registran los anticipos del cliente, los despachos de mercancía (parciales o totales) y, al final, la factura. Lo que el cliente no pagó por anticipado queda en Cuentas por cobrar.',
    pantalla: [
      'Cuatro tarjetas: Abiertas (cantidad y total en pedidos), Anticipos recibidos (de órdenes sin facturar), Por cobrar (con cuánto ya está facturado) y Todas.',
      'Buscador por número, cliente o factura.',
      'Filtros: Abiertas, Por cobrar, Facturadas y Todas; y Con y sin factura, Con factura, Sin factura.',
      'Cada orden muestra total, pagado, saldo, una barra de despacho y su estado (Abierta, Facturada o Anulada). Al tocarla se abre su detalle.',
      'No hay botón para crear una orden aquí: las órdenes salen de convertir un presupuesto aprobado ("Ir a presupuestos").'
    ],
    tareas: [
      {
        q: 'Cómo crear una orden de venta',
        pasos: [
          'Entra a Menú → Ingresos → Presupuestos y crea el presupuesto.',
          'Apruébalo con el botón "Aprobar".',
          'Pulsa "Convertir en orden de venta". Se crea la orden (con numeración OV-año-0001) y se abre su detalle.'
        ],
        notas: ['La orden copia los productos, precios, descuento y forma de pago (divisas o bolívares) del presupuesto.']
      },
      {
        q: 'Cómo registrar el anticipo de un cliente',
        pasos: [
          'Abre la orden (Menú → Ingresos → Órdenes de venta y toca la orden).',
          'Pulsa "Registrar anticipo".',
          'Indica la fecha, el monto en USD y la forma de pago: Efectivo o Banco. Opcional: referencia (N.º de transferencia o recibo), notas y el comprobante (foto del efectivo o captura del banco).',
          'Pulsa "Registrar anticipo". Se genera el asiento: entra a Caja o Banco y queda como pasivo en Anticipos de clientes.'
        ],
        notas: [
          'Si no adjuntas comprobante, la app pregunta si quieres registrar el pago de todas formas. Puedes subirlo después desde la orden, en el cuadro "Pagos" (botón con flecha, en amarillo).',
          'Cuando la orden ya está facturada, el mismo botón se llama "Registrar cobro".'
        ]
      },
      {
        q: 'Cómo registrar un despacho (entrega de mercancía)',
        pasos: [
          'Abre la orden y pulsa "Registrar despacho".',
          'Indica la fecha y, por cada producto, cuántas unidades salen. Puede ser un despacho parcial.',
          'Agrega notas si quieres (transporte, guía, quién retira).',
          'Pulsa "Registrar despacho". La existencia del inventario baja por lo despachado. Se crea un número DSP-año-0001 y puedes imprimir la "Orden de despacho".'
        ],
        notas: [
          'Si despachas más de lo que hay registrado en existencias, la app avisa y el inventario quedaría en negativo; tú decides si continúas.',
          'El despacho no toca el libro diario: solo mueve el inventario.',
          'El botón desaparece cuando todo lo pedido ya fue despachado.'
        ]
      },
      {
        q: 'Cómo facturar una orden',
        pasos: [
          'Abre la orden y pulsa "Facturar". Si la orden es sin factura, el botón dice "Emitir nota de entrega".',
          'En una orden con factura, elige "Factura digital" (la imprenta digital asigna el número de factura y de control y se emite con fecha de hoy) o "Número manual" (escribes el N.º de factura fiscal y el N.º de control y eliges la fecha).',
          'Revisa el resumen: total, retención de IVA del cliente (si la tiene), anticipos que se aplican y lo que queda en Cuentas por cobrar.',
          'Pulsa "Emitir factura digital" o "Facturar" (o "Emitir nota").'
        ],
        notas: [
          'La factura genera un solo asiento: Debe Anticipos de clientes (lo ya pagado), IVA retenido si aplica y Cuentas por cobrar (el resto); Haber Ingresos por ventas e IVA débito fiscal.',
          'Si hay unidades sin despachar, la app lo avisa pero deja facturar y despachar después.',
          'Si el cliente pagó de más, el excedente queda como saldo a su favor en Anticipos de clientes.',
          'En factura digital puedes marcar "Enviarla por correo" si el cliente tiene correo registrado. Si la imprenta está en modo simulador, los números son de prueba y la factura no tiene validez fiscal; la pantalla lo indica.',
          'Una factura con IVA se registra también en el Libro de Ventas (Menú → Impuestos → IVA).'
        ],
        pendiente: ['No pude comprobar con una cuenta real de la imprenta digital; solo se verificó lo que muestra la pantalla.']
      },
      {
        q: 'Cómo registrar el cobro de una orden ya facturada',
        pasos: [
          'Abre la orden facturada.',
          'Pulsa "Registrar cobro" y completa fecha, monto, forma de pago (Efectivo o Banco) y, si quieres, referencia y comprobante.',
          'Pulsa "Registrar cobro". El saldo de la orden baja y el dinero entra a Caja o Banco.'
        ],
        notas: ['También puedes cobrar desde Cuentas por cobrar.']
      },
      {
        q: 'Cómo ver el estado de una orden (cobro y despacho)',
        pasos: [
          'Abre la orden. El cuadro "Estado de la orden" muestra, a la izquierda, el cobro (total, menos anticipos, cobros y retención = falta por cobrar, con el porcentaje cobrado) y, a la derecha, el despacho por producto (pedido, despachado, pendiente).',
          'Pulsa "Imprimir estado" para sacarlo en papel o PDF.'
        ]
      },
      {
        q: 'Cómo imprimir la orden, la nota de entrega o la factura',
        pasos: [
          'Abre la orden y pulsa "Imprimir". El documento cambia según el estado: Orden de venta, y una vez facturada, Nota de venta, Nota de entrega o Factura.',
          'En el diálogo de impresión del navegador elige "Guardar como PDF" si lo quieres en archivo.'
        ],
        notas: ['Si la factura fue digital, también aparecen los botones "Enviar por correo" y "WhatsApp".']
      },
      {
        q: 'Cómo cambiar una orden a con factura o sin factura',
        pasos: [
          'Abre una orden que esté Abierta.',
          'En el cuadro "Productos y precios" marca o desmarca "Con factura (IVA)".'
        ],
        notas: ['Solo se puede cambiar mientras la orden está abierta. Después de facturar, solo muestra si fue con o sin factura.']
      },
      {
        q: 'Cómo eliminar una orden de venta',
        pasos: [
          'Abre la orden (solo administradores ven el botón) y pulsa "Eliminar orden".',
          'Lee el aviso: lista lo que también se borrará (anticipos y cobros con sus asientos, despachos —la mercancía vuelve al inventario— y la factura con su registro en el Libro de Ventas) y confirma.'
        ],
        notas: [
          'El presupuesto de origen vuelve a "Aprobado".',
          'Si la factura digital ya se emitió en la imprenta real, borrarla aquí no la anula allá: hay que emitir una nota de crédito.',
          'No se puede deshacer.'
        ]
      }
    ],
    conecta: [
      'Presupuestos: de ahí nace la orden.',
      'Existencias: los despachos bajan el inventario; desde Existencias también se puede abrir el formulario de despacho de una orden.',
      'Cuentas por cobrar: lo no pagado por anticipo queda ahí al facturar.',
      'IVA (Libro de Ventas), Libro diario y Plan de cuentas: la factura, los anticipos y los cobros generan asientos.',
      'Clientes: el cliente puede tener retención de IVA (75 % o 100 %), que se descuenta de lo que debe.'
    ]
  }
];
