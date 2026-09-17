-- =====================================================================
-- REVISIÓN — ¿la anon key puede leer o escribir algo?
--
-- Sólo lee. No cambia nada. Se puede correr cuando sea.
--
-- La pregunta que contesta: alguien que abre el navegador, saca la
-- NEXT_PUBLIC_SUPABASE_ANON_KEY del bundle —está ahí, es su función— y
-- pega contra la API sin loguearse, ¿qué ve?
--
-- Para que vea algo tienen que darse DOS cosas a la vez:
--   1. que el rol `anon` tenga permiso sobre la tabla (GRANT), y
--   2. que alguna política de RLS lo deje pasar.
-- Con que falte una, no entra. Por eso se miran las dos.
--
-- El sospechoso es `05_dev_anon_policies.sql`, que crea políticas
-- `dev_anon_all` y cuyo encabezado dice que hay que revertirlo cuando
-- exista el login. Pero no se busca sólo ese nombre: se busca CUALQUIER
-- política que alcance a anon, venga de donde venga.
-- =====================================================================

set search_path = public;


-- ---------------------------------------------------------------------
-- 1. El veredicto, en un renglón
-- ---------------------------------------------------------------------
select
  count(*) filter (
    where 'anon' = any(p.roles) or 'public' = any(p.roles)
  ) as politicas_que_alcanzan_a_anon,
  case
    when count(*) filter (
      where 'anon' = any(p.roles) or 'public' = any(p.roles)
    ) = 0
    then 'LIMPIO — ninguna politica deja pasar a anon'
    else 'ABIERTO — hay politicas que dejan pasar a anon, ver detalle abajo'
  end as veredicto
from pg_policies p
where p.schemaname = 'public';


-- ---------------------------------------------------------------------
-- 2. Cuáles son, si las hay
--
-- Ojo con `public` en la columna de roles: NO significa «la app». En
-- Postgres `public` es «todos los roles», anon incluido. Una política
-- `to public` abre lo mismo que una `to anon`, y se lee como si fuera
-- inofensiva.
-- ---------------------------------------------------------------------
select
  p.tablename,
  p.policyname,
  p.cmd            as operacion,
  p.roles,
  p.qual           as condicion_lectura,
  p.with_check     as condicion_escritura
from pg_policies p
where p.schemaname = 'public'
  and ('anon' = any(p.roles) or 'public' = any(p.roles))
order by p.tablename, p.policyname;


-- ---------------------------------------------------------------------
-- 3. Tablas con RLS apagado
--
-- Esto es peor que una política abierta: sin RLS no hay nada que filtre,
-- y alcanza con que el rol tenga el GRANT. Una tabla nueva creada a mano
-- desde el editor arranca así.
-- ---------------------------------------------------------------------
select
  c.relname as tabla,
  'RLS APAGADO' as estado
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and not c.relrowsecurity
order by c.relname;


-- ---------------------------------------------------------------------
-- 4. Qué le está permitido al rol anon, tabla por tabla
--
-- Son los GRANT, la otra mitad del candado. Supabase se los da por
-- defecto a todas las tablas nuevas de `public`, asi que lo normal es que
-- esta lista tenga MUCHAS filas y no pase nada: sin política que lo deje
-- pasar, el GRANT solo no sirve.
--
-- Importa cuando se cruza con las secciones 2 y 3.
-- ---------------------------------------------------------------------
select
  g.table_name as tabla,
  string_agg(distinct g.privilege_type, ', ' order by g.privilege_type) as permisos
from information_schema.role_table_grants g
where g.table_schema = 'public'
  and g.grantee = 'anon'
group by g.table_name
order by g.table_name;


-- ---------------------------------------------------------------------
-- 5. Las funciones que puede ejecutar anon
--
-- Las `security definer` corren con los permisos de quien las creó y se
-- saltean RLS por completo. Una sola ejecutable por anon alcanza para
-- abrir todo lo que esa función toque. Acá sólo tendrían que aparecer
-- funciones que de verdad quieras públicas.
-- ---------------------------------------------------------------------
select
  p.proname as funcion,
  case when p.prosecdef then 'SECURITY DEFINER' else 'invoker' end as modo
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and has_function_privilege('anon', p.oid, 'execute')
order by p.prosecdef desc, p.proname;
