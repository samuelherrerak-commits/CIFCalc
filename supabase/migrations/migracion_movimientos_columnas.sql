-- Maestro de Costo — Migración: columnas anchas del diario, estilo LegalYa.
-- Archivo idempotente: puede ejecutarse varias veces sin errores.
-- Se aplica DESPUÉS de: migracion_contabilidad_legalya.sql.
--
-- addTransaction() en LegalYa manda más columnas de las que se habían copiado
-- a "movements" (cantidad, unidad, precio_venta, codigo_barra) — Ventas e
-- Inventario las usan de verdad (cantidad vendida/recibida, precio de venta
-- unitario) y el Dashboard las vuelve a leer para "Top Vendidos".

alter table movements add column if not exists cantidad numeric not null default 0;
alter table movements add column if not exists unidad text not null default 'monto';
alter table movements add column if not exists precio_venta numeric not null default 0;
alter table movements add column if not exists codigo_barra text not null default '';
