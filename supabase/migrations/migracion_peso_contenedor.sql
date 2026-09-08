-- CIFCalc — Migración: Peso máximo de carga del contenedor
-- Archivo idempotente: puede ejecutarse varias veces sin errores.
-- Agrega la columna container_max_weight (kg) a containers para la barra de peso.
-- Se aplica DESPUÉS del esquema base y de migracion_productos.sql.

alter table containers add column if not exists container_max_weight numeric not null default 28200;