-- Maestro de Costo — Migración: atributos adicionales del catálogo de productos
-- (Marca, Colección, Categoría, Color) para soportar la importación del Maestro de Códigos.
-- Archivo idempotente: puede ejecutarse varias veces sin errores.
-- Se aplica DESPUÉS de: schema.sql y todas las migraciones previas.

alter table products add column if not exists brand text not null default '';
alter table products add column if not exists collection text not null default '';
alter table products add column if not exists category text not null default '';
alter table products add column if not exists color text not null default '';
