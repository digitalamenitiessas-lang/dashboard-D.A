-- =====================================================================
-- PASO 12 — SEGUIMIENTOS: los acercamientos antes de que haya proyecto
--
-- UNA tabla nueva, `seguimientos`. Un renglón por CONTACTO —la reunión,
-- la llamada, el mail— y no por prospecto. El hilo de un prospecto es
-- el conjunto de sus contactos, y su estado se lee del más reciente.
--
-- Por qué no hay tabla de prospectos con su propio estado: seria una
-- segunda fuente para el mismo dato. Alcanzaria con cargar una reunion y
-- olvidarse de tocar el estado de arriba para que la pantalla dijera
-- «esperamos respuesta» sobre algo que se cerro la semana pasada. Es la
-- misma regla que ya rige en `fixed_expenses` (sin columna status) y en
-- `tickets` (sin columna status): lo derivado no se guarda.
--
-- `prospecto` es TEXTO LIBRE y no un `client_id`. Anotar una reunion con
-- alguien de quien todavia no se sabe nada no deberia exigir crearle una
-- ficha antes. El costo conocido es que la misma empresa se escriba de
-- tres formas, y por eso el agrupado no usa este campo crudo sino
-- `prospecto_key`, que la base deriva sola (punto 2).
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
end $$;


-- ---------------------------------------------------------------------
-- 1. Los dos enums
--
-- Enum y no texto libre, por lo mismo que `expense_kind` y `ticket_kind`:
-- en seis meses habria 'reunion', 'Reunion' y 'meet' y la pregunta «¿por
-- donde entran los clientes?» dejaria de tener respuesta.
--
-- `seguimiento_estado` es de qué lado quedó la pelota después de ESE
-- contacto. Los dos primeros valores son la negociación viva; los dos
-- últimos la cierran. El orden de declaración importa poco acá porque no
-- se ordena por este campo, pero se declara de vivo a cerrado igual.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'seguimiento_kind') then
    create type seguimiento_kind as enum (
      'Reunión', 'Llamada', 'Mail', 'WhatsApp', 'Visita', 'Otro'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'seguimiento_estado') then
    create type seguimiento_estado as enum (
      'Pelota nuestra', 'Pelota de ellos', 'Ganado', 'Perdido'
    );
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 2. La tabla
--
-- `prospecto_key` es una columna GENERADA, no un trigger ni un cálculo de
-- la app: así vale igual para lo que carga la pantalla y para lo que
-- alguien inserte a mano por SQL, que en este repo pasa todas las
-- semanas. Baja a minúsculas y colapsa los espacios de más, que son los
-- dos errores de tipeo que de verdad ocurren.
--
-- Lo que NO hace es sacar acentos: eso necesita la extensión `unaccent`,
-- que no está instalada, y agregarla obligaría a que el índice y el
-- esquema dependan de ella. «Mediterráneo» y «Mediterraneo» siguen siendo
-- dos prospectos distintos. La defensa contra eso es el autocompletado
-- del diálogo, que ofrece los nombres ya cargados para que nadie invente
-- una grafía nueva.
-- ---------------------------------------------------------------------
create table if not exists seguimientos (
  id            uuid primary key default gen_random_uuid(),

  prospecto     text not null check (length(btrim(prospecto)) > 0),

  prospecto_key text generated always as (
    lower(btrim(regexp_replace(prospecto, '\s+', ' ', 'g')))
  ) stored,

  contacted_on  date not null default current_date,
  kind          seguimiento_kind not null default 'Reunión',

  -- Quiénes estuvieron, de los dos lados. Texto libre a propósito: son
  -- personas que en general no están en ninguna tabla.
  attendees     text not null default '',

  -- Qué se habló y cómo fue.
  summary       text not null default '',

  estado        seguimiento_estado not null default 'Pelota nuestra',

  -- Cuándo retomar. Null = no quedó fecha.
  next_contact_on date,

  created_at    timestamptz not null default now(),

  -- No se puede quedar en volver a contactar ANTES del contacto que lo
  -- decidió: seria una fecha que ya nacio vencida y alertaria para
  -- siempre.
  constraint seguimientos_proximo_despues_del_contacto
    check (next_contact_on is null or next_contact_on >= contacted_on)
);

-- El índice que sostiene la pantalla: agrupar por prospecto y, adentro,
-- el contacto más reciente primero (que es el que define el estado).
create index if not exists seguimientos_prospecto_idx
  on seguimientos (prospecto_key, contacted_on desc, created_at desc);

-- Los que hay que retomar, que es lo que mira el motor de alertas.
create index if not exists seguimientos_proximos_idx
  on seguimientos (next_contact_on)
  where next_contact_on is not null and estado = 'Pelota nuestra';

comment on table seguimientos is
  'Un renglón por contacto con un prospecto. El estado del prospecto se '
  'lee del contacto más reciente, no se guarda aparte.';

comment on column seguimientos.prospecto_key is
  'prospecto normalizado (minúsculas, espacios colapsados). Clave de '
  'agrupado. No saca acentos: haría falta la extensión unaccent.';

comment on column seguimientos.estado is
  'De qué lado quedó la pelota DESPUÉS de este contacto.';


-- ---------------------------------------------------------------------
-- 3. RLS — mismo criterio que el resto: sólo usuarios autenticados.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['seguimientos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists authenticated_all on public.%I', t);
    execute format(
      'create policy authenticated_all on public.%I
         for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 4. Verificación
-- ---------------------------------------------------------------------
select * from (

  select 1 as orden, '1· ESTRUCTURA' as seccion,
         o.item,
         case when o.ok then '✓ está' else '✗ FALTA' end as detalle
  from (
    select 'tipo seguimiento_kind' as item,
           exists (select 1 from pg_type where typname = 'seguimiento_kind') as ok
    union all select 'tipo seguimiento_estado',
           exists (select 1 from pg_type where typname = 'seguimiento_estado')
    union all select 'tabla seguimientos',
           to_regclass('public.seguimientos') is not null
    union all select 'columna generada prospecto_key',
           exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'seguimientos'
                      and column_name = 'prospecto_key'
                      and is_generated = 'ALWAYS')
    union all select 'check próximo contacto >= contacto',
           exists (select 1 from pg_constraint
                    where conname = 'seguimientos_proximo_despues_del_contacto')
    union all select 'índice de agrupado por prospecto',
           exists (select 1 from pg_class where relname = 'seguimientos_prospecto_idx')
    union all select 'RLS authenticated_all en seguimientos',
           exists (select 1 from pg_policies
                    where schemaname = 'public' and tablename = 'seguimientos'
                      and policyname = 'authenticated_all')
  ) o

  union all
  -- Un renglón por PROSPECTO, con su estado actual: el del contacto más
  -- reciente. Es la misma lectura que hace la pantalla.
  select 2, '2· PROSPECTOS',
         s.prospecto,
         s.estado::text || ' · ' || s.contactos || ' contacto(s)' ||
           case when s.next_contact_on is not null
                then ' · retomar ' || s.next_contact_on::text else '' end
  from (
    select distinct on (prospecto_key)
           prospecto, estado, next_contact_on,
           count(*) over (partition by prospecto_key) as contactos
      from seguimientos
     order by prospecto_key, contacted_on desc, created_at desc
  ) s

) x
order by orden, item;
