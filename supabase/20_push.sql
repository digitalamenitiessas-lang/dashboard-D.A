-- =====================================================================
-- PASO 20 — NOTIFICACIONES PUSH
--
-- Tres piezas:
--
--   `push_subscriptions`  Un renglón por celular que aceptó recibir
--                         avisos. Como toda la empresa entra con el
--                         mismo usuario, no hay a quién rutear: se le
--                         manda a todos.
--
--   `notifications`       La cola. Nada se manda desde un trigger: el
--                         trigger sólo encola. Si el push falla o
--                         Internet se cae, la operación del usuario no
--                         se rompe — se reintenta después.
--
--   pg_cron               Cada minuto vacía la cola, y una vez por día
--                         busca lo que venció y lo encola.
--
-- El `dedupe_key` es lo que evita que te taladre: un mantenimiento
-- vencido avisa UNA vez por día, no una vez por minuto.
--
-- Es idempotente: se puede correr de nuevo sin romper nada.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Extensiones
-- pg_net manda el HTTP a la Edge Function; pg_cron dispara el reloj.
-- Si alguna falla acá, activala en el panel: Database → Extensions.
-- ---------------------------------------------------------------------
create extension if not exists pg_net;
create extension if not exists pg_cron;


-- ---------------------------------------------------------------------
-- 1. Config
--
-- La URL de la función y su token. Va en su propia tabla con RLS que no
-- le da acceso a NADIE: sólo la leen las funciones `security definer` de
-- más abajo, que corren con los permisos del dueño.
-- ---------------------------------------------------------------------
create table if not exists app_settings (
  key   text primary key,
  value text not null
);

alter table app_settings enable row level security;
-- Sin políticas = nadie con anon key ni con sesión puede leerla.
drop policy if exists authenticated_all on app_settings;


-- ---------------------------------------------------------------------
-- 2. Los celulares suscriptos
-- ---------------------------------------------------------------------
create table if not exists push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text not null default '',
  label        text not null default '',
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_created_idx
  on push_subscriptions (created_at desc);

alter table push_subscriptions enable row level security;
drop policy if exists authenticated_all on push_subscriptions;
create policy authenticated_all on push_subscriptions
  for all to authenticated using (true) with check (true);


-- ---------------------------------------------------------------------
-- 3. La cola
--
-- `dedupe_key` null = se manda siempre (un cobro nuevo es un hecho
-- único). Con valor = se manda una sola vez, nunca repetido: los avisos
-- de vencimiento lo arman con la fecha adentro, así avisan un día sí y
-- al otro también, pero una vez por día.
-- ---------------------------------------------------------------------
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null default '',
  url         text not null default '/',
  dedupe_key  text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  attempts    smallint not null default 0,
  last_error  text
);

create unique index if not exists notifications_dedupe_uidx
  on notifications (dedupe_key) where dedupe_key is not null;

create index if not exists notifications_pendientes_idx
  on notifications (created_at) where sent_at is null;

alter table notifications enable row level security;
drop policy if exists authenticated_all on notifications;
create policy authenticated_all on notifications
  for all to authenticated using (true) with check (true);


-- ---------------------------------------------------------------------
-- 4. Encolar
--
-- `on conflict do nothing` sobre el índice único: si el aviso ya está
-- encolado o ya se mandó, no se duplica.
-- ---------------------------------------------------------------------
create or replace function notificar(
  p_title text,
  p_body  text default '',
  p_url   text default '/',
  p_dedupe text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into notifications (title, body, url, dedupe_key)
  values (p_title, p_body, p_url, p_dedupe)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
$$;


-- ---------------------------------------------------------------------
-- 5. Qué avisa cuando se carga algo
--
-- Los montos van con el código de moneda por delante, siempre: USD y
-- ARS comparten el símbolo $ y un aviso ambiguo no sirve de nada.
-- ---------------------------------------------------------------------

create or replace function avisar_cobro()
returns trigger language plpgsql security definer set search_path = public as $$
declare proyecto text;
begin
  select name into proyecto from projects where id = new.project_id;
  perform notificar(
    'Cobro registrado · ' || coalesce(proyecto, 'sin proyecto'),
    new.concept || ' — ' || new.currency::text || ' ' ||
      to_char(new.amount, 'FM999G999G999D00'),
    '/cobros'
  );
  return new;
end $$;

drop trigger if exists payments_avisar on payments;
create trigger payments_avisar after insert on payments
  for each row execute function avisar_cobro();


create or replace function avisar_mantenimiento_cobrado()
returns trigger language plpgsql security definer set search_path = public as $$
declare proyecto text;
begin
  select name into proyecto from projects where id = new.project_id;
  perform notificar(
    'Mantenimiento cobrado · ' || coalesce(proyecto, ''),
    new.currency::text || ' ' || to_char(new.amount, 'FM999G999G999D00'),
    '/mantenimientos'
  );
  return new;
end $$;

drop trigger if exists maintenance_charges_avisar on maintenance_charges;
create trigger maintenance_charges_avisar after insert on maintenance_charges
  for each row execute function avisar_mantenimiento_cobrado();


create or replace function avisar_movimiento()
returns trigger language plpgsql security definer set search_path = public as $$
declare origen text; destino text; moneda text;
begin
  select name, currency::text into origen, moneda from accounts where id = new.from_account_id;
  select name into destino from accounts where id = new.to_account_id;
  perform notificar(
    new.category::text || ' · ' || coalesce(nullif(new.concept, ''), 'sin concepto'),
    coalesce(origen, 'de afuera') || ' → ' || coalesce(destino, 'para afuera') ||
      case when new.amount_out > 0
           then ' · ' || coalesce(moneda, '') || ' ' || to_char(new.amount_out, 'FM999G999G999D00')
           else '' end,
    '/caja'
  );
  return new;
end $$;

drop trigger if exists money_movements_avisar on money_movements;
create trigger money_movements_avisar after insert on money_movements
  for each row execute function avisar_movimiento();


create or replace function avisar_proyecto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform notificar('Proyecto nuevo · ' || new.name, new.status::text, '/proyectos/' || new.id);
  elsif new.status is distinct from old.status then
    perform notificar(
      'Cambió de estado · ' || new.name,
      old.status::text || ' → ' || new.status::text,
      '/proyectos/' || new.id
    );
  end if;
  return new;
end $$;

drop trigger if exists projects_avisar on projects;
create trigger projects_avisar after insert or update on projects
  for each row execute function avisar_proyecto();


create or replace function avisar_nota()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notificar('Nota nueva · ' || new.title,
                    left(new.content, 120), '/notas');
  return new;
end $$;

drop trigger if exists notes_avisar on notes;
create trigger notes_avisar after insert on notes
  for each row execute function avisar_nota();


-- ---------------------------------------------------------------------
-- 6. Qué avisa cuando algo VENCE
--
-- Corre una vez por día. El `dedupe_key` lleva la fecha adentro, así que
-- vuelve a avisar mañana pero no dos veces hoy.
--
-- Ojo con el mantenimiento: el vencimiento se calcula desde
-- (start_date, frequency, due_day) y se compara contra los cobros
-- REALES de maintenance_charges. No se usa last_collected_date, que es
-- estado derivado y hace que la mora se auto-cure.
-- ---------------------------------------------------------------------
create or replace function revisar_vencimientos()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  r record;
  venc date;
  impagos int;
begin
  -- Mantenimientos: períodos vencidos sin cobro
  for r in
    select p.id, p.name, m.amount, m.currency::text as mon, m.frequency::text as freq,
           m.due_day, coalesce(m.start_date, m.implementation_date) as desde
      from project_maintenance m
      join projects p on p.id = m.project_id
     where m.active and m.status = 'Activo'
       and coalesce(m.start_date, m.implementation_date) is not null
  loop
    impagos := 0;
    venc := make_date(
      extract(year from r.desde)::int,
      extract(month from r.desde)::int,
      least(r.due_day, 28)
    );
    while venc <= hoy loop
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
end $$;


-- ---------------------------------------------------------------------
-- 7. Despachar la cola
--
-- Le pega a la Edge Function, que es la única que sabe firmar VAPID y
-- cifrar el payload. Acá sólo se avisa "hay cosas para mandar".
-- ---------------------------------------------------------------------
create or replace function despachar_push()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  url   text;
  token text;
begin
  if not exists (select 1 from notifications where sent_at is null and attempts < 5) then
    return;
  end if;

  select value into url   from app_settings where key = 'push_function_url';
  select value into token from app_settings where key = 'push_function_token';

  if url is null or token is null then
    raise warning 'Falta configurar push_function_url / push_function_token en app_settings';
    return;
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
-- 8. El reloj
-- ---------------------------------------------------------------------
select cron.unschedule('despachar-push')      where exists (select 1 from cron.job where jobname = 'despachar-push');
select cron.unschedule('revisar-vencimientos') where exists (select 1 from cron.job where jobname = 'revisar-vencimientos');

-- Cada minuto: vaciar la cola.
select cron.schedule('despachar-push', '* * * * *', $cron$ select despachar_push(); $cron$);

-- Todos los días 9:00 de Buenos Aires (12:00 UTC): buscar vencimientos.
select cron.schedule('revisar-vencimientos', '0 12 * * *', $cron$ select revisar_vencimientos(); $cron$);


-- ---------------------------------------------------------------------
-- 9. QUÉ TE FALTA HACER A MANO (dos inserts)
--
-- Reemplazá <TU-PROYECTO> por el ref de tu proyecto de Supabase
-- (qijattjgtsisicaqtxhc) y <TOKEN> por una cadena larga al azar que vas
-- a poner también como secreto de la Edge Function (PUSH_TOKEN).
--
--   insert into app_settings (key, value) values
--     ('push_function_url',   'https://<TU-PROYECTO>.supabase.co/functions/v1/enviar-push'),
--     ('push_function_token', '<TOKEN>')
--   on conflict (key) do update set value = excluded.value;
--
-- Para generar el token: openssl rand -hex 32
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 10. Verificación
-- ---------------------------------------------------------------------
select 'celulares suscriptos' as que, count(*)::text as cuanto from push_subscriptions
union all
select 'avisos en cola', count(*)::text from notifications where sent_at is null
union all
select 'avisos mandados', count(*)::text from notifications where sent_at is not null
union all
select 'config cargada', count(*)::text from app_settings
  where key in ('push_function_url', 'push_function_token')
union all
select 'tareas programadas', string_agg(jobname, ', ') from cron.job
  where jobname in ('despachar-push', 'revisar-vencimientos');
