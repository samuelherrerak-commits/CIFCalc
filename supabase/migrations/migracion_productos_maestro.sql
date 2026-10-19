-- Maestro de Costo — Migración: columnas del Maestro de Códigos en products.
-- Archivo idempotente: puede ejecutarse varias veces sin errores.

alter table products add column if not exists brand text not null default '';
alter table products add column if not exists collection text not null default '';
alter table products add column if not exists category text not null default '';
alter table products add column if not exists color text not null default '';
