-- Maestro de Costo — Migración: Módulo de Contabilidad (plan de cuentas + diario + mayor)
-- Archivo idempotente: puede ejecutarse varias veces sin errores.
-- Se aplica DESPUÉS de: schema.sql, migracion_productos.sql, migracion_peso_contenedor.sql, migracion_peso_kg.sql.

-- ============================================
-- 1. Tabla: accounts (plan de cuentas)
-- ============================================
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null default '',
  name text not null default '',
  type text not null default 'gasto_otros',
  nature text not null default 'deudora',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- 2. Tabla: journal_entries (pólizas / asientos)
-- ============================================
create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date text not null default '',
  description text not null default '',
  source text not null default 'manual',
  source_ref uuid,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- 3. Tabla: journal_lines (líneas de la póliza)
-- ============================================
create table if not exists journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references journal_entries(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete restrict,
  debit numeric not null default 0,
  credit numeric not null default 0,
  memo text not null default '',
  line_order numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- 4. Tabla: accounting_settings (mapeo de cierre automático, fila única id='default')
-- ============================================
create table if not exists accounting_settings (
  id text primary key default 'default',
  fob_account_id uuid references accounts(id) on delete set null,
  ocean_freight_account_id uuid references accounts(id) on delete set null,
  insurance_account_id uuid references accounts(id) on delete set null,
  tariff_account_id uuid references accounts(id) on delete set null,
  port_fee_account_id uuid references accounts(id) on delete set null,
  customs_broker_account_id uuid references accounts(id) on delete set null,
  other_account_id uuid references accounts(id) on delete set null,
  vat_account_id uuid references accounts(id) on delete set null,
  payable_account_id uuid references accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- 5. Índices
-- ============================================
create unique index if not exists idx_accounts_code on accounts(code);
create index if not exists idx_journal_lines_entry_id on journal_lines(entry_id);
create index if not exists idx_journal_lines_account_id on journal_lines(account_id);
create index if not exists idx_journal_entries_source_ref on journal_entries(source_ref);

-- ============================================
-- 6. RLS (Row Level Security)
-- ============================================
alter table accounts enable row level security;
alter table journal_entries enable row level security;
alter table journal_lines enable row level security;
alter table accounting_settings enable row level security;

drop policy if exists "Allow all on accounts" on accounts;
create policy "Allow all on accounts" on accounts for all using (true) with check (true);

drop policy if exists "Allow all on journal_entries" on journal_entries;
create policy "Allow all on journal_entries" on journal_entries for all using (true) with check (true);

drop policy if exists "Allow all on journal_lines" on journal_lines;
create policy "Allow all on journal_lines" on journal_lines for all using (true) with check (true);

drop policy if exists "Allow all on accounting_settings" on accounting_settings;
create policy "Allow all on accounting_settings" on accounting_settings for all using (true) with check (true);

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

drop trigger if exists set_updated_at_accounts on accounts;
create trigger set_updated_at_accounts before update on accounts for each row execute function update_updated_at();

drop trigger if exists set_updated_at_journal_entries on journal_entries;
create trigger set_updated_at_journal_entries before update on journal_entries for each row execute function update_updated_at();

drop trigger if exists set_updated_at_journal_lines on journal_lines;
create trigger set_updated_at_journal_lines before update on journal_lines for each row execute function update_updated_at();

drop trigger if exists set_updated_at_accounting_settings on accounting_settings;
create trigger set_updated_at_accounting_settings before update on accounting_settings for each row execute function update_updated_at();
