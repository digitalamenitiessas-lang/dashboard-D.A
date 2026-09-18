-- =====================================================================
-- PRUEBA — ¿el silenciado hace lo que dice?
--
-- Se pega en el editor SQL y listo. Imprime OK o MAL por cada cosa, y no
-- deja nada atrás: usa un asunto de mentira y lo borra al final.
--
-- NO MANDA NINGÚN PUSH. Todo corre adentro de un solo bloque, que es una
-- sola transacción: el reloj que despacha la cola no ve filas que todavía
-- no se confirmaron, y para cuando la transacción termina los avisos de
-- prueba ya están borrados.
--
-- Lo que verifica, que es exactamente lo que se prometió:
--   1. Un aviso nuevo suena.
--   2. Silenciado, con la misma gravedad, NO suena.
--   3. Si EMPEORA, vuelve a sonar aunque el plazo no se haya cumplido, y
--      el silencio se levanta solo.
--   4. Si se cumple el plazo, vuelve a sonar.
--   5. Reactivar a mano funciona.
--   6. La firma vieja de notificar() sigue intacta — de eso dependen los
--      avisos de recibos y propuestas.
-- =====================================================================

set search_path = public;

do $$
declare
  hoy     date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  asunto  text := 'zzz-prueba-silencio';
  a       avisos;
  sonaron int;
  bien    int := 0;
  mal     int := 0;
begin
  -- Punto de partida limpio.
  delete from notifications where dedupe_key like asunto || '%';
  delete from avisos where avisos.asunto = asunto;

  -- ---- 1. Un aviso nuevo suena --------------------------------------
  perform avisar_recurrente(asunto, 'PRUEBA', 'cuerpo', '/alertas', 1);
  select count(*) into sonaron from notifications where dedupe_key like asunto || '%';
  if sonaron = 1 then
    raise notice 'OK   1. un aviso nuevo suena';  bien := bien + 1;
  else
    raise notice 'MAL  1. esperaba 1 aviso, hubo %', sonaron;  mal := mal + 1;
  end if;

  -- ---- 2. Silenciado y sin empeorar, NO suena ------------------------
  perform silenciar_aviso(asunto, 7);
  select * into a from avisos where avisos.asunto = asunto;
  if a.silenciado_at is not null and a.silenciado_gravedad = 1
     and a.silenciado_hasta = hoy + 7 then
    raise notice 'OK   2a. quedo silenciado por 7 dias, con gravedad 1 de referencia';
    bien := bien + 1;
  else
    raise notice 'MAL  2a. silencio mal puesto: at=% grav=% hasta=%',
      a.silenciado_at, a.silenciado_gravedad, a.silenciado_hasta;
    mal := mal + 1;
  end if;

  delete from notifications where dedupe_key like asunto || '%';
  perform avisar_recurrente(asunto, 'PRUEBA', 'cuerpo', '/alertas', 1);
  select count(*) into sonaron from notifications where dedupe_key like asunto || '%';
  if sonaron = 0 then
    raise notice 'OK   2b. con la misma gravedad NO suena';  bien := bien + 1;
  else
    raise notice 'MAL  2b. sono igual estando silenciado';  mal := mal + 1;
  end if;

  -- ---- 3. Si empeora, vuelve ----------------------------------------
  perform avisar_recurrente(asunto, 'PRUEBA', 'cuerpo peor', '/alertas', 2);
  select count(*) into sonaron from notifications where dedupe_key like asunto || '%';
  select * into a from avisos where avisos.asunto = asunto;
  if sonaron = 1 then
    raise notice 'OK   3a. al empeorar vuelve a sonar, sin esperar el plazo';
    bien := bien + 1;
  else
    raise notice 'MAL  3a. empeoro y no sono';  mal := mal + 1;
  end if;
  if a.silenciado_at is null then
    raise notice 'OK   3b. el silencio se levanto solo';  bien := bien + 1;
  else
    raise notice 'MAL  3b. el silencio quedo puesto despues de empeorar';  mal := mal + 1;
  end if;

  -- ---- 4. Si se cumple el plazo, vuelve ------------------------------
  perform silenciar_aviso(asunto, 7);
  -- Se hace viejo el plazo a mano, que es mas rapido que esperar una semana.
  update avisos set silenciado_hasta = hoy - 1 where avisos.asunto = asunto;
  delete from notifications where dedupe_key like asunto || '%';
  perform avisar_recurrente(asunto, 'PRUEBA', 'cuerpo', '/alertas', 2);
  select count(*) into sonaron from notifications where dedupe_key like asunto || '%';
  select * into a from avisos where avisos.asunto = asunto;
  if sonaron = 1 and a.silenciado_at is null then
    raise notice 'OK   4. vencido el plazo vuelve a sonar y se limpia el silencio';
    bien := bien + 1;
  else
    raise notice 'MAL  4. plazo vencido: sonaron=% silencio=%', sonaron, a.silenciado_at;
    mal := mal + 1;
  end if;

  -- ---- 5. Sin plazo: se calla hasta que empeore -----------------------
  perform silenciar_aviso(asunto, null);
  select * into a from avisos where avisos.asunto = asunto;
  delete from notifications where dedupe_key like asunto || '%';
  perform avisar_recurrente(asunto, 'PRUEBA', 'cuerpo', '/alertas', 2);
  select count(*) into sonaron from notifications where dedupe_key like asunto || '%';
  if a.silenciado_hasta is null and sonaron = 0 then
    raise notice 'OK   5. sin plazo se queda callado';  bien := bien + 1;
  else
    raise notice 'MAL  5. sin plazo: hasta=% sonaron=%', a.silenciado_hasta, sonaron;
    mal := mal + 1;
  end if;

  -- ---- 6. Reactivar a mano -------------------------------------------
  perform reactivar_aviso(asunto);
  select * into a from avisos where avisos.asunto = asunto;
  delete from notifications where dedupe_key like asunto || '%';
  perform avisar_recurrente(asunto, 'PRUEBA', 'cuerpo', '/alertas', 2);
  select count(*) into sonaron from notifications where dedupe_key like asunto || '%';
  if a.silenciado_at is null and sonaron = 1 then
    raise notice 'OK   6. reactivar a mano lo vuelve a hacer sonar';  bien := bien + 1;
  else
    raise notice 'MAL  6. reactivar: silencio=% sonaron=%', a.silenciado_at, sonaron;
    mal := mal + 1;
  end if;

  -- ---- 7. La firma vieja de notificar() sigue viva --------------------
  -- De esto dependen los avisos de recibos y propuestas, que preguntan por
  -- la firma exacta antes de llamar.
  if to_regprocedure('public.notificar(text,text,text,text)') is not null then
    raise notice 'OK   7. notificar(text,text,text,text) intacta';  bien := bien + 1;
  else
    raise notice 'MAL  7. cambio la firma de notificar: recibos y propuestas dejaron de avisar';
    mal := mal + 1;
  end if;

  -- ---- Limpieza -------------------------------------------------------
  delete from notifications where dedupe_key like asunto || '%';
  delete from avisos where avisos.asunto = asunto;

  raise notice '--------------------------------';
  if mal = 0 then
    raise notice 'TODO BIEN — % chequeos', bien;
  else
    raise notice '% BIEN, % MAL', bien, mal;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- Y el estado de verdad, para mirar de paso
-- ---------------------------------------------------------------------
select
  (select count(*) from avisos)                                 as asuntos_conocidos,
  (select count(*) from avisos where silenciado_at is not null) as silenciados_ahora,
  (select count(*) from notifications where sent_at is null)    as avisos_en_cola;

-- Los asuntos que el reloj ya vio, con su gravedad. Si esto está vacío es
-- porque `revisar_vencimientos()` todavía no corrió desde que se instaló
-- el paso 24: corre una vez por día. Para no esperar:
--     select revisar_vencimientos();
select asunto, titulo, gravedad, visto_at, silenciado_hasta
  from avisos
 order by silenciado_at desc nulls last, gravedad desc
 limit 20;
