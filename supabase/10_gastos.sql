-- =====================================================================
-- PASO 10 — GASTOS: en qué se va la plata y qué falta pagar
--
-- Dos ideas, UNA tabla nueva:
--
--   `money_movements`  El gasto que YA ocurrió sigue siendo un movimiento
--                      categoría 'Gasto', como hasta hoy. NO se crea una
--                      tabla de egresos: si existiera, el saldo de una
--                      cuenta tendría dos fuentes y tarde o temprano se
--                      desincronizan. Sólo gana tres columnas: en qué se
--                      gastó, qué compromiso paga y qué período de ese
--                      compromiso.
--
--   `fixed_expenses`   El gasto comprometido: el servidor, el sueldo del
--                      empleado, el contador. Es un PLAN, no es plata que
--                      salió. project_id null = gasto de estructura.
--
-- Nada derivado se guarda: ni el total, ni el vencido, ni la última vez
-- que se pagó. El calendario de un gasto fijo es función pura de
-- (started_on, frequency, due_day) y un período está pago cuando existe
-- un movimiento que lo declara. Pagar tarde NO corre el calendario.
--
-- El mismo gasto no se puede contar dos veces: índice único sobre
-- (fixed_expense_id, period_start).
--
-- Un retiro de socio NO es un gasto y no puede entrar acá: ver el punto 3.
--
-- Requiere 03_schema.sql y 08_caja.sql. Es idempotente de punta a punta:
-- se puede correr dos veces seguidas sin romper nada y sin resucitar nada
-- que hayas borrado a mano.
--
-- NO toca `infrastructure_costs`: no la renombra ni la borra. Renombrarla
-- rompe PROJECT_SELECT y obliga a que el SQL y el deploy salgan juntos y
-- sin vuelta atrás, para mover cero filas. Queda quieta hasta el 11.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Freno de mano
--
-- Este script le pone una forma obligatoria al 'Gasto': sale de una
-- cuenta y no entra a ninguna. Si en la base hay uno mal cargado, mejor
-- enterarse ahora — con el script abortado y la base intacta — y no
-- después, con el reporte ya mintiendo.
-- (Tu base tiene 2 movimientos y ninguno es 'Gasto': esto va a pasar
-- derecho. Está para cuando la corras en otro lado.)
-- ---------------------------------------------------------------------
do $$
declare malformados int;
begin
  if to_regclass('public.projects') is null then
    raise exception 'Falta correr 03_schema.sql: no existe projects.';
  end if;

  if to_regclass('public.money_movements') is null then
    raise exception 'Falta correr 08_caja.sql: no existe money_movements.';
  end if;

  if not exists (select 1 from pg_type where typname = 'maintenance_frequency') then
    raise exception 'Falta correr 03_schema.sql: no existe el tipo maintenance_frequency.';
  end if;

  select count(*) into malformados
    from money_movements
   where category = 'Gasto'
     and (from_account_id is null or to_account_id is not null);

  if malformados > 0 then
    raise exception
      'Hay % movimiento(s) categoría Gasto que no son un egreso limpio: '
      'sin cuenta de origen (y entonces el monto no tiene moneda), o con '
      'cuenta de destino (y entonces la plata no salió, se movió). '
      'Arreglalos y volvé a correr. Para verlos: '
      'select id, moved_on, concept, from_account_id, to_account_id, amount_out '
      'from money_movements where category = ''Gasto'' '
      'and (from_account_id is null or to_account_id is not null);',
      malformados;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1. Rubro de gasto
--
-- Enum y no texto libre: en seis meses habría 'AWS', 'aws' y 'Amazon' y
-- la pregunta '¿en qué gastamos?' no se podría contestar. Enum y no
-- tabla de lookup: es la convención del repo, los enums de Postgres
-- espejan las uniones de lib/types.ts.
--
-- Dos aclaraciones que no son de nomenclatura sino de plata:
--
--   'Sueldos' es el sueldo del EMPLEADO, que es un gasto fijo de
--   estructura de verdad. El sueldo de un socio NO va acá: se carga como
--   un movimiento categoría 'Retiro' hacia una cuenta kind 'Retiros' y
--   nunca entra al resultado. Si alguien lo carga como Gasto/Sueldos, la
--   misma plata queda contada dos veces — retirada y gastada. Por eso el
--   punto 3 y la sección 4 de verificación insisten con las cuentas de
--   Retiros.
--
--   'Comisiones por venta' es lo que cobra el empleado por cerrar una
--   venta: es un costo DIRECTO del proyecto y se carga como gasto suelto
--   CON project_id, no como gasto fijo. Va separado de 'Comisiones
--   bancarias', que son del banco, son de estructura y no las decide
--   nadie de acá adentro. Meterlas en la misma bolsa haría que 'cuánto
--   nos cuesta vender' y 'cuánto nos cobra el banco' fueran el mismo
--   número.
--
-- La lista arranca generosa a propósito, porque agregar un valor después
-- es un script nuevo (y NO se puede usar el valor recién agregado en el
-- mismo script: `alter type ... add value` no lo permite en la misma
-- transacción).
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'expense_kind') then
    create type expense_kind as enum (
      'Infraestructura',
      'Herramientas',
      'Sueldos',
      'Honorarios',
      'Impuestos',
      'Servicios',
      'Comisiones bancarias',
      'Comisiones por venta',
      'Marketing',
      'Equipamiento',
      'Otros'
    );
  end if;
end $$;

-- Si corriste una versión anterior de este script, el rubro nuevo entra
-- acá. Sobre un enum que ya lo tiene es un no-op, así que la segunda
-- corrida pasa derecho. Va suelto y no adentro de un do $$ a propósito:
-- `add value` es la única sentencia de este script que le tiene alergia
-- a los bloques. Y no se usa en ninguna parte del script, justamente
-- porque un valor recién agregado no se puede usar en la misma
-- transacción.
alter type expense_kind add value if not exists 'Comisiones por venta';


-- ---------------------------------------------------------------------
-- 2. El compromiso
--
-- Reusa `maintenance_frequency` a propósito: es el mismo vocabulario que
-- project_maintenance, y del lado de TypeScript reusa frequencyMonths.
--
-- NO tiene columna `status`. La vigencia se lee del rango:
--   vigente = started_on <= hoy y (ended_on is null o ended_on >= hoy)
-- Un status al lado de un ended_on son dos formas de decir lo mismo y
-- una de las dos siempre termina mintiendo. Dar de baja = poner
-- ended_on; el historial de pagos anteriores queda intacto.
--
-- NO tiene `account_id` sugerida: un plan en USD con cuenta por defecto
-- en pesos es la forma más corta de cargar 20 pesos donde iban 20
-- dólares. La cuenta se elige en cada pago.
--
-- `amount` es lo ESPERADO. Lo que salió de verdad vive en los
-- movimientos, siempre, sin excepción.
-- ---------------------------------------------------------------------
create table if not exists fixed_expenses (
  id         uuid primary key default gen_random_uuid(),
  concept    text not null,
  kind       expense_kind not null default 'Otros',
  vendor     text not null default '',

  -- null = gasto de estructura (el sueldo del empleado, el contador, las
  -- herramientas del estudio). Con proyecto = costo directo imputable a
  -- ese proyecto. CASCADE porque un plan es a futuro: si el proyecto se
  -- borra, el compromiso se va con él.
  project_id uuid references projects(id) on delete cascade,

  amount     numeric(14,2) not null check (amount > 0),
  currency   currency not null default 'ARS',
  frequency  maintenance_frequency not null default 'Mensual',

  -- Tope 28 para que el día exista en todos los meses, igual que
  -- project_maintenance.
  due_day    smallint not null default 1 check (due_day between 1 and 28),

  -- Arranque del PRIMER período. Todo el calendario sale de acá, así que
  -- no es un dato decorativo: si lo ponés dos años atrás, vas a tener
  -- dos años de períodos impagos. El diálogo lo avisa antes de guardar.
  started_on date not null default date_trunc('month', current_date)::date,
  ended_on   date,

  notes      text not null default '',

  -- Trazabilidad de la copia del punto 4. Sin FK: la tabla vieja se
  -- borra en el 11 y esto queda como referencia histórica.
  source_infra_cost_id uuid,

  created_at timestamptz not null default now(),

  constraint fixed_expenses_window
    check (ended_on is null or ended_on >= started_on)
);

create index if not exists fixed_expenses_project_idx  on fixed_expenses (project_id);
create index if not exists fixed_expenses_vigencia_idx on fixed_expenses (ended_on, started_on);

-- Una fila de infrastructure_costs se copia una sola vez, aunque el
-- punto 4 se ejecute de nuevo en otro entorno.
create unique index if not exists fixed_expenses_source_uidx
  on fixed_expenses (source_infra_cost_id)
  where source_infra_cost_id is not null;

comment on table fixed_expenses is
  'Gastos comprometidos. project_id null = estructura. Lo que realmente '
  'se pagó vive en money_movements, nunca acá.';

comment on column fixed_expenses.amount is
  'Lo esperado por período, en `currency`. Nunca lo pagado.';

comment on column fixed_expenses.started_on is
  'Arranque del primer período: de acá sale todo el calendario.';

comment on column fixed_expenses.ended_on is
  'Fecha de baja. No hay columna status: dar de baja es poner esto.';


-- ---------------------------------------------------------------------
-- 3. El egreso real: tres columnas sobre lo que ya existe
--
-- Quedan NULLABLE a propósito. Los 'Gasto' ya cargados siguen siendo
-- válidos con rubro nulo: la pantalla los muestra en un cartel 'sin
-- rubro', igual que Caja avisa hoy de los cobros sin cuenta. No se
-- adivina el rubro de nada.
--
-- El FK del plan es RESTRICT y no SET NULL: un plan con pagos no se
-- borra, se da de baja con `ended_on`. Si fuera SET NULL, borrar un plan
-- dejaría movimientos huérfanos y el índice único de más abajo dejaría
-- de significar algo.
-- ---------------------------------------------------------------------
alter table money_movements
  add column if not exists expense_kind     expense_kind,
  add column if not exists fixed_expense_id uuid references fixed_expenses(id) on delete restrict,
  add column if not exists period_start     date;

comment on column money_movements.expense_kind is
  'En qué se gastó. Null = todavía sin clasificar.';

comment on column money_movements.fixed_expense_id is
  'Qué gasto fijo salda este egreso. Null = gasto excepcional.';

comment on column money_movements.period_start is
  'Qué período de ese gasto fijo salda. Primer día del período.';

do $$
begin
  -- (a) Un 'Gasto' sale de una cuenta y no entra a ninguna.
  --     Sin cuenta de origen el monto no tiene moneda (una cuenta tiene
  --     UNA moneda y el monto va en la de su cuenta). Con cuenta de
  --     destino la plata no salió de la empresa: se movió entre cuentas
  --     propias, y contarla como gasto infla el mes.
  --     Hoy la UI ya lo respeta (shape.Gasto = {from:true,to:false});
  --     esto lo hace cierto también para lo que se carga por SQL a mano,
  --     que en este repo pasa todas las semanas.
  if not exists (
    select 1 from pg_constraint
     where conname = 'money_movements_gasto_es_egreso'
       and conrelid = 'public.money_movements'::regclass
  ) then
    alter table money_movements
      add constraint money_movements_gasto_es_egreso
        check (category <> 'Gasto'
            or (from_account_id is not null and to_account_id is null));
  end if;

  -- (b) Rubro, plan y período sólo existen en un gasto. Un 'Retiro'
  --     NUNCA puede llevar rubro, así que no puede colarse en el
  --     desglose ni sumarse al resultado: el sueldo de un socio sale
  --     como Retiro y muere ahí.
  if not exists (
    select 1 from pg_constraint
     where conname = 'money_movements_gasto_solo_en_gasto'
       and conrelid = 'public.money_movements'::regclass
  ) then
    alter table money_movements
      add constraint money_movements_gasto_solo_en_gasto
        check (category = 'Gasto'
            or (expense_kind is null
                and fixed_expense_id is null
                and period_start is null));
  end if;

  -- (c) Plan y período van juntos o no van. Un pago imputado a un plan
  --     que no dice qué período salda es plata que sale y no cubre nada;
  --     un período sin plan no significa nada.
  if not exists (
    select 1 from pg_constraint
     where conname = 'money_movements_plan_con_periodo'
       and conrelid = 'public.money_movements'::regclass
  ) then
    alter table money_movements
      add constraint money_movements_plan_con_periodo
        check ((fixed_expense_id is null) = (period_start is null));
  end if;
end $$;

-- (d) ACÁ SE CIERRA EL DOBLE CONTEO.
-- Un período de un gasto fijo se paga UNA vez. Cargar el hosting de
-- septiembre desde Caja y otra vez desde el botón Pagar de /gastos ya no
-- produce dos egresos: el segundo lo rechaza la base. No es una
-- convención de UI que alguien pueda saltear cargando a mano.
create unique index if not exists money_movements_gasto_fijo_periodo_uidx
  on money_movements (fixed_expense_id, period_start)
  where fixed_expense_id is not null;

create index if not exists money_movements_expense_kind_idx
  on money_movements (expense_kind, moved_on desc)
  where category = 'Gasto';

create index if not exists money_movements_fixed_expense_idx
  on money_movements (fixed_expense_id, period_start);

-- Lo que la base NO puede impedir sola: un 'Gasto' pagado DESDE una
-- cuenta kind 'Retiros'. Eso es plata ya repartida entre los socios y
-- contarla otra vez como gasto de la empresa la duplica. Un CHECK no
-- puede mirar otra tabla, así que la defensa vive en dos lados:
-- expenseEntries() los excluye, withdrawalsMislabeled() los muestra en
-- el cartel ámbar de /gastos, y la sección 4 de acá abajo los cuenta.


-- ---------------------------------------------------------------------
-- 4. Copia opcional desde infrastructure_costs
--
-- Tu base tiene 0 costos de infraestructura cargados, así que acá no va
-- a pasar absolutamente nada. Está para una base con el seed corrido (8
-- filas) o para otro entorno.
--
-- El centinela es `fixed_expenses vacía`, no `no existe ya esta fila`:
-- así, si revisás los planes copiados y borrás tres a mano, volver a
-- correr el script NO los resucita. Es el mismo criterio del seed de
-- cuentas de 08_caja.sql.
--
-- started_on va al 1 del mes que viene: el día que lo corrés nada nace
-- vencido y la confirmación arranca hacia adelante.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.infrastructure_costs') is not null
     and not exists (select 1 from fixed_expenses) then

    insert into fixed_expenses (
      concept, kind, project_id, amount, currency, frequency,
      due_day, started_on, notes, source_infra_cost_id
    )
    select
      ic.concept,
      'Infraestructura'::expense_kind,
      ic.project_id,
      ic.amount,
      ic.currency,
      ic.frequency,
      1,
      (date_trunc('month', current_date) + interval '1 month')::date,
      'Copiado de infrastructure_costs — revisá el día de vencimiento y la fecha de inicio',
      ic.id
    from infrastructure_costs ic
    where ic.amount > 0;

  end if;
end $$;


-- ---------------------------------------------------------------------
-- 5. RLS — mismo criterio que el resto: sólo usuarios autenticados.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['fixed_expenses']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists authenticated_all on public.%I', t);
    execute format(
      'create policy authenticated_all on public.%I
         for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 6. Verificación
--
-- Un solo listado, para leerlo de arriba a abajo:
--   1· que estén los objetos que el script tenía que dejar
--   2· los rubros disponibles
--   3· los gastos fijos cargados
--   4· lo que hay que ir a mirar a mano
--
-- Si copiaste desde infrastructure_costs, revisá due_day y started_on de
-- cada fila: la tabla vieja no tenía ni día de vencimiento ni fecha de
-- inicio, y de esos dos datos depende todo el calendario.
-- ---------------------------------------------------------------------
select * from (

  -- 1 ─ Estructura
  select 1 as orden, '1· ESTRUCTURA' as seccion,
         o.item,
         case when o.ok then '✓ está' else '✗ FALTA' end as detalle,
         null::text as valor,
         '' as nota
  from (
    select 'tipo expense_kind' as item,
           exists (select 1 from pg_type where typname = 'expense_kind') as ok
    union all select 'tabla fixed_expenses',
           to_regclass('public.fixed_expenses') is not null
    union all select 'columna money_movements.expense_kind',
           exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'money_movements'
                      and column_name = 'expense_kind')
    union all select 'columna money_movements.fixed_expense_id',
           exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'money_movements'
                      and column_name = 'fixed_expense_id')
    union all select 'columna money_movements.period_start',
           exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'money_movements'
                      and column_name = 'period_start')
    union all select 'check gasto es egreso (sale de una cuenta, no entra a ninguna)',
           exists (select 1 from pg_constraint
                    where conname = 'money_movements_gasto_es_egreso')
    union all select 'check rubro/plan/período sólo en un Gasto',
           exists (select 1 from pg_constraint
                    where conname = 'money_movements_gasto_solo_en_gasto')
    union all select 'check plan y período van juntos',
           exists (select 1 from pg_constraint
                    where conname = 'money_movements_plan_con_periodo')
    union all select 'índice único (gasto fijo, período) — el freno al doble conteo',
           exists (select 1 from pg_class
                    where relname = 'money_movements_gasto_fijo_periodo_uidx')
    union all select 'RLS authenticated_all en fixed_expenses',
           exists (select 1 from pg_policies
                    where schemaname = 'public' and tablename = 'fixed_expenses'
                      and policyname = 'authenticated_all')
  ) o

  union all
  -- 2 ─ Rubros disponibles (los mismos que EXPENSE_KINDS en lib/types.ts)
  select 2, '2· RUBROS DISPONIBLES',
         k,
         case k
           when 'Sueldos'              then 'del empleado; el socio va por Retiro, no por acá'
           when 'Comisiones por venta' then 'costo directo: se carga con proyecto'
           when 'Comisiones bancarias' then 'del banco: estructura'
           else '' end,
         null,
         ''
  from (
    -- Se lee el catálogo y no enum_range() a propósito: si el rubro nuevo
    -- se agregó recién, en esta misma transacción, tocar el tipo todavía
    -- puede quejarse. pg_enum es una tabla común y no se queja nunca.
    select e.enumlabel::text as k
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'expense_kind'
  ) rubros

  union all
  -- 3 ─ Los compromisos cargados
  select 3, '3· GASTOS FIJOS',
         fe.concept,
         coalesce(p.name, '— estructura —') || ' · ' || fe.kind::text
           || ' · ' || fe.frequency::text || ' · día ' || fe.due_day
           || case when fe.vendor <> '' then ' · ' || fe.vendor else '' end,
         fe.currency::text || ' ' || to_char(fe.amount, 'FM999G999G999D00'),
         case when fe.ended_on is not null
                then 'de baja el ' || fe.ended_on::text
              when fe.source_infra_cost_id is not null
                then 'copiado: revisá día e inicio (arranca ' || fe.started_on::text || ')'
              else 'desde ' || fe.started_on::text end
  from fixed_expenses fe
  left join projects p on p.id = fe.project_id

  union all
  -- 4 ─ Lo que hay que ir a mirar a mano
  select 4, '4· A REVISAR',
         'Gastos sin rubro',
         'no entran al desglose hasta que digas en qué se gastaron',
         (select count(*) from money_movements
           where category = 'Gasto' and expense_kind is null)::text,
         'select id, moved_on, concept from money_movements '
         'where category = ''Gasto'' and expense_kind is null;'

  union all
  select 4, '4· A REVISAR',
         'Gastos pagados desde una cuenta de Retiros',
         'esa plata ya está contada como retirada: recategorizalos o la duplicás',
         (select count(*) from money_movements m
             join accounts a on a.id = m.from_account_id
            where m.category = 'Gasto' and a.kind = 'Retiros')::text,
         'select m.id, m.moved_on, m.concept, a.name from money_movements m '
         'join accounts a on a.id = m.from_account_id '
         'where m.category = ''Gasto'' and a.kind = ''Retiros'';'

  union all
  select 4, '4· A REVISAR',
         'Gastos fijos copiados de infrastructure_costs',
         'les falta el día de vencimiento y la fecha de inicio reales',
         (select count(*) from fixed_expenses
           where source_infra_cost_id is not null)::text,
         'infrastructure_costs queda quieta hasta el 11: la app ya no la lee'

) t
order by orden, item;
