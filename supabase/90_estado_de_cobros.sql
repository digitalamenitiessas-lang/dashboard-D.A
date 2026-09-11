-- =====================================================================
-- REPORTE — Estado de cobros al día de hoy
--
-- Sólo lee: no modifica nada. Pegalo entero en el SQL Editor de Supabase
-- y dale Run. Devuelve un único listado con cinco secciones, pensado
-- para leerlo de arriba a abajo en una reunión.
-- =====================================================================

with cobros as (
  select
    p.name                                              as proyecto,
    pay.concept                                         as detalle,
    pay.currency::text                                  as moneda,
    pay.amount                                          as monto,
    pay.paid_date::text                                 as fecha,
    coalesce(acc.name, '⚠ sin cuenta asignada')         as cuenta
  from payments pay
  join projects p        on p.id   = pay.project_id
  left join accounts acc on acc.id = pay.account_id
),

mantenimientos_cobrados as (
  select
    p.name                                              as proyecto,
    'Cuota de mantenimiento'                            as detalle,
    mc.currency::text                                   as moneda,
    mc.amount                                           as monto,
    mc.charged_on::text                                 as fecha,
    coalesce(acc.name, '⚠ sin cuenta asignada')         as cuenta
  from maintenance_charges mc
  join projects p        on p.id   = mc.project_id
  left join accounts acc on acc.id = mc.account_id
),

-- Lo cobrado de cada proyecto sólo cuenta en la moneda del proyecto:
-- nunca se suman monedas distintas.
por_proyecto as (
  select
    p.id,
    p.name,
    p.status::text                                      as estado,
    p.currency::text                                    as moneda,
    p.quoted_amount                                     as cotizado,
    coalesce((
      select sum(pay.amount) from payments pay
      where pay.project_id = p.id and pay.currency = p.currency
    ), 0)                                               as cobrado,
    coalesce((
      select sum(mc.amount) from maintenance_charges mc
      where mc.project_id = p.id and mc.currency = p.currency
    ), 0)                                               as mantenimiento_cobrado
  from projects p
),

saldos as (
  select
    a.name,
    a.kind::text                                        as tipo,
    a.currency::text                                    as moneda,
    a.archived,
      coalesce((select sum(amount) from payments            where account_id = a.id), 0)
    + coalesce((select sum(amount) from maintenance_charges where account_id = a.id), 0)
    + coalesce((select sum(amount_in)  from money_movements where to_account_id   = a.id), 0)
    - coalesce((select sum(amount_out) from money_movements where from_account_id = a.id), 0)
                                                        as saldo
  from accounts a
)

select * from (

  -- 1 ─ Cada cobro de proyecto registrado
  select 1 as orden, '1· COBROS DE PROYECTO' as seccion,
         proyecto as item, detalle,
         moneda || ' ' || to_char(monto, 'FM999G999G999D00') as monto,
         fecha, cuenta as nota
  from cobros

  union all
  -- 2 ─ Cada cuota de mantenimiento efectivamente cobrada
  select 2, '2· MANTENIMIENTOS COBRADOS',
         proyecto, detalle,
         moneda || ' ' || to_char(monto, 'FM999G999G999D00'),
         fecha, cuenta
  from mantenimientos_cobrados

  union all
  -- 3 ─ Cotizado vs cobrado por proyecto (el pendiente sale de acá)
  select 3, '3· ESTADO POR PROYECTO',
         name, estado,
         moneda || ' ' || to_char(cotizado, 'FM999G999G999D00')
           || '  cobrado ' || to_char(cobrado, 'FM999G999G999D00')
           || '  pendiente ' || to_char(greatest(cotizado - cobrado, 0), 'FM999G999G999D00'),
         null,
         case when mantenimiento_cobrado > 0
              then '+ ' || to_char(mantenimiento_cobrado, 'FM999G999G999D00') || ' de mantenimiento'
              else '' end
  from por_proyecto

  union all
  -- 4 ─ Planes de mantenimiento vigentes y su próximo cobro
  select 4, '4· PLANES DE MANTENIMIENTO',
         p.name,
         m.frequency::text || ' · día ' || m.due_day || ' · ' || m.status::text,
         m.currency::text || ' ' || to_char(m.amount, 'FM999G999G999D00'),
         coalesce(m.last_collected_date::text, m.start_date::text,
                  m.implementation_date::text),
         case when m.last_collected_date is not null
              then 'último cobro'
              when m.start_date is not null then 'arranca'
              else 'sin fecha de arranque' end
  from project_maintenance m
  join projects p on p.id = m.project_id
  where m.active

  union all
  -- 5 ─ Dónde está la plata (saldo derivado, nunca guardado)
  select 5, '5· SALDOS POR CUENTA',
         name, tipo,
         moneda || ' ' || to_char(saldo, 'FM999G999G999D00'),
         null,
         case when archived then 'archivada' else '' end
  from saldos

) t
order by orden, fecha desc nulls last, item;
