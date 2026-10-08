-- =====================================================================
-- MKT PROCESS · 07 · Horario laboral y archivo de tareas
-- Ejecutar después de events-audit.sql. Es idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- CONFIGURACIÓN GENERAL · una sola fila
-- work_days usa el día ISO: 1 = lunes … 7 = domingo.
-- Las horas son de Ecuador (America/Guayaquil); la app las aplica con esa
-- zona sin importar dónde esté el navegador.
--
-- El tiempo de una tarea y su paso al archivo se CALCULAN al leer, no se
-- guardan: cambiar el horario o los días recalcula todo, también lo
-- pasado, y no hace falta ningún proceso programado.
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  id                  uuid primary key default gen_random_uuid(),
  singleton           boolean not null default true unique check (singleton),
  name                text not null default 'Horario laboral y archivo',   -- rótulo para la auditoría
  work_days           smallint[] not null default '{1,2,3,4,5}'
                        check (cardinality(work_days) > 0 and work_days <@ '{1,2,3,4,5,6,7}'::smallint[]),
  work_start          time not null default '09:00',
  work_end            time not null default '18:00',
  archive_after_days  integer not null default 3 check (archive_after_days between 1 and 365),
  updated_at          timestamptz not null default now(),
  constraint app_settings_hours check (work_end > work_start)
);

insert into public.app_settings (singleton) values (true)
on conflict (singleton) do nothing;

drop trigger if exists app_settings_updated_at on public.app_settings;
create trigger app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;

drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings
  for select to authenticated using (true);

-- Solo se edita la fila que existe: no hay políticas de insert ni delete.
drop policy if exists app_settings_update on public.app_settings;
create policy app_settings_update on public.app_settings
  for update to authenticated
  using (public.is_jefe()) with check (public.is_jefe());

-- Cambiar el horario mueve todas las métricas de tiempo: queda auditado.
drop trigger if exists zz_audit on public.app_settings;
create trigger zz_audit
  after insert or update or delete on public.app_settings
  for each row execute function public.audit_row();


-- ---------------------------------------------------------------------
-- El archivo consulta "completadas antes de tal fecha" y las activas
-- consultan lo contrario: este índice sirve a las dos.
-- ---------------------------------------------------------------------
create index if not exists tasks_finished_idx
  on public.tasks (finished_at) where status = 'completado';
