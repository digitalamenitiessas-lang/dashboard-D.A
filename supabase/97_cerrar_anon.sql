-- =====================================================================
-- CERRAR EL ACCESO ANÓNIMO
--
-- Correr SÓLO si `96_revisar_anon.sql` encontró políticas que alcanzan a
-- anon. Es el bloque de REVERTIR que `05_dev_anon_policies.sql` dejó
-- comentado al final, con dos diferencias:
--
--   - Busca las políticas en vez de asumir la lista de diez tablas de
--     2024. Si alguien agregó una tabla después y le copió la política,
--     esa también se cierra.
--   - Dice qué hizo, antes y después.
--
-- NO toca los GRANT. En Supabase el rol anon tiene permisos sobre las
-- tablas de `public` por defecto, y sacárselos rompe cosas que no se ven
-- desde acá. Con RLS activo y sin política que lo deje pasar, el GRANT
-- solo no abre nada: la puerta queda cerrada igual.
--
-- Es idempotente: correrlo dos veces no hace nada la segunda.
-- =====================================================================

set search_path = public;

do $$
declare
  r        record;
  cerradas int := 0;
begin
  -- Antes
  raise notice '--- politicas que alcanzaban a anon ---';
  for r in
    select tablename, policyname, roles
      from pg_policies
     where schemaname = 'public'
       and ('anon' = any(roles) or 'public' = any(roles))
     order by tablename, policyname
  loop
    raise notice '  %.% (roles: %)', r.tablename, r.policyname, r.roles;
  end loop;

  -- Se borran las que abren a anon, una por una.
  --
  -- El filtro es por ROL y no por nombre: `dev_anon_all` es la que
  -- conocemos, pero cualquier otra que deje pasar a anon hace el mismo
  -- daño y no tiene por qué llamarse igual. Se saltean las de
  -- `authenticated`, que son las que hacen andar la app.
  for r in
    select tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and ('anon' = any(roles) or 'public' = any(roles))
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
    cerradas := cerradas + 1;
  end loop;

  raise notice '--- cerradas: % ---', cerradas;
end $$;


-- ---------------------------------------------------------------------
-- Verificación: tiene que dar cero.
-- ---------------------------------------------------------------------
select
  count(*) as politicas_que_alcanzan_a_anon,
  case when count(*) = 0
       then 'CERRADO'
       else 'TODAVIA HAY — revisar a mano'
  end as estado
from pg_policies
where schemaname = 'public'
  and ('anon' = any(roles) or 'public' = any(roles));


-- ---------------------------------------------------------------------
-- Y que la app siga teniendo lo suyo: una política `authenticated` por
-- tabla. Si alguna tabla de datos quedara en cero acá, la pantalla que la
-- usa se ve vacía.
-- ---------------------------------------------------------------------
select
  c.relname as tabla,
  count(p.policyname) filter (where 'authenticated' = any(p.roles)) as politicas_authenticated
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.schemaname = 'public' and p.tablename = c.relname
where n.nspname = 'public'
  and c.relkind = 'r'
group by c.relname
order by politicas_authenticated, c.relname;
