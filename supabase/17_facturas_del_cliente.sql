-- =====================================================================
-- PASO 17 — LA FACTURA ES DEL CLIENTE, NO DEL PROYECTO
--
-- El paso 16 colgo la factura de un PROYECTO. Con un caso concreto
-- encima —«cargarle al cliente una factura de Servicio de hosting»— se ve
-- que no alcanza: el hosting no es un proyecto, y obligar a inventarle
-- uno para poder facturarlo ensucia la lista de proyectos con cosas que
-- no son proyectos.
--
-- Ahora:
--
--   cliente_id  OBLIGATORIO. Una factura siempre se le emite a alguien.
--   project_id  OPCIONAL. Si la factura corresponde a un proyecto se lo
--               elige, y los numeros de ese proyecto —facturado, sin
--               facturar— siguen funcionando. Si es un servicio suelto,
--               queda vacio.
--   moneda      PROPIA. Sin proyecto del que heredarla, la factura tiene
--               que decir en que moneda esta.
--   concepto    Que se factura: «Servicio de hosting», «Desarrollo -
--               segunda etapa». Es lo que se lee en la lista.
--
-- Y `payments.project_id` pasa a ser NULLABLE: si una factura puede no
-- tener proyecto, el cobro que la salda tampoco puede tenerlo. Era NOT
-- NULL desde el paso 3.
--
-- Requiere 16_facturas.sql. Es idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Freno de mano
-- ---------------------------------------------------------------------
do $$
declare sin_cliente int;
begin
  if to_regclass('public.facturas') is null then
    raise exception 'Falta correr 16_facturas.sql: no existe facturas.';
  end if;

  -- Si ya hay facturas cargadas, cada una necesita un cliente al que
  -- mudarse, y sale del proyecto. Una factura de un proyecto sin cliente
  -- asignado no tiene a donde ir: mejor abortar con la base intacta que
  -- dejarla a medias.
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='facturas'
                and column_name='project_id' and is_nullable='NO') then
    select count(*) into sin_cliente
      from facturas f
      join projects p on p.id = f.project_id
     where p.client_id is null;

    if sin_cliente > 0 then
      raise exception
        'Hay % factura(s) de proyectos que no tienen cliente asignado. '
        'Asignales el cliente al proyecto (Editar proyecto -> Cliente) y '
        'volve a correr este script.', sin_cliente;
    end if;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 1. Las columnas nuevas
-- ---------------------------------------------------------------------
alter table facturas
  add column if not exists cliente_id uuid references clients(id) on delete restrict,
  add column if not exists concepto   text not null default '',
  add column if not exists moneda     currency;


-- ---------------------------------------------------------------------
-- 2. Mudar lo que ya estuviera cargado
--
-- El cliente y la moneda salen del proyecto, que es de donde salian antes
-- implicitamente. Sobre una tabla vacia no hace nada.
-- ---------------------------------------------------------------------
update facturas f
   set cliente_id = coalesce(f.cliente_id, p.client_id),
       moneda     = coalesce(f.moneda, p.currency)
  from projects p
 where p.id = f.project_id
   and (f.cliente_id is null or f.moneda is null);


-- ---------------------------------------------------------------------
-- 3. Aflojar el proyecto, apretar el cliente
-- ---------------------------------------------------------------------
do $$
begin
  -- project_id pasa a opcional. El FK tambien cambia: con la factura
  -- colgada del cliente, borrar un proyecto ya no tiene por que frenarse
  -- —la factura sobrevive sin el— asi que RESTRICT pasa a SET NULL.
  execute 'alter table facturas alter column project_id drop not null';

  if exists (select 1 from pg_constraint
              where conname = 'facturas_project_id_fkey'
                and conrelid = 'public.facturas'::regclass) then
    execute 'alter table facturas drop constraint facturas_project_id_fkey';
  end if;
  execute 'alter table facturas add constraint facturas_project_id_fkey
             foreign key (project_id) references projects(id) on delete set null';

  -- cliente y moneda pasan a obligatorios. Sobre una tabla vacia entra
  -- derecho; con datos, el punto 2 ya los lleno.
  execute 'alter table facturas alter column cliente_id set not null';
  execute 'alter table facturas alter column moneda set not null';
exception
  when others then
    raise notice 'Ya estaba aplicado o no se pudo: %', sqlerrm;
end $$;

create index if not exists facturas_cliente_idx
  on facturas (cliente_id, emitida_on desc);

comment on column facturas.cliente_id is
  'A quien se le factura. Obligatorio: una factura siempre tiene destinatario.';

comment on column facturas.project_id is
  'Opcional. Con proyecto, suma a los numeros de ese proyecto; sin el, es un '
  'servicio suelto (hosting, soporte).';

comment on column facturas.moneda is
  'Propia, porque sin proyecto no hay de donde heredarla.';


-- ---------------------------------------------------------------------
-- 4. La moneda de una factura CON proyecto tiene que ser la del proyecto
--
-- Un CHECK no puede mirar otra tabla, asi que va un trigger. Sin esto, una
-- factura en pesos sobre un proyecto cotizado en dolares haria que
-- «facturado» y «cotizado» del mismo proyecto esten en monedas distintas,
-- y sumarlos o restarlos —que es lo que hace «sin facturar»— seria
-- exactamente lo que esta app no hace en ningun lado.
-- ---------------------------------------------------------------------
create or replace function validar_moneda_factura()
returns trigger language plpgsql set search_path = public as $$
declare moneda_proyecto currency;
begin
  if new.project_id is null then
    return new;
  end if;

  select currency into moneda_proyecto from projects where id = new.project_id;

  if moneda_proyecto is not null and moneda_proyecto <> new.moneda then
    raise exception
      'La factura esta en % y el proyecto esta cotizado en %. Una factura de '
      'un proyecto va en la moneda de ese proyecto; si es un servicio aparte, '
      'dejala sin proyecto.', new.moneda, moneda_proyecto;
  end if;

  return new;
end $$;

drop trigger if exists facturas_validar_moneda on facturas;
create trigger facturas_validar_moneda
  before insert or update on facturas
  for each row execute function validar_moneda_factura();


-- ---------------------------------------------------------------------
-- 5. Un cobro puede no tener proyecto
--
-- Si una factura de hosting no cuelga de ningun proyecto, el cobro que la
-- salda tampoco puede. Era NOT NULL desde el paso 3.
-- ---------------------------------------------------------------------
alter table payments alter column project_id drop not null;

comment on column payments.project_id is
  'Opcional desde el paso 17: un cobro puede saldar una factura de servicio '
  'que no corresponde a ningun proyecto.';


-- ---------------------------------------------------------------------
-- 6. El cobro y su factura tienen que ser del mismo CLIENTE
--
-- Reemplaza la validacion por proyecto del paso 16, que ya no alcanza: lo
-- que tiene que coincidir ahora es el destinatario. Si el cobro ademas
-- tiene proyecto, ese proyecto tiene que ser el del cliente de la factura.
-- ---------------------------------------------------------------------
create or replace function validar_imputacion_cobro()
returns trigger language plpgsql set search_path = public as $$
declare
  cliente_factura  uuid;
  proyecto_factura uuid;
  cliente_cobro    uuid;
begin
  if new.factura_id is null then
    return new;
  end if;

  select cliente_id, project_id into cliente_factura, proyecto_factura
    from facturas where id = new.factura_id;

  if cliente_factura is null then
    raise exception 'La factura que se quiere imputar no existe.';
  end if;

  -- Si el cobro tiene proyecto, su cliente sale de ahi.
  if new.project_id is not null then
    select client_id into cliente_cobro from projects where id = new.project_id;

    if cliente_cobro is distinct from cliente_factura then
      raise exception
        'Ese cobro y esa factura no son del mismo cliente. Un cobro solo '
        'puede saldar una factura del cliente al que corresponde.';
    end if;

    -- Y si la factura ademas apunta a un proyecto, tiene que ser el mismo.
    if proyecto_factura is not null and proyecto_factura <> new.project_id then
      raise exception
        'Esa factura es de otro proyecto del mismo cliente. Elegi la factura '
        'que corresponde, o saca el proyecto del cobro.';
    end if;
  end if;

  return new;
end $$;


-- ---------------------------------------------------------------------
-- 7. Verificación
-- ---------------------------------------------------------------------
select * from (

  select 1 as orden, '1· ESTRUCTURA' as seccion, o.item,
         case when o.ok then '✓ está' else '✗ FALTA' end as detalle
  from (
    select 'facturas.cliente_id obligatorio' as item,
           exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='facturas'
                      and column_name='cliente_id' and is_nullable='NO') as ok
    union all select 'facturas.project_id opcional',
           exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='facturas'
                      and column_name='project_id' and is_nullable='YES')
    union all select 'facturas.moneda obligatoria',
           exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='facturas'
                      and column_name='moneda' and is_nullable='NO')
    union all select 'facturas.concepto',
           exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='facturas'
                      and column_name='concepto')
    union all select 'payments.project_id opcional',
           exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='payments'
                      and column_name='project_id' and is_nullable='YES')
    union all select 'trigger de moneda coherente con el proyecto',
           exists (select 1 from pg_trigger where tgname='facturas_validar_moneda')
    union all select 'imputación valida por CLIENTE',
           exists (select 1 from pg_proc where proname='validar_imputacion_cobro'
                     and prosrc like '%cliente_factura%')
  ) o

  union all
  select 2, '2· FACTURAS', f.numero,
         c.name || ' · ' || f.moneda::text || ' ' ||
           to_char(f.importe, 'FM999G999G999D00') ||
           case when f.concepto <> '' then ' · ' || f.concepto else '' end ||
           coalesce(' · ' || p.name, ' · sin proyecto')
  from facturas f
  join clients c on c.id = f.cliente_id
  left join projects p on p.id = f.project_id

) x
order by orden, item;
