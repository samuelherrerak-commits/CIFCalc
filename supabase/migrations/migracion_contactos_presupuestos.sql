-- Maestro de Costo — Migración: directorio de Contactos (CRM) y Presupuestos.
-- Archivo idempotente: puede ejecutarse varias veces sin errores.
-- Se aplica DESPUÉS de: migracion_contabilidad_legalya.sql, migracion_movimientos_columnas.sql.

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  rif text not null default '',
  name text not null default '',
  type text not null default 'cliente',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_contacts_rif on contacts(rif) where rif <> '';
create index if not exists idx_contacts_type on contacts(type);

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null default '',
  date text not null default '',
  contact_id uuid,
  contact_name text not null default '',
  concepto text not null default '',
  items text not null default '[]',
  total numeric not null default 0,
  status text not null default 'pendiente',
  converted_ref text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_quotes_status on quotes(status);

alter table contacts enable row level security;
alter table quotes enable row level security;

drop policy if exists "Allow all on contacts" on contacts;
create policy "Allow all on contacts" on contacts for all using (true) with check (true);

drop policy if exists "Allow all on quotes" on quotes;
create policy "Allow all on quotes" on quotes for all using (true) with check (true);

drop trigger if exists set_updated_at_contacts on contacts;
create trigger set_updated_at_contacts before update on contacts for each row execute function update_updated_at();

drop trigger if exists set_updated_at_quotes on quotes;
create trigger set_updated_at_quotes before update on quotes for each row execute function update_updated_at();
