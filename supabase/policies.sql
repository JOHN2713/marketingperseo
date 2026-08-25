-- =====================================================================
-- MKT PROCESS · 03 · Row Level Security
-- Ejecutar después de functions.sql
-- Modelo: equipo compartido. Todos ven todo. El admin manda en plantillas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;


-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.process_templates enable row level security;
alter table public.template_steps    enable row level security;
alter table public.processes         enable row level security;
alter table public.process_steps     enable row level security;


-- ---------------------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (true);

-- Editar el propio perfil. El cambio de rol lo bloquea el trigger guard_role_change.
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin on public.profiles
  for delete to authenticated
  using (public.is_admin());


-- ---------------------------------------------------------------------
-- PROCESS TEMPLATES · lectura para todos, escritura solo admin
-- ---------------------------------------------------------------------
drop policy if exists templates_select on public.process_templates;
create policy templates_select on public.process_templates
  for select to authenticated
  using (true);

drop policy if exists templates_write on public.process_templates;
create policy templates_write on public.process_templates
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ---------------------------------------------------------------------
-- TEMPLATE STEPS
-- ---------------------------------------------------------------------
drop policy if exists template_steps_select on public.template_steps;
create policy template_steps_select on public.template_steps
  for select to authenticated
  using (true);

drop policy if exists template_steps_write on public.template_steps;
create policy template_steps_write on public.template_steps
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ---------------------------------------------------------------------
-- PROCESSES · equipo compartido
-- ---------------------------------------------------------------------
drop policy if exists processes_select on public.processes;
create policy processes_select on public.processes
  for select to authenticated
  using (true);

drop policy if exists processes_insert on public.processes;
create policy processes_insert on public.processes
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists processes_update on public.processes;
create policy processes_update on public.processes
  for update to authenticated
  using (true)
  with check (true);

-- Borrar arrastra todos los pasos y sus observaciones: solo dueño o admin.
drop policy if exists processes_delete on public.processes;
create policy processes_delete on public.processes
  for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin());


-- ---------------------------------------------------------------------
-- PROCESS STEPS · equipo compartido
-- ---------------------------------------------------------------------
drop policy if exists process_steps_select on public.process_steps;
create policy process_steps_select on public.process_steps
  for select to authenticated
  using (true);

drop policy if exists process_steps_insert on public.process_steps;
create policy process_steps_insert on public.process_steps
  for insert to authenticated
  with check (
    exists (select 1 from public.processes p where p.id = process_id)
  );

drop policy if exists process_steps_update on public.process_steps;
create policy process_steps_update on public.process_steps
  for update to authenticated
  using (true)
  with check (true);

drop policy if exists process_steps_delete on public.process_steps;
create policy process_steps_delete on public.process_steps
  for delete to authenticated
  using (true);


-- ---------------------------------------------------------------------
-- Permisos de ejecución de las RPC
-- ---------------------------------------------------------------------
grant execute on function public.create_process_from_template(uuid, text, date) to authenticated;
grant execute on function public.reorder_process_steps(uuid, uuid[])            to authenticated;
grant execute on function public.reorder_template_steps(uuid, uuid[])           to authenticated;
grant execute on function public.insert_process_step(uuid, text, integer)       to authenticated;
grant execute on function public.duplicate_process_step(uuid)                   to authenticated;
grant execute on function public.duplicate_template(uuid)                       to authenticated;
grant execute on function public.insert_template_step(uuid, text)               to authenticated;
grant select  on public.v_steps_attention                                       to authenticated;


-- ---------------------------------------------------------------------
-- VERIFICACIÓN
-- Debe devolver rowsecurity = true en las cinco tablas.
-- ---------------------------------------------------------------------
-- select tablename, rowsecurity
--   from pg_tables
--  where schemaname = 'public'
--  order by tablename;
