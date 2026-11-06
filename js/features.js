// Interruptores de módulos. El código de un módulo apagado se conserva; solo
// se esconde del menú y su ruta lleva a otra pantalla.
//
// Punto de venta (venta directa): apagado. Briggs vende como importadora:
// todo pasa por Presupuesto → Orden de venta → anticipos → despachos → factura.
export const POS_ENABLED = false;

// Promociones: apagadas. Mientras tanto el precio solo lleva el descuento
// fijo del cliente o el % negociado en el presupuesto.
export const PROMOTIONS_ENABLED = false;

// Contenedores por pagar: apagado mientras se redefine cómo se registra el
// costo de los contenedores.
export const CONTAINER_PAYMENTS_ENABLED = false;
