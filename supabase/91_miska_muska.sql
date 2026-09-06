-- =====================================================================
-- ALTA — Miska Muska
--
-- Proyecto ya implementado. El desarrollo se hizo SIN CARGO, así que
-- va cotizado en 0 y no arrastra saldo pendiente. El ingreso es el
-- mantenimiento mensual de USD 300: el primer período es septiembre
-- 2026 y se cobra el 1 de octubre de 2026.
--
-- Es idempotente: si ya existe un proyecto llamado 'Miska Muska' no
-- crea un segundo. Se puede correr de nuevo sin duplicar nada.
--
-- Queda pendiente de completar a mano (no se inventan datos):
--   · implementation_date — la fecha real en que salió a producción
--   · client_id           — hoy no hay ningún cliente cargado en la base
--   · owner_name / contact_person — el cliente y su contacto
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) El proyecto
-- El trigger `projects_init_children` crea solo las tres filas 1:1
-- (desarrollo, infraestructura, mantenimiento).
-- ---------------------------------------------------------------------
insert into projects (
  name, description, type, status, priority, quoted_amount, currency
)
select
  'Miska Muska',
  'Implementado. El desarrollo se hizo sin cargo. El ingreso es el '
  || 'mantenimiento mensual de USD 300; el primer período es septiembre '
  || '2026 y se cobra el 1 de octubre de 2026.',
  'terceros',
  'En mantenimiento',
  'Media',
  0,
  'USD'
where not exists (
  select 1 from projects where name = 'Miska Muska'
);


-- ---------------------------------------------------------------------
-- 2) El plan de mantenimiento
--
-- Va en un statement aparte a propósito: la fila que crea el trigger de
-- arriba no es visible desde una CTE del mismo statement, así que un
-- `with ... insert ... update` actualizaría cero filas en silencio.
--
-- El ancla del cálculo es `start_date` (derive.ts usa
-- lastCollectedDate ?? startDate ?? implementationDate), por eso el
-- próximo cobro sale bien aunque implementation_date quede en null.
-- ---------------------------------------------------------------------
update project_maintenance m
   set active              = true,
       status              = 'Activo',
       amount              = 300,
       currency            = 'USD',
       frequency           = 'Mensual',
       due_day             = 1,
       start_date          = date '2026-09-01',
       last_collected_date = null   -- todavía no se cobró nada
  from projects p
 where p.id = m.project_id
   and p.name = 'Miska Muska';


-- ---------------------------------------------------------------------
-- 3) Verificación — tiene que devolver exactamente una fila
-- ---------------------------------------------------------------------
select
  p.name                                          as proyecto,
  p.status::text                                  as estado,
  p.type::text                                    as tipo,
  p.currency::text || ' ' || p.quoted_amount::text as cotizado,
  m.active                                        as plan_activo,
  m.status::text                                  as plan_estado,
  m.currency::text || ' ' || m.amount::text       as cuota,
  m.frequency::text                               as frecuencia,
  m.due_day                                       as dia_de_cobro,
  m.start_date                                    as arranca,
  m.last_collected_date                           as ultimo_cobro,
  p.implementation_date                           as implementado,
  p.client_id                                     as cliente
from projects p
join project_maintenance m on m.project_id = p.id
where p.name = 'Miska Muska';
