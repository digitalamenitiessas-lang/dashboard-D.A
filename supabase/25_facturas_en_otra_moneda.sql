-- =====================================================================
-- PASO 25 — FACTURAR EN OTRA MONEDA QUE LA DEL PROYECTO
--
-- Se cotiza en dólares y se factura en pesos. Es el caso normal, no la
-- excepción, y hasta ahora la base no lo dejaba: el trigger del paso 17
-- exigía que la factura fuera en la misma moneda que su proyecto.
--
-- Esa regla existía por un motivo bueno, y el motivo sigue vigente: el
-- «sin facturar» de un proyecto es `cotizado − facturado`, y si las
-- facturas estuvieran en otra moneda esa resta sería peras menos
-- manzanas. Lo que cambia no es el cuidado, es cómo se consigue.
--
-- LA MISMA FORMA QUE YA TIENEN LOS COBROS. Un cobro guarda `amount` (lo
-- que entró, en la moneda de la cuenta) y `applied_amount` (cuánto salda
-- de lo cotizado, en la moneda del proyecto). La factura pasa a tener
-- exactamente eso: `importe` + `moneda` es el papel que recibe el
-- cliente, y `aplicado` es cuánto de lo cotizado salda ese papel.
--
-- La cotización NO se guarda: sale de dividir uno por el otro. Es la
-- misma decisión que tomó el paso de los cobros — la cotización es una
-- consecuencia de los dos montos, no un tercer dato que pueda quedar
-- diciendo algo distinto.
--
-- NO HACE FALTA MIGRAR NADA. Todas las facturas que hay cumplen hoy que
-- su moneda es la del proyecto, así que quedan con `aplicado` en null y
-- siguen calculando igual que antes.
--
-- Requiere 16 y 17. Es idempotente.
-- =====================================================================

set search_path = public;


-- ---------------------------------------------------------------------
-- 0. Freno de mano
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.facturas') is null then
    raise exception 'Falta correr 16_facturas.sql y 17_facturas_del_cliente.sql';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1. La columna
--
-- Nullable a propósito: `aplicado` sólo tiene sentido cuando la factura
-- es de un proyecto Y está en otra moneda. En cualquier otro caso sería
-- un número repetido, y un dato repetido es un dato que algún día va a
-- discrepar con el original.
-- ---------------------------------------------------------------------
alter table facturas add column if not exists aplicado numeric(14,2);

comment on column facturas.aplicado is
  'Cuanto de lo cotizado salda esta factura, en la moneda del PROYECTO. '
  'Solo cuando la factura va en otra moneda que su proyecto; null si no. '
  'La cotizacion sale de importe / aplicado.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'facturas_aplicado_positivo'
  ) then
    alter table facturas add constraint facturas_aplicado_positivo
      check (aplicado is null or aplicado > 0);
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 2. La regla nueva
--
-- Deja de ser «misma moneda» y pasa a ser «si difieren, decime cuánto
-- salda». Sigue siendo estricta: una factura en otra moneda sin su
-- equivalente dejaría el «sin facturar» del proyecto mintiendo en
-- silencio, que es exactamente lo que la regla vieja evitaba.
-- ---------------------------------------------------------------------
create or replace function validar_moneda_factura()
returns trigger language plpgsql set search_path = public as $$
declare moneda_proyecto currency;
begin
  -- Sin proyecto no hay nada contra qué aplicar: la factura es un servicio
  -- suelto y vale por sí misma.
  if new.project_id is null then
    if new.aplicado is not null then
      raise exception
        'Esta factura no tiene proyecto, asi que no salda nada: el '
        'equivalente tiene que quedar vacio.';
    end if;
    return new;
  end if;

  select currency into moneda_proyecto from projects where id = new.project_id;

  if moneda_proyecto is null then
    return new;
  end if;

  if moneda_proyecto = new.moneda then
    -- Mismo caso de siempre. El equivalente seria el mismo numero otra vez.
    if new.aplicado is not null then
      raise exception
        'La factura ya esta en %, la misma moneda del proyecto: el '
        'equivalente sobra.', new.moneda;
    end if;
    return new;
  end if;

  -- Monedas distintas: se permite, pero hay que decir cuanto salda.
  if new.aplicado is null then
    raise exception
      'La factura esta en % y el proyecto esta cotizado en %. Cargá a '
      'cuanto equivale en %, o dejá la factura sin proyecto.',
      new.moneda, moneda_proyecto, moneda_proyecto;
  end if;

  return new;
end $$;

drop trigger if exists facturas_validar_moneda on facturas;
create trigger facturas_validar_moneda
  before insert or update on facturas
  for each row execute function validar_moneda_factura();


-- ---------------------------------------------------------------------
-- 3. Verificación
-- ---------------------------------------------------------------------
select
  exists (
    select 1 from information_schema.columns
     where table_name = 'facturas' and column_name = 'aplicado'
  ) as columna_lista,
  exists (
    select 1 from pg_constraint where conname = 'facturas_aplicado_positivo'
  ) as check_listo,
  exists (
    select 1 from pg_trigger where tgname = 'facturas_validar_moneda'
  ) as trigger_listo,
  (select count(*) from facturas where aplicado is not null) as facturas_en_otra_moneda;
