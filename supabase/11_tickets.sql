-- =====================================================================
-- PASO 11 — TICKETS: reclamos y pedidos de clientes
--
-- UNA tabla nueva, `tickets`, y dos triggers de aviso.
--
-- Un ticket cuelga SIEMPRE de un proyecto (`project_id not null`). El
-- cliente no se guarda acá: sale del proyecto. Guardarlo también sería
-- una segunda fuente para el mismo dato, y el día que un proyecto cambie
-- de cliente los tickets viejos seguirían apuntando al anterior.
--
-- NO HAY COLUMNA `status`. El estado se lee de `resolved_at`:
--
--     resolved_at is null  →  Abierto
--     resolved_at not null →  Resuelto
--
-- Es la misma decisión que `fixed_expenses.ended_on` en el paso 10 y por
-- el mismo motivo: un `status` al lado de una fecha son dos formas de
-- decir lo mismo, y una de las dos siempre termina mintiendo — un ticket
-- 'Resuelto' sin fecha de resolución, o con fecha y todavía 'Abierto'.
-- Resolver es poner la fecha. Reabrir es sacarla.
--
-- `grade` es un smallint 1..3 y no un enum, porque la urgencia es
-- ORDINAL: `grade >= 2` significa lo mismo en SQL y en TypeScript, sin
-- depender del orden en que se declararon los valores de un tipo.
--
--   1 · Baja     — sin apuro
--   2 · Media    — para esta semana
--   3 · Urgente  — hay que verlo ya
--
-- Requiere 03_schema.sql. Los avisos push requieren además 20_push.sql,
-- pero si no está corrido el script NO falla: crea la tabla igual y
-- saltea los triggers (ver punto 4).
--
-- Es idempotente: se puede correr de nuevo sin romper nada.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Freno de mano
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.projects') is null then
    raise exception 'Falta correr 03_schema.sql: no existe projects.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1. De qué se trata
--
-- Enum y no texto libre, por lo mismo que `expense_kind`: en seis meses
-- habría 'reclamo', 'Reclamo' y 'queja', y «¿qué nos piden más?» dejaría
-- de tener respuesta. Arranca generosa a propósito, porque agregar un
-- valor después es un script nuevo — y `alter type ... add value` no
-- deja usar el valor recién agregado en la misma transacción.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ticket_kind') then
    create type ticket_kind as enum (
      'Reclamo',
      'Pedido',
      'Consulta',
      'Incidencia',
      'Mejora',
      'Otro'
    );
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 2. La tabla
--
-- `on delete cascade`: los tickets de un proyecto son del proyecto. Si el
-- proyecto se borra, no queda un reclamo apuntando al vacío. No es como
-- `fixed_expenses`, que es RESTRICT porque ahí hay plata de por medio;
-- acá no hay nada que reconciliar.
--
-- `resolution` es texto y no null: vacío mientras está abierto, con el
-- qué-se-hizo cuando se resuelve. El CHECK de más abajo impide la
-- combinación imposible (resolución cargada en un ticket abierto).
-- ---------------------------------------------------------------------
create table if not exists tickets (
  id          uuid primary key default gen_random_uuid(),

  project_id  uuid not null references projects(id) on delete cascade,

  kind        ticket_kind not null default 'Pedido',

  -- 1 baja · 2 media · 3 urgente. Ordinal, por eso número y no enum.
  grade       smallint not null default 1 check (grade between 1 and 3),

  title       text not null check (length(btrim(title)) > 0),
  detail      text not null default '',

  created_at  timestamptz not null default now(),

  -- El único estado que se guarda. Null = abierto.
  resolved_at timestamptz,

  -- Qué se hizo. Vacío mientras está abierto.
  resolution  text not null default '',

  -- Un ticket abierto no puede tener resolución escrita: sería un
  -- "ya lo arreglamos" en algo que figura como pendiente.
  constraint tickets_resolucion_solo_si_resuelto
    check (resolved_at is not null or resolution = ''),

  -- No se puede resolver antes de existir. Es seguro tenerlo porque la
  -- fecha la sella la base (punto 2b) y no el reloj del celular.
  constraint tickets_resuelto_despues_de_creado
    check (resolved_at is null or resolved_at >= created_at)
);


-- ---------------------------------------------------------------------
-- 2b. La fecha de resolución la pone la BASE, no el celular
--
-- La app manda un timestamp al resolver, pero acá se pisa con `now()`.
-- No es desconfianza abstracta: los celulares tienen la hora corrida, y
-- uno atrasado un minuto escribiría un `resolved_at` ANTERIOR al
-- `created_at` de un ticket recién cargado — el CHECK de arriba
-- rechazaría la operación y el usuario vería un error incomprensible al
-- tocar «Resolver».
--
-- Como efecto secundario, «resuelto» pasa a significar siempre la misma
-- cosa: el instante en que la base lo registró. Nadie puede backdatear
-- una resolución cambiándose la hora del teléfono.
--
-- Sólo actúa en la transición a resuelto. Reabrir (poner null) pasa
-- derecho, y un UPDATE que toca el título de un ticket ya resuelto no le
-- corre la fecha.
-- ---------------------------------------------------------------------
create or replace function sellar_resolucion_ticket()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.resolved_at is not null
     and (tg_op = 'INSERT' or old.resolved_at is null) then
    new.resolved_at := now();
  elsif tg_op = 'UPDATE' and new.resolved_at is not null then
    -- Ya estaba resuelto: la fecha original no se mueve.
    new.resolved_at := old.resolved_at;
  end if;
  return new;
end $$;

drop trigger if exists tickets_sellar_resolucion on tickets;
create trigger tickets_sellar_resolucion before insert or update on tickets
  for each row execute function sellar_resolucion_ticket();

-- El índice que sostiene la pantalla: abiertos primero, el más urgente
-- arriba. Parcial sobre los abiertos, que son los que se miran todo el
-- día; los resueltos se leen por fecha y van en el índice de abajo.
create index if not exists tickets_abiertos_idx
  on tickets (grade desc, created_at desc)
  where resolved_at is null;

create index if not exists tickets_resueltos_idx
  on tickets (resolved_at desc)
  where resolved_at is not null;

create index if not exists tickets_project_idx on tickets (project_id, created_at desc);

comment on table tickets is
  'Reclamos y pedidos de clientes, siempre contra un proyecto. El estado '
  'no se guarda: resolved_at null = abierto, con fecha = resuelto.';

comment on column tickets.grade is
  'Urgencia ordinal: 1 baja, 2 media, 3 urgente.';

comment on column tickets.resolved_at is
  'El estado. Null = abierto. Resolver es poner la fecha, reabrir es sacarla.';


-- ---------------------------------------------------------------------
-- 3. El tipo de actividad
--
-- Va suelto y no adentro de un do $$: `add value` es la única sentencia
-- de este script con alergia a los bloques. Y NO se usa en ninguna parte
-- del script, justamente porque un valor recién agregado no se puede
-- usar en la misma transacción — la app lo escribe después, desde otra.
-- ---------------------------------------------------------------------
alter type activity_type add value if not exists 'ticket';


-- ---------------------------------------------------------------------
-- 4. Los avisos push
--
-- Dos: uno cuando se carga un ticket y otro cuando se resuelve. Como
-- todo en este repo, el trigger NO manda nada — sólo encola con
-- `notificar()`, y si el push falla el guardado del usuario no se rompe.
--
-- `dedupe_key` va en null a propósito en los dos casos: un ticket nuevo
-- y una resolución son hechos únicos, no vencimientos que se repiten
-- todos los días. El dedupe es para lo segundo.
--
-- Si `20_push.sql` todavía no se corrió, `notificar()` no existe: el
-- bloque se saltea entero y la tabla queda igual de usable, sin avisos.
-- Corré 20_push.sql y después este script de nuevo, y los triggers se
-- crean.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.notificar(text,text,text,text)') is null then
    raise notice
      'Sin avisos push: falta correr 20_push.sql (no existe la función '
      'notificar). La tabla tickets queda creada igual. Corré 20_push.sql '
      'y volvé a correr este script para activar los triggers.';
    return;
  end if;

  -- Ticket nuevo. El grado va en el título porque es lo único que decide
  -- si vale la pena desbloquear el celular ahora o mirarlo más tarde.
  execute $fn$
    create or replace function avisar_ticket_nuevo()
    returns trigger language plpgsql security definer set search_path = public as $body$
    declare proyecto text; cliente text;
    begin
      select p.name, c.name into proyecto, cliente
        from projects p
        left join clients c on c.id = p.client_id
       where p.id = new.project_id;

      perform notificar(
        'Grado ' || new.grade || ' · ' || new.kind::text || ' · ' ||
          coalesce(proyecto, 'sin proyecto'),
        new.title ||
          case when cliente is not null and cliente <> ''
               then ' — ' || cliente else '' end,
        '/tickets'
      );
      return new;
    end $body$;
  $fn$;

  execute 'drop trigger if exists tickets_avisar_nuevo on tickets';
  execute 'create trigger tickets_avisar_nuevo after insert on tickets
             for each row execute function avisar_ticket_nuevo()';

  -- Resuelto. Sólo en la transición abierto → resuelto: un UPDATE que
  -- corrige el título de un ticket ya resuelto no vuelve a avisar.
  execute $fn$
    create or replace function avisar_ticket_resuelto()
    returns trigger language plpgsql security definer set search_path = public as $body$
    declare proyecto text;
    begin
      select name into proyecto from projects where id = new.project_id;

      perform notificar(
        'Resuelto · ' || coalesce(proyecto, 'sin proyecto'),
        new.title ||
          case when btrim(new.resolution) <> ''
               then ' — ' || left(new.resolution, 100) else '' end,
        '/tickets'
      );
      return new;
    end $body$;
  $fn$;

  execute 'drop trigger if exists tickets_avisar_resuelto on tickets';
  execute 'create trigger tickets_avisar_resuelto after update on tickets
             for each row
             when (old.resolved_at is null and new.resolved_at is not null)
             execute function avisar_ticket_resuelto()';
end $$;


-- ---------------------------------------------------------------------
-- 5. RLS — mismo criterio que el resto: sólo usuarios autenticados.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['tickets']
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
-- Si la fila de los triggers dice ✗ FALTA, es que todavía no corriste
-- 20_push.sql: la ticketera funciona, pero sin avisos al celular.
-- ---------------------------------------------------------------------
select * from (

  select 1 as orden, '1· ESTRUCTURA' as seccion,
         o.item,
         case when o.ok then '✓ está' else '✗ FALTA' end as detalle
  from (
    select 'tipo ticket_kind' as item,
           exists (select 1 from pg_type where typname = 'ticket_kind') as ok
    union all select 'tabla tickets',
           to_regclass('public.tickets') is not null
    union all select 'check resolución sólo si resuelto',
           exists (select 1 from pg_constraint
                    where conname = 'tickets_resolucion_solo_si_resuelto')
    union all select 'check resuelto después de creado',
           exists (select 1 from pg_constraint
                    where conname = 'tickets_resuelto_despues_de_creado')
    union all select 'índice de abiertos (grado desc)',
           exists (select 1 from pg_class where relname = 'tickets_abiertos_idx')
    union all select 'trigger que sella la fecha de resolución',
           exists (select 1 from pg_trigger where tgname = 'tickets_sellar_resolucion')
    union all select 'valor ''ticket'' en activity_type',
           exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                    where t.typname = 'activity_type' and e.enumlabel = 'ticket')
    union all select 'trigger de aviso: ticket nuevo  (necesita 20_push.sql)',
           exists (select 1 from pg_trigger where tgname = 'tickets_avisar_nuevo')
    union all select 'trigger de aviso: ticket resuelto (necesita 20_push.sql)',
           exists (select 1 from pg_trigger where tgname = 'tickets_avisar_resuelto')
    union all select 'RLS authenticated_all en tickets',
           exists (select 1 from pg_policies
                    where schemaname = 'public' and tablename = 'tickets'
                      and policyname = 'authenticated_all')
  ) o

  union all
  select 2, '2· TICKETS CARGADOS',
         case when t.resolved_at is null
              then 'ABIERTO · grado ' || t.grade else 'resuelto' end,
         t.title || ' — ' || coalesce(p.name, '?')
  from tickets t
  left join projects p on p.id = t.project_id

) x
order by orden, item;
