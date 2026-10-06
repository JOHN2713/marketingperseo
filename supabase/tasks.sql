-- =====================================================================
-- MKT PROCESS · 05 · Tareas, rol jefe y registro restringido
-- Ejecutar después de seed-masterclass.sql (o de policies.sql).
-- Es idempotente: se puede volver a correr sin romper nada.
-- =====================================================================


-- ---------------------------------------------------------------------
-- ROL JEFE
-- admin = gestiona el sistema; jefe = asigna tareas a otros y ve métricas.
-- Un admin tiene todo lo del jefe.
--
-- ADD VALUE dentro de una transacción no deja usar el valor nuevo hasta el
-- commit. Por eso todo lo de abajo compara role::text y nunca el literal
-- del enum: el script corre de una sola vez en el SQL Editor.
-- ---------------------------------------------------------------------
alter type public.user_role add value if not exists 'jefe';

create or replace function public.is_jefe()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role::text in ('admin', 'jefe')
  );
$$;

grant execute on function public.is_jefe() to authenticated;


-- ---------------------------------------------------------------------
-- REGISTRO SOLO CON CORREO DEL DOMINIO
-- Si cambias el dominio, cámbialo también en assets/js/config.js
-- (ALLOWED_EMAIL_DOMAIN): allá solo da el aviso temprano, aquí se aplica.
-- ---------------------------------------------------------------------
create or replace function public.guard_email_domain()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_dominio constant text := 'perseo.ec';
begin
  if lower(split_part(new.email, '@', 2)) <> v_dominio then
    raise exception 'Solo se permiten correos @%.', v_dominio
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists auth_users_email_domain on auth.users;
create trigger auth_users_email_domain
  before insert or update of email on auth.users
  for each row execute function public.guard_email_domain();


-- ---------------------------------------------------------------------
-- ENUM DE ESTADO DE TAREA
-- ---------------------------------------------------------------------
do $$ begin
  create type public.task_status as enum
    ('pendiente','en_curso','en_revision','completado','bloqueado');
exception when duplicate_object then null; end $$;


-- ---------------------------------------------------------------------
-- TIPOS DE TAREA · catálogo que mantiene el jefe
-- ---------------------------------------------------------------------
create table if not exists public.task_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.task_types (name, sort_order) values
  ('Imagen', 1), ('Video', 2), ('Pauta', 3), ('Blog', 4), ('Web', 5)
on conflict (name) do nothing;


-- ---------------------------------------------------------------------
-- TAREAS
-- started_at / finished_at los pone el trigger al cambiar de estado y el
-- responsable los puede corregir. due_date es la fecha límite estimada.
-- ---------------------------------------------------------------------
create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(trim(title)) > 0),
  type_id       uuid references public.task_types(id) on delete set null,
  priority      public.priority_level not null default 'media',
  status        public.task_status    not null default 'pendiente',
  due_date      date,
  started_at    timestamptz,
  finished_at   timestamptz,
  observations  text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint tasks_time_range check (
    started_at is null or finished_at is null or finished_at >= started_at
  )
);

create index if not exists tasks_status_idx  on public.tasks (status);
create index if not exists tasks_created_idx on public.tasks (created_at);

drop trigger if exists tasks_updated_at on public.tasks;
create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();


create table if not exists public.task_assignees (
  task_id     uuid not null references public.tasks(id)    on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  primary key (task_id, profile_id)
);

create index if not exists task_assignees_profile_idx on public.task_assignees (profile_id);


create table if not exists public.task_resources (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  label       text,
  url         text not null check (url ~* '^https?://\S+$'),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists task_resources_task_idx on public.task_resources (task_id, sort_order);


-- ---------------------------------------------------------------------
-- HORAS DE INICIO Y FIN AUTOMÁTICAS
-- Pasar a 'en_curso' marca el inicio; pasar a 'completado' marca el fin.
-- Solo se llenan si están vacías: lo que el responsable corrigió a mano
-- no se pisa. Reabrir una tarea completada borra el fin, salvo que en la
-- misma edición se haya escrito uno a mano.
-- ---------------------------------------------------------------------
create or replace function public.set_task_times()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  if new.status in ('en_curso', 'en_revision', 'completado') and new.started_at is null then
    -- Completar sin haber pasado por 'en_curso' deja el inicio vacío a
    -- propósito: inventarlo daría duraciones de cero que falsean el promedio.
    if new.status <> 'completado' then
      new.started_at := now();
    end if;
  end if;

  if new.status = 'completado' and new.finished_at is null then
    new.finished_at := greatest(now(), coalesce(new.started_at, now()));
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'completado' and new.status <> 'completado'
     and new.finished_at is not distinct from old.finished_at then
    new.finished_at := null;
  end if;

  return new;
end $$;

drop trigger if exists tasks_times on public.tasks;
create trigger tasks_times
  before insert or update of status on public.tasks
  for each row execute function public.set_task_times();


-- ---------------------------------------------------------------------
-- ¿PUEDO EDITAR ESTA TAREA?
-- Jefe/admin, quien la creó o cualquiera de sus responsables.
-- ---------------------------------------------------------------------
create or replace function public.can_edit_task(p_task_id uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select public.is_jefe()
      or exists (select 1 from public.tasks t
                  where t.id = p_task_id and t.created_by = auth.uid())
      or exists (select 1 from public.task_assignees a
                  where a.task_id = p_task_id and a.profile_id = auth.uid());
$$;

grant execute on function public.can_edit_task(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- GUARDAR TAREA COMPLETA · una sola transacción
-- Crea (p_id nulo) o actualiza la tarea, reemplaza responsables y recursos.
-- security invoker: RLS se sigue aplicando como el usuario que llama.
--
-- p_data:      { title, type_id, priority, status, due_date,
--                started_at, finished_at, observations }
-- p_assignees: uuid[]  (nulo = no tocar responsables)
-- p_resources: [{ label, url }]  (nulo = no tocar recursos)
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
      title, type_id, priority, status, due_date,
      started_at, finished_at, observations, created_by
    ) values (
      trim(p_data->>'title'),
      nullif(p_data->>'type_id', '')::uuid,
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
    delete from public.task_resources where task_id = v_id;

    insert into public.task_resources (task_id, label, url, sort_order)
    select v_id,
           nullif(trim(r.value->>'label'), ''),
           trim(r.value->>'url'),
           r.ordinality::integer
      from jsonb_array_elements(p_resources) with ordinality r
     where coalesce(trim(r.value->>'url'), '') <> '';
  end if;

  return v_id;
end $$;

grant execute on function public.save_task(uuid, jsonb, uuid[], jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- RLS · todos ven todo (equipo compartido); editar según can_edit_task
-- ---------------------------------------------------------------------
alter table public.task_types     enable row level security;
alter table public.tasks          enable row level security;
alter table public.task_assignees enable row level security;
alter table public.task_resources enable row level security;

-- Tipos: lectura para todos, escritura del jefe
drop policy if exists task_types_select on public.task_types;
create policy task_types_select on public.task_types
  for select to authenticated using (true);

drop policy if exists task_types_write on public.task_types;
create policy task_types_write on public.task_types
  for all to authenticated
  using (public.is_jefe()) with check (public.is_jefe());

-- Tareas
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated using (true);

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using (public.can_edit_task(id)) with check (public.can_edit_task(id));

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete to authenticated
  using (created_by = auth.uid() or public.is_jefe());

-- Responsables: el jefe asigna a cualquiera; los demás solo a sí mismos
-- y solo en tareas que crearon.
drop policy if exists task_assignees_select on public.task_assignees;
create policy task_assignees_select on public.task_assignees
  for select to authenticated using (true);

drop policy if exists task_assignees_insert on public.task_assignees;
create policy task_assignees_insert on public.task_assignees
  for insert to authenticated
  with check (
    public.is_jefe()
    or (profile_id = auth.uid() and exists (
          select 1 from public.tasks t where t.id = task_id and t.created_by = auth.uid()))
  );

drop policy if exists task_assignees_delete on public.task_assignees;
create policy task_assignees_delete on public.task_assignees
  for delete to authenticated
  using (
    public.is_jefe()
    or (profile_id = auth.uid() and exists (
          select 1 from public.tasks t where t.id = task_id and t.created_by = auth.uid()))
  );

-- Recursos: quien puede editar la tarea
drop policy if exists task_resources_select on public.task_resources;
create policy task_resources_select on public.task_resources
  for select to authenticated using (true);

drop policy if exists task_resources_write on public.task_resources;
create policy task_resources_write on public.task_resources
  for all to authenticated
  using (public.can_edit_task(task_id)) with check (public.can_edit_task(task_id));


-- ---------------------------------------------------------------------
-- VERIFICACIÓN
-- ---------------------------------------------------------------------
-- select tablename, rowsecurity from pg_tables
--  where schemaname = 'public' and tablename like 'task%';
