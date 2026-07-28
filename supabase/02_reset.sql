-- =====================================================================
-- PASO 2 — RESET DEL ESQUEMA PUBLIC
--
-- ⚠️  IRREVERSIBLE. Borra TODAS las tablas, vistas, funciones, triggers
--     y tipos del esquema `public`, con todos sus datos.
--
-- Verificá antes:
--   1. Que corriste 01_inventario.sql y lo que aparece es la base vieja.
--   2. Que en el selector de proyecto de Supabase estás en el proyecto
--      correcto (es el error más común y no tiene vuelta atrás).
--
-- Qué NO borra:
--   • auth.users        → los usuarios siguen existiendo
--   • storage.objects   → los archivos siguen existiendo
--   (más abajo hay instrucciones opcionales para eso)
-- =====================================================================

drop schema public cascade;
create schema public;

-- Restaurar los permisos que Supabase espera en `public`
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all privileges on schema public to postgres, anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;

-- Extensión usada por el esquema (gen_random_uuid)
create extension if not exists pgcrypto with schema public;


-- =====================================================================
-- OPCIONAL — sólo si además querés vaciar usuarios y archivos
-- Descomentá a conciencia, esto tampoco tiene vuelta atrás.
-- =====================================================================

-- Borrar todos los usuarios de Auth:
-- delete from auth.users;

-- Vaciar un bucket de Storage (reemplazá 'nombre-del-bucket'):
-- delete from storage.objects where bucket_id = 'nombre-del-bucket';
