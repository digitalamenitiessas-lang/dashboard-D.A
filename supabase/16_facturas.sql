-- =====================================================================
-- PASO 16 — FACTURAS DE CLIENTE
--
-- UNA tabla nueva, `facturas`, y una columna en `payments`.
--
-- Es un REGISTRO INTERNO, no un comprobante de AFIP: numero, fecha,
-- importe y moneda. Sin tipo A/B/C, sin punto de venta, sin IVA
-- discriminado y sin retenciones. Se decidio asi a proposito; el dia que
-- haya que espejar lo que se emite de verdad, esos campos se agregan y la
-- forma de abajo los aguanta.
--
-- EL ESTADO NO SE GUARDA. Pendiente / Parcial / Cancelada salen de
-- comparar el importe de la factura con lo que se le imputo de cobros. Es
-- la regla que este repo aplica en todos lados —`tickets` no tiene
-- columna status, `fixed_expenses` tampoco, los saldos de caja se
-- calculan siempre— y aca ademas hace que "que el cobro mueva el estado"
-- deje de ser trabajo: no hay nada que mover. Editar o borrar un cobro
-- reacomoda el estado solo, y no existe el dia en que la columna diga una
-- cosa y los cobros otra.
--
-- LA FACTURA CUELGA DE UN PROYECTO. Los cobros ya cuelgan de un proyecto
-- (`payments.project_id` es NOT NULL), asi que imputar un cobro a una
-- factura no obliga a tocar nada de lo que ya existe. La contra conocida:
-- una factura no puede cubrir dos proyectos ni facturar algo que no sea
-- un proyecto. Si eso empieza a pasar seguido, hay que replantearlo.
--
-- Requiere 03_schema.sql. Es idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Freno de mano
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.projects') is null then
    raise exception 'Falta correr 03_schema.sql: no existe projects.';
  end if;
  if to_regclass('public.payments') is null then
    raise exception 'Falta correr 03_schema.sql: no existe payments.';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'payments'
       and column_name = 'applied_amount'
  ) then
    raise exception
      'Falta correr 14_cobros_en_otra_moneda.sql: sin applied_amount, un '
      'cobro en pesos no puede saldar una factura en dolares.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1. La tabla
--
-- `project_id` es RESTRICT y no CASCADE, al reves que `payments`. Una
-- factura es un documento del PASADO: borrar un proyecto no deberia
-- borrar el registro de lo que se le facturo a un cliente. Es el mismo
-- criterio que `money_movements.fixed_expense_id` (paso 10): lo que tiene
-- plata asociada no se borra, se da de baja.
--
-- La MONEDA no esta aca: es la del proyecto. Una factura en otra moneda
-- que la cotizada abriria una tercera dimension de conversion —cotizado,
-- facturado y cobrado en tres monedas— y no hay cotizacion cargada en
-- este sistema para resolverla. Con la moneda del proyecto, el
-- `applied_amount` de un cobro (paso 14) salda la factura sin ninguna
-- cuenta extra: es el mismo numero que ya salda lo cotizado.
-- ---------------------------------------------------------------------
create table if not exists facturas (
  id          uuid primary key default gen_random_uuid(),

  project_id  uuid not null references projects(id) on delete restrict,

  numero      text not null check (length(btrim(numero)) > 0),

  emitida_on  date not null default current_date,
  -- Cuando vence. Null = sin plazo pactado.
  vence_on    date,

  importe     numeric(14,2) not null check (importe > 0),

  notas       text not null default '',

  created_at  timestamptz not null default now(),

  constraint facturas_vence_despues_de_emitida
    check (vence_on is null or vence_on >= emitida_on)
);

-- El numero de factura es propio y no se repite. Normalizado para que
-- «A-0001» y «a-0001 » no entren como dos.
create unique index if not exists facturas_numero_uidx
  on facturas (lower(btrim(numero)));

create index if not exists facturas_project_idx
  on facturas (project_id, emitida_on desc);

comment on table facturas is
  'Registro interno de lo facturado. El estado (pendiente/parcial/cancelada) '
  'NO se guarda: sale de los cobros imputados.';

comment on column facturas.importe is
  'En la moneda del PROYECTO. Una factura no lleva moneda propia.';


-- ---------------------------------------------------------------------
-- 2. Imputar un cobro a una factura
-- ---------------------------------------------------------------------
alter table payments
  add column if not exists factura_id uuid references facturas(id) on delete set null;

create index if not exists payments_factura_idx on payments (factura_id);

comment on column payments.factura_id is
  'Que factura salda este cobro. Null = cobro sin imputar (un anticipo sin '
  'factura, por ejemplo). Un cobro salda UNA factura; una factura recibe '
  'varios cobros, y de ahi sale el estado Parcial.';


-- ---------------------------------------------------------------------
-- 3. Un cobro y su factura tienen que ser del MISMO proyecto
--
-- Un CHECK no puede mirar otra tabla, asi que va un trigger. Sin esto se
-- puede imputar el cobro de un proyecto a la factura de otro, y entonces
-- las dos pantallas mienten a la vez: a una le sobra plata y a la otra le
-- falta, sin nada que lo delate.
-- ---------------------------------------------------------------------
create or replace function validar_imputacion_cobro()
returns trigger language plpgsql set search_path = public as $$
declare proyecto_factura uuid;
begin
  if new.factura_id is null then
    return new;
  end if;

  select project_id into proyecto_factura from facturas where id = new.factura_id;

  if proyecto_factura is null then
    raise exception 'La factura que se quiere imputar no existe.';
  end if;

  if proyecto_factura <> new.project_id then
    raise exception
      'Ese cobro y esa factura son de proyectos distintos. Un cobro solo '
      'puede saldar una factura del mismo proyecto.';
  end if;

  return new;
end $$;

drop trigger if exists payments_validar_imputacion on payments;
create trigger payments_validar_imputacion
  before insert or update on payments
  for each row execute function validar_imputacion_cobro();


-- ---------------------------------------------------------------------
-- 4. RLS — mismo criterio que el resto: solo usuarios autenticados.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['facturas']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists authenticated_all on public.%I', t);
    execute format(
      'create policy authenticated_all on public.%I
         for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 5. Verificación
-- ---------------------------------------------------------------------
select * from (

  select 1 as orden, '1· ESTRUCTURA' as seccion, o.item,
         case when o.ok then '✓ está' else '✗ FALTA' end as detalle
  from (
    select 'tabla facturas' as item,
           to_regclass('public.facturas') is not null as ok
    union all select 'índice único de número',
           exists (select 1 from pg_class where relname = 'facturas_numero_uidx')
    union all select 'columna payments.factura_id',
           exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='payments'
                      and column_name='factura_id')
    union all select 'trigger: cobro y factura del mismo proyecto',
           exists (select 1 from pg_trigger where tgname='payments_validar_imputacion')
    union all select 'RLS authenticated_all en facturas',
           exists (select 1 from pg_policies
                    where schemaname='public' and tablename='facturas'
                      and policyname='authenticated_all')
  ) o

  union all
  -- Un renglon por factura con su estado CALCULADO, que es la misma lectura
  -- que hace la pantalla.
  select 2, '2· FACTURAS', f.numero,
         p.name || ' · ' || p.currency::text || ' ' ||
           to_char(f.importe, 'FM999G999G999D00') || ' · ' ||
           case
             when coalesce(c.imputado, 0) <= 0 then 'Pendiente'
             when coalesce(c.imputado, 0) >= f.importe then 'Cancelada'
             else 'Parcial (' || to_char(c.imputado, 'FM999G999G999D00') || ')'
           end
  from facturas f
  join projects p on p.id = f.project_id
  left join (
    -- Lo que salda cada cobro: su importe si esta en la moneda del
    -- proyecto, y si no, el equivalente del paso 14.
    select pa.factura_id,
           sum(case when pa.currency = pr.currency
                    then pa.amount else coalesce(pa.applied_amount, 0) end) as imputado
      from payments pa
      join projects pr on pr.id = pa.project_id
     where pa.factura_id is not null
     group by pa.factura_id
  ) c on c.factura_id = f.id

) x
order by orden, item;
