-- =====================================================================
-- PASO 18 — PROVEEDORES: EL ESPEJO DE CLIENTES
--
-- Misma forma que del lado de los clientes, dada vuelta:
--
--   proveedores          a quien le pagamos.
--   facturas_proveedor   lo que nos factura. Queda abierta hasta que se
--                        pague, y el estado NO se guarda: sale de los
--                        pagos imputados.
--   el pago              es un MOVIMIENTO DE CAJA, no una tabla nueva.
--
-- Esa ultima decision es la que importa. Si los pagos a proveedor
-- vivieran en su propia tabla, el saldo de una cuenta tendria dos
-- origenes —los movimientos y los pagos— y tarde o temprano se
-- desincronizan. Es exactamente lo que el paso 10 evito a proposito con
-- los gastos fijos: «si existiera una tabla de egresos, el saldo de una
-- cuenta tendria dos fuentes». Aca vale igual. Un pago a proveedor es un
-- movimiento categoria 'Gasto' que ademas dice a quien se le pago y que
-- factura salda.
--
-- El proveedor ya existia como TEXTO LIBRE en `fixed_expenses.vendor`.
-- Este script lo convierte en entidad y migra los valores que haya, para
-- no terminar con dos listas de proveedores conviviendo. La columna
-- `vendor` NO se borra: la lee codigo que todavia esta desplegado, y
-- borrarla rompeia guardar cualquier gasto fijo hasta el deploy. Queda
-- como referencia historica y deja de escribirse.
--
-- Requiere 03_schema.sql, 08_caja.sql y 10_gastos.sql. Es idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Freno de mano
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.money_movements') is null then
    raise exception 'Falta correr 08_caja.sql: no existe money_movements.';
  end if;
  if to_regclass('public.fixed_expenses') is null then
    raise exception 'Falta correr 10_gastos.sql: no existe fixed_expenses.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1. El proveedor
--
-- `plazo_dias` es el plazo de pago pactado: de ahi sale el vencimiento
-- por defecto de cada factura suya. Null = sin plazo, se paga contra
-- presentacion.
-- ---------------------------------------------------------------------
create table if not exists proveedores (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (length(btrim(nombre)) > 0),
  cuit       text not null default '',
  contacto   text not null default '',
  telefono   text not null default '',
  email      text not null default '',
  plazo_dias smallint check (plazo_dias is null or plazo_dias between 0 and 365),
  notas      text not null default '',
  created_at timestamptz not null default now()
);

-- Un proveedor no se repite. Normalizado, por lo mismo que el numero de
-- factura: «Hostinger», «hostinger» y «HOSTINGER » no son tres.
create unique index if not exists proveedores_nombre_uidx
  on proveedores (lower(btrim(nombre)));

comment on table proveedores is
  'A quien le pagamos. Espejo de clients, del lado de lo que sale.';

comment on column proveedores.plazo_dias is
  'Plazo de pago pactado, en dias. De aca sale el vencimiento por defecto '
  'de sus facturas. Null = contra presentacion.';


-- ---------------------------------------------------------------------
-- 2. Lo que nos factura
--
-- Misma forma que `facturas`, del otro lado. Moneda propia: un proveedor
-- puede facturar en dolares aunque le paguemos desde una cuenta en pesos.
-- ---------------------------------------------------------------------
create table if not exists facturas_proveedor (
  id            uuid primary key default gen_random_uuid(),
  proveedor_id  uuid not null references proveedores(id) on delete restrict,
  numero        text not null default '',
  concepto      text not null check (length(btrim(concepto)) > 0),
  emitida_on    date not null default current_date,
  vence_on      date,
  importe       numeric(14,2) not null check (importe > 0),
  moneda        currency not null default 'USD',
  -- A que proyecto imputarle este gasto. Null = gasto de estructura, el
  -- mismo criterio que `fixed_expenses.project_id`.
  project_id    uuid references projects(id) on delete set null,
  notas         text not null default '',
  created_at    timestamptz not null default now(),

  constraint facturas_proveedor_vence_despues
    check (vence_on is null or vence_on >= emitida_on)
);

-- El numero lo pone el proveedor y puede venir vacio (un ticket, un
-- resumen de tarjeta), asi que la unicidad va POR PROVEEDOR y solo
-- cuando hay numero.
create unique index if not exists facturas_proveedor_numero_uidx
  on facturas_proveedor (proveedor_id, lower(btrim(numero)))
  where btrim(numero) <> '';

create index if not exists facturas_proveedor_prov_idx
  on facturas_proveedor (proveedor_id, emitida_on desc);

comment on table facturas_proveedor is
  'Lo que nos factura un proveedor. El estado (pendiente/parcial/pagada) NO '
  'se guarda: sale de los movimientos de caja imputados.';


-- ---------------------------------------------------------------------
-- 3. El pago: un movimiento de caja que dice a quien y contra que
--
-- Tres columnas sobre lo que ya existe, en vez de una tabla nueva. El
-- saldo de una cuenta sigue saliendo de un solo lugar.
--
-- `factura_aplicado` es el espejo de `payments.applied_amount`: cuanto de
-- la factura salda este pago, en la moneda de la FACTURA. Hace falta
-- porque un movimiento esta en la moneda de su cuenta, y se puede pagar
-- desde una cuenta en pesos una factura en dolares.
-- ---------------------------------------------------------------------
alter table money_movements
  add column if not exists proveedor_id         uuid references proveedores(id) on delete set null,
  add column if not exists factura_proveedor_id uuid references facturas_proveedor(id) on delete set null,
  add column if not exists factura_aplicado     numeric(14,2);

create index if not exists money_movements_proveedor_idx
  on money_movements (proveedor_id);
create index if not exists money_movements_factura_prov_idx
  on money_movements (factura_proveedor_id);

do $$
begin
  -- Proveedor y factura solo tienen sentido en un 'Gasto'. Es el mismo
  -- criterio que el paso 10 aplico a `expense_kind`: un 'Retiro' no puede
  -- llevar proveedor y por lo tanto no se puede colar en lo que le
  -- pagamos a nadie.
  if not exists (
    select 1 from pg_constraint where conname = 'money_movements_proveedor_solo_en_gasto'
  ) then
    alter table money_movements
      add constraint money_movements_proveedor_solo_en_gasto
        check (category = 'Gasto'
            or (proveedor_id is null
                and factura_proveedor_id is null
                and factura_aplicado is null));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'money_movements_aplicado_positivo'
  ) then
    alter table money_movements
      add constraint money_movements_aplicado_positivo
        check (factura_aplicado is null or factura_aplicado > 0);
  end if;
end $$;

comment on column money_movements.proveedor_id is
  'A quien se le pago. Null = gasto sin proveedor identificado.';
comment on column money_movements.factura_proveedor_id is
  'Que factura de proveedor salda este pago. Null = pago sin imputar.';
comment on column money_movements.factura_aplicado is
  'Cuanto salda, en la moneda de la FACTURA. Null = salda su propio importe '
  '(pago en la misma moneda que la factura).';


-- ---------------------------------------------------------------------
-- 4. Un pago y su factura tienen que ser del mismo proveedor
-- ---------------------------------------------------------------------
create or replace function validar_pago_proveedor()
returns trigger language plpgsql set search_path = public as $$
declare prov_factura uuid;
begin
  if new.factura_proveedor_id is null then
    return new;
  end if;

  select proveedor_id into prov_factura
    from facturas_proveedor where id = new.factura_proveedor_id;

  if prov_factura is null then
    raise exception 'La factura de proveedor que se quiere imputar no existe.';
  end if;

  -- El proveedor del movimiento se completa solo si venia vacio: quien
  -- elige una factura ya dijo a quien le paga.
  if new.proveedor_id is null then
    new.proveedor_id := prov_factura;
  elsif new.proveedor_id <> prov_factura then
    raise exception
      'Ese pago y esa factura son de proveedores distintos. Un pago solo '
      'puede saldar una factura del proveedor al que se le paga.';
  end if;

  return new;
end $$;

drop trigger if exists money_movements_validar_pago on money_movements;
create trigger money_movements_validar_pago
  before insert or update on money_movements
  for each row execute function validar_pago_proveedor();


-- ---------------------------------------------------------------------
-- 5. El proveedor de un gasto fijo deja de ser texto
--
-- Se da de alta un proveedor por cada `vendor` distinto que haya cargado
-- y se enlaza. `vendor` NO se borra: la lee codigo que puede estar todavia
-- desplegado, y borrarla rompeia guardar cualquier gasto fijo hasta el
-- deploy. Queda como referencia y deja de escribirse.
-- ---------------------------------------------------------------------
alter table fixed_expenses
  add column if not exists proveedor_id uuid references proveedores(id) on delete set null;

create index if not exists fixed_expenses_proveedor_idx
  on fixed_expenses (proveedor_id);

insert into proveedores (nombre)
select distinct btrim(fe.vendor)
  from fixed_expenses fe
 where btrim(fe.vendor) <> ''
   and not exists (
     select 1 from proveedores p
      where lower(p.nombre) = lower(btrim(fe.vendor))
   );

update fixed_expenses fe
   set proveedor_id = p.id
  from proveedores p
 where fe.proveedor_id is null
   and btrim(fe.vendor) <> ''
   and lower(p.nombre) = lower(btrim(fe.vendor));

comment on column fixed_expenses.vendor is
  'OBSOLETA desde el paso 18: el proveedor vive en proveedor_id. Se conserva '
  'como referencia historica y ya no se escribe.';


-- ---------------------------------------------------------------------
-- 6. RLS — mismo criterio que el resto.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['proveedores', 'facturas_proveedor']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists authenticated_all on public.%I', t);
    execute format(
      'create policy authenticated_all on public.%I
         for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 7. Verificación
-- ---------------------------------------------------------------------
select * from (

  select 1 as orden, '1· ESTRUCTURA' as seccion, o.item,
         case when o.ok then '✓ está' else '✗ FALTA' end as detalle
  from (
    select 'tabla proveedores' as item,
           to_regclass('public.proveedores') is not null as ok
    union all select 'tabla facturas_proveedor',
           to_regclass('public.facturas_proveedor') is not null
    union all select 'money_movements.proveedor_id',
           exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='money_movements'
                      and column_name='proveedor_id')
    union all select 'money_movements.factura_proveedor_id',
           exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='money_movements'
                      and column_name='factura_proveedor_id')
    union all select 'check: proveedor sólo en un Gasto',
           exists (select 1 from pg_constraint
                    where conname='money_movements_proveedor_solo_en_gasto')
    union all select 'trigger: pago y factura del mismo proveedor',
           exists (select 1 from pg_trigger where tgname='money_movements_validar_pago')
    union all select 'fixed_expenses.proveedor_id',
           exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='fixed_expenses'
                      and column_name='proveedor_id')
  ) o

  union all
  select 2, '2· PROVEEDORES MIGRADOS DE GASTOS', p.nombre,
         (select count(*)::text from fixed_expenses fe where fe.proveedor_id = p.id)
           || ' gasto(s) fijo(s) enlazado(s)'
  from proveedores p

) x
order by orden, item;
