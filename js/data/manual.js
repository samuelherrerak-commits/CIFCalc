// Manual de uso de Gestión financiera (Contabilidad). Una entrada por pantalla.
// REGLA: solo se escribe lo que la app hace hoy (se verifica en el código). Lo que no se pudo
// comprobar va en `pendiente`. El buscador del menú, la página #/contabilidad/ayuda y el
// asistente leen este mismo archivo.
//
// {
//   id, section (igual que el menú), title,
//   path: ruta de la pantalla, menu: cómo llegar,
//   resumen: para qué sirve,
//   tareas: [{ q: pregunta, pasos: [..], notas?: [..] }],
//   conecta?: [..],   // con qué otras pantallas se relaciona
//   buscar?: 'sinónimos para el buscador'
// }
import { RESUMEN_Y_ORDENES } from './manual-ingresos-1.js';
import { INGRESOS_2 } from './manual-ingresos-2.js';

export const MANUAL_BASE = [
  {
    id: 'presupuestos', section: 'Ingresos', title: 'Presupuestos',
    path: '#/contabilidad/presupuestos', menu: 'Menú → Ingresos → Presupuestos',
    buscar: 'cotizacion cotizar oferta proforma cliente precio',
    resumen: 'Aquí se arman las cotizaciones para los clientes. Un presupuesto no genera asiento contable ni rebaja el inventario. Pasa por estados: Pendiente → Aprobado → Convertido en orden de venta, o Rechazado. Al convertirlo se crea una orden de venta; el inventario y el diario se mueven después, con los anticipos, despachos y la factura de esa orden.',
    pantalla: [
      'Tres tarjetas arriba: Pendientes, Aprobados y Convertidos, cada una con la cantidad y el total en $. Al tocarlas filtran la lista.',
      'Filtros: Pendientes, Aprobados, Convertidos, Rechazados y Todos (con la cantidad de cada uno).',
      'Buscador por N.º, cliente o nota.',
      'Un presupuesto pendiente cuya fecha "Válido hasta" ya pasó se marca como Vencido.',
      'Botón "Datos de la empresa" y botón "+ Nuevo presupuesto".'
    ],
    tareas: [
      {
        q: 'Cómo crear un presupuesto',
        pasos: [
          'Entra a Menú → Ingresos → Presupuestos y pulsa "+ Nuevo presupuesto".',
          'En "Cliente" elige el cliente de la lista. Si no existe, elige "+ Nuevo contacto…" para crearlo ahí mismo.',
          'En "Venta" elige "Con factura (IVA)" o "Sin factura". Sin factura no lleva IVA.',
          'Revisa el "Nivel de precio" (Distribuidor, Retail, Máximo ponderado…). Si el cliente tiene un nivel guardado se elige solo; si no, queda el más alto y puedes cambiarlo.',
          'Elige la "Forma de pago": Divisas (USD / USDT) o Bolívares (tasa BCV).',
          'Busca los productos por nombre, categoría o código y tócalos para agregarlos. Si el cliente ya ha comprado antes, aparece el filtro "⭐ Sugeridos" con esos productos.',
          'En cada línea puedes cambiar la cantidad, el precio de lista y el descuento negociado (%).',
          'Abre el desplegable "Fecha, validez, notas y descuento" si necesitas cambiar la fecha (obligatoria), "Válido hasta" (por defecto 15 días después), escribir una nota o aplicar un descuento a todo el presupuesto.',
          'Pulsa "Emitir presupuesto". Queda como Pendiente.'
        ],
        notas: [
          'La app avisa si no hay productos ("Agrega al menos un producto"), si alguna línea tiene precio 0, si falta la fecha o si "Válido hasta" es anterior a la fecha.',
          'Los precios de lista salen del Catálogo según el nivel elegido (costo del contenedor más reciente + margen del nivel). Si un producto no tiene costo, usa su precio fijo.',
          'El descuento especial del cliente (Contactos) se aplica solo al elegirlo.'
        ]
      },
      {
        q: 'Cómo cotizar en bolívares',
        pasos: [
          'Dentro del presupuesto, en "Forma de pago", pulsa "Bolívares (tasa BCV)".',
          'La app multiplica los precios por el factor USDT ÷ BCV y muestra el total en Bs.'
        ],
        notas: ['Necesita que existan la tasa BCV y la tasa USDT guardadas para la fecha del presupuesto. Si faltan, la app lo avisa y manda a IVA → Tasas BCV.']
      },
      {
        q: 'Cómo agregar un producto que no está en el catálogo',
        pasos: [
          'Dentro del presupuesto pulsa "+ Producto que no está en el catálogo".',
          'Escribe el nombre y el precio de venta (obligatorios); la cantidad, la categoría y el tipo de IVA son opcionales.',
          'Pulsa "Agregar al presupuesto".'
        ],
        notas: ['El producto queda en el catálogo con un código provisional PROV-0001, PROV-0002… Cámbialo por el código BRG en Productos cuando lo vayas a importar.']
      },
      {
        q: 'Cómo imprimir o mandar un presupuesto por WhatsApp',
        pasos: [
          'En la lista de Presupuestos, busca el presupuesto.',
          'Pulsa "Imprimir": se abre el diálogo de impresión del navegador; elige "Guardar como PDF" si lo quieres en archivo.',
          'O pulsa "WhatsApp": abre WhatsApp con un mensaje de resumen, dirigido al teléfono del cliente si lo tiene guardado.'
        ],
        notas: ['Al emitir un presupuesto aparece un aviso verde con los botones WhatsApp e Imprimir para ese documento.']
      },
      {
        q: 'Cómo aprobar un presupuesto y convertirlo en orden de venta',
        pasos: [
          'En la lista, en un presupuesto Pendiente pulsa "Aprobar".',
          'Ya Aprobado, pulsa "Convertir en orden de venta". Se crea la orden con los mismos productos, precios y forma de pago, y se abre la orden.',
          'El presupuesto queda como "Convertido en orden" y muestra el número de la orden.'
        ],
        notas: ['Si te equivocaste al aprobar, usa "Volver a pendiente" (solo mientras no esté convertido).']
      },
      {
        q: 'Cómo editar, rechazar o eliminar un presupuesto',
        pasos: [
          'Editar: solo los Pendientes. Pulsa "Editar", cambia lo que necesites y pulsa "Guardar cambios".',
          'Rechazar: en un presupuesto Pendiente o Aprobado pulsa "Rechazar" y confirma.',
          'Eliminar: botón "Eliminar", solo para administradores y nunca en presupuestos ya convertidos. No se puede deshacer.'
        ]
      },
      {
        q: 'Cómo cambiar los datos de la empresa que salen en el presupuesto',
        pasos: [
          'En Presupuestos pulsa "Datos de la empresa".',
          'Completa nombre o razón social, RIF, teléfono, e-mail, Instagram, dirección, logo (botón "Subir logo") y los términos y condiciones.',
          'Guarda. Los datos de la empresa salen en el encabezado del presupuesto impreso y los términos y condiciones al final.'
        ]
      }
    ],
    conecta: [
      'Contactos (Clientes): de ahí salen el cliente, su descuento especial y su nivel de precio.',
      'Catálogo: de ahí salen los precios por nivel.',
      'Órdenes de venta: donde termina un presupuesto aprobado.',
      'IVA → Tasas BCV: tasas para cotizar en bolívares.'
    ]
  }
];

// Orden = el del menú.
export const MANUAL = [
  ...RESUMEN_Y_ORDENES.filter(e => e.id === 'resumen'),
  ...MANUAL_BASE.filter(e => e.id === 'presupuestos'),
  ...RESUMEN_Y_ORDENES.filter(e => e.id !== 'resumen'),
  ...INGRESOS_2
];
