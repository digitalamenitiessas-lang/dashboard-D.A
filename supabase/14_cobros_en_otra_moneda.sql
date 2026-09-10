-- =====================================================================
-- PASO 14 — COBRAR EN UNA MONEDA Y SALDAR EN OTRA
--
-- El caso real, y el mas frecuente de la empresa: el proyecto se cotiza
-- en DOLARES y el cliente paga en PESOS al cambio del dia.
--
-- Hoy eso no se puede registrar sin perder algo:
--
--   Se carga el cobro en ARS  -> `projectFinance()` lo descarta al sumar
--                                lo cobrado (lib/derive.ts filtra por
--                                `p.currency === project.currency`), asi
--                                que la deuda del proyecto NO baja y nada
--                                lo avisa. El comentario del codigo dice
--                                "anything else is surfaced separately" y
--                                no se surfacea en ninguna parte.
--   Se carga el cobro en USD  -> la deuda baja bien, pero se pierde
--                                cuantos pesos entraron de verdad, y el
--                                saldo de la cuenta en pesos queda mal.
--
-- La salida NO es guardar una cotizacion. Es la misma que este repo ya
-- eligio para un cambio de moneda en Caja: DOS MONTOS, y la cotizacion
-- queda implicita. Del README: "un cambio de dolares a pesos es un
-- movimiento de una cuenta USD a una ARS con dos montos distintos: la
-- cotizacion de esa operacion queda registrada como dato real, no
-- estimada". Un cobro en otra moneda es exactamente la misma operacion.
--
--   amount + currency  ->  lo que ENTRO de verdad. Es lo que suma al
--                          saldo de su cuenta en Caja.
--   applied_amount     ->  cuanto de lo COTIZADO salda, en la moneda del
--                          proyecto. Es lo que baja la deuda.
--
-- La cotizacion de esa operacion es la division de los dos, y queda como
-- dato real de lo que efectivamente paso ese dia.
--
-- Requiere 03_schema.sql. Es idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Freno de mano
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.payments') is null then
    raise exception 'Falta correr 03_schema.sql: no existe payments.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1. La columna
--
-- NULLABLE a proposito, y esa es la parte importante para no romper nada
-- de lo que ya esta cargado:
--
--   null  = este cobro salda su propio importe. Es el caso normal, el de
--           un cobro en la misma moneda que el proyecto, y es lo que
--           tienen TODAS las filas que ya existen. Nada cambia para
--           ellas.
--   valor = este cobro entro en una moneda y salda otra. El valor esta
--           en la moneda del PROYECTO, no en la del cobro.
--
-- No lleva CHECK contra la moneda del proyecto porque un CHECK no puede
-- mirar otra tabla. La regla la sostiene la app: el dialogo solo ofrece
-- el campo cuando las monedas difieren, y `projectFinance()` solo lo usa
-- en ese caso.
-- ---------------------------------------------------------------------
alter table payments
  add column if not exists applied_amount numeric(12,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'payments_applied_amount_positivo'
  ) then
    -- Cero no significa nada: un cobro que salda cero es un cobro que no
    -- salda, y eso se expresa dejando la columna en null.
    alter table payments
      add constraint payments_applied_amount_positivo
        check (applied_amount is null or applied_amount > 0);
  end if;
end $$;

comment on column payments.amount is
  'Lo que entro de verdad, en `currency`. Es lo que suma al saldo de su cuenta.';

comment on column payments.applied_amount is
  'Cuanto de lo cotizado salda, en la moneda del PROYECTO. Null = salda su '
  'propio importe (cobro en la misma moneda). La cotizacion de la operacion '
  'es la division de los dos.';


-- ---------------------------------------------------------------------
-- 2. Que hay hoy para revisar a mano
--
-- Los cobros que estan en una moneda distinta a la de su proyecto y no
-- tienen equivalente cargado: son los que hoy NO bajan la deuda y nadie
-- se enteraba. Despues de este script la pantalla los va a marcar, pero
-- conviene verlos aca tambien.
-- ---------------------------------------------------------------------
select * from (

  select 1 as orden, '1· ESTRUCTURA' as seccion,
         o.item,
         case when o.ok then '✓ está' else '✗ FALTA' end as detalle
  from (
    select 'columna payments.applied_amount' as item,
           exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'payments'
                      and column_name = 'applied_amount') as ok
    union all select 'check de importe positivo',
           exists (select 1 from pg_constraint
                    where conname = 'payments_applied_amount_positivo')
  ) o

  union all
  select 2, '2· A REVISAR: cobros que no bajan la deuda',
         p.concept || ' · ' || pr.name,
         p.currency::text || ' ' || to_char(p.amount, 'FM999G999G999D00') ||
           ' cobrado en un proyecto cotizado en ' || pr.currency::text ||
           ' — falta cargarle el equivalente'
  from payments p
  join projects pr on pr.id = p.project_id
  where p.currency <> pr.currency
    and p.applied_amount is null

) x
order by orden, item;
