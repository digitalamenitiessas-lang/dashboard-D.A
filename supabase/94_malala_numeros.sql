-- =====================================================================
-- MALALA — dejar los números redondos
--
-- Cotizado USD 2.500. Pagaron tres cuartos y deben un cuarto: USD 625.
--
--   «mitad yerba buena»  USD 1.250  = 1/2   ← ya estaba bien
--   «mitad de mitad»     USD   625  = 1/4   ← estaba cargado en 562
--   ------------------------------------------
--   cobrado              USD 1.875  = 3/4
--   pendiente            USD   625  = 1/4
--
-- NOTA: MALALA cotizó en dólares y pagó en pesos, a la cotización de
-- cada pago. Esos montos en pesos hoy no se pueden registrar sin romper
-- el pendiente, porque `payments` guarda un solo monto. Queda para la
-- mejora de doble monto en el cobro (ver conversación). Por ahora el
-- pago queda expresado en la moneda de la cotización, que es lo que
-- hace que el saldo del cliente sea correcto.
--
-- Es idempotente: si ya está en 625, no cambia nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) El segundo pago cancela un cuarto exacto
-- ---------------------------------------------------------------------
update payments p
   set amount = 625
  from projects pr
 where pr.id       = p.project_id
   and pr.name     = 'MALALA'
   and p.currency  = 'USD'
   and p.amount    = 562;


-- ---------------------------------------------------------------------
-- 2) Verificación — el saldo del cliente
-- Esperado: cotizado 2.500 · cobrado 1.875 · pendiente 625
-- ---------------------------------------------------------------------
select
  p.name                    as proyecto,
  p.currency::text          as moneda,
  p.quoted_amount           as cotizado,
  sum(pay.amount)           as cobrado,
  p.quoted_amount - sum(pay.amount) as pendiente
from projects p
join payments pay on pay.project_id = p.id and pay.currency = p.currency
where p.name = 'MALALA'
group by p.name, p.currency, p.quoted_amount;


-- ---------------------------------------------------------------------
-- 3) Qué se hizo con la plata de MALALA
--
-- Esto YA está registrado: los movimientos tienen project_id apuntando
-- al proyecto. Lo que falta es que alguna pantalla lo muestre — hoy
-- `movements` sólo se lee en Caja, la ficha del proyecto no los mira.
-- ---------------------------------------------------------------------
select
  mv.moved_on                                        as fecha,
  mv.category::text                                  as categoria,
  mv.concept                                         as concepto,
  coalesce(fa.name, 'de afuera') || ' -> ' || coalesce(ta.name, 'para afuera') as ruta,
  fa.currency::text || ' ' || mv.amount_out::text    as sale,
  ta.currency::text || ' ' || mv.amount_in::text     as entra
from money_movements mv
left join accounts fa on fa.id = mv.from_account_id
left join accounts ta on ta.id = mv.to_account_id
join projects p on p.id = mv.project_id
where p.name = 'MALALA'
order by mv.moved_on, mv.created_at;
