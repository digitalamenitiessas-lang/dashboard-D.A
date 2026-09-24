-- =====================================================================
-- PASO 1 de 2 — BUSCAR el movimiento de los 135.000
--
-- SÓLO LEE. No cambia nada. Devuelve tablas, no mensajes, porque el
-- editor de Supabase muestra resultados pero no siempre los `notice`.
--
-- Con lo que salga acá se arma el UPDATE exacto, apuntado al id. Con
-- plata no se hace un update "por monto y a ver qué pasa": si hubiera dos
-- movimientos de 135.000 se tocaría el equivocado y no habría forma de
-- saberlo después.
-- =====================================================================

set search_path = public;


-- ---------------------------------------------------------------------
-- 1. Los candidatos: cualquier movimiento de 135.000, de cualquier lado
-- ---------------------------------------------------------------------
select
  m.id,
  m.moved_on                                   as fecha,
  m.category                                   as categoria,
  m.concept                                    as concepto,
  o.name || ' · ' || o.currency                as sale_de,
  m.amount_out                                 as monto_sale,
  coalesce(d.name || ' · ' || d.currency, '—') as entra_a,
  d.kind                                       as tipo_destino,
  m.amount_in                                  as monto_entra,
  p.name                                       as proyecto,
  m.notes                                      as notas
from money_movements m
left join accounts o on o.id = m.from_account_id
left join accounts d on d.id = m.to_account_id
left join projects p on p.id = m.project_id
where m.amount_out = 135000 or m.amount_in = 135000
order by m.moved_on desc;


-- ---------------------------------------------------------------------
-- 2. Por las dudas: algo que mencione a Malala, con el monto que sea
--
-- Si el de arriba no aparece, quizá el importe quedó cargado distinto.
-- ---------------------------------------------------------------------
select
  m.id,
  m.moved_on   as fecha,
  m.category   as categoria,
  m.concept    as concepto,
  m.amount_out as monto_sale,
  m.amount_in  as monto_entra,
  o.name       as sale_de,
  d.name       as entra_a
from money_movements m
left join accounts o on o.id = m.from_account_id
left join accounts d on d.id = m.to_account_id
left join projects p on p.id = m.project_id
where m.concept ilike '%malala%'
   or m.notes   ilike '%malala%'
   or p.name    ilike '%malala%'
order by m.moved_on desc
limit 20;


-- ---------------------------------------------------------------------
-- 3. Las cuentas de Retiros que existen hoy
--
-- Si no aparece ninguna de Marco, hay que crearla —desde Caja, o con el
-- bloque comentado de abajo— antes de reimputar nada.
-- ---------------------------------------------------------------------
select
  id,
  name     as cuenta,
  currency as moneda,
  kind     as tipo,
  archived as archivada
from accounts
where kind = 'Retiros'
order by archived, name;


-- ---------------------------------------------------------------------
-- 4. Todas las cuentas, para saber de dónde salió la plata
-- ---------------------------------------------------------------------
select id, name as cuenta, kind as tipo, currency as moneda, archived
from accounts
order by archived, kind, name;
