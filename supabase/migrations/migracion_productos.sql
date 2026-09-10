-- Maestro de Costo — Migración: Módulo Productos (catálogo maestro)
-- Archivo idempotente: puede ejecutarse varias veces sin errores.
-- Se aplica DESPUÉS del esquema base (schema.sql), tanto en bases nuevas
-- como en bases existentes que ya tengan las tablas originales.

-- ============================================
-- 1. Tabla: products (catálogo maestro)
-- ============================================
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  sku_briggs text not null default '',
  sku text not null default '',
  name text not null default '',
  supplier_id uuid references suppliers(id) on delete set null,
  origin_country text not null default '',
  qty numeric not null default 100,
  units_per_box numeric not null default 1,
  box_volume numeric not null default 0,
  weight_kg numeric not null default 0,
  weight_lbs numeric not null default 0,
  hs_code text not null default '',
  fob_unit numeric not null default 0,
  tariff_rate numeric not null default 0,
  gain_margin numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- 2. items: columnas nuevas del catálogo
-- ============================================
alter table items add column if not exists product_id uuid references products(id) on delete set null;
alter table items add column if not exists sku_briggs text not null default '';
alter table items add column if not exists weight_kg numeric not null default 0;
alter table items add column if not exists weight_lbs numeric not null default 0;

-- ============================================
-- 3. Índices (rendimiento en JOINs y filtros)
-- ============================================
create index if not exists idx_products_sku_briggs on products(sku_briggs);
create index if not exists idx_products_sku on products(sku);
create index if not exists idx_products_name on products(name);

-- ============================================
-- 4. RLS (Row Level Security)
-- ============================================
alter table products enable row level security;

drop policy if exists "Allow all on products" on products;
create policy "Allow all on products" on products
  for all using (true) with check (true);

-- ============================================
-- 5. updated_at automático via trigger
-- ============================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at_products on products;
create trigger set_updated_at_products
  before update on products
  for each row execute function update_updated_at();