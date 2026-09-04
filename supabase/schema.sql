-- CIFCalc — Esquema de Supabase
-- Ejecutar en el SQL Editor de Supabase Dashboard

-- ============================================
-- 1. Tabla: companies
-- ============================================
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  tax_id text not null default '',
  created_at timestamptz not null default now()
);

-- ============================================
-- 2. Tabla: suppliers
-- ============================================
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  country text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  created_at timestamptz not null default now()
);

-- ============================================
-- 3. Tabla: containers
-- ============================================
create table if not exists containers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete set null,
  bl_number text not null default '',
  operation_date text not null default '',
  container_capacity numeric not null default 33,
  insurance_rate numeric not null default 0,
  insurance_enabled boolean not null default true,
  port_fee_rate numeric not null default 0,
  vat_rate numeric not null default 16,
  ocean_freight numeric not null default 0,
  inland_freight numeric not null default 0,
  customs_expenses numeric not null default 0,
  customs_broker_fee numeric not null default 0,
  op_expenses numeric not null default 0,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

-- ============================================
-- 4. Tabla: items
-- ============================================
create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  container_id uuid not null references containers(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,
  origin_country text not null default '',
  sku text not null default '',
  name text not null default '',
  qty numeric not null default 0,
  units_per_box numeric not null default 1,
  box_volume numeric not null default 0,
  fob_unit numeric not null default 0,
  hs_code text not null default '',
  tariff_rate numeric not null default 0,
  gain_margin numeric not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================
-- 5. Índices (rendimiento en JOINs y filtros)
-- ============================================
create index if not exists idx_containers_company_id on containers(company_id);
create index if not exists idx_items_container_id on items(container_id);
create index if not exists idx_items_supplier_id on items(supplier_id);

-- ============================================
-- 6. RLS (Row Level Security)
-- ============================================
-- Habilitar RLS en todas las tablas
alter table companies enable row level security;
alter table suppliers enable row level security;
alter table containers enable row level security;
alter table items enable row level security;

-- Políticas: permitir todo al rol anon (sin auth por ahora)
create policy "Allow all on companies" on companies
  for all using (true) with check (true);

create policy "Allow all on suppliers" on suppliers
  for all using (true) with check (true);

create policy "Allow all on containers" on containers
  for all using (true) with check (true);

create policy "Allow all on items" on items
  for all using (true) with check (true);

-- ============================================
-- 7. updated_at automático (opcional)
-- ============================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger para containers (si se agrega columna updated_at)
-- Descomentar si se añade la columna updated_at a containers:
-- alter table containers add column updated_at timestamptz not null default now();
-- create trigger set_updated_at_containers
--   before update on containers
--   for each row execute function update_updated_at();
