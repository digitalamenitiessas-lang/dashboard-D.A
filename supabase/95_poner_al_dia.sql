-- =====================================================================
-- PUESTA AL DÍA — 06/09/2026
--
-- Junta en una sola corrida los scripts 91 a 94. Pegalo entero en el
-- SQL Editor y dale Run una vez: al final devuelve el estado completo
-- de la base para revisar que todo haya quedado bien.
--
-- Todo es idempotente: se puede correr de nuevo sin duplicar nada.
--
-- Qué hace:
--   1. Landing JULINAS — el anticipo entró al banco y se retiró completo
--   2. Miska Muska     — alta del proyecto + plan de USD 300/mes
--   3. HoMeApp         — en producción + plan de ARS 200.000/mes
--   4. MALALA          — el segundo pago pasa a USD 625 (3/4 cobrado)
--
-- Lo que NO toca, porque falta el dato:
--   · el cotizado de HoMeApp, que sigue en USD 1 (valor de prueba)
--   · los montos en pesos reales de MALALA (falta el doble monto)
--   · los dos movimientos de cheques, que quedan como están
-- =====================================================================


-- =====================================================================
-- 1) LANDING JULINAS
-- Estaba con el cobro asignado directo a «Retiros»: los totales daban
-- bien pero no quedaba registro de que la plata hubiera entrado.
-- =====================================================================

update payments p
   set account_id = (select id from accounts where name = 'Banco pesos')
  from projects pr
 where pr.id       = p.project_id
   and pr.name     = 'Landing JULINAS'
   and p.currency  = 'ARS'
   and p.amount    = 250000;

insert into money_movements (
  moved_on, category, concept,
  from_account_id, amount_out,
  to_account_id,   amount_in,
  project_id, notes
)
select
  date '2026-07-15',                                    -- fecha del retiro
  'Retiro',
  'Reparto del anticipo de Landing JULINAS',
  (select id from accounts where name = 'Banco pesos'), 250000,
  (select id from accounts where name = 'Retiros'),     250000,
  (select id from projects where name = 'Landing JULINAS'),
  'Se repartió entre los socios y se retiró completo.'
where not exists (
  select 1 from money_movements
   where category = 'Retiro'
     and concept  = 'Reparto del anticipo de Landing JULINAS'
);


-- =====================================================================
-- 2) MISKA MUSKA
-- Implementado. Desarrollo sin cargo, así que va cotizado en 0 y no
-- arrastra pendiente. El ingreso es el mantenimiento.
-- =====================================================================

insert into projects (
  name, description, type, status, priority, quoted_amount, currency
)
select
  'Miska Muska',
  'Implementado. El desarrollo se hizo sin cargo. El ingreso es el '
  || 'mantenimiento mensual de USD 300; el primer período es septiembre '
  || '2026 y se cobra el 1 de octubre de 2026.',
  'terceros', 'En mantenimiento', 'Media', 0, 'USD'
where not exists (select 1 from projects where name = 'Miska Muska');

-- En statement aparte: la fila 1:1 la crea el trigger del insert de
-- arriba y no es visible desde una CTE del mismo statement.
update project_maintenance m
   set active              = true,
       status              = 'Activo',
       amount              = 300,
       currency            = 'USD',
       frequency           = 'Mensual',
       due_day             = 1,
       start_date          = date '2026-09-01',
       last_collected_date = null
  from projects p
 where p.id = m.project_id
   and p.name = 'Miska Muska';


-- =====================================================================
-- 3) HOMEAPP (el proyecto del hotel)
-- Ya está en producción y empieza a pagar mantenimiento por septiembre.
-- =====================================================================

update projects
   set status = 'En mantenimiento'
 where name = 'HoMeApp';

update project_maintenance m
   set active              = true,
       status              = 'Activo',
       amount              = 200000,
       currency            = 'ARS',
       frequency           = 'Mensual',
       due_day             = 1,
       start_date          = date '2026-09-01',
       last_collected_date = null
  from projects p
 where p.id = m.project_id
   and p.name = 'HoMeApp';


-- =====================================================================
-- 4) MALALA
-- Cotizado USD 2.500. Pagaron 3/4 y deben 1/4 = USD 625.
-- El segundo cobro («mitad de mitad») estaba en 562.
-- =====================================================================

update payments p
   set amount = 625
  from projects pr
 where pr.id       = p.project_id
   and pr.name     = 'MALALA'
   and p.currency  = 'USD'
   and p.amount    = 562;


-- =====================================================================
-- VERIFICACIÓN — estado completo de la base
--
-- Qué tiene que dar:
--   · MALALA        cotizado 2.500 · cobrado 1.875 · pendiente 625
--   · Landing JULINAS  ARS 500.000 · cobrado 250.000 · pendiente 250.000
--   · Miska Muska   cotizado 0 · plan USD 300 mensual desde 01-09
--   · HoMeApp       En mantenimiento · plan ARS 200.000 mensual desde 01-09
--   · Banco pesos   ARS 0        (entraron 250.000 y salieron 250.000)
--   · Retiros       ARS 250.000
--   · Caja USD      USD 475      (1.875 de MALALA menos 1.400 de cheques)
--   · Cheques       ARS 2.000.000
-- =====================================================================

select * from (

  select 1 as orden, '1· PROYECTOS' as seccion,
         p.name as item,
         p.status::text as detalle,
         p.currency::text || ' ' || p.quoted_amount::text as cotizado,
         coalesce((select sum(x.amount) from payments x
                    where x.project_id = p.id and x.currency = p.currency), 0)::text as cobrado,
         greatest(p.quoted_amount - coalesce((select sum(x.amount) from payments x
                    where x.project_id = p.id and x.currency = p.currency), 0), 0)::text as pendiente
  from projects p

  union all
  select 2, '2· PLANES DE MANTENIMIENTO',
         p.name,
         m.status::text || ' · ' || m.frequency::text || ' · día ' || m.due_day,
         m.currency::text || ' ' || m.amount::text,
         'desde ' || m.start_date::text,
         coalesce('último cobro ' || m.last_collected_date::text, 'sin cobros')
  from project_maintenance m
  join projects p on p.id = m.project_id
  where m.active

  union all
  select 3, '3· SALDOS POR CUENTA',
         a.name,
         a.kind::text,
         a.currency::text || ' ' || (
             coalesce((select sum(amount)     from payments            where account_id     = a.id), 0)
           + coalesce((select sum(amount)     from maintenance_charges where account_id     = a.id), 0)
           + coalesce((select sum(amount_in)  from money_movements     where to_account_id   = a.id), 0)
           - coalesce((select sum(amount_out) from money_movements     where from_account_id = a.id), 0)
         )::text,
         '', ''
  from accounts a

  union all
  select 4, '4· MOVIMIENTOS',
         coalesce(pr.name, '(sin proyecto)'),
         mv.category::text || ' · ' || mv.concept,
         coalesce(fa.name, 'de afuera') || ' → ' || coalesce(ta.name, 'para afuera'),
         'sale ' || mv.amount_out::text,
         'entra ' || mv.amount_in::text
  from money_movements mv
  left join accounts fa on fa.id = mv.from_account_id
  left join accounts ta on ta.id = mv.to_account_id
  left join projects pr on pr.id = mv.project_id

  union all
  select 5, '5· COBROS SIN CUENTA ASIGNADA',
         pr.name, pay.concept,
         pay.currency::text || ' ' || pay.amount::text,
         pay.paid_date::text, ''
  from payments pay
  join projects pr on pr.id = pay.project_id
  where pay.account_id is null

) t
order by orden, item;
