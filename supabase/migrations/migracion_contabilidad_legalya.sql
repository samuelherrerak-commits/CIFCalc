-- Maestro de Costo — Migración: contabilidad estilo LegalYa.
-- Archivo idempotente: puede ejecutarse varias veces sin errores.
-- Se aplica DESPUÉS de: migracion_contabilidad.sql, migracion_modulos_ventas_gastos.sql,
-- migracion_movimientos.sql, migracion_movimientos_v2.sql.
--
-- Reemplaza por completo el modelo anterior (cuentas Activo/Pasivo/Capital +
-- tabla "movements" con document_number/movement_subtype) por uno unificado,
-- copiado de LegalYa ERP: un solo catálogo de cuentas con códigos jerárquicos
-- (1=Activo, 2=Pasivo, 3=Patrimonio, 4=Ingreso, 5=Costo, 6=Gasto) y un diario
-- plano (una fila = una línea de Debe o Haber, sin encabezado de asiento,
-- correlacionadas solo por ref_doc).
--
-- accounts/movements ya existían con otra forma (de las migraciones
-- anteriores); como no había datos reales todavía, se recrean limpias.

drop table if exists movements cascade;
drop table if exists accounts cascade;

create table accounts (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  nombre text not null default '',
  tipo text not null default 'Gasto',
  tipo_especifico text not null default 'Otros',
  naturaleza text not null default 'Deudora',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index idx_accounts_codigo on accounts(codigo);
create index idx_accounts_tipo on accounts(tipo);

create table movements (
  id uuid primary key default gen_random_uuid(),
  entry_date text not null default '',
  codigo_cuenta text not null default '',
  cuenta_contable text not null default '',
  concepto text not null default '',
  debit numeric not null default 0,
  credit numeric not null default 0,
  ref_doc text not null default '',
  entidad text not null default '',
  source text not null default 'manual',
  source_ref uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_movements_codigo_cuenta on movements(codigo_cuenta);
create index idx_movements_ref_doc on movements(ref_doc);
create index idx_movements_source_ref on movements(source_ref);

alter table accounts enable row level security;
alter table movements enable row level security;

drop policy if exists "Allow all on accounts" on accounts;
create policy "Allow all on accounts" on accounts for all using (true) with check (true);

drop policy if exists "Allow all on movements" on movements;
create policy "Allow all on movements" on movements for all using (true) with check (true);

drop trigger if exists set_updated_at_accounts on accounts;
create trigger set_updated_at_accounts before update on accounts for each row execute function update_updated_at();

drop trigger if exists set_updated_at_movements on movements;
create trigger set_updated_at_movements before update on movements for each row execute function update_updated_at();

-- Existencias de inventario directamente en el catálogo de Productos (en vez de
-- reconstruirlas del diario como hace LegalYa — más robusto).
alter table products add column if not exists stock numeric not null default 0;
alter table products add column if not exists avg_cost numeric not null default 0;
