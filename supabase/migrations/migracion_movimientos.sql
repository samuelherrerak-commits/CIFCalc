-- Maestro de Costo — Migración: Módulo de Movimientos (Ingreso / Costo / Gasto)
-- Archivo idempotente: puede ejecutarse varias veces sin errores.
-- Se aplica DESPUÉS de: migracion_contabilidad.sql, migracion_modulos_ventas_gastos.sql.
--
-- Reemplaza el CRUD abierto de "conceptos"/"categorías" (sale_concepts, expense_categories)
-- por un mapeo fijo de 1 cuenta por cada subtipo del plan de cuentas simplificado
-- (ver MOVEMENT_SUBTYPES en js/accounting.js), fila única id='default', mismo patrón
-- que accounting_settings.

create table if not exists movement_settings (
  id text primary key default 'default',

  ingreso_ventas_account_id uuid references accounts(id) on delete set null,
  ingreso_prestamo_account_id uuid references accounts(id) on delete set null,
  ingreso_otros_account_id uuid references accounts(id) on delete set null,
  vat_rate_ingreso numeric not null default 16,
  vat_account_id_ingreso uuid references accounts(id) on delete set null,

  costo_venta_account_id uuid references accounts(id) on delete set null,
  costo_producto_account_id uuid references accounts(id) on delete set null,
  costo_logistico_account_id uuid references accounts(id) on delete set null,
  costo_otros_account_id uuid references accounts(id) on delete set null,

  gasto_admin_account_id uuid references accounts(id) on delete set null,
  gasto_logistica_account_id uuid references accounts(id) on delete set null,
  gasto_ventas_account_id uuid references accounts(id) on delete set null,
  vat_rate_gasto numeric not null default 16,
  vat_account_id_gasto uuid references accounts(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table movement_settings enable row level security;

drop policy if exists "Allow all on movement_settings" on movement_settings;
create policy "Allow all on movement_settings" on movement_settings for all using (true) with check (true);

drop trigger if exists set_updated_at_movement_settings on movement_settings;
create trigger set_updated_at_movement_settings before update on movement_settings for each row execute function update_updated_at();
