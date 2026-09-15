-- =====================================================================
-- PASO 19 — COTIZACIÓN DEL DÓLAR, AL BNA
--
-- Se factura al dólar del Banco Nación, nunca al blue. Hasta ahora la
-- cotización se tipeaba a mano en cada operación, así que dos cobros del
-- mismo día podían quedar a valores distintos y nadie guardaba con qué
-- número se había facturado.
--
-- Una tabla con una fila por día y un reloj que la llena sola.
--
-- FUENTE: dolarapi.com/v1/dolares/oficial. No hay endpoint de "banco
-- nación" que funcione (el de bancos/nacion devuelve vacío), pero el
-- "oficial" viene siguiendo al BNA al peso: verificado contra
-- bna.com.ar/Personas el 15-09-2026, compra 1480 / venta 1530 en los dos.
-- Si algún día se despegan, se cambia la URL en `app_settings` y listo:
-- no hay que tocar este script.
--
-- POR QUÉ `venta` Y NO `compra`: el cliente que nos paga en pesos un
-- servicio cotizado en dólares tiene que comprar esos dólares, y los
-- compra al valor de venta del banco. Cobrar al de compra sería
-- regalarle la diferencia (hoy, 50 pesos por dólar). Las dos se guardan
-- igual, para poder auditar y para no tener que volver a pedirlas.
--
-- NO reemplaza el criterio de no sumar monedas distintas. Esto sirve
-- para UNA operación concreta —cuánto pesos son estos dólares hoy— y
-- queda registrada con el pago. Los totales del sistema siguen yendo
-- por `MoneyByCurrency`, bucket por bucket.
--
-- Requiere pg_net y pg_cron (los activa 20_push.sql). Es idempotente.
-- =====================================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- `app_settings` la crea el 20_push. Si todavía no está, la creamos acá
-- con el mismo criterio: RLS prendida y sin políticas, o sea que sólo la
-- leen las funciones `security definer`.
create table if not exists app_settings (
  key   text primary key,
  value text not null
);
alter table app_settings enable row level security;


-- ---------------------------------------------------------------------
-- 1. Una fila por día
--
-- `fecha` es la clave: dos corridas del mismo día pisan el valor en vez
-- de acumular filas. Lo que importa es "con qué cotización se factura
-- hoy", no el minuto a minuto.
-- ---------------------------------------------------------------------
create table if not exists cotizaciones (
  fecha     date primary key,
  compra    numeric(12,4) not null check (compra > 0),
  venta     numeric(12,4) not null check (venta  > 0),
  fuente    text not null default 'BNA',
  -- Cuándo la trajimos, que no es lo mismo que a qué día corresponde.
  tomada_at timestamptz not null default now(),

  constraint cotizaciones_venta_mayor check (venta >= compra)
);

create index if not exists cotizaciones_fecha_idx on cotizaciones (fecha desc);

alter table cotizaciones enable row level security;
drop policy if exists authenticated_lee on cotizaciones;
-- Sólo lectura desde la app: la escribe el reloj, no una persona. Si
-- hiciera falta corregir una a mano, se hace desde el SQL Editor.
create policy authenticated_lee on cotizaciones
  for select to authenticated using (true);


-- ---------------------------------------------------------------------
-- 2. Traerla
--
-- pg_net es asincrónico: `http_get` devuelve un id y la respuesta cae
-- después en `net._http_response`. En vez de esperarla —que en una
-- función de Postgres no se puede hacer bien— cada corrida hace dos
-- cosas: primero levanta la respuesta que pidió la corrida ANTERIOR, y
-- después dispara el pedido siguiente. Se auto-repara: si una corrida
-- falla, la que viene levanta lo que haya y sigue.
-- ---------------------------------------------------------------------
create or replace function tomar_cotizacion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  url        text;
  pedido_id  bigint;
  cuerpo     jsonb;
  estado     int;
  v_compra   numeric;
  v_venta    numeric;
  v_fecha    date;
begin
  select value into url from app_settings where key = 'cotizacion_url';
  if url is null then
    url := 'https://dolarapi.com/v1/dolares/oficial';
    insert into app_settings (key, value) values ('cotizacion_url', url)
    on conflict (key) do nothing;
  end if;

  -- (a) Levantar la respuesta del pedido anterior, si hay uno esperando.
  select value::bigint into pedido_id
    from app_settings where key = 'cotizacion_pedido_id';

  if pedido_id is not null then
    select r.status_code, r.content::jsonb
      into estado, cuerpo
      from net._http_response r
     where r.id = pedido_id;

    if estado = 200 and cuerpo is not null then
      v_compra := (cuerpo ->> 'compra')::numeric;
      v_venta  := (cuerpo ->> 'venta')::numeric;
      -- La fecha del proveedor, no la nuestra: un feriado devuelve la
      -- cotización del día hábil anterior, y esa es la que corresponde.
      v_fecha  := coalesce(
        ((cuerpo ->> 'fechaActualizacion')::timestamptz
           at time zone 'America/Argentina/Buenos_Aires')::date,
        (now() at time zone 'America/Argentina/Buenos_Aires')::date
      );

      if v_compra > 0 and v_venta > 0 then
        insert into cotizaciones (fecha, compra, venta, fuente)
        values (v_fecha, v_compra, v_venta, 'BNA')
        on conflict (fecha) do update
          set compra    = excluded.compra,
              venta     = excluded.venta,
              tomada_at = now();
      end if;
    end if;

    delete from app_settings where key = 'cotizacion_pedido_id';
  end if;

  -- (b) Disparar el pedido de esta corrida.
  select net.http_get(url := url, timeout_milliseconds := 8000) into pedido_id;

  insert into app_settings (key, value) values ('cotizacion_pedido_id', pedido_id::text)
  on conflict (key) do update set value = excluded.value;
end $$;


-- ---------------------------------------------------------------------
-- 3. La que vale hoy
--
-- Devuelve la última que tengamos, sea de hoy o del último día hábil.
-- `dias_de_atraso` es lo que le permite a la pantalla avisar cuando el
-- número está viejo en vez de mostrarlo como si fuera de hoy.
-- ---------------------------------------------------------------------
create or replace function cotizacion_vigente()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select case when c.fecha is null then null else json_build_object(
    'fecha',         c.fecha,
    'compra',        c.compra,
    'venta',         c.venta,
    'fuente',        c.fuente,
    'tomadaAt',      c.tomada_at,
    'diasDeAtraso',  (now() at time zone 'America/Argentina/Buenos_Aires')::date - c.fecha
  ) end
  from cotizaciones c
  order by c.fecha desc
  limit 1;
$$;

revoke all on function cotizacion_vigente() from public;
grant execute on function cotizacion_vigente() to authenticated;


-- ---------------------------------------------------------------------
-- 4. El reloj
--
-- Cada hora en días hábiles, de 9 a 19. El BNA publica una vez por la
-- mañana y a veces corrige, así que pedirla seguido cuesta nada y evita
-- facturar con la de ayer. Fuera de ese rango no cambia nunca.
-- Los horarios van en UTC: Argentina es UTC-3 todo el año.
-- ---------------------------------------------------------------------
select cron.unschedule('tomar-cotizacion')
 where exists (select 1 from cron.job where jobname = 'tomar-cotizacion');

select cron.schedule(
  'tomar-cotizacion', '0 12-22 * * 1-5', $cron$ select tomar_cotizacion(); $cron$
);

-- Una primera corrida ahora, para no arrancar con la tabla vacía. Hacen
-- falta dos: la primera dispara el pedido y la segunda lo levanta.
select tomar_cotizacion();
select pg_sleep(3);
select tomar_cotizacion();


-- ---------------------------------------------------------------------
-- 5. Verificación — tiene que devolver la cotización de hoy
-- ---------------------------------------------------------------------
select
  (select count(*) from cotizaciones)               as filas,
  (select cotizacion_vigente())                     as vigente,
  (select string_agg(jobname, ', ' order by jobname)
     from cron.job where jobname = 'tomar-cotizacion') as reloj;
