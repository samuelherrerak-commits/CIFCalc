-- Maestro de Costo — Migración: alinea el nombre de las columnas de foto con el
-- Apps Script real (foto_url / foto_file_id), agregando la que faltaba.
-- La columna anterior "photo_url" (de migracion_foto_producto.sql) se deja sin
-- tocar/usar para no ser destructivos; puedes eliminarla manualmente si quieres.
-- Archivo idempotente: puede ejecutarse varias veces sin errores.

alter table products add column if not exists foto_url text not null default '';
alter table products add column if not exists foto_file_id text not null default '';
