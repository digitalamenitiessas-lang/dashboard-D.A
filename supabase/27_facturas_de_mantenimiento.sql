-- =====================================================================
-- PASO 27 — CADA FACTURA DE MANTENIMIENTO DICE QUÉ MES PAGA
--
-- El problema real (Joaquín, 04/11/2026): «me figura octubre cuando es
-- noviembre, y voy creando a mano las facturas de cada mes».
--
-- El mantenimiento se cobra en `payments` desde /cobros, imputado a una
-- factura, porque eso es lo que cancela la deuda y lo que genera el
-- recibo. Pero la mora de /mantenimientos se calculaba SÓLO con
-- `maintenance_charges` (el botón Cobrar de esa pantalla), así que un
-- mes cobrado por /cobros nunca tapaba su período: la pantalla seguía
-- mostrando octubre como lo que había que cobrar.
--
-- La regla del cobro no cambia: lo que se cobra del 1 al 10 es el mes
-- que pasó (mes vencido). Lo que cambia es CÓMO se sabe que un mes está
-- pago: lo dice la factura, no la fecha del cobro.
--
--   1. `facturas.periodo`: el primer día del mes que paga la factura.
--      Null = no es de mantenimiento.
--   2. Un período está cobrado cuando su factura está cancelada (o,
--      como hasta ahora, cuando hay un `maintenance_charge` que lo tapa).
--   3. La app genera sola la factura de cada mes: apenas se cancela la
--      de un mes crea la del siguiente, y si nadie pagó, la crea igual
--      cuando abre la ventana de cobro. Ver `facturasDeMantenimientoQueFaltan()`
--      en lib/derive.ts.
--
-- Las facturas que se cargaron a mano se marcan acá con su período si
-- el concepto lo dice («Mantenimiento octubre»). Las que no, se marcan
-- desde la pantalla: Editar factura → «Mes de mantenimiento». Mientras
-- un plan tenga facturas de mantenimiento sin marcar y ninguna marcada,
-- la app NO genera nada para ese plan, para no duplicarlas.
--
-- Requiere 15, 16, 17, 24 y 25. Es idempotente.
-- =====================================================================

set search_path = public;


-- ---------------------------------------------------------------------
-- 0. Freno de mano
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'facturas'
       and column_name = 'aplicado'
  ) then
    raise exception 'Falta correr 25_facturas_en_otra_moneda.sql.';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'project_maintenance'
       and column_name = 'due_day_to'
  ) then
    raise exception 'Falta correr 15_ventana_de_cobro.sql.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1. La columna
--
-- Siempre el día 1: es el MES lo que importa, y con el día libre
-- «2026-10-01» y «2026-10-15» serían dos períodos distintos para el
-- índice único.
--
-- No se exige proyecto con un CHECK aunque un mes de mantenimiento
-- siempre sea de un plan: el FK de `project_id` es SET NULL (paso 17), y
-- con ese check borrar un proyecto con facturas de mantenimiento fallaría
-- con un error que nadie entiende. La app nunca crea una sin proyecto.
-- ---------------------------------------------------------------------
alter table facturas add column if not exists periodo date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'facturas_periodo_dia_1') then
    alter table facturas add constraint facturas_periodo_dia_1
      check (periodo is null or extract(day from periodo) = 1);
  end if;
end $$;

-- Un mes, una factura. Es lo que hace que generar sea seguro: si dos
-- pestañas abiertas intentan crear la de noviembre a la vez, la segunda
-- rebota acá en vez de duplicarla.
create unique index if not exists facturas_mantenimiento_periodo_uidx
  on facturas (project_id, periodo)
  where periodo is not null;

comment on column facturas.periodo is
  'Mes de mantenimiento que paga esta factura (siempre el dia 1). Null = no '
  'es de mantenimiento. El mes se cobra vencido: la de octubre se cobra '
  'del 1 al 10 de noviembre.';


-- ---------------------------------------------------------------------
-- 2. La moneda de una factura de mantenimiento es la del PLAN
--
-- El trigger del paso 25 exige el equivalente (`aplicado`) cuando la
-- factura va en otra moneda que el proyecto, porque eso es lo que
-- descuenta de lo cotizado. Una factura de mantenimiento no descuenta
-- nada de lo cotizado —el desarrollo es una cosa y el abono mensual otra—
-- y el plan tiene su propia moneda: HoMeApp se cotizó en dólares y el
-- mantenimiento es en pesos. Con período, el chequeo no aplica.
-- ---------------------------------------------------------------------
create or replace function validar_moneda_factura()
returns trigger language plpgsql set search_path = public as $$
declare moneda_proyecto currency;
begin
  if new.periodo is not null then
    return new;
  end if;

  if new.project_id is null then
    if new.aplicado is not null then
      raise exception
        'Esta factura no tiene proyecto, asi que no salda nada: el '
        'equivalente tiene que quedar vacio.';
    end if;
    return new;
  end if;

  select currency into moneda_proyecto from projects where id = new.project_id;

  if moneda_proyecto is null then
    return new;
  end if;

  if moneda_proyecto = new.moneda then
    if new.aplicado is not null then
      raise exception
        'La factura ya esta en %, la misma moneda del proyecto: el '
        'equivalente sobra.', new.moneda;
    end if;
    return new;
  end if;

  if new.aplicado is null then
    raise exception
      'La factura esta en % y el proyecto esta cotizado en %. Cargá a '
      'cuanto equivale en %, o dejá la factura sin proyecto.',
      new.moneda, moneda_proyecto, moneda_proyecto;
  end if;

  return new;
end $$;


-- ---------------------------------------------------------------------
-- 3. Marcar las facturas que ya se cargaron a mano
--
-- Sólo cuando no hay duda:
--   · el concepto habla de mantenimiento o abono y nombra UN mes;
--   · la factura es del proyecto del plan, o no tiene proyecto y el
--     cliente tiene UN solo plan activo (si tiene dos, no hay forma de
--     saber de cuál es);
--   · nadie más reclama ese mes para ese proyecto.
-- El año sale del concepto si lo dice; si no, es el del mes más cercano
-- hacia atrás desde la emisión: una factura de «diciembre» emitida en
-- enero es del diciembre anterior.
--
-- Lo que no se pueda marcar así aparece en la verificación del final.
-- ---------------------------------------------------------------------
with planes as (
  select m.project_id, p.client_id
    from project_maintenance m
    join projects p on p.id = m.project_id
   where m.status = 'Activo'
),
clientes_con_un_plan as (
  select client_id from planes group by client_id having count(*) = 1
),
meses(n, nombre) as (
  values (1, 'enero'), (2, 'febrero'), (3, 'marzo'), (4, 'abril'),
         (5, 'mayo'), (6, 'junio'), (7, 'julio'), (8, 'agosto'),
         (9, 'septiembre|setiembre'), (10, 'octubre'),
         (11, 'noviembre'), (12, 'diciembre')
),
candidatas as (
  select f.id,
         pl.project_id,
         make_date(
           coalesce(
             substring(f.concepto from '(20[0-9]{2})')::int,
             case when mm.n <= extract(month from f.emitida_on)
                  then extract(year from f.emitida_on)::int
                  else extract(year from f.emitida_on)::int - 1 end
           ),
           mm.n, 1
         ) as periodo
    from facturas f
    join planes pl
      on pl.project_id = f.project_id
      or (f.project_id is null
          and f.cliente_id = pl.client_id
          and pl.client_id in (select client_id from clientes_con_un_plan))
    join meses mm on f.concepto ~* ('\m(' || mm.nombre || ')\M')
   where f.periodo is null
     and f.concepto ~* '(manten|abono)'
),
sin_dudas as (
  select c.*
    from candidatas c
   -- Un solo mes en el concepto…
   where (select count(*) from candidatas c2 where c2.id = c.id) = 1
     -- …una sola factura para ese mes…
     and (select count(*) from candidatas c3
           where c3.project_id = c.project_id and c3.periodo = c.periodo) = 1
     -- …y ninguna marcada de antes con el mismo.
     and not exists (select 1 from facturas f2
                      where f2.project_id = c.project_id and f2.periodo = c.periodo)
)
update facturas f
   set periodo    = s.periodo,
       project_id = s.project_id
  from sin_dudas s
 where f.id = s.id;


-- ---------------------------------------------------------------------
-- 4. El aviso diario: un mes con su factura cancelada está cobrado
--
-- Es la misma función del paso 24 con el bloque de mantenimientos
-- reescrito. De paso vuelve a respetar dos cosas que el 24 había
-- perdido al reescribirla:
--   · la ventana de cobro del paso 15 (vencido recién después del 10);
--   · el primer vencimiento es el primer día de cobro DESPUÉS del
--     arranque, igual que `dueDateSeries()` en lib/derive.ts. El 24
--     contaba también el del mes de arranque y avisaba un período de más.
-- El resto —dominios, notas, proyectos demorados— queda igual.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.avisar_recurrente(text, text, text, text, numeric)') is null then
    raise notice
      'Salteado: falta correr 24_silenciar_avisos.sql. Corrélo y volvé a '
      'correr este script para que el aviso diario cuente las facturas.';
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
  paso interval;
  venc date;
  cierre date;
  per date;
  impagos int;
begin
  -- Mantenimientos: períodos cuya ventana ya cerró y siguen sin cobrar.
  -- Gravedad: la cantidad de períodos impagos.
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
    paso := case r.freq
      when 'Mensual' then interval '1 month'
      when 'Trimestral' then interval '3 months'
      when 'Semestral' then interval '6 months'
      else interval '12 months' end;

    -- Mes vencido: el primer cobro es el primer día de cobro después del
    -- arranque. El del mismo mes del arranque no existe.
    venc := make_date(
      extract(year from r.desde)::int,
      extract(month from r.desde)::int,
      least(r.due_day, 28)
    );
    while venc <= r.desde loop
      venc := (venc + paso)::date;
    end loop;

    loop
      cierre := make_date(
        extract(year from venc)::int,
        extract(month from venc)::int,
        least(greatest(r.due_hasta, r.due_day), 28)
      );
      exit when cierre >= hoy;

      -- El mes (o el arranque del trimestre, semestre…) que paga este cobro.
      per := date_trunc('month', venc - paso)::date;

      if not exists (
        select 1 from maintenance_charges c
         where c.project_id = r.id
           and c.charged_on >= venc - interval '10 days'
           and c.charged_on <  venc + paso
      ) and not exists (
        -- Factura de ese mes cancelada: lo imputado cubre el importe. Lo
        -- que salda cada cobro es lo mismo que `loQueSalda()`.
        select 1 from facturas f
         where f.project_id = r.id
           and f.periodo = per
           and round(f.importe, 2) <= (
             select round(coalesce(sum(
                      case when pa.currency = f.moneda then pa.amount
                           else coalesce(pa.applied_amount, 0) end), 0), 2)
               from payments pa
              where pa.factura_id = f.id)
      ) then
        impagos := impagos + 1;
      end if;

      venc := (venc + paso)::date;
    end loop;

    if impagos > 0 then
      perform avisar_recurrente(
        'mnt-' || r.id,
        'Mantenimiento sin cobrar · ' || r.name,
        impagos || ' período(s) · ' || r.mon || ' ' ||
          to_char(r.amount * impagos, 'FM999G999G999D00') || ' sin registrar',
        '/mantenimientos',
        impagos
      );
    end if;
  end loop;

  -- Dominios por vencer.
  -- Gravedad a dos escalones: por vencer (1) y vencido (2). Con los días
  -- restantes como gravedad, cada día sería «peor» y el silencio no
  -- duraría nunca.
  for r in
    select p.id, p.name, i.domain, i.domain_expiry
      from project_infrastructure i
      join projects p on p.id = i.project_id
     where i.domain_expiry is not null
       and i.domain_expiry <= hoy + 30
  loop
    perform avisar_recurrente(
      'dom-' || r.id,
      case when r.domain_expiry < hoy
           then 'Dominio VENCIDO · ' || r.domain
           else 'Dominio por vencer · ' || r.domain end,
      r.name || ' — ' || abs(r.domain_expiry - hoy) || ' día(s)',
      '/infraestructura',
      case when r.domain_expiry < hoy then 2 else 1 end
    );
  end loop;

  -- Recordatorios de notas.
  -- Tres escalones: mañana (1), hoy (2), ya venció (3).
  for r in
    select n.id, n.title, n.reminder_date
      from notes n
     where n.reminder_date is not null
       and n.reminder_date <= hoy + 1
  loop
    perform avisar_recurrente(
      'nota-' || r.id,
      'Recordatorio · ' || r.title,
      case when r.reminder_date < hoy
           then 'Venció hace ' || (hoy - r.reminder_date) || ' día(s)'
           when r.reminder_date = hoy then 'Es hoy'
           else 'Es mañana' end,
      '/notas',
      case when r.reminder_date < hoy then 3
           when r.reminder_date = hoy then 2
           else 1 end
    );
  end loop;

  -- Proyectos demorados.
  -- Gravedad en SEMANAS de atraso, no en días: así vuelve a avisar una vez
  -- por semana mientras se sigue atrasando, en vez de todos los días.
  for r in
    select p.id, p.name, p.estimated_delivery
      from projects p
     where p.estimated_delivery is not null
       and p.estimated_delivery < hoy
       and p.status not in ('Implementado', 'En mantenimiento', 'Finalizado')
  loop
    perform avisar_recurrente(
      'late-' || r.id,
      'Proyecto demorado · ' || r.name,
      (hoy - r.estimated_delivery) || ' día(s) pasada la entrega estimada',
      '/proyectos/' || r.id,
      floor((hoy - r.estimated_delivery) / 7.0) + 1
    );
  end loop;
end $body$;
  $fn$;
end $$;


-- ---------------------------------------------------------------------
-- 5. Verificación
--
-- La sección 3 es la que hay que mirar: facturas que parecen de
-- mantenimiento y quedaron SIN mes. Mientras un plan tenga alguna así y
-- ninguna marcada, la app no le genera facturas. Marcalas desde
-- Editar factura → «Mes de mantenimiento».
-- ---------------------------------------------------------------------
select * from (

  select 1 as orden, '1· ESTRUCTURA' as seccion, o.item,
         case when o.ok then '✓ está' else '✗ FALTA' end as detalle
  from (
    select 'columna facturas.periodo' as item,
           exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'facturas'
                      and column_name = 'periodo') as ok
    union all select 'un mes, una factura (índice único)',
           exists (select 1 from pg_class
                    where relname = 'facturas_mantenimiento_periodo_uidx')
    union all select 'moneda libre con período',
           exists (select 1 from pg_proc
                    where proname = 'validar_moneda_factura'
                      and prosrc like '%new.periodo%')
    union all select 'aviso diario mira las facturas',
           exists (select 1 from pg_proc
                    where proname = 'revisar_vencimientos'
                      and prosrc like '%f.periodo%')
  ) o

  union all
  select 2, '2· CON MES', p.name || ' · ' || to_char(f.periodo, 'YYYY-MM'),
         f.numero || ' · ' || f.moneda::text || ' ' ||
           to_char(f.importe, 'FM999G999G999D00') ||
           case when f.concepto <> '' then ' · ' || f.concepto else '' end
    from facturas f
    join projects p on p.id = f.project_id
   where f.periodo is not null

  union all
  select 3, '3· PARECEN DE MANTENIMIENTO Y NO TIENEN MES', f.numero,
         c.name || coalesce(' · ' || p.name, ' · sin proyecto') || ' · ' ||
           f.moneda::text || ' ' || to_char(f.importe, 'FM999G999G999D00') ||
           case when f.concepto <> '' then ' · ' || f.concepto else '' end
    from facturas f
    join clients c on c.id = f.cliente_id
    left join projects p on p.id = f.project_id
   where f.periodo is null
     and (f.concepto ~* '(manten|abono)'
          or exists (select 1 from project_maintenance m
                      join projects pm on pm.id = m.project_id
                     where m.status = 'Activo'
                       and pm.client_id = f.cliente_id
                       and m.amount = f.importe
                       and m.currency = f.moneda))

) x
order by orden, item;
