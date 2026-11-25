-- =====================================================================
-- PASO 28 — TABLERO DEL EQUIPO Y AVISOS NUEVOS
--
-- El problema (25/11/2026): el equipo se olvida de las metas y de lo que
-- cada uno tenía que hacer. No hace falta un gestor de proyectos: hace
-- falta que cada uno diga en qué está y para cuándo, y que el sistema le
-- avise a ESA persona cuando se le viene la fecha encima.
--
-- Cinco piezas:
--
--   1. `miembros`       Nombre para mostrar de cada usuario. auth.users
--                       no se puede leer desde la app.
--   2. `metas`          Los objetivos del equipo, con fecha.
--   3. `tareas_equipo`  Lo que hace cada uno, con responsable, fecha
--                       límite y, si corresponde, meta y proyecto.
--   4. Push por persona Hasta ahora todo aviso iba a todos los celulares.
--                       Un recordatorio de tarea es de una sola persona.
--   5. Avisos           Quedan SOLO: cobros y movimientos de caja (al
--                       momento), tareas por vencer (al responsable) y
--                       cobro de mantenimiento del 1 al 10 (a todos).
--                       Todo lo demás se apaga.
--
-- IMPORTANTE: después de correr esto hay que volver a deployar la Edge
-- Function `enviar-push`, que es la que sabe a quién mandarle cada
-- aviso. Mientras tenga la versión vieja, los recordatorios de tareas le
-- llegan a todos los celulares en vez de sólo al responsable.
--
-- Requiere 20, 24 y 27. Es idempotente.
-- =====================================================================

set search_path = public;


-- ---------------------------------------------------------------------
-- 0. Freno de mano
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.notifications') is null then
    raise exception 'Falta correr 20_push.sql.';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'facturas'
       and column_name = 'periodo'
  ) then
    raise exception 'Falta correr 27_facturas_de_mantenimiento.sql.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1. Miembros del equipo
--
-- Una fila por usuario, con el nombre que se muestra en el tablero. Se
-- crea sola cuando se da de alta a alguien en Authentication → Users, y
-- las que ya existen se completan acá con lo que va antes de la @, que
-- cada uno puede cambiar desde el tablero.
-- ---------------------------------------------------------------------
create table if not exists miembros (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nombre     text not null,
  created_at timestamptz not null default now()
);

alter table miembros enable row level security;
drop policy if exists miembros_ver on miembros;
create policy miembros_ver on miembros
  for select to authenticated using (true);
-- Cada uno edita sólo su propio nombre.
drop policy if exists miembros_editar_propio on miembros;
create policy miembros_editar_propio on miembros
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function nombre_inicial(p_email text)
returns text
language sql
immutable
as $$
  select initcap(replace(replace(split_part(coalesce(p_email, ''), '@', 1), '.', ' '), '_', ' '))
$$;

insert into miembros (user_id, nombre)
select u.id, coalesce(nullif(btrim(nombre_inicial(u.email)), ''), 'Sin nombre')
  from auth.users u
on conflict (user_id) do nothing;

create or replace function alta_de_miembro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.miembros (user_id, nombre)
  values (new.id, coalesce(nullif(btrim(public.nombre_inicial(new.email)), ''), 'Sin nombre'))
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists miembros_alta on auth.users;
create trigger miembros_alta after insert on auth.users
  for each row execute function alta_de_miembro();


-- ---------------------------------------------------------------------
-- 2. Metas
-- ---------------------------------------------------------------------
create table if not exists metas (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null check (btrim(titulo) <> ''),
  detalle        text not null default '',
  fecha_objetivo date,
  estado         text not null default 'activa'
                 check (estado in ('activa', 'lograda', 'archivada')),
  creado_por     uuid default auth.uid() references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table metas enable row level security;
drop policy if exists authenticated_all on metas;
create policy authenticated_all on metas
  for all to authenticated using (true) with check (true);


-- ---------------------------------------------------------------------
-- 3. Tareas del equipo
--
-- Se llama `tareas_equipo` y no `tareas` porque `project_tasks` (los
-- pendientes de cada proyecto) ya existe y es otra cosa: aquellos son
-- checklists del proyecto, éstas son el trabajo de una persona.
--
-- `responsable_id` arranca en quien la crea: la idea es que cada uno
-- cargue lo suyo. Se puede cambiar, pero no es la regla.
-- ---------------------------------------------------------------------
create table if not exists tareas_equipo (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null check (btrim(titulo) <> ''),
  detalle        text not null default '',
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente', 'en_curso', 'bloqueada', 'hecha')),
  responsable_id uuid default auth.uid() references auth.users(id) on delete set null,
  meta_id        uuid references metas(id) on delete set null,
  project_id     uuid references projects(id) on delete set null,
  fecha_limite   date,
  orden          double precision not null default extract(epoch from now()),
  hecha_at       timestamptz,
  creado_por     uuid default auth.uid() references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists tareas_equipo_estado_idx on tareas_equipo (estado, orden);
create index if not exists tareas_equipo_responsable_idx on tareas_equipo (responsable_id, estado);
create index if not exists tareas_equipo_meta_idx on tareas_equipo (meta_id);

alter table tareas_equipo enable row level security;
drop policy if exists authenticated_all on tareas_equipo;
create policy authenticated_all on tareas_equipo
  for all to authenticated using (true) with check (true);

-- `hecha_at` y `updated_at` se mantienen solos.
create or replace function tareas_equipo_sellos()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.estado = 'hecha' and (tg_op = 'INSERT' or old.estado is distinct from 'hecha') then
    new.hecha_at := now();
  elsif new.estado <> 'hecha' then
    new.hecha_at := null;
  end if;
  return new;
end $$;

drop trigger if exists tareas_equipo_sellos on tareas_equipo;
create trigger tareas_equipo_sellos before insert or update on tareas_equipo
  for each row execute function tareas_equipo_sellos();

create or replace function metas_sello()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists metas_sello on metas;
create trigger metas_sello before update on metas
  for each row execute function metas_sello();


-- ---------------------------------------------------------------------
-- 4. Push por persona
--
-- Cada celular pasa a saber de quién es. Los que ya estaban suscriptos
-- quedan con `user_id` null hasta que su dueño abra el dashboard: la app
-- los vincula sola al cargar (ver `vincularDispositivo()` en lib/push.ts).
-- Mientras tanto reciben los avisos para todos, pero no los personales.
--
-- `notifications.user_id` null = para todos, como hasta ahora.
-- ---------------------------------------------------------------------
alter table push_subscriptions
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table push_subscriptions
  alter column user_id set default auth.uid();
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

alter table notifications
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Aviso para una sola persona. Es una función aparte y no un parámetro
-- más de `notificar()`: `emitir_recibo` pregunta por la firma exacta
-- `notificar(text,text,text,text)` y cambiarla lo dejaría mudo (ver 24).
create or replace function notificar_a(
  p_user   uuid,
  p_title  text,
  p_body   text default '',
  p_url    text default '/',
  p_dedupe text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into notifications (user_id, title, body, url, dedupe_key)
  values (p_user, p_title, p_body, p_url, p_dedupe)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
$$;

revoke all on function notificar_a(uuid, text, text, text, text) from public;


-- ---------------------------------------------------------------------
-- 5. Apagar los avisos que ya no se quieren
--
-- Quedan: cobro registrado, mantenimiento cobrado, recibo emitido (los
-- tres son cobros) y movimiento de caja. Se van los demás.
-- ---------------------------------------------------------------------
drop trigger if exists projects_avisar          on projects;
drop trigger if exists notes_avisar             on notes;
drop trigger if exists project_tasks_avisar     on project_tasks;

do $$
begin
  if to_regclass('public.fixed_expenses') is not null then
    execute 'drop trigger if exists fixed_expenses_avisar on fixed_expenses';
  end if;
  if to_regclass('public.tickets') is not null then
    execute 'drop trigger if exists tickets_avisar_nuevo on tickets';
    execute 'drop trigger if exists tickets_avisar_resuelto on tickets';
  end if;
end $$;

-- La propuesta emitida avisa desde adentro de `emitir_propuesta()`, que
-- es larga y no conviene reescribir para sacarle tres líneas. Se corta
-- en la entrada: `notificar()` ignora lo que apunta a /propuestas. Misma
-- firma, así que `emitir_recibo` la sigue encontrando.
create or replace function notificar(
  p_title  text,
  p_body   text default '',
  p_url    text default '/',
  p_dedupe text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_url like '/propuestas%' then
    return;
  end if;
  insert into notifications (title, body, url, dedupe_key)
  values (p_title, p_body, p_url, p_dedupe)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
end $$;

-- Los relojes diarios viejos: mantenimiento sin cobrar (lo reemplaza el
-- del 1 al 10), dominios, notas, proyectos demorados y gastos fijos.
select cron.unschedule('revisar-vencimientos')
 where exists (select 1 from cron.job where jobname = 'revisar-vencimientos');
select cron.unschedule('revisar-gastos')
 where exists (select 1 from cron.job where jobname = 'revisar-gastos');

-- Lo que quedó en la cola de esos avisos no se manda: se marca como
-- descartado para que no llegue de golpe cuando se redeploye la función.
update notifications
   set sent_at = now(), last_error = 'descartado: aviso apagado en el paso 28'
 where sent_at is null
   and url not like '/cobros%'
   and url not like '/caja%'
   and url not like '/gastos%'
   and url not like '/mantenimientos%';


-- ---------------------------------------------------------------------
-- 6. Tareas por vencer, al responsable
--
-- 3 días antes, el día anterior y el mismo día. Pasada la fecha, todos
-- los días hasta que se marque como hecha o se cambie la fecha. Una
-- tarea sin fecha límite no avisa nunca.
-- ---------------------------------------------------------------------
create or replace function revisar_tareas()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  r record;
  faltan int;
  titulo text;
  contexto text;
begin
  for r in
    select t.id, t.titulo, t.responsable_id, t.fecha_limite, t.estado,
           m.titulo as meta, p.name as proyecto
      from tareas_equipo t
      left join metas m on m.id = t.meta_id
      left join projects p on p.id = t.project_id
     where t.estado <> 'hecha'
       and t.fecha_limite is not null
       and t.responsable_id is not null
       and t.fecha_limite <= hoy + 3
  loop
    faltan := r.fecha_limite - hoy;
    continue when faltan = 2;

    titulo := case
      when faltan = 3 then 'Te quedan 3 días · '
      when faltan = 1 then 'Vence mañana · '
      when faltan = 0 then 'Vence hoy · '
      else 'Vencida hace ' || abs(faltan) || ' día(s) · '
    end || r.titulo;

    contexto := concat_ws(' · ',
      case when r.estado = 'bloqueada' then 'Está bloqueada' end,
      'Meta: ' || r.meta,
      'Proyecto: ' || r.proyecto);

    perform notificar_a(
      r.responsable_id,
      titulo,
      coalesce(nullif(contexto, '') || '. ', '')
        || 'Si ya está, marcala como hecha; si no llega, cambiale la fecha.',
      '/tablero',
      'tarea-' || r.id || '-' || hoy
    );
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 7. Cobrar mantenimiento, del 1 al 10, a todos
--
-- Del 1 al 10 se cobra el mes que pasó (mes vencido, paso 27). Todos los
-- días de esa ventana sale UN aviso para todos con los proyectos que
-- todavía no tienen ese mes cobrado. En cuanto se registra el cobro, al
-- día siguiente ese proyecto ya no aparece; cuando no queda ninguno, no
-- sale nada.
--
-- Cobrado = lo mismo que el paso 27: un `maintenance_charge` que tapa el
-- período, o la factura de ese mes cancelada.
--
-- Sólo planes activos de proyectos implementados o en mantenimiento. En
-- los planes trimestrales, semestrales o anuales, sólo los meses en que
-- les toca cobrar.
-- ---------------------------------------------------------------------
create or replace function revisar_cobros_mantenimiento()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hoy    date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  mes    date := date_trunc('month', hoy)::date;
  meses  text[] := array['enero','febrero','marzo','abril','mayo','junio','julio',
                         'agosto','septiembre','octubre','noviembre','diciembre'];
  r      record;
  paso   interval;
  venc   date;
  per    date;
  lista  text[] := '{}';
  nombres text[] := '{}';
  cuerpo text;
begin
  if extract(day from hoy) > 10 then
    return;
  end if;

  for r in
    select p.id, p.name, m.amount, m.currency::text as mon, m.frequency::text as freq,
           m.due_day, coalesce(m.start_date, m.implementation_date) as desde
      from project_maintenance m
      join projects p on p.id = m.project_id
     where m.status = 'Activo'
       and p.status in ('Implementado', 'En mantenimiento')
       and coalesce(m.start_date, m.implementation_date) is not null
     order by p.name
  loop
    paso := case r.freq
      when 'Mensual' then interval '1 month'
      when 'Trimestral' then interval '3 months'
      when 'Semestral' then interval '6 months'
      else interval '12 months' end;

    -- La misma serie que el paso 27: el primer cobro es el primer día de
    -- cobro DESPUÉS del arranque.
    venc := make_date(extract(year from r.desde)::int,
                      extract(month from r.desde)::int,
                      least(r.due_day, 28));
    while venc <= r.desde loop
      venc := (venc + paso)::date;
    end loop;
    while date_trunc('month', venc)::date < mes loop
      venc := (venc + paso)::date;
    end loop;

    -- Este mes no le toca cobrar (todavía no arrancó, o es trimestral).
    continue when date_trunc('month', venc)::date <> mes;

    per := date_trunc('month', venc - paso)::date;

    continue when exists (
      select 1 from maintenance_charges c
       where c.project_id = r.id
         and c.charged_on >= venc - interval '10 days'
         and c.charged_on <  venc + paso
    ) or exists (
      select 1 from facturas f
       where f.project_id = r.id
         and f.periodo = per
         and round(f.importe, 2) <= (
           select round(coalesce(sum(
                    case when pa.currency = f.moneda then pa.amount
                         else coalesce(pa.applied_amount, 0) end), 0), 2)
             from payments pa
            where pa.factura_id = f.id)
    );

    nombres := nombres || r.name;
    lista := lista || (r.name || ' ' || r.mon || ' '
      || to_char(r.amount, 'FM999G999G999D00')
      || ' (' || meses[extract(month from per)::int] || ')');
  end loop;

  if array_length(lista, 1) is null then
    return;
  end if;

  cuerpo := array_to_string(lista, ' · ');
  if length(cuerpo) > 220 then
    cuerpo := left(cuerpo, 217) || '…';
  end if;
  cuerpo := cuerpo || case
    when extract(day from hoy) = 10 then '. Hoy es el último día para cobrar.'
    else '. Quedan ' || (10 - extract(day from hoy)::int) || ' día(s) para el 10.'
  end;

  perform notificar(
    case when array_length(nombres, 1) = 1
         then 'Cobrar mantenimiento · ' || nombres[1]
         else 'Cobrar mantenimiento · ' || array_length(nombres, 1) || ' proyectos'
    end,
    cuerpo,
    '/mantenimientos',
    'cobrar-mnt-' || hoy
  );
end $$;


-- ---------------------------------------------------------------------
-- 8. El reloj: todos los días a las 9:00 de Buenos Aires (12:00 UTC)
-- ---------------------------------------------------------------------
select cron.unschedule('avisos-diarios')
 where exists (select 1 from cron.job where jobname = 'avisos-diarios');

select cron.schedule('avisos-diarios', '0 12 * * *', $cron$
  select revisar_tareas();
  select revisar_cobros_mantenimiento();
$cron$);


-- ---------------------------------------------------------------------
-- 9. Verificación
--
-- La última sección muestra los últimos avisos de cobros y caja que se
-- encolaron, y si se mandaron. Sirve para ver si esos avisos llegan:
-- si aparecen con `sent_at` y sin error, el problema es del celular.
-- ---------------------------------------------------------------------
select * from (
  select 1 as orden, 'miembros' as que, count(*)::text as detalle from miembros
  union all
  select 2, 'tablas del tablero',
         (to_regclass('public.metas') is not null and to_regclass('public.tareas_equipo') is not null)::text
  union all
  select 3, 'celulares sin dueño (se vinculan al abrir la app)',
         count(*)::text from push_subscriptions where user_id is null
  union all
  select 4, 'triggers de aviso que quedan',
         string_agg(tgname, ', ' order by tgname)
    from pg_trigger where tgname like '%_avisar%' and not tgisinternal
  union all
  select 5, 'relojes',
         string_agg(jobname || ' (' || schedule || ')', ', ' order by jobname) from cron.job
  union all
  select 6, 'últimos avisos de cobros y caja',
         coalesce(string_agg(x, ' | '), 'ninguno')
    from (
      select to_char(created_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI')
             || ' ' || title
             || case when sent_at is null then ' [EN COLA]'
                     when last_error is not null then ' [' || last_error || ']'
                     else ' [mandado]' end as x
        from notifications
       where url like '/cobros%' or url like '/caja%' or url like '/gastos%'
       order by created_at desc
       limit 5
    ) u
) v
order by orden;
