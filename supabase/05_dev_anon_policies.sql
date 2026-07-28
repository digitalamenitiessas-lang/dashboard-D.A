-- =====================================================================
-- PASO 5 — SÓLO PARA DESARROLLO (opcional)
--
-- El esquema deja RLS activo y sólo permite acceso a usuarios
-- AUTENTICADOS. Como la app todavía no tiene login, con la anon key
-- vas a ver todo vacío.
--
-- ⚠️  Este archivo abre lectura y escritura al rol `anon`. La anon key
--     viaja al navegador, así que cualquiera que la tenga puede leer y
--     escribir estas tablas. Usalo sólo en una base de pruebas con
--     datos ficticios, nunca con datos reales de clientes.
--
-- Cuando armemos el login, corré el bloque de REVERTIR de abajo.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'clients', 'projects', 'project_development', 'project_infrastructure',
    'infrastructure_costs', 'project_maintenance', 'payments',
    'maintenance_charges', 'notes', 'activity'
  ]
  loop
    execute format('drop policy if exists dev_anon_all on public.%I', t);
    execute format(
      'create policy dev_anon_all on public.%I
         for all to anon using (true) with check (true)', t);
  end loop;
end $$;


-- =====================================================================
-- REVERTIR (correr apenas exista el login)
-- =====================================================================
-- do $$
-- declare t text;
-- begin
--   foreach t in array array[
--     'clients', 'projects', 'project_development', 'project_infrastructure',
--     'infrastructure_costs', 'project_maintenance', 'payments',
--     'maintenance_charges', 'notes', 'activity'
--   ]
--   loop
--     execute format('drop policy if exists dev_anon_all on public.%I', t);
--   end loop;
-- end $$;
