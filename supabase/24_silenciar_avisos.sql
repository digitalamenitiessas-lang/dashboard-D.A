-- =====================================================================
-- PASO 24 — SILENCIAR AVISOS
--
-- Los avisos que se repiten todos los días son útiles hasta que uno ya
-- está al tanto. A partir de ahí son ruido, y el problema del ruido no es
-- que moleste: es que uno deja de mirar. El día que aparezca el aviso que
-- sí importaba, va a estar abajo de cinco que no.
--
-- La idea: poder decirle a un aviso «ya sé», y que se calle. Pero
-- «silenciar» NO es «no me cuentes nunca más». Un mantenimiento impago
-- que se silencia y desaparece para siempre es plata que no se cobra.
--
-- Por eso el silencio se rompe solo de dos maneras:
--
--   1. Se cumple el plazo que se eligió (una semana, un mes, lo que sea).
--   2. LA SITUACIÓN EMPEORA. El mantenimiento pasa de uno a dos períodos
--      impagos; el dominio pasa de «vence en veinte días» a VENCIDO. Ahí
--      el aviso vuelve aunque el plazo no se haya cumplido, porque ya no
--      es el mismo aviso que se silenció.
--
-- Cada aviso recurrente trae un número de gravedad, y el silencio guarda
-- cuál era cuando se puso. Si después llega uno más alto, se levanta.
--
-- Requiere 20_push. Es idempotente.
-- =====================================================================

set search_path = public;


-- ---------------------------------------------------------------------
-- 1. La tabla
--
-- Una fila por asunto, no por aviso mandado. El `asunto` es la identidad
-- estable de la cosa avisada —`mnt-<proyecto>`, `dom-<proyecto>`— que es
-- el mismo id que ya usa `buildAlerts()` en el cliente. No hizo falta
-- inventar nada: las dos puntas ya llamaban igual a lo mismo.
--
-- Guarda también lo último que se vio de cada asunto. Eso es lo que
-- permite que silenciar desde la pantalla no tenga que mandar la gravedad
-- —el servidor ya la sabe— y evita que el cliente y la base calculen la
-- misma cuenta de dos formas que con el tiempo se separan.
-- ---------------------------------------------------------------------
create table if not exists avisos (
  asunto      text primary key,

  -- ---- Lo último que vio el reloj diario ------------------------------
  titulo      text not null default '',
  gravedad    numeric not null default 0,
  visto_at    timestamptz not null default now(),

  -- ---- El silencio, si lo hay ----------------------------------------
  -- Los dos van juntos o no va ninguno: un silencio sin la gravedad de
  -- referencia no se puede levantar cuando la cosa empeora.
  silenciado_hasta     date,      -- null con silencio activo = sin plazo
  silenciado_gravedad  numeric,
  silenciado_at        timestamptz,

  constraint avisos_silencio_completo check (
    (silenciado_gravedad is null and silenciado_at is null)
    or
    (silenciado_gravedad is not null and silenciado_at is not null)
  )
);

create index if not exists avisos_silenciados_idx
  on avisos (silenciado_at desc) where silenciado_at is not null;

alter table avisos enable row level security;
drop policy if exists authenticated_all on avisos;
create policy authenticated_all on avisos
  for all to authenticated using (true) with check (true);


-- ---------------------------------------------------------------------
-- 2. Avisar, pero de algo recurrente
--
-- Es la puerta por la que pasan los avisos del reloj diario. Los de una
-- sola vez —un cobro que se registró, una propuesta que salió— siguen
-- llamando a `notificar()` directo y NO se pueden silenciar: no hace
-- falta callar algo que suena una vez.
--
-- Se hizo aparte en vez de agregarle parámetros a `notificar()` a
-- propósito. `emitir_recibo` y `emitir_propuesta` preguntan por la firma
-- exacta con `to_regprocedure('public.notificar(text,text,text,text)')`;
-- agregarle argumentos aunque sea con default cambia esa firma, la
-- pregunta empieza a dar null y esas dos funciones dejan de avisar en
-- silencio. Un bug que no se ve hasta que alguien nota que hace semanas
-- no llega el aviso de un recibo.
--
-- De paso el `dedupe_key` con la fecha se arma en un solo lugar, en vez
-- de repetirse en cada uno de los cinco llamados.
-- ---------------------------------------------------------------------
create or replace function avisar_recurrente(
  p_asunto   text,
  p_titulo   text,
  p_cuerpo   text,
  p_url      text,
  p_gravedad numeric default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  a   avisos;
  callado boolean := false;
begin
  select * into a from avisos where asunto = p_asunto;

  if found and a.silenciado_at is not null then
    callado :=
      (a.silenciado_hasta is null or a.silenciado_hasta >= hoy)
      and p_gravedad <= a.silenciado_gravedad;
  end if;

  -- Se anota SIEMPRE lo último visto, esté callado o no: es lo que la
  -- pantalla muestra al listar los silenciados, y lo que se usa de
  -- referencia si mañana alguien lo vuelve a silenciar.
  insert into avisos (asunto, titulo, gravedad, visto_at)
  values (p_asunto, p_titulo, p_gravedad, now())
  on conflict (asunto) do update
    set titulo   = excluded.titulo,
        gravedad = excluded.gravedad,
        visto_at = excluded.visto_at,
        -- Si dejó de estar callado —se cumplió el plazo o empeoró— el
        -- silencio se levanta acá. No queda colgado esperando que alguien
        -- lo saque a mano.
        silenciado_hasta    = case when callado then avisos.silenciado_hasta end,
        silenciado_gravedad = case when callado then avisos.silenciado_gravedad end,
        silenciado_at       = case when callado then avisos.silenciado_at end;

  if callado then
    return;
  end if;

  perform notificar(p_titulo, p_cuerpo, p_url, p_asunto || '-' || hoy);
end $$;


-- ---------------------------------------------------------------------
-- 3. Silenciar y reactivar, desde la pantalla
-- ---------------------------------------------------------------------

/**
 * `p_dias` null = sin plazo: se calla hasta que empeore, o hasta que
 * alguien lo reactive a mano.
 *
 * `p_gravedad` sólo hace falta para los avisos que el reloj diario todavía
 * no vio —los que la pantalla calcula sola, como los tickets—. Para el
 * resto se usa la que ya está anotada, que es la única que no puede
 * discrepar con la que va a comparar mañana.
 */
create or replace function silenciar_aviso(
  p_asunto   text,
  p_dias     int default null,
  p_titulo   text default '',
  p_gravedad numeric default null
)
returns avisos
language plpgsql
security definer
set search_path = public
as $$
declare
  hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  a   avisos;
begin
  if coalesce(btrim(p_asunto), '') = '' then
    raise exception 'Falta el asunto';
  end if;
  if p_dias is not null and p_dias < 1 then
    raise exception 'El plazo tiene que ser de al menos un día';
  end if;

  insert into avisos (asunto, titulo, gravedad)
  values (p_asunto, coalesce(p_titulo, ''), coalesce(p_gravedad, 0))
  on conflict (asunto) do nothing;

  update avisos
     set silenciado_hasta    = case when p_dias is null then null else hoy + p_dias end,
         silenciado_gravedad = coalesce(p_gravedad, gravedad),
         silenciado_at       = now(),
         titulo = case when coalesce(btrim(p_titulo), '') <> '' then p_titulo else titulo end
   where asunto = p_asunto
  returning * into a;

  return a;
end $$;

create or replace function reactivar_aviso(p_asunto text)
returns void
language sql
security definer
set search_path = public
as $$
  update avisos
     set silenciado_hasta = null,
         silenciado_gravedad = null,
         silenciado_at = null
   where asunto = p_asunto;
$$;

revoke all on function avisar_recurrente(text, text, text, text, numeric) from public;
revoke all on function silenciar_aviso(text, int, text, numeric) from public;
revoke all on function reactivar_aviso(text) from public;
grant execute on function silenciar_aviso(text, int, text, numeric) to authenticated;
grant execute on function reactivar_aviso(text) to authenticated;


-- ---------------------------------------------------------------------
-- 4. El reloj diario, ahora silenciable
--
-- Se reescriben las dos funciones enteras en vez de parchearlas: el único
-- cambio es que cada `notificar()` pasa a ser `avisar_recurrente()` con
-- su asunto y su gravedad, y así queda a la vista cuál es la gravedad de
-- cada uno.
--
-- LA GRAVEDAD ES A ESCALONES, NO UN CONTINUO. Es la decisión que hace que
-- esto sirva. Si la gravedad del proyecto demorado fueran los días de
-- atraso, subiría todos los días, rompería el silencio todos los días, y
-- silenciar no serviría de nada. Por eso son semanas: un proyecto
-- demorado vuelve a avisar una vez por semana, no una vez por día.
-- ---------------------------------------------------------------------
create or replace function revisar_vencimientos()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  r record;
  venc date;
  impagos int;
begin
  -- Mantenimientos: períodos vencidos sin cobro.
  -- Gravedad: la cantidad de períodos impagos.
  for r in
    select p.id, p.name, m.amount, m.currency::text as mon, m.frequency::text as freq,
           m.due_day, coalesce(m.start_date, m.implementation_date) as desde
      from project_maintenance m
      join projects p on p.id = m.project_id
     where m.active and m.status = 'Activo'
       and coalesce(m.start_date, m.implementation_date) is not null
  loop
    impagos := 0;
    venc := make_date(
      extract(year from r.desde)::int,
      extract(month from r.desde)::int,
      least(r.due_day, 28)
    );
    while venc <= hoy loop
      if not exists (
        select 1 from maintenance_charges c
         where c.project_id = r.id
           and c.charged_on >= venc - interval '10 days'
           and c.charged_on <  venc + (case r.freq
                 when 'Mensual' then interval '1 month'
                 when 'Trimestral' then interval '3 months'
                 when 'Semestral' then interval '6 months'
                 else interval '12 months' end)
      ) then
        impagos := impagos + 1;
      end if;
      venc := venc + (case r.freq
        when 'Mensual' then interval '1 month'
        when 'Trimestral' then interval '3 months'
        when 'Semestral' then interval '6 months'
        else interval '12 months' end);
    end loop;

    if impagos > 0 then
      perform avisar_recurrente(
        'mnt-' || r.id,
        'Mantenimiento sin cobrar · ' || r.name,
        impagos || ' período(s) · ' || r.mon || ' ' ||
          to_char(r.amount * impagos, 'FM999G999G999D00') || ' sin registrar',
        '/mantenimientos',
        impagos
      );
    end if;
  end loop;

  -- Dominios por vencer.
  -- Gravedad a dos escalones: por vencer (1) y vencido (2). Con los días
  -- restantes como gravedad, cada día sería «peor» y el silencio no
  -- duraría nunca.
  for r in
    select p.id, p.name, i.domain, i.domain_expiry
      from project_infrastructure i
      join projects p on p.id = i.project_id
     where i.domain_expiry is not null
       and i.domain_expiry <= hoy + 30
  loop
    perform avisar_recurrente(
      'dom-' || r.id,
      case when r.domain_expiry < hoy
           then 'Dominio VENCIDO · ' || r.domain
           else 'Dominio por vencer · ' || r.domain end,
      r.name || ' — ' || abs(r.domain_expiry - hoy) || ' día(s)',
      '/infraestructura',
      case when r.domain_expiry < hoy then 2 else 1 end
    );
  end loop;

  -- Recordatorios de notas.
  -- Tres escalones: mañana (1), hoy (2), ya venció (3).
  for r in
    select n.id, n.title, n.reminder_date
      from notes n
     where n.reminder_date is not null
       and n.reminder_date <= hoy + 1
  loop
    perform avisar_recurrente(
      'nota-' || r.id,
      'Recordatorio · ' || r.title,
      case when r.reminder_date < hoy
           then 'Venció hace ' || (hoy - r.reminder_date) || ' día(s)'
           when r.reminder_date = hoy then 'Es hoy'
           else 'Es mañana' end,
      '/notas',
      case when r.reminder_date < hoy then 3
           when r.reminder_date = hoy then 2
           else 1 end
    );
  end loop;

  -- Proyectos demorados.
  -- Gravedad en SEMANAS de atraso, no en días: así vuelve a avisar una vez
  -- por semana mientras se sigue atrasando, en vez de todos los días.
  for r in
    select p.id, p.name, p.estimated_delivery
      from projects p
     where p.estimated_delivery is not null
       and p.estimated_delivery < hoy
       and p.status not in ('Implementado', 'En mantenimiento', 'Finalizado')
  loop
    perform avisar_recurrente(
      'late-' || r.id,
      'Proyecto demorado · ' || r.name,
      (hoy - r.estimated_delivery) || ' día(s) pasada la entrega estimada',
      '/proyectos/' || r.id,
      floor((hoy - r.estimated_delivery) / 7.0) + 1
    );
  end loop;
end $$;


-- Gastos fijos. Mismo criterio que el mantenimiento: la gravedad es la
-- cantidad de períodos impagos.
do $$
begin
  if to_regclass('public.fixed_expenses') is null then
    raise notice 'Sin 10_gastos.sql: se saltea revisar_gastos_vencidos()';
    return;
  end if;

  execute $fn$
  create or replace function revisar_gastos_vencidos()
  returns void
  language plpgsql
  security definer
  set search_path = public
  as $body$
  declare
    hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
    r record;
    venc date;
    paso interval;
    impagos int;
    guarda int;
  begin
    for r in
      select e.id, e.concept, e.amount, e.currency::text as mon,
             e.frequency::text as freq, e.due_day, e.started_on, e.ended_on
        from fixed_expenses e
       where e.started_on <= hoy
         and (e.ended_on is null or e.ended_on >= hoy)
    loop
      paso := case r.freq
        when 'Mensual'    then interval '1 month'
        when 'Trimestral' then interval '3 months'
        when 'Semestral'  then interval '6 months'
        else interval '12 months' end;

      impagos := 0;
      guarda  := 0;
      venc := make_date(
        extract(year  from r.started_on)::int,
        extract(month from r.started_on)::int,
        least(r.due_day, 28)
      );

      while venc <= hoy and guarda < 400 loop
        if not exists (
          select 1 from money_movements m
           where m.fixed_expense_id = r.id
             and m.period_start = venc
        ) then
          impagos := impagos + 1;
        end if;
        venc   := (venc + paso)::date;
        guarda := guarda + 1;
      end loop;

      if impagos > 0 then
        perform avisar_recurrente(
          'gfx-' || r.id,
          'Gasto fijo sin pagar · ' || r.concept,
          impagos || ' período(s) · ' || r.mon || ' '
            || to_char(r.amount * impagos, 'FM999G999G999D00') || ' sin registrar',
          '/gastos',
          impagos
        );
      end if;
    end loop;
  end $body$;
  $fn$;
end $$;


-- ---------------------------------------------------------------------
-- 5. Verificación
-- ---------------------------------------------------------------------
select
  (select count(*) from avisos)                                     as asuntos_conocidos,
  (select count(*) from avisos where silenciado_at is not null)     as silenciados,
  (to_regprocedure('public.avisar_recurrente(text,text,text,text,numeric)') is not null) as avisar_listo,
  (to_regprocedure('public.silenciar_aviso(text,int,text,numeric)') is not null)         as silenciar_listo,
  -- La firma vieja tiene que seguir existiendo: emitir_recibo y
  -- emitir_propuesta preguntan por ella antes de avisar.
  (to_regprocedure('public.notificar(text,text,text,text)') is not null)                 as notificar_intacta;
