-- Maestro de Costo — Migración: IVA (Libros de Compras y Ventas) y tasas BCV.
-- Archivo idempotente: puede ejecutarse varias veces sin errores.

alter table products add column if not exists iva_tipo text not null default 'general';
alter table movements add column if not exists tasa_bcv numeric not null default 0;
alter table contacts add column if not exists iva_retention_pct numeric not null default 0;

alter table accounting_settings add column if not exists iva_enabled boolean not null default true;
alter table accounting_settings add column if not exists iva_rate_general numeric not null default 16;
alter table accounting_settings add column if not exists iva_rate_reducida numeric not null default 8;
alter table accounting_settings add column if not exists prices_include_iva boolean not null default false;

create table if not exists fiscal_docs (
  id text primary key,
  book text not null default 'ventas',
  date text not null default '',
  doc_type text not null default 'factura',
  invoice_number text not null default '',
  control_number text not null default '',
  affected_invoice text not null default '',
  rif text not null default '',
  name text not null default '',
  total numeric not null default 0,
  exempt numeric not null default 0,
  base_general numeric not null default 0,
  tax_general numeric not null default 0,
  base_reducida numeric not null default 0,
  tax_reducida numeric not null default 0,
  withheld numeric not null default 0,
  withholding_number text not null default '',
  withholding_date text not null default '',
  import_form text not null default '',
  import_file text not null default '',
  ref_doc text not null default '',
  source_ref text not null default '',
  tasa_bcv numeric not null default 0,
  status text not null default 'emitida',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists exchange_rates (
  id text primary key,
  date text not null default '',
  usd_bcv numeric not null default 0,
  eur_bcv numeric not null default 0,
  usdt numeric not null default 0,
  source text not null default '',
  fetched_at text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table fiscal_docs enable row level security;
alter table exchange_rates enable row level security;
drop policy if exists "allow all fiscal_docs" on fiscal_docs;
create policy "allow all fiscal_docs" on fiscal_docs for all using (true) with check (true);
drop policy if exists "allow all exchange_rates" on exchange_rates;
create policy "allow all exchange_rates" on exchange_rates for all using (true) with check (true);
