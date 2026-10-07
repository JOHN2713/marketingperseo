-- =====================================================================
-- MKT PROCESS · 06 · Áreas, calendario de eventos y auditoría
-- Ejecutar después de tasks.sql. Es idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- ÁREAS · catálogo que mantiene el jefe
-- Sirve para dos cosas: el área que solicita una tarea y las áreas
-- responsables de un evento.
-- ---------------------------------------------------------------------
create table if not exists public.areas (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.areas (name, sort_order) values
  ('Marketing', 1), ('Comercial', 2), ('Operaciones', 3),
  ('Post Venta', 4), ('Socio Perseo', 5), ('Otros', 6)
on conflict (name) do nothing;

alter table public.areas enable row level security;

drop policy if exists areas_select on public.areas;
create policy areas_select on public.areas
  for select to authenticated using (true);

drop policy if exists areas_write on public.areas;
create policy areas_write on public.areas
  for all to authenticated
  using (public.is_jefe()) with check (public.is_jefe());

-- Área solicitante de la tarea
alter table public.tasks
  add column if not exists area_id uuid references public.areas(id) on delete set null;


-- ---------------------------------------------------------------------
-- GUARDAR TAREA · reemplaza la versión de tasks.sql
-- Cambios: guarda area_id, y los links se comparan en vez de borrarse y
-- recrearse en cada guardado (la auditoría registraría ruido).
-- ---------------------------------------------------------------------
create or replace function public.save_task(
  p_id         uuid,
  p_data       jsonb,
  p_assignees  uuid[] default null,
  p_resources  jsonb  default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id    uuid := p_id;
  v_rows  integer;
begin
  -- Un integrante solo se asigna a sí mismo. El jefe asigna a cualquiera.
  if p_assignees is not null and not public.is_jefe()
     and exists (select 1 from unnest(p_assignees) x where x <> auth.uid()) then
    raise exception 'Solo el jefe de área puede asignar tareas a otras personas.'
      using errcode = '42501';
  end if;

  if v_id is null then
    insert into public.tasks (
      title, type_id, area_id, priority, status, due_date,
      started_at, finished_at, observations, created_by
    ) values (
      trim(p_data->>'title'),
      nullif(p_data->>'type_id', '')::uuid,
      nullif(p_data->>'area_id', '')::uuid,
      coalesce(nullif(p_data->>'priority', ''), 'media')::public.priority_level,
      coalesce(nullif(p_data->>'status', ''), 'pendiente')::public.task_status,
      nullif(p_data->>'due_date', '')::date,
      nullif(p_data->>'started_at', '')::timestamptz,
      nullif(p_data->>'finished_at', '')::timestamptz,
      nullif(p_data->>'observations', ''),
      auth.uid()
    )
    returning id into v_id;

    -- Sin responsables explícitos, la tarea es de quien la crea.
    if p_assignees is null or cardinality(p_assignees) = 0 then
      p_assignees := array[auth.uid()];
    end if;
  else
    if not public.can_edit_task(v_id) then
      raise exception 'No tienes permiso para editar esta tarea.' using errcode = '42501';
    end if;

    update public.tasks set
      title        = trim(p_data->>'title'),
      type_id      = nullif(p_data->>'type_id', '')::uuid,
      area_id      = nullif(p_data->>'area_id', '')::uuid,
      priority     = coalesce(nullif(p_data->>'priority', ''), 'media')::public.priority_level,
      status       = coalesce(nullif(p_data->>'status', ''), 'pendiente')::public.task_status,
      due_date     = nullif(p_data->>'due_date', '')::date,
      started_at   = nullif(p_data->>'started_at', '')::timestamptz,
      finished_at  = nullif(p_data->>'finished_at', '')::timestamptz,
      observations = nullif(p_data->>'observations', '')
    where id = v_id;

    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      raise exception 'No se encontró la tarea.' using errcode = 'P0002';
    end if;
  end if;

  if p_assignees is not null then
    -- Quitar a otros de una tarea que asignó el jefe también es asignar.
    if not public.is_jefe() and exists (
      select 1 from public.task_assignees
       where task_id = v_id and profile_id <> auth.uid()
         and profile_id <> all (p_assignees)
    ) then
      raise exception 'Solo el jefe de área puede quitar responsables.' using errcode = '42501';
    end if;

    delete from public.task_assignees
     where task_id = v_id and profile_id <> all (p_assignees);

    insert into public.task_assignees (task_id, profile_id)
    select v_id, x from unnest(p_assignees) x
    on conflict do nothing;
  end if;

  if p_resources is not null then
    -- Solo se tocan los links que de verdad cambiaron.
    with nuevos as (
      select nullif(trim(r.value->>'label'), '') as label,
             trim(r.value->>'url')               as url,
             r.ordinality::integer               as ord
        from jsonb_array_elements(p_resources) with ordinality r
       where coalesce(trim(r.value->>'url'), '') <> ''
    ),
    borrados as (
      delete from public.task_resources tr
       where tr.task_id = v_id
         and not exists (select 1 from nuevos n
                          where n.url = tr.url and n.label is not distinct from tr.label)
    ),
    reordenados as (
      update public.task_resources tr set sort_order = n.ord
        from nuevos n
       where tr.task_id = v_id and n.url = tr.url and n.label is not distinct from tr.label
    )
    insert into public.task_resources (task_id, label, url, sort_order)
    select distinct on (n.url, n.label) v_id, n.label, n.url, n.ord
      from nuevos n
     where not exists (select 1 from public.task_resources tr
                        where tr.task_id = v_id and tr.url = n.url
                          and tr.label is not distinct from n.label)
     order by n.url, n.label, n.ord;
  end if;

  return v_id;
end $$;


-- ---------------------------------------------------------------------
-- EVENTOS
-- ---------------------------------------------------------------------
do $$ begin
  create type public.event_status as enum ('por_aprobacion','confirmado','rechazado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.event_modality as enum ('presencial','virtual');
exception when duplicate_object then null; end $$;

create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(trim(title)) > 0),
  description  text,
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  all_day      boolean not null default false,
  status       public.event_status   not null default 'por_aprobacion',
  modality     public.event_modality not null default 'virtual',
  location     text,                 -- dirección o link de la reunión
  -- Evento creado junto con un proceso (Masterclass). Si se borra el
  -- proceso, el evento se va con él.
  process_id   uuid unique references public.processes(id) on delete cascade,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint events_time_range check (ends_at is null or ends_at >= starts_at)
);

create index if not exists events_starts_idx on public.events (starts_at);

drop trigger if exists events_updated_at on public.events;
create trigger events_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

create table if not exists public.event_areas (
  event_id  uuid not null references public.events(id) on delete cascade,
  area_id   uuid not null references public.areas(id)  on delete cascade,
  primary key (event_id, area_id)
);


-- ---------------------------------------------------------------------
-- SOLO EL JEFE APRUEBA
-- Un evento creado por un integrante nace 'por_aprobacion', pida lo que
-- pida. Cambiar el estado después es cosa del jefe o del admin.
-- auth.uid() nulo = SQL Editor / service_role: pasa sin restricción.
-- ---------------------------------------------------------------------
create or replace function public.guard_event_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null or public.is_jefe() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'por_aprobacion';
  elsif new.status is distinct from old.status then
    raise exception 'Solo el jefe de área puede confirmar o rechazar un evento.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists events_guard_status on public.events;
create trigger events_guard_status
  before insert or update of status on public.events
  for each row execute function public.guard_event_status();


create or replace function public.can_edit_event(p_event_id uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select public.is_jefe()
      or exists (select 1 from public.events e
                  where e.id = p_event_id and e.created_by = auth.uid());
$$;

grant execute on function public.can_edit_event(uuid) to authenticated;


alter table public.events      enable row level security;
alter table public.event_areas enable row level security;

drop policy if exists events_select on public.events;
create policy events_select on public.events
  for select to authenticated using (true);

drop policy if exists events_insert on public.events;
create policy events_insert on public.events
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists events_update on public.events;
create policy events_update on public.events
  for update to authenticated
  using (public.can_edit_event(id)) with check (public.can_edit_event(id));

drop policy if exists events_delete on public.events;
create policy events_delete on public.events
  for delete to authenticated
  using (public.can_edit_event(id));

drop policy if exists event_areas_select on public.event_areas;
create policy event_areas_select on public.event_areas
  for select to authenticated using (true);

drop policy if exists event_areas_write on public.event_areas;
create policy event_areas_write on public.event_areas
  for all to authenticated
  using (public.can_edit_event(event_id)) with check (public.can_edit_event(event_id));


-- ---------------------------------------------------------------------
-- GUARDAR EVENTO · una sola transacción
-- p_data:  { title, description, starts_at, ends_at, all_day,
--            status, modality, location }
-- p_areas: uuid[]  (nulo = no tocar las áreas responsables)
-- ---------------------------------------------------------------------
create or replace function public.save_event(
  p_id     uuid,
  p_data   jsonb,
  p_areas  uuid[] default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id    uuid := p_id;
  v_rows  integer;
begin
  if v_id is null then
    insert into public.events (
      title, description, starts_at, ends_at, all_day, status, modality, location, created_by
    ) values (
      trim(p_data->>'title'),
      nullif(p_data->>'description', ''),
      (p_data->>'starts_at')::timestamptz,
      nullif(p_data->>'ends_at', '')::timestamptz,
      coalesce((p_data->>'all_day')::boolean, false),
      coalesce(nullif(p_data->>'status', ''), 'por_aprobacion')::public.event_status,
      coalesce(nullif(p_data->>'modality', ''), 'virtual')::public.event_modality,
      nullif(p_data->>'location', ''),
      auth.uid()
    )
    returning id into v_id;
  else
    if not public.can_edit_event(v_id) then
      raise exception 'No tienes permiso para editar este evento.' using errcode = '42501';
    end if;

    update public.events set
      title       = trim(p_data->>'title'),
      description = nullif(p_data->>'description', ''),
      starts_at   = (p_data->>'starts_at')::timestamptz,
      ends_at     = nullif(p_data->>'ends_at', '')::timestamptz,
      all_day     = coalesce((p_data->>'all_day')::boolean, false),
      status      = coalesce(nullif(p_data->>'status', ''), 'por_aprobacion')::public.event_status,
      modality    = coalesce(nullif(p_data->>'modality', ''), 'virtual')::public.event_modality,
      location    = nullif(p_data->>'location', '')
    where id = v_id;

    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      raise exception 'No se encontró el evento.' using errcode = 'P0002';
    end if;
  end if;

  if p_areas is not null then
    delete from public.event_areas
     where event_id = v_id and area_id <> all (p_areas);

    insert into public.event_areas (event_id, area_id)
    select v_id, x from unnest(p_areas) x
    on conflict do nothing;
  end if;

  return v_id;
end $$;

grant execute on function public.save_event(uuid, jsonb, uuid[]) to authenticated;


-- ---------------------------------------------------------------------
-- PLANTILLAS QUE CREAN EVENTO
-- Masterclass lo trae activado; cualquier otra plantilla (Webinar,
-- Lanzamiento) puede activarlo desde su pantalla.
-- ---------------------------------------------------------------------
alter table public.process_templates
  add column if not exists creates_event boolean not null default false;

-- Solo la primera vez: si el admin lo desactiva después, volver a correr
-- el script no lo reactiva.
do $$ begin
  if not exists (select 1 from public.events where process_id is not null)
     and not exists (select 1 from public.process_templates where creates_event) then
    update public.process_templates set creates_event = true where name = 'Masterclass';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- CREAR PROCESO (+ EVENTO SI LA PLANTILLA LO PIDE)
-- Envuelve a create_process_from_template. p_event_at nulo = el evento
-- queda de día completo en la fecha de fin del cronograma.
-- ---------------------------------------------------------------------
create or replace function public.create_process_with_event(
  p_template_id uuid,
  p_name        text,
  p_start_date  date,
  p_event_at    timestamptz default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_process_id uuid;
  v_end        date;
  v_area       uuid;
  v_event_id   uuid;
begin
  v_process_id := public.create_process_from_template(p_template_id, p_name, p_start_date);

  if exists (select 1 from public.process_templates
              where id = p_template_id and creates_event) then
    select coalesce(end_date, start_date, current_date) into v_end
      from public.processes where id = v_process_id;

    insert into public.events (title, starts_at, all_day, modality, process_id, created_by)
    values (
      p_name,
      coalesce(p_event_at, (v_end::timestamp at time zone 'America/Guayaquil')),
      p_event_at is null,
      'virtual',
      v_process_id,
      auth.uid()
    )
    returning id into v_event_id;

    select id into v_area from public.areas where name = 'Marketing';
    if v_area is not null then
      insert into public.event_areas (event_id, area_id) values (v_event_id, v_area);
    end if;
  end if;

  return v_process_id;
end $$;

grant execute on function public.create_process_with_event(uuid, text, date, timestamptz) to authenticated;

-- Procesos de plantillas con evento que ya existían: se les crea el suyo.
insert into public.events (title, starts_at, all_day, modality, process_id, created_by, status)
select p.name,
       (coalesce(p.end_date, p.start_date, p.created_at::date)::timestamp at time zone 'America/Guayaquil'),
       true, 'virtual', p.id, p.owner_id,
       'por_aprobacion'
  from public.processes p
  join public.process_templates t on t.id = p.template_id and t.creates_event
 where p.status <> 'cancelado'
   and not exists (select 1 from public.events e where e.process_id = p.id);


-- ---------------------------------------------------------------------
-- AUDITORÍA
-- Un registro por cada alta, edición o baja. Solo el admin lo lee y nadie
-- lo escribe a mano: lo llena el trigger audit_row (security definer).
-- changes: en UPDATE { campo: [antes, después] }; en INSERT/DELETE la fila.
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,          -- sin FK: el registro sobrevive al usuario
  action      text not null check (action in ('INSERT','UPDATE','DELETE')),
  table_name  text not null,
  record_id   uuid,
  label       text,          -- título o nombre del registro al momento del cambio
  context     text,          -- a qué pertenece: proceso del paso, tarea del link...
  changes     jsonb
);

create index if not exists audit_log_at_idx    on public.audit_log (at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id, at desc);
create index if not exists audit_log_table_idx on public.audit_log (table_name, at desc);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select to authenticated using (public.is_admin());
-- Sin políticas de insert/update/delete: nadie con sesión puede alterarlo.


create or replace function public.audit_row()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  -- Campos que cambian solos y no dicen nada de lo que hizo la persona.
  v_skip constant text[] := array['updated_at','created_at','sort_order','progress','completed_at'];
  v_old     jsonb;
  v_new     jsonb;
  v_row     jsonb;
  v_changes jsonb;
  v_id      uuid;
  v_label   text;
  v_context text;
  v_actor   uuid := auth.uid();
  v_parent  timestamptz;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  v_row := coalesce(v_new, v_old);

  -- Tablas hijas: el registro auditado es el padre. Si el padre ya no
  -- existe es un borrado en cascada y basta con el registro del padre.
  if tg_table_name in ('task_assignees', 'task_resources') then
    v_id := (v_row->>'task_id')::uuid;
    select title into v_label from public.tasks where id = v_id;
    if v_label is null then return null; end if;
  elsif tg_table_name = 'event_areas' then
    v_id := (v_row->>'event_id')::uuid;
    select title into v_label from public.events where id = v_id;
    if v_label is null then return null; end if;
  else
    v_id := (v_row->>'id')::uuid;
    v_label := coalesce(v_row->>'title', v_row->>'name', v_row->>'full_name', v_row->>'email');
  end if;

  -- Pasos: se anota a qué proceso o plantilla pertenecen. Los que nacen
  -- junto con su padre (clonar plantilla = 24 pasos) o mueren con él no se
  -- registran uno por uno. now() es la hora de inicio de la transacción,
  -- así que created_at = now() significa "creado en esta misma operación".
  if tg_table_name = 'process_steps' then
    select name, created_at into v_context, v_parent
      from public.processes where id = (v_row->>'process_id')::uuid;
    if v_context is null or (tg_op = 'INSERT' and v_parent = now()) then return null; end if;
  elsif tg_table_name = 'template_steps' then
    select name, created_at into v_context, v_parent
      from public.process_templates where id = (v_row->>'template_id')::uuid;
    if v_context is null or (tg_op = 'INSERT' and v_parent = now()) then return null; end if;
  end if;

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_array(v_old->n.key, n.value))
      into v_changes
      from jsonb_each(v_new) n
     where n.key <> all (v_skip)
       and n.value is distinct from v_old->n.key;
    if v_changes is null then return null; end if;   -- solo cambió ruido
  else
    v_changes := jsonb_strip_nulls(v_row - v_skip);
  end if;

  -- Un perfil solo nace por el trigger de registro: el actor es ese usuario.
  if tg_table_name = 'profiles' and tg_op = 'INSERT' then
    v_actor := v_id;
  end if;

  insert into public.audit_log (actor_id, action, table_name, record_id, label, context, changes)
  values (v_actor, tg_op, tg_table_name, v_id, v_label, v_context, v_changes);

  return null;
end $$;


do $$
declare
  t text;
begin
  foreach t in array array[
    'tasks', 'task_assignees', 'task_resources', 'task_types', 'areas',
    'events', 'event_areas',
    'processes', 'process_steps', 'process_templates', 'template_steps',
    'profiles'
  ] loop
    execute format('drop trigger if exists zz_audit on public.%I', t);
    execute format(
      'create trigger zz_audit after insert or update or delete on public.%I
         for each row execute function public.audit_row()', t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- VERIFICACIÓN
-- ---------------------------------------------------------------------
-- select tablename, rowsecurity from pg_tables
--  where schemaname = 'public' and tablename in ('areas','events','event_areas','audit_log');
