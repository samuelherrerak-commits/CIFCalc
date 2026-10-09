-- Maestro de Costo — Migración: presupuestos con validez y datos de la empresa
-- para los documentos impresos (presupuesto / nota de venta).
-- Archivo idempotente: puede ejecutarse varias veces sin errores.

alter table quotes add column if not exists valid_until text not null default '';

alter table accounting_settings add column if not exists issuer_name text not null default '';
alter table accounting_settings add column if not exists issuer_rif text not null default '';
alter table accounting_settings add column if not exists issuer_address text not null default '';
alter table accounting_settings add column if not exists issuer_phone text not null default '';
alter table accounting_settings add column if not exists issuer_email text not null default '';
alter table accounting_settings add column if not exists issuer_logo text not null default '';
alter table accounting_settings add column if not exists quote_terms text not null default '';
