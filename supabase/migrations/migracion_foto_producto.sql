-- Maestro de Costo — Migración: foto de producto (enlace a Google Drive)
-- Archivo idempotente: puede ejecutarse varias veces sin errores.
-- Se aplica DESPUÉS de: schema.sql y todas las migraciones previas.

alter table products add column if not exists photo_url text not null default '';
