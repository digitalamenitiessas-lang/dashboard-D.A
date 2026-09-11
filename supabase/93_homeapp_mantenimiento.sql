-- =====================================================================
-- HoMeApp — plan de mantenimiento (el proyecto del hotel)
--
-- ARS 200.000 por mes. El primer período es septiembre 2026 y se cobra
-- el 1 de octubre de 2026, igual que Miska Muska.
--
-- Es idempotente: se puede correr de nuevo sin romper nada.
--
-- ⚠️  DOS SUPUESTOS QUE TENÉS QUE CONFIRMAR (ver bloques 1 y 3):
--     · el estado del proyecto pasa a 'En mantenimiento'
--     · el monto cotizado del desarrollo NO se toca (hoy está en USD 1)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Estado del proyecto
--
-- SUPUESTO: si empieza a pagar mantenimiento por septiembre, está en
-- producción. Hoy figura 'En pruebas' con entrega estimada 2026-09-01,
-- así que el dashboard lo cuenta como demorado.
--
-- Si todavía NO salió a producción, borrá este bloque entero.
-- ---------------------------------------------------------------------
update projects
   set status = 'En mantenimiento'
 where name = 'HoMeApp';


-- ---------------------------------------------------------------------
-- 2) El plan
--
-- La fila 1:1 ya existe (la creó el trigger projects_init_children).
-- El ancla del cálculo es start_date, por eso el próximo cobro sale
-- bien aunque implementation_date siga en null.
-- ---------------------------------------------------------------------
update project_maintenance m
   set active              = true,
       status              = 'Activo',
       amount              = 200000,
       currency            = 'ARS',
       frequency           = 'Mensual',
       due_day             = 1,
       start_date          = date '2026-09-01',
       last_collected_date = null   -- todavía no se cobró nada
  from projects p
 where p.id = m.project_id
   and p.name = 'HoMeApp';


-- ---------------------------------------------------------------------
-- 3) NO SE TOCA: quoted_amount
--
-- HoMeApp figura cotizado en USD 1, que es evidentemente un valor de
-- prueba. No lo corrijo porque no sé el número real. Cuando lo sepas:
--
--   update projects
--      set quoted_amount = <monto>, currency = '<USD|ARS>'
--    where name = 'HoMeApp';
--
-- Ojo con la moneda: la app sólo descuenta del pendiente los pagos que
-- están en la MISMA moneda que el proyecto. Si se cotizó en pesos y se
-- cobra en pesos, poné 'ARS' en las dos puntas.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 4) Verificación — los dos planes de mantenimiento activos
-- Esperado: Miska Muska USD 300 y HoMeApp ARS 200.000, ambos mensuales,
-- día 1, desde 2026-09-01, sin cobros.
-- ---------------------------------------------------------------------
select
  p.name                                    as proyecto,
  p.status::text                            as estado,
  m.currency::text || ' ' || m.amount::text as cuota,
  m.frequency::text                         as frecuencia,
  m.due_day                                 as dia,
  m.start_date                              as arranca,
  m.last_collected_date                     as ultimo_cobro
from projects p
join project_maintenance m on m.project_id = p.id
where m.active
order by p.name;
