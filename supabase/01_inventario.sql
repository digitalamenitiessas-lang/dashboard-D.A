-- =====================================================================
-- PASO 1 — INVENTARIO (no borra nada)
-- Corré esto ANTES del reset para confirmar que estás en la base correcta
-- y ver qué hay realmente adentro.
-- =====================================================================

-- Tablas del esquema public con su cantidad de filas
select
  table_name as tabla,
  (xpath(
    '/row/c/text()',
    query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')
  ))[1]::text::bigint as filas
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
order by filas desc, table_name;

-- Cuántos usuarios de Auth hay (el reset NO los toca)
select count(*) as usuarios_auth from auth.users;

-- Buckets de Storage (el reset NO los toca)
select id, name, public from storage.buckets;
