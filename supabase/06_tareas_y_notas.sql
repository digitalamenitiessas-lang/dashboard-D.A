-- =====================================================================
-- PASO 6 — Tareas por proyecto y notas vinculadas
--
-- Correr DESPUÉS del 03. Es seguro mientras la base esté vacía:
-- elimina las tres columnas de texto de project_development, que quedan
-- reemplazadas por la tabla project_tasks.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tareas / pendientes del proyecto
-- Reemplaza internal_todos, client_todos y blockers por filas propias,
-- para poder marcarlas como hechas y saber cuándo se completaron.
-- ---------------------------------------------------------------------
create type task_kind as enum ('interno', 'cliente', 'bloqueador');

create table project_tasks (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  kind       task_kind not null default 'interno',
  title      text not null,
  done       boolean not null default false,
  done_at    timestamptz,
  created_at timestamptz not null default now()
);

create index project_tasks_project_id_idx on project_tasks (project_id, kind, created_at);

-- done_at se completa y se limpia solo según se tilde o destilde la tarea
create or replace function sync_task_done_at()
returns trigger language plpgsql as $$
begin
  if new.done and not coalesce(old.done, false) then
    new.done_at = now();
  elsif not new.done then
    new.done_at = null;
  end if;
  return new;
end;
$$;

create trigger project_tasks_sync_done_at
  before insert or update on project_tasks
  for each row execute function sync_task_done_at();


-- ---------------------------------------------------------------------
-- Las notas ahora pueden colgar de un proyecto
-- (para cargar una reunión, una idea o un pendiente dentro del proyecto).
-- Sigue siendo opcional: una nota sin project_id es una nota general.
-- ---------------------------------------------------------------------
alter table notes
  add column project_id uuid references projects(id) on delete set null;

create index notes_project_id_idx on notes (project_id, created_at desc);


-- ---------------------------------------------------------------------
-- Quitar las listas de texto que quedan reemplazadas por project_tasks
-- ---------------------------------------------------------------------
alter table project_development
  drop column internal_todos,
  drop column client_todos,
  drop column blockers;


-- ---------------------------------------------------------------------
-- RLS para la tabla nueva (mismo criterio que el resto)
-- ---------------------------------------------------------------------
alter table project_tasks enable row level security;

drop policy if exists authenticated_all on project_tasks;
create policy authenticated_all on project_tasks
  for all to authenticated using (true) with check (true);
