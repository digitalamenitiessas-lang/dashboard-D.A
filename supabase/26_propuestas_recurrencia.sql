-- =====================================================================
-- PASO 26 — EL TOTAL DE UNA PROPUESTA NO SUMA LO QUE SE COBRA TODOS LOS MESES
--
-- `emitir_propuesta` sumaba todos los ítems por igual. Con un desarrollo de
-- 8.500 y un mantenimiento de 300 por mes daba 8.800, y esos 8.800 no son
-- lo que el cliente paga: son dos compromisos distintos. Como acá siempre
-- se cotiza desarrollo más mantenimiento, salía mal en todas.
--
-- Cada ítem ahora trae `recurrencia` en el json (unica, mensual,
-- trimestral, semestral, anual). La columna `total` pasa a ser lo que se
-- paga UNA SOLA VEZ, que es lo que contesta «¿por cuánto salió?» en la
-- lista y en el aviso.
--
-- No hay nada que migrar: a las propuestas emitidas antes de que existiera
-- el campo se las lee como únicas, que es exactamente lo que eran.
--
-- Requiere 23_propuestas. Es idempotente.
-- =====================================================================

set search_path = public;

do $$
begin
  if to_regclass('public.propuestas') is null then
    raise exception 'Falta correr 23_propuestas.sql';
  end if;
end $$;


create or replace function emitir_propuesta(p_contenido jsonb, p_plantilla text)
returns propuestas
language plpgsql
security definer
set search_path = public
as $$
declare
  nuevo     propuestas;
  v_total   numeric(14,2);
  v_mensual numeric(14,2);
  v_mon     public.currency;
  v_cli     text;
  v_tit     text;
  v_extra   text := '';
begin
  if p_plantilla not in ('corta', 'larga') then
    raise exception 'Plantilla desconocida: %', p_plantilla;
  end if;

  -- Lo que se paga una sola vez. `coalesce` sobre la recurrencia: lo que no
  -- la trae es de antes del paso 26 y era único.
  select coalesce(sum((i->>'cantidad')::numeric * (i->>'precioUnitario')::numeric), 0)
    into v_total
    from jsonb_array_elements(coalesce(p_contenido->'items', '[]'::jsonb)) as i
   where i->>'precioUnitario' is not null
     and i->>'precioUnitario' <> ''
     and coalesce(i->>'recurrencia', 'unica') = 'unica';

  -- Lo mensual, sólo para el aviso. Las otras frecuencias —trimestral,
  -- semestral, anual— quedan en el json y salen en el PDF, pero no en el
  -- push: son raras, y meterlas obligaría a un aviso de tres renglones.
  select coalesce(sum((i->>'cantidad')::numeric * (i->>'precioUnitario')::numeric), 0)
    into v_mensual
    from jsonb_array_elements(coalesce(p_contenido->'items', '[]'::jsonb)) as i
   where i->>'precioUnitario' is not null
     and i->>'precioUnitario' <> ''
     and i->>'recurrencia' = 'mensual';

  v_mon := coalesce(nullif(p_contenido->>'moneda', ''), 'USD')::public.currency;
  v_cli := coalesce(nullif(btrim(p_contenido#>>'{cliente,nombre}'), ''), 'Sin especificar');
  v_tit := coalesce(nullif(btrim(p_contenido->>'titulo'), ''), 'Propuesta');

  insert into propuestas (
    plantilla, cliente_nombre, titulo, total, moneda, validez_dias, contenido
  )
  values (
    p_plantilla, v_cli, v_tit, v_total, v_mon,
    nullif(p_contenido->>'validezDias', '')::integer,
    p_contenido
  )
  returning * into nuevo;

  -- El cuerpo del aviso, armado según lo que haya.
  --
  -- El total único puede ser CERO y no es un error: una propuesta de puro
  -- mantenimiento es perfectamente válida. Pero `FM` le come el dígito
  -- adelante de la coma, así que un cero se imprime «.00» y el aviso
  -- quedaba «USD .00 + USD 300,00/mes». En ese caso se muestra sólo la
  -- parte mensual, que es toda la propuesta.
  --
  -- El monto SIEMPRE con el código de moneda: USD y ARS comparten el «$» y
  -- un «$625» en un aviso se lee como pesos.
  if v_mensual > 0 then
    v_extra := v_mon::text || ' '
      || to_char(v_mensual, 'FM999G999G999D00') || '/mes';
  end if;

  if to_regprocedure('public.notificar(text,text,text,text)') is not null then
    perform notificar(
      'Propuesta N° ' || nuevo.numero || ' · ' || nuevo.cliente_nombre,
      case
        when v_total > 0 and v_extra <> '' then
          v_mon::text || ' ' || to_char(v_total, 'FM999G999G999D00')
            || ' + ' || v_extra
        when v_total > 0 then
          v_mon::text || ' ' || to_char(v_total, 'FM999G999G999D00')
        when v_extra <> '' then v_extra
        else 'Sin importes cargados'
      end || ' · ' || nuevo.titulo,
      '/propuestas'
    );
  end if;

  return nuevo;
end $$;

revoke all on function emitir_propuesta(jsonb, text) from public;
grant execute on function emitir_propuesta(jsonb, text) to authenticated;


-- ---------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------
select
  (to_regprocedure('public.emitir_propuesta(jsonb,text)') is not null) as funcion_lista,
  (select count(*) from propuestas)                                   as propuestas_emitidas;
