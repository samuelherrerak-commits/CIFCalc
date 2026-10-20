-- Maestro de Costo — Migración: CRM, promociones y costo por venta.
-- Archivo idempotente: puede ejecutarse varias veces sin errores.

alter table contacts add column if not exists stage text not null default 'activo';
alter table contacts add column if not exists tags text not null default '';
alter table contacts add column if not exists notes text not null default '';
alter table contacts add column if not exists discount_pct numeric not null default 0;
alter table contacts add column if not exists next_followup_date text not null default '';

alter table quotes add column if not exists kind text not null default 'presupuesto';

alter table movements add column if not exists costo_unitario numeric not null default 0;
alter table movements add column if not exists precio_lista numeric not null default 0;

create table if not exists crm_activities (
  id text primary key,
  contact_id text not null default '',
  kind text not null default 'actividad',
  channel text not null default '',
  date text not null default '',
  due_date text not null default '',
  note text not null default '',
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists promotions (
  id text primary key,
  name text not null default '',
  scope text not null default 'categoria',
  target text not null default '',
  discount_pct numeric not null default 0,
  start_date text not null default '',
  end_date text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table crm_activities enable row level security;
alter table promotions enable row level security;
drop policy if exists "allow all crm_activities" on crm_activities;
create policy "allow all crm_activities" on crm_activities for all using (true) with check (true);
drop policy if exists "allow all promotions" on promotions;
create policy "allow all promotions" on promotions for all using (true) with check (true);
