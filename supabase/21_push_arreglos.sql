-- =====================================================================
-- PASO 21 — Arreglos del push
--
-- Tres cosas que el 20 dejó mal o incompletas:
--
--   1. `despachar_push()` se callaba. Si faltaba la configuración hacía
--      `raise warning` y volvía, así que pg_cron marcaba la corrida como
--      `succeeded` y en la práctica el push estuvo roto días sin que
--      nada lo dijera. Un sistema de avisos que no avisa que está roto
--      es peor que no tenerlo: ahora se muere con `raise exception` y
--      queda registrado en `cron.job_run_details`.
--
--   2. Faltaba todo el módulo de gastos. El 20 se escribió antes del
--      `10_gastos.sql`, así que no avisa ni cuando se paga un gasto fijo
--      ni cuando hay períodos vencidos.
--
--   3. Faltaban los pendientes. Un bloqueador nuevo tiene que avisar.
--
-- Y agrega `push_estado()`, para que la app pueda mostrar un cartel
-- cuando la cadena está cortada en vez de que se descubra por casualidad.
--
-- Requiere 20_push.sql. El bloque 2 requiere además 10_gastos.sql, y si
-- no está se saltea solo. Es idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Que el despacho falle de cara
-- ---------------------------------------------------------------------
create or replace function despachar_push()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  url      text;
  token    text;
  pendientes int;
begin
  select count(*) into pendientes
    from notifications where sent_at is null and attempts < 5;

  -- Sin nada para mandar no hay nada que revisar: que la falta de
  -- configuración no llene el log cuando además no hay avisos en cola.
  if pendientes = 0 then
    return;
  end if;

  select value into url   from app_settings where key = 'push_function_url';
  select value into token from app_settings where key = 'push_function_token';

  -- Antes esto era un `raise warning` y un `return`. Es la línea que hizo
  -- que 22 avisos se quedaran en la cola mientras el cron informaba
  -- `succeeded` una vez por minuto.
  if url is null or token is null then
    raise exception
      'Push sin configurar: faltan push_function_url o push_function_token en '
      'app_settings, y hay % aviso(s) esperando. Corré `npm run push:sql` y '
      'pegá el insert que imprime.', pendientes;
  end if;

  perform net.http_post(
    url     := url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || token
    ),
    body    := '{}'::jsonb
  );
end $$;


-- ---------------------------------------------------------------------
-- 2. Gastos
--
-- El movimiento ya avisaba, pero sin decir en qué se gastó ni qué
-- compromiso salda. Con el rubro adentro, el aviso se entiende sin
-- abrir la app, que es el punto de una notificación.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.fixed_expenses') is null then
    raise notice 'Sin 10_gastos.sql: me salteo los avisos de gastos.';
    return;
  end if;

  -- Alta de un gasto fijo
  execute $fn$
    create or replace function avisar_gasto_fijo()
    returns trigger language plpgsql security definer set search_path = public as $body$
    declare proyecto text;
    begin
      select name into proyecto from projects where id = new.project_id;
      perform notificar(
        'Gasto fijo nuevo · ' || new.concept,
        new.currency::text || ' ' || to_char(new.amount, 'FM999G999G999D00')
          || ' · ' || new.frequency::text || ' · día ' || new.due_day
          || ' · ' || coalesce(proyecto, 'estructura'),
        '/gastos'
      );
      return new;
    end $body$;
  $fn$;

  execute 'drop trigger if exists fixed_expenses_avisar on fixed_expenses';
  execute 'create trigger fixed_expenses_avisar after insert on fixed_expenses
             for each row execute function avisar_gasto_fijo()';

  -- El movimiento, ahora con rubro y con el gasto fijo que salda
  execute $fn$
    create or replace function avisar_movimiento()
    returns trigger language plpgsql security definer set search_path = public as $body$
    declare
      origen text; destino text; moneda text; plan text; extra text := '';
    begin
      select name, currency::text into origen, moneda from accounts where id = new.from_account_id;
      select name into destino from accounts where id = new.to_account_id;

      if new.expense_kind is not null then
        extra := ' · ' || new.expense_kind::text;
      end if;

      if new.fixed_expense_id is not null then
        select concept into plan from fixed_expenses where id = new.fixed_expense_id;
        extra := extra || ' · salda ' || coalesce(plan, 'un gasto fijo')
                       || ' de ' || to_char(new.period_start, 'TMMonth YYYY');
      end if;

      perform notificar(
        new.category::text || ' · ' || coalesce(nullif(new.concept, ''), 'sin concepto'),
        coalesce(origen, 'de afuera') || ' → ' || coalesce(destino, 'para afuera')
          || case when new.amount_out > 0
                  then ' · ' || coalesce(moneda, '') || ' ' || to_char(new.amount_out, 'FM999G999G999D00')
                  else '' end
          || extra,
        case when new.category = 'Gasto' then '/gastos' else '/caja' end
      );
      return new;
    end $body$;
  $fn$;
end $$;


-- ---------------------------------------------------------------------
-- 3. Pendientes: sólo los bloqueadores
--
-- Un pendiente interno más no es noticia; un bloqueador sí, porque frena
-- el proyecto. Avisar de todos sería la forma más rápida de que el
-- equipo silencie las notificaciones y de paso se pierda las de plata.
-- ---------------------------------------------------------------------
create or replace function avisar_bloqueador()
returns trigger language plpgsql security definer set search_path = public as $$
declare proyecto text;
begin
  if new.kind <> 'bloqueador' or new.done then
    return new;
  end if;
  select name into proyecto from projects where id = new.project_id;
  perform notificar(
    'Bloqueador · ' || coalesce(proyecto, ''),
    new.title,
    '/proyectos/' || new.project_id
  );
  return new;
end $$;

drop trigger if exists project_tasks_avisar on project_tasks;
create trigger project_tasks_avisar after insert on project_tasks
  for each row execute function avisar_bloqueador();


-- ---------------------------------------------------------------------
-- 4. Vencimientos de gastos fijos, una vez por día
--
-- Mismo criterio que el motor de `lib/gastos.ts`: el calendario sale de
-- (started_on, frequency, due_day) y NUNCA del último pago, y un período
-- está pago sólo si existe un movimiento que lo DECLARA. Así, pagar
-- tarde no borra el período atrasado.
--
-- UN aviso por gasto fijo con el conteo adentro, no uno por período: con
-- ocho planes y medio año sin confirmar pagos serían cuarenta y ocho
-- notificaciones que entierran las que importan.
-- ---------------------------------------------------------------------
create or replace function revisar_gastos_vencidos()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  r record;
  venc date;
  paso interval;
  impagos int;
  guarda int;
begin
  if to_regclass('public.fixed_expenses') is null then
    return;
  end if;

  for r in
    select e.id, e.concept, e.amount, e.currency::text as mon,
           e.frequency::text as freq, e.due_day, e.started_on, e.ended_on
      from fixed_expenses e
     where e.started_on <= hoy
       and (e.ended_on is null or e.ended_on >= hoy)
  loop
    paso := case r.freq
      when 'Mensual'    then interval '1 month'
      when 'Trimestral' then interval '3 months'
      when 'Semestral'  then interval '6 months'
      else interval '12 months' end;

    impagos := 0;
    guarda  := 0;
    venc := make_date(
      extract(year  from r.started_on)::int,
      extract(month from r.started_on)::int,
      least(r.due_day, 28)
    );

    while venc <= hoy and guarda < 400 loop
      if not exists (
        select 1 from money_movements m
         where m.fixed_expense_id = r.id
           and m.period_start = venc
      ) then
        impagos := impagos + 1;
      end if;
      venc   := (venc + paso)::date;
      guarda := guarda + 1;
    end loop;

    if impagos > 0 then
      perform notificar(
        'Gasto fijo sin pagar · ' || r.concept,
        impagos || ' período(s) · ' || r.mon || ' '
          || to_char(r.amount * impagos, 'FM999G999G999D00') || ' sin registrar',
        '/gastos',
        'gfx-' || r.id || '-' || hoy
      );
    end if;
  end loop;
end $$;

-- Se engancha al mismo reloj diario, después de los vencimientos de cobro.
select cron.unschedule('revisar-gastos')
 where exists (select 1 from cron.job where jobname = 'revisar-gastos');

select cron.schedule(
  'revisar-gastos', '5 12 * * *', $cron$ select revisar_gastos_vencidos(); $cron$
);


-- ---------------------------------------------------------------------
-- 5. Que la app pueda saber si el push está vivo
--
-- `app_settings` tiene RLS sin políticas: nadie la lee. Esta función es
-- `security definer` y devuelve sólo el diagnóstico, nunca los valores.
-- ---------------------------------------------------------------------
create or replace function push_estado()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'configurado',
      exists (select 1 from app_settings where key = 'push_function_url')
      and exists (select 1 from app_settings where key = 'push_function_token'),
    'dispositivos', (select count(*) from push_subscriptions),
    'enCola',       (select count(*) from notifications where sent_at is null),
    -- Un aviso que lleva más de diez minutos en la cola significa que el
    -- despacho no está funcionando: el cron corre cada minuto.
    'atascados',    (select count(*) from notifications
                      where sent_at is null and created_at < now() - interval '10 minutes'),
    'ultimoError',  (select last_error from notifications
                      where last_error is not null order by created_at desc limit 1)
  );
$$;

revoke all on function push_estado() from public;
grant execute on function push_estado() to authenticated;


-- ---------------------------------------------------------------------
-- 6. Verificación
-- ---------------------------------------------------------------------
select push_estado() as estado_del_push
union all
select json_build_object(
  'triggers_de_aviso',
  (select count(*) from pg_trigger where tgname like '%_avisar' and not tgisinternal),
  'tareas_de_cron',
  (select string_agg(jobname, ', ' order by jobname) from cron.job)
);
