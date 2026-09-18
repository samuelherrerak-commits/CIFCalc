-- Maestro de Costo — Migración: Módulos parametrizables de Ventas y Gastos
-- Archivo idempotente: puede ejecutarse varias veces sin errores.
-- Se aplica DESPUÉS de: schema.sql y todas las migraciones previas, incluida migracion_contabilidad.sql.

-- ============================================
-- 1. Marcar cuentas de banco/caja
-- ============================================
alter table accounts add column if not exists is_bank_account boolean not null default false;

-- ============================================
-- 2. Tabla: expense_categories (clasificación de gastos → cuenta contable)
-- ============================================
create table if not exists expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  account_id uuid references accounts(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- 3. Tabla: sale_concepts (qué se vende → cuenta de ingreso)
-- ============================================
create table if not exists sale_concepts (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  revenue_account_id uuid references accounts(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- 4. Tabla: module_settings (tasa de IVA + cuenta de IVA por módulo, fila única por id)
-- ============================================
create table if not exists module_settings (
  id text primary key,
  vat_rate numeric not null default 16,
  vat_account_id uuid references accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- 5. Índices
-- ============================================
create index if not exists idx_expense_categories_account_id on expense_categories(account_id);
create index if not exists idx_sale_concepts_revenue_account_id on sale_concepts(revenue_account_id);

-- ============================================
-- 6. RLS (Row Level Security)
-- ============================================
alter table expense_categories enable row level security;
alter table sale_concepts enable row level security;
alter table module_settings enable row level security;

drop policy if exists "Allow all on expense_categories" on expense_categories;
create policy "Allow all on expense_categories" on expense_categories for all using (true) with check (true);

drop policy if exists "Allow all on sale_concepts" on sale_concepts;
create policy "Allow all on sale_concepts" on sale_concepts for all using (true) with check (true);

drop policy if exists "Allow all on module_settings" on module_settings;
create policy "Allow all on module_settings" on module_settings for all using (true) with check (true);

-- ============================================
-- 7. updated_at automático via trigger (función compartida, ya existe desde schema.sql)
-- ============================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at_expense_categories on expense_categories;
create trigger set_updated_at_expense_categories before update on expense_categories for each row execute function update_updated_at();

drop trigger if exists set_updated_at_sale_concepts on sale_concepts;
create trigger set_updated_at_sale_concepts before update on sale_concepts for each row execute function update_updated_at();

drop trigger if exists set_updated_at_module_settings on module_settings;
create trigger set_updated_at_module_settings before update on module_settings for each row execute function update_updated_at();
