-- Maestro de Costo — Migración v2: simplifica el modelo contable.
-- Archivo idempotente: puede ejecutarse varias veces sin errores.
-- Se aplica DESPUÉS de: migracion_contabilidad.sql, migracion_modulos_ventas_gastos.sql,
-- migracion_movimientos.sql.
--
-- Los tipos de movimiento (Ingreso/Costo/Gasto) SON las cuentas nominales — ya no se
-- mapean a una cuenta contable aparte, así que movement_settings se recorta a solo IVA.
-- journal_entries/journal_lines quedan sin uso (no hay datos reales todavía) y se
-- reemplazan por una sola tabla plana "movements": una fila por cuenta tocada en un
-- asiento, varias filas comparten el mismo document_number.

alter table movement_settings drop column if exists ingreso_ventas_account_id;
alter table movement_settings drop column if exists ingreso_prestamo_account_id;
alter table movement_settings drop column if exists ingreso_otros_account_id;
alter table movement_settings drop column if exists costo_venta_account_id;
alter table movement_settings drop column if exists costo_producto_account_id;
alter table movement_settings drop column if exists costo_logistico_account_id;
alter table movement_settings drop column if exists costo_otros_account_id;
alter table movement_settings drop column if exists gasto_admin_account_id;
alter table movement_settings drop column if exists gasto_logistica_account_id;
alter table movement_settings drop column if exists gasto_ventas_account_id;

-- El catálogo de cuentas reales ahora es solo Activo/Pasivo/Capital (ver ACCOUNT_TYPES
-- en js/accounting.js); el valor por defecto de la columna ya no debe ser un tipo de gasto.
alter table accounts alter column type set default 'activo';

create table if not exists movements (
  id uuid primary key default gen_random_uuid(),
  entry_date text not null default '',
  document_number numeric not null default 0,
  movement_subtype text,
  account_id uuid references accounts(id) on delete restrict,
  description text not null default '',
  debit numeric not null default 0,
  credit numeric not null default 0,
  source text not null default 'manual',
  source_ref uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_movements_document_number on movements(document_number);
create index if not exists idx_movements_account_id on movements(account_id);
create index if not exists idx_movements_source_ref on movements(source_ref);

alter table movements enable row level security;

drop policy if exists "Allow all on movements" on movements;
create policy "Allow all on movements" on movements for all using (true) with check (true);

drop trigger if exists set_updated_at_movements on movements;
create trigger set_updated_at_movements before update on movements for each row execute function update_updated_at();
