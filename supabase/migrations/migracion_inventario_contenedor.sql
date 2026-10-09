-- Maestro de Costo — Migración: marca de inventario registrado por contenedor.
-- Archivo idempotente: puede ejecutarse varias veces sin errores.
--
-- Antes, el inventario (stock/avg_cost) solo se registraba si el mapeo
-- contable de cierre estaba completo — si no lo estaba, el contenedor
-- quedaba "Completo" pero sin stock y sin forma de recuperarlo. Ahora el
-- inventario se registra siempre al completar el contenedor, independiente
-- del asiento contable; esta columna evita que se duplique el stock si el
-- asiento contable se reintenta después.

alter table containers add column if not exists inventory_posted boolean not null default false;
