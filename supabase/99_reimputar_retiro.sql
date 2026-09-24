-- =====================================================================
-- PASO 2 de 2 — REIMPUTAR un movimiento como retiro de un socio
--
-- Antes correr `99_buscar_retiro_malala.sql`, que devuelve los dos ids
-- que hay que pegar acá abajo.
--
-- Qué hace: deja el movimiento como categoría Retiro, con destino la
-- cuenta del socio. El lado de salida NO se toca — de dónde salió la
-- plata y cuánto salió ya estaban bien; lo que faltaba era a quién se le
-- imputa.
--
-- NO ACTÚA SI ALGO NO CIERRA. Sólo modifica si el destino es una cuenta
-- de tipo Retiros y su moneda es la misma que la de la cuenta de origen.
-- Si el retiro fue en otra moneda que la cuenta de origen, esto no
-- aplica: ese caso lleva dos montos distintos y conviene hacerlo desde la
-- pantalla, que pide la cotización.
--
-- La última consulta muestra cómo quedó el movimiento. Si salió igual que
-- antes, es que alguna validación no pasó: la consulta del medio dice
-- cuál.
-- =====================================================================

set search_path = public;


-- ---------------------------------------------------------------------
-- COMPLETAR ACÁ. Los dos ids salen del script anterior.
-- ---------------------------------------------------------------------
create temp view param as
select
  'PEGAR-EL-ID-DEL-MOVIMIENTO'::uuid  as mov,
  'PEGAR-EL-ID-DE-RETIROS-MARCO'::uuid as dest;


-- ---------------------------------------------------------------------
-- 1. Antes de tocar: qué dice cada validación
-- ---------------------------------------------------------------------
select
  m.id,
  m.category                                as categoria_actual,
  m.concept                                 as concepto,
  o.name || ' · ' || o.currency             as sale_de,
  m.amount_out                              as monto,
  d.name || ' · ' || d.currency             as destino_nuevo,
  d.kind = 'Retiros'                        as destino_es_de_retiros,
  d.currency = o.currency                   as monedas_coinciden,
  (d.kind = 'Retiros' and d.currency = o.currency) as va_a_actualizar
from param p
join money_movements m on m.id = p.mov
join accounts o on o.id = m.from_account_id
join accounts d on d.id = p.dest;


-- ---------------------------------------------------------------------
-- 2. El cambio
-- ---------------------------------------------------------------------
update money_movements m
   set category      = 'Retiro',
       to_account_id = p.dest,
       -- Misma moneda en los dos lados: es un solo importe, no dos.
       amount_in     = m.amount_out
  from param p
  join accounts d on d.id = p.dest
  join money_movements m2 on m2.id = p.mov
  join accounts o on o.id = m2.from_account_id
 where m.id = p.mov
   and d.kind = 'Retiros'
   and d.currency = o.currency;


-- ---------------------------------------------------------------------
-- 3. Cómo quedó
-- ---------------------------------------------------------------------
select
  m.id,
  m.moved_on                    as fecha,
  m.category                    as categoria,
  m.concept                     as concepto,
  o.name || ' · ' || o.currency as sale_de,
  m.amount_out                  as monto_sale,
  d.name || ' · ' || d.currency as se_le_imputa_a,
  m.amount_in                   as monto_entra
from param p
join money_movements m on m.id = p.mov
left join accounts o on o.id = m.from_account_id
left join accounts d on d.id = m.to_account_id;
