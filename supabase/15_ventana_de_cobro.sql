-- =====================================================================
-- PASO 15 — EL MANTENIMIENTO SE COBRA EN UNA VENTANA, NO EN UN DIA
--
-- Como funciona de verdad en esta empresa: el mantenimiento arranca una
-- vez que el cliente pago el soporte, se le pone fecha al primer cobro, y
-- de ahi en mas paga ENTRE EL 1 Y EL 10 de cada mes.
--
-- El modelo tenia un solo dia (`due_day`), asi que un plan con dia 1
-- quedaba VENCIDO el dia 2. En los hechos eso significaba:
--
--   - /mantenimientos mostrando mora que no existe durante nueve dias de
--     cada mes;
--   - el aviso diario al celular gritando "mantenimiento sin cobrar" el
--     dia 2, todos los meses, por cada plan activo;
--   - y la consecuencia peor: un aviso que grita cuando no pasa nada se
--     empieza a ignorar, y el mes que de verdad no pagaron nadie lo mira.
--
-- Se agrega `due_day_to`: el ultimo dia de la ventana. La serie de
-- vencimientos sigue anclada en `due_day` —ahi es cuando se PUEDE cobrar—
-- y un periodo recien pasa a vencido despues de `due_day_to`.
--
-- NO se toca `fixed_expenses.due_day`, que comparte el nombre pero es
-- otra cosa: eso es lo que NOSOTROS pagamos, y ahi el vencimiento es un
-- dia puntual que pone el proveedor.
--
-- Requiere 03_schema.sql. Es idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Freno de mano
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.project_maintenance') is null then
    raise exception 'Falta correr 03_schema.sql: no existe project_maintenance.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1. La columna
--
-- NULLABLE, y eso es lo que hace que no cambie nada de lo ya cargado:
-- null = la ventana es de un solo dia, el comportamiento de siempre. Un
-- plan existente sigue calculando exactamente igual hasta que alguien le
-- ponga el ultimo dia desde la pantalla.
--
-- Tope 28 por lo mismo que `due_day`: el 29, 30 y 31 no existen todos los
-- meses y la serie se iria corriendo sola.
-- ---------------------------------------------------------------------
alter table project_maintenance
  add column if not exists due_day_to smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'project_maintenance_ventana'
  ) then
    -- La ventana no puede cerrar antes de abrir. Con null pasa derecho.
    alter table project_maintenance
      add constraint project_maintenance_ventana
        check (
          due_day_to is null
          or (due_day_to between 1 and 28 and due_day_to >= due_day)
        );
  end if;
end $$;

comment on column project_maintenance.due_day is
  'Primer dia de la ventana de cobro: desde aca se puede cobrar el periodo.';

comment on column project_maintenance.due_day_to is
  'Ultimo dia de la ventana. Null = ventana de un solo dia. Un periodo '
  'recien esta vencido DESPUES de este dia.';


-- ---------------------------------------------------------------------
-- 2. El aviso diario tiene que respetar la ventana
--
-- `revisar_vencimientos()` del paso 20 contaba un periodo como impago
-- apenas pasaba `due_day`. Con la ventana, un plan que se cobra del 1 al
-- 10 dejaba de estar al dia el dia 2 y mandaba push todos los meses.
--
-- Se reemplaza SOLO el bloque de mantenimientos; el resto de la funcion
-- —dominios, notas, proyectos demorados— queda igual. Si el paso 20 no
-- esta corrido, no hay nada que reemplazar y el script lo dice.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.revisar_vencimientos()') is null then
    raise notice
      'Salteado: falta correr 20_push.sql (no existe revisar_vencimientos). '
      'Corrélo y volvé a correr este script para que el aviso diario '
      'respete la ventana de cobro.';
    return;
  end if;

  execute $fn$
create or replace function revisar_vencimientos()
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  r record;
  venc date;
  cierre date;
  impagos int;
begin
  -- Mantenimientos: períodos cuya VENTANA ya cerró y siguen sin cobro.
  for r in
    select p.id, p.name, m.amount, m.currency::text as mon, m.frequency::text as freq,
           m.due_day, coalesce(m.due_day_to, m.due_day) as due_hasta,
           coalesce(m.start_date, m.implementation_date) as desde
      from project_maintenance m
      join projects p on p.id = m.project_id
     where m.status = 'Activo'
       and coalesce(m.start_date, m.implementation_date) is not null
  loop
    impagos := 0;
    venc := make_date(
      extract(year from r.desde)::int,
      extract(month from r.desde)::int,
      least(r.due_day, 28)
    );
    loop
      -- El último día de la ventana de ESE período. Recién pasado ese día
      -- el período cuenta como vencido.
      cierre := make_date(
        extract(year from venc)::int,
        extract(month from venc)::int,
        least(greatest(r.due_hasta, r.due_day), 28)
      );
      exit when cierre >= hoy;

      if not exists (
        select 1 from maintenance_charges c
         where c.project_id = r.id
           and c.charged_on >= venc - interval '10 days'
           and c.charged_on <  venc + (case r.freq
                 when 'Mensual' then interval '1 month'
                 when 'Trimestral' then interval '3 months'
                 when 'Semestral' then interval '6 months'
                 else interval '12 months' end)
      ) then
        impagos := impagos + 1;
      end if;

      venc := venc + (case r.freq
        when 'Mensual' then interval '1 month'
        when 'Trimestral' then interval '3 months'
        when 'Semestral' then interval '6 months'
        else interval '12 months' end);
    end loop;

    if impagos > 0 then
      perform notificar(
        'Mantenimiento sin cobrar · ' || r.name,
        impagos || ' período(s) · ' || r.mon || ' ' ||
          to_char(r.amount * impagos, 'FM999G999G999D00') || ' sin registrar',
        '/mantenimientos',
        'mnt-' || r.id || '-' || hoy
      );
    end if;
  end loop;

  -- Dominios por vencer (30 días o menos)
  for r in
    select p.id, p.name, i.domain, i.domain_expiry
      from project_infrastructure i
      join projects p on p.id = i.project_id
     where i.domain_expiry is not null
       and i.domain_expiry <= hoy + 30
  loop
    perform notificar(
      case when r.domain_expiry < hoy
           then 'Dominio VENCIDO · ' || r.domain
           else 'Dominio por vencer · ' || r.domain end,
      r.name || ' — ' || abs(r.domain_expiry - hoy) || ' día(s)',
      '/infraestructura',
      'dom-' || r.id || '-' || hoy
    );
  end loop;

  -- Recordatorios de notas
  for r in
    select n.id, n.title, n.reminder_date
      from notes n
     where n.reminder_date is not null
       and n.reminder_date <= hoy + 1
  loop
    perform notificar(
      'Recordatorio · ' || r.title,
      case when r.reminder_date < hoy
           then 'Venció hace ' || (hoy - r.reminder_date) || ' día(s)'
           when r.reminder_date = hoy then 'Es hoy'
           else 'Es mañana' end,
      '/notas',
      'nota-' || r.id || '-' || hoy
    );
  end loop;

  -- Proyectos demorados
  for r in
    select p.id, p.name, p.estimated_delivery
      from projects p
     where p.estimated_delivery is not null
       and p.estimated_delivery < hoy
       and p.status not in ('Implementado', 'En mantenimiento', 'Finalizado')
  loop
    perform notificar(
      'Proyecto demorado · ' || r.name,
      (hoy - r.estimated_delivery) || ' día(s) pasada la entrega estimada',
      '/proyectos/' || r.id,
      'late-' || r.id || '-' || hoy
    );
  end loop;
end $body$;
  $fn$;
end $$;


-- ---------------------------------------------------------------------
-- 3. Verificación
-- ---------------------------------------------------------------------
select * from (

  select 1 as orden, '1· ESTRUCTURA' as seccion,
         o.item,
         case when o.ok then '✓ está' else '✗ FALTA' end as detalle
  from (
    select 'columna project_maintenance.due_day_to' as item,
           exists (select 1 from information_schema.columns
                    where table_schema = 'public'
                      and table_name = 'project_maintenance'
                      and column_name = 'due_day_to') as ok
    union all select 'check de ventana coherente',
           exists (select 1 from pg_constraint
                    where conname = 'project_maintenance_ventana')
    union all select 'revisar_vencimientos() respeta la ventana',
           exists (select 1 from pg_proc
                    where proname = 'revisar_vencimientos'
                      and prosrc like '%due_day_to%')
  ) o

  union all
  select 2, '2· PLANES ACTIVOS',
         p.name,
         'cobra del día ' || m.due_day || ' al ' ||
           coalesce(m.due_day_to::text, m.due_day::text || ' (un solo día)')
  from project_maintenance m
  join projects p on p.id = m.project_id
  where m.status = 'Activo'

) x
order by orden, item;
