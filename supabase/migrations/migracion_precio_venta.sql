-- Maestro de Costo — Migración: precio de venta del producto (Inventario).
-- Archivo idempotente: puede ejecutarse varias veces sin errores.
--
-- Se llena con el precio sugerido por la calculadora (costo ÷ (1 − margen))
-- al completar un contenedor, y se puede editar desde Contabilidad › Inventario.

alter table products add column if not exists stock numeric not null default 0;
alter table products add column if not exists avg_cost numeric not null default 0;
alter table products add column if not exists sale_price numeric not null default 0;
