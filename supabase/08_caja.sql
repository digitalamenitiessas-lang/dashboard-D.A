-- =====================================================================
-- PASO 8 — CAJA: dónde está la plata y qué se hizo con ella
--
-- Dos ideas nada más:
--
--   `accounts`         Un lugar donde la plata puede estar parada.
--                      Cada cuenta tiene UNA moneda; el saldo no se
--                      guarda, se calcula desde los movimientos.
--
--   `money_movements`  Cada vez que la plata se mueve: de qué cuenta
--                      sale, a qué cuenta entra, y cuánto de cada lado.
--                      Dos montos y no uno es lo que permite registrar
--                      un cambio de moneda sin inventar cotizaciones.
--
-- Sin origen  = plata que entró de afuera.
-- Sin destino = plata que salió para afuera.
--
-- Los cobros NO generan filas acá: `payments` y `maintenance_charges`
-- guardan a qué cuenta entraron y el saldo los suma directo. Así la
-- caja no puede quedar desfasada de los cobros.
--
-- Es idempotente: se puede correr de nuevo sin romper nada.
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'account_kind') then
    create type account_kind as enum (
      'Caja', 'Banco', 'Billetera', 'Inversión', 'Retiros'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'movement_category') then
    create type movement_category as enum (
      'Cambio de moneda',
      'Transferencia',
      'Gasto',
      'Retiro',
      'Inversión',
      'Ingreso extra',
      'Ajuste'
    );
  end if;
end $$;


-- ---------------------------------------------------------------------
-- Cuentas
-- ---------------------------------------------------------------------
create table if not exists accounts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kind       account_kind not null default 'Banco',
  currency   currency not null default 'ARS',
  notes      text not null default '',
  archived   boolean not null default false,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists accounts_sort_idx on accounts (archived, sort_order, name);


-- ---------------------------------------------------------------------
-- Movimientos
--
-- Los montos van cada uno en la moneda de SU cuenta, por eso un cambio
-- de dólares a pesos es simplemente un movimiento de una cuenta USD a
-- una cuenta ARS: la cotización de esa operación queda implícita en los
-- dos montos, que es un dato real y no una estimación.
-- ---------------------------------------------------------------------
create table if not exists money_movements (
  id              uuid primary key default gen_random_uuid(),
  moved_on        date not null,
  category        movement_category not null default 'Transferencia',
  concept         text not null default '',
  from_account_id uuid references accounts(id) on delete restrict,
  amount_out      numeric(14,2) not null default 0,
  to_account_id   uuid references accounts(id) on delete restrict,
  amount_in       numeric(14,2) not null default 0,
  project_id      uuid references projects(id) on delete set null,
  notes           text not null default '',
  created_at      timestamptz not null default now(),

  -- Un movimiento que no sale de ningún lado ni entra a ninguno no es
  -- un movimiento.
  constraint money_movements_has_a_side
    check (from_account_id is not null or to_account_id is not null),

  -- Cada lado que exista tiene que mover algo.
  constraint money_movements_out_amount
    check (from_account_id is null or amount_out > 0),
  constraint money_movements_in_amount
    check (to_account_id is null or amount_in > 0),

  -- Mover plata de una cuenta a sí misma no hace nada.
  constraint money_movements_distinct_accounts
    check (from_account_id is null
        or to_account_id is null
        or from_account_id <> to_account_id)
);

create index if not exists money_movements_moved_on_idx on money_movements (moved_on desc);
create index if not exists money_movements_from_idx     on money_movements (from_account_id);
create index if not exists money_movements_to_idx       on money_movements (to_account_id);
create index if not exists money_movements_project_idx  on money_movements (project_id);


-- ---------------------------------------------------------------------
-- A qué cuenta entró cada cobro
-- Queda opcional: los cobros ya cargados no tienen cuenta asignada y no
-- suman a ningún saldo hasta que se les asigne una.
-- ---------------------------------------------------------------------
alter table payments
  add column if not exists account_id uuid references accounts(id) on delete set null;

alter table maintenance_charges
  add column if not exists account_id uuid references accounts(id) on delete set null;

create index if not exists payments_account_idx            on payments (account_id);
create index if not exists maintenance_charges_account_idx on maintenance_charges (account_id);


-- ---------------------------------------------------------------------
-- Cuentas iniciales, para no arrancar con la pantalla vacía.
-- Renombralas, cambiales la moneda o borrá las que no uses.
-- ---------------------------------------------------------------------
insert into accounts (name, kind, currency, sort_order)
select * from (values
  ('Caja USD',     'Caja'::account_kind,      'USD'::currency, 1::smallint),
  ('Banco pesos',  'Banco'::account_kind,     'ARS'::currency, 2::smallint),
  ('Mercado Pago', 'Billetera'::account_kind, 'ARS'::currency, 3::smallint),
  ('Cheques',      'Inversión'::account_kind, 'ARS'::currency, 4::smallint),
  ('Retiros',      'Retiros'::account_kind,   'ARS'::currency, 5::smallint)
) as seed(name, kind, currency, sort_order)
where not exists (select 1 from accounts);


-- ---------------------------------------------------------------------
-- RLS — mismo criterio que el resto: sólo usuarios autenticados.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['accounts', 'money_movements']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists authenticated_all on public.%I', t);
    execute format(
      'create policy authenticated_all on public.%I
         for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
