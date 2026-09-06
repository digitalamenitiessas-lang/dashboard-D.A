-- =====================================================================
-- CORRECCIÓN — Landing JULINAS: el anticipo entró al banco y se retiró
--
-- Estaba cargado con el cobro asignado directo a la cuenta «Retiros».
-- Los totales daban bien, pero no quedaba registro de que la plata
-- hubiera entrado, y un retiro parcial no se podía expresar.
--
-- Forma correcta, en dos pasos:
--   1. El cobro se asigna a la cuenta donde realmente entró (Banco pesos).
--   2. Un movimiento de categoría 'Retiro' lo pasa a la cuenta 'Retiros'.
--
-- Los tres KPIs de Caja (Disponible / Invertido / Retirado) terminan
-- igual que ahora; lo que se gana es el rastro en el historial del banco.
--
-- ⚠️  SUPUESTO A REVISAR: la fecha del retiro. No me la pasaste, así que
--     usa la misma fecha del cobro (15-07-2026). Si se retiró otro día,
--     cambiá la constante de abajo antes de correr.
--
-- Es idempotente: se puede correr de nuevo sin duplicar el movimiento.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) El cobro entró al Banco pesos
-- ---------------------------------------------------------------------
update payments p
   set account_id = (select id from accounts where name = 'Banco pesos')
  from projects pr
 where pr.id = p.project_id
   and pr.name     = 'Landing JULINAS'
   and p.currency  = 'ARS'
   and p.amount    = 250000;


-- ---------------------------------------------------------------------
-- 2) El retiro: completo, del banco a Retiros
-- Misma moneda de los dos lados, así que los dos montos son iguales.
-- ---------------------------------------------------------------------
insert into money_movements (
  moved_on, category, concept,
  from_account_id, amount_out,
  to_account_id,   amount_in,
  project_id, notes
)
select
  date '2026-07-15',                                   -- ⚠️ fecha del retiro
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


-- ---------------------------------------------------------------------
-- 3) Verificación — saldos por cuenta después del cambio
--
-- Esperado:  Banco pesos ARS 0  (entraron 250.000 y salieron 250.000)
--            Retiros     ARS 250.000
--            Caja USD    USD 412        <- pendiente de revisar
--            Cheques     ARS 2.000.000  <- pendiente de revisar
-- ---------------------------------------------------------------------
select
  a.name,
  a.kind::text     as tipo,
  a.currency::text as moneda,
    coalesce((select sum(amount)     from payments            where account_id     = a.id), 0)
  + coalesce((select sum(amount)     from maintenance_charges where account_id     = a.id), 0)
  + coalesce((select sum(amount_in)  from money_movements     where to_account_id   = a.id), 0)
  - coalesce((select sum(amount_out) from money_movements     where from_account_id = a.id), 0)
    as saldo
from accounts a
order by a.sort_order, a.name;
