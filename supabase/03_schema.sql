-- =====================================================================
-- PASO 3 — ESQUEMA DE DIGITAL AMENITIES
-- Refleja lib/types.ts: los enums usan exactamente los mismos valores
-- que las uniones de TypeScript.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type project_type as enum ('propio', 'terceros');

create type project_status as enum (
  'Idea',
  'Presupuestado',
  'En negociación',
  'En desarrollo',
  'En pruebas',
  'Esperando al cliente',
  'Pausado',
  'Bloqueado',
  'Implementado',
  'En mantenimiento',
  'Finalizado'
);

create type priority as enum ('Baja', 'Media', 'Alta', 'Crítica');

create type currency as enum ('USD', 'ARS', 'EUR');

create type payment_method as enum (
  'Transferencia', 'Efectivo', 'Tarjeta', 'Mercado Pago', 'Crypto', 'PayPal'
);

create type payment_status as enum ('Pendiente', 'Cobrado', 'Vencido');

create type maintenance_status as enum ('Activo', 'Pausado', 'Cancelado');

create type maintenance_frequency as enum ('Mensual', 'Trimestral', 'Semestral', 'Anual');

create type note_category as enum (
  'Idea', 'Proyecto potencial', 'Recordatorio', 'Reunión', 'Pendiente', 'Mejora'
);

create type activity_type as enum (
  'estado', 'pago', 'mantenimiento', 'nota', 'proyecto', 'edición'
);


-- ---------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------
create table clients (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  contact_person text not null default '',
  phone          text not null default '',
  email          text not null default '',
  notes          text not null default '',
  created_at     timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- Proyectos (núcleo del sistema)
-- ---------------------------------------------------------------------
create table projects (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  description         text not null default '',
  type                project_type not null default 'terceros',
  client_id           uuid references clients(id) on delete set null,
  owner_name          text not null default '',
  contact_person      text not null default '',
  internal_lead       text not null default '',
  status              project_status not null default 'Idea',
  priority            priority not null default 'Media',
  start_date          date,
  estimated_delivery  date,
  implementation_date date,
  quoted_amount       numeric(12,2) not null default 0,
  currency            currency not null default 'USD',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index projects_client_id_idx on projects (client_id);
create index projects_status_idx    on projects (status);
create index projects_updated_at_idx on projects (updated_at desc);


-- ---------------------------------------------------------------------
-- Desarrollo (1:1 con proyecto)
-- ---------------------------------------------------------------------
create table project_development (
  project_id     uuid primary key references projects(id) on delete cascade,
  stage          text not null default '',
  progress       smallint not null default 0 check (progress between 0 and 100),
  next_goal      text not null default '',
  internal_todos text[] not null default '{}',
  client_todos   text[] not null default '{}',
  blockers       text[] not null default '{}',
  last_update    date
);


-- ---------------------------------------------------------------------
-- Infraestructura (1:1 con proyecto)
-- NOTA: por diseño acá NO se guardan contraseñas ni tokens.
-- ---------------------------------------------------------------------
create table project_infrastructure (
  project_id        uuid primary key references projects(id) on delete cascade,
  production_url    text not null default '',
  staging_url       text not null default '',
  repo              text not null default '',
  deploy_platform   text not null default '',
  hosting           text not null default '',
  domain            text not null default '',
  domain_expiry     date,
  database          text not null default '',
  external_services text[] not null default '{}',
  automations       text[] not null default '{}',
  tech_lead         text not null default ''
);


-- ---------------------------------------------------------------------
-- Costos de infraestructura (N por proyecto)
-- ---------------------------------------------------------------------
create table infrastructure_costs (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  concept    text not null,
  amount     numeric(12,2) not null default 0,
  currency   currency not null default 'USD',
  frequency  maintenance_frequency not null default 'Mensual'
);

create index infrastructure_costs_project_id_idx on infrastructure_costs (project_id);


-- ---------------------------------------------------------------------
-- Mantenimiento (1:1 con proyecto)
-- due_day tope 28 para que exista en todos los meses.
-- ---------------------------------------------------------------------
create table project_maintenance (
  project_id          uuid primary key references projects(id) on delete cascade,
  active              boolean not null default false,
  implementation_date date,
  start_date          date,
  amount              numeric(12,2) not null default 0,
  currency            currency not null default 'USD',
  frequency           maintenance_frequency not null default 'Mensual',
  due_day             smallint not null default 1 check (due_day between 1 and 28),
  services            text[] not null default '{}',
  status              maintenance_status not null default 'Pausado',
  last_collected_date date
);


-- ---------------------------------------------------------------------
-- Pagos del proyecto
-- ---------------------------------------------------------------------
create table payments (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  concept    text not null,
  amount     numeric(12,2) not null default 0,
  currency   currency not null default 'USD',
  due_date   date not null,
  paid_date  date,
  method     payment_method,
  status     payment_status not null default 'Pendiente',
  receipt    text,
  notes      text not null default '',
  created_at timestamptz not null default now()
);

create index payments_project_id_idx on payments (project_id);
create index payments_due_date_idx   on payments (due_date);
create index payments_status_idx     on payments (status);


-- ---------------------------------------------------------------------
-- Cobros de mantenimiento (historial de cada cobro recurrente)
-- El MVP hoy sólo guarda la última fecha; esta tabla permite el
-- historial completo que pide el brief (fecha, importe, medio, comprobante).
-- ---------------------------------------------------------------------
create table maintenance_charges (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  charged_on date not null,
  amount     numeric(12,2) not null,
  currency   currency not null default 'USD',
  method     payment_method,
  receipt    text,
  notes      text not null default '',
  created_at timestamptz not null default now()
);

create index maintenance_charges_project_id_idx on maintenance_charges (project_id, charged_on desc);


-- ---------------------------------------------------------------------
-- Notas e ideas
-- ---------------------------------------------------------------------
create table notes (
  id                      uuid primary key default gen_random_uuid(),
  title                   text not null,
  content                 text not null default '',
  author                  text not null default '',
  priority                priority not null default 'Media',
  tags                    text[] not null default '{}',
  category                note_category not null default 'Idea',
  created_at              timestamptz not null default now(),
  reminder_date           date,
  converted_to_project_id uuid references projects(id) on delete set null
);

create index notes_created_at_idx    on notes (created_at desc);
create index notes_reminder_date_idx on notes (reminder_date);


-- ---------------------------------------------------------------------
-- Historial de actividad
-- ---------------------------------------------------------------------
create table activity (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  type       activity_type not null,
  message    text not null,
  date       timestamptz not null default now()
);

create index activity_date_idx       on activity (date desc);
create index activity_project_id_idx on activity (project_id, date desc);


-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

-- updated_at automático en proyectos
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_set_updated_at
  before update on projects
  for each row execute function set_updated_at();

-- Al crear un proyecto se crean sus tres filas 1:1, así la app nunca
-- tiene que lidiar con desarrollo/infra/mantenimiento inexistentes.
create or replace function init_project_children()
returns trigger language plpgsql as $$
begin
  insert into project_development (project_id) values (new.id);
  insert into project_infrastructure (project_id) values (new.id);
  insert into project_maintenance (project_id) values (new.id);
  return new;
end;
$$;

create trigger projects_init_children
  after insert on projects
  for each row execute function init_project_children();


-- ---------------------------------------------------------------------
-- Row Level Security
-- Herramienta interna: acceso completo para usuarios autenticados.
-- El rol `anon` queda SIN acceso (ver 05_dev_anon_policies.sql).
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'clients', 'projects', 'project_development', 'project_infrastructure',
    'infrastructure_costs', 'project_maintenance', 'payments',
    'maintenance_charges', 'notes', 'activity'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists authenticated_all on public.%I', t);
    execute format(
      'create policy authenticated_all on public.%I
         for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
