-- CIFCalc — Migración: Peso solo en kg (se elimina lbs)
-- Archivo idempotente: puede ejecutarse varias veces sin errores.
-- Elimina la columna weight_lbs de products e items (ya no se usa).

alter table products drop column if exists weight_lbs;
alter table items drop column if exists weight_lbs;