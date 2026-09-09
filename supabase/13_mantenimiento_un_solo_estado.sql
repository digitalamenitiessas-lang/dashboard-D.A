-- =====================================================================
-- PASO 13 — UN SOLO ESTADO PARA EL MANTENIMIENTO
--
-- `project_maintenance` tenia DOS columnas que dicen lo mismo:
--
--     active  boolean
--     status  maintenance_status  ('Activo' | 'Pausado' | 'Cancelado')
--
-- y toda la logica derivada exigia LAS DOS a la vez:
--
--     if (!m.active || m.status !== 'Activo') return ...
--
-- O sea que una fila con active=true y status='Pausado' —o al reves—
-- desaparecia EN SILENCIO de la mora, del proximo cobro, de las alertas y
-- del push diario. El plan seguia existiendo, el cliente seguia debiendo,
-- y la app no mostraba nada. Es exactamente el anti-patron que este mismo
-- repo documenta y evita a proposito en `fixed_expenses` (paso 10, sin
-- columna status) y en `tickets` (paso 11, sin columna status): «dos
-- formas de decir lo mismo y una de las dos siempre termina mintiendo».
--
-- LA SALIDA NO ES BORRAR `active`. La leen cinco scripts SQL, entre ellos
-- `revisar_vencimientos()` del paso 20, que es la que corre todos los dias
-- a las 9 y manda los avisos al celular. Borrar la columna la romperia en
-- silencio hasta que alguien notara que dejaron de llegar avisos.
--
-- En vez de eso, `active` pasa a ser una columna GENERADA a partir de
-- `status`. Queda un solo dato que se escribe —`status`— y `active` es su
-- sombra calculada: sigue existiendo, se sigue leyendo igual desde todo el
-- SQL viejo, y ya no puede discrepar. Postgres rechaza cualquier intento
-- de escribirla, asi que la desincronizacion deja de ser posible tambien
-- para lo que se cargue a mano.
--
-- Requiere 03_schema.sql. Es idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Freno de mano
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.project_maintenance') is null then
    raise exception 'Falta correr 03_schema.sql: no existe project_maintenance.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1. Antes de tocar nada: que se ve hoy
--
-- Las filas incoherentes, si las hay. Se listan ANTES de arreglarlas para
-- que quede el registro de que habia y no haya que adivinarlo despues.
-- ---------------------------------------------------------------------
do $$
declare incoherentes int;
begin
  -- Si `active` ya es generada, este script ya se corrio: no hay nada que
  -- reconciliar y el conteo daria cero igual.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'project_maintenance'
       and column_name = 'active' and is_generated = 'ALWAYS'
  ) then
    raise notice 'active ya es una columna generada: nada que reconciliar.';
    return;
  end if;

  execute $q$
    select count(*) from project_maintenance
     where active <> (status = 'Activo')
  $q$ into incoherentes;

  if incoherentes > 0 then
    raise notice
      '% fila(s) con active y status en desacuerdo. Se reconcilian abajo '
      'preservando el comportamiento actual: un plan queda Activo SOLO si '
      'hoy se estaba comportando como activo (active AND status=Activo).',
      incoherentes;
  else
    raise notice 'active y status ya estaban de acuerdo en todas las filas.';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 2. Reconciliar
--
-- El criterio NO es inventar una intencion sino PRESERVAR lo que la app
-- venia haciendo. Hoy un plan se comporta como activo si y solo si
-- `active AND status = 'Activo'`. Entonces:
--
--   active=true,  status='Activo'     -> Activo     (se comportaba activo)
--   active=true,  status='Pausado'    -> Pausado    (no se comportaba activo)
--   active=true,  status='Cancelado'  -> Cancelado  (idem)
--   active=false, status='Activo'     -> Pausado    (idem; el status mentia)
--   active=false, status<>'Activo'    -> sin cambio
--
-- Nadie se vuelve activo de golpe. El unico movimiento posible es hacia
-- 'Pausado', y sobre filas que la app ya trataba como no activas — asi que
-- ni la mora ni los avisos cambian de un dia para el otro por correr esto.
-- Un plan que en realidad estaba vigente se reactiva desde la pantalla,
-- que ahora deja editarlo.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'project_maintenance'
       and column_name = 'active' and is_generated = 'ALWAYS'
  ) then
    return; -- ya migrado
  end if;

  execute $q$
    update project_maintenance
       set status = 'Pausado'
     where not active and status = 'Activo'
  $q$;
end $$;


-- ---------------------------------------------------------------------
-- 3. `active` pasa a ser la sombra calculada de `status`
--
-- Se borra y se vuelve a crear porque Postgres no deja convertir una
-- columna comun en generada. El nombre y el tipo quedan iguales, asi que
-- todo el SQL que la lee —`revisar_vencimientos()` del paso 20 y los
-- scripts 90 a 95— sigue funcionando sin tocar una linea.
--
-- Lo que SI cambia: nadie puede volver a escribirla. Un
-- `update ... set active = true` ahora falla con un error explicito en vez
-- de dejar la fila en un estado imposible.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'project_maintenance'
       and column_name = 'active' and is_generated = 'ALWAYS'
  ) then
    return; -- ya migrado
  end if;

  execute 'alter table project_maintenance drop column active';
  execute $q$
    alter table project_maintenance
      add column active boolean
      generated always as (status = 'Activo') stored
  $q$;
end $$;

comment on column project_maintenance.active is
  'DERIVADA de status. No se escribe: Postgres la rechaza. Existe para que '
  'el SQL que ya la leia siga funcionando.';

comment on column project_maintenance.status is
  'El unico estado que se escribe. Activo | Pausado | Cancelado.';


-- ---------------------------------------------------------------------
-- 3b. Que un importe no pueda ser negativo
--
-- Ninguna de las dos tablas tenia CHECK sobre `amount`: la base aceptaba 0
-- y aceptaba negativos. Un importe negativo en el plan hace que la mora
-- —que se calcula como periodos_impagos * amount— de un total NEGATIVO,
-- o sea que el cliente figuraria como si nos debiera plata al reves. El
-- precedente de como se hace esto en el repo ya existe:
-- `fixed_expenses.amount` lleva `check (amount > 0)` desde el paso 10.
--
-- Va `>= 0` y no `> 0` a proposito: el 0 es el default legitimo de un plan
-- que todavia no se configuro, y toda fila de `project_maintenance` nace
-- asi (la crea el trigger `init_project_children`). Lo que se prohibe es el
-- negativo, que no significa nada.
--
-- Si ya hubiera filas negativas el constraint no se agrega y el script lo
-- avisa, en vez de abortar a mitad de camino.
-- ---------------------------------------------------------------------
do $$
declare malos int;
begin
  if not exists (
    select 1 from pg_constraint where conname = 'project_maintenance_amount_no_negativo'
  ) then
    select count(*) into malos from project_maintenance where amount < 0;
    if malos > 0 then
      raise warning
        'No se agrego el check de importe en project_maintenance: hay % fila(s) '
        'con amount negativo. Arreglalas y volve a correr este script.', malos;
    else
      alter table project_maintenance
        add constraint project_maintenance_amount_no_negativo check (amount >= 0);
    end if;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'maintenance_charges_amount_no_negativo'
  ) then
    select count(*) into malos from maintenance_charges where amount < 0;
    if malos > 0 then
      raise warning
        'No se agrego el check de importe en maintenance_charges: hay % fila(s) '
        'con amount negativo. Arreglalas y volve a correr este script.', malos;
    else
      alter table maintenance_charges
        add constraint maintenance_charges_amount_no_negativo check (amount >= 0);
    end if;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 4. Verificación
-- ---------------------------------------------------------------------
select * from (

  select 1 as orden, '1· ESTRUCTURA' as seccion,
         o.item,
         case when o.ok then '✓ está' else '✗ FALTA' end as detalle
  from (
    select 'active es una columna GENERADA' as item,
           exists (select 1 from information_schema.columns
                    where table_schema = 'public'
                      and table_name = 'project_maintenance'
                      and column_name = 'active'
                      and is_generated = 'ALWAYS') as ok
    union all select 'no queda ninguna fila con active y status en desacuerdo',
           not exists (select 1 from project_maintenance
                        where active <> (status = 'Activo'))
    union all select 'revisar_vencimientos() sigue existiendo (paso 20)',
           to_regprocedure('public.revisar_vencimientos()') is not null
    union all select 'check de importe no negativo en el plan',
           exists (select 1 from pg_constraint
                    where conname = 'project_maintenance_amount_no_negativo')
    union all select 'check de importe no negativo en los cobros',
           exists (select 1 from pg_constraint
                    where conname = 'maintenance_charges_amount_no_negativo')
  ) o

  union all
  select 2, '2· PLANES',
         p.name,
         m.status::text || ' · ' || m.currency::text || ' ' ||
           to_char(m.amount, 'FM999G999G999D00') || ' ' || m.frequency::text ||
           ' · día ' || m.due_day
  from project_maintenance m
  join projects p on p.id = m.project_id
  where m.status <> 'Cancelado' or m.amount > 0

) x
order by orden, item;
