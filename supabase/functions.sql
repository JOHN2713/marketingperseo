-- =====================================================================
-- MKT PROCESS · 02 · Funciones, triggers y RPC
-- Ejecutar después de schema.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- PORCENTAJE DE AVANCE
-- Los pasos 'omitido' no cuentan en el denominador.
-- ---------------------------------------------------------------------
create or replace function public.recalc_process_progress(p_process_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_total integer;
  v_done  integer;
begin
  select count(*) filter (where status <> 'omitido'),
         count(*) filter (where status =  'completado')
    into v_total, v_done
    from public.process_steps
   where process_id = p_process_id;

  update public.processes
     set progress = case
                      when coalesce(v_total, 0) = 0 then 0
                      else round((v_done::numeric / v_total) * 100, 2)
                    end
   where id = p_process_id;
end $$;


create or replace function public.trg_recalc_progress()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.recalc_process_progress(coalesce(new.process_id, old.process_id));
  return coalesce(new, old);
end $$;

drop trigger if exists process_steps_progress on public.process_steps;
create trigger process_steps_progress
  after insert or update of status or delete on public.process_steps
  for each row execute function public.trg_recalc_progress();


-- ---------------------------------------------------------------------
-- completed_at automático
-- ---------------------------------------------------------------------
create or replace function public.set_step_completed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- En un trigger de INSERT, OLD no esta asignado: leerlo aborta la sentencia.
  if tg_op = 'INSERT' then
    if new.status = 'completado' then
      new.completed_at := coalesce(new.completed_at, now());
    else
      new.completed_at := null;
    end if;
    return new;
  end if;

  if new.status = 'completado' and old.status <> 'completado' then
    new.completed_at := now();
  elsif new.status <> 'completado' then
    new.completed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists process_steps_completed_at on public.process_steps;
create trigger process_steps_completed_at
  before insert or update of status on public.process_steps
  for each row execute function public.set_step_completed_at();


-- ---------------------------------------------------------------------
-- Solo un admin puede cambiar el rol de alguien
-- ---------------------------------------------------------------------
create or replace function public.guard_role_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    -- auth.uid() nulo = ejecucion fuera de una sesion de usuario (SQL Editor o
    -- service_role). Es la unica via para crear el primer administrador.
    if auth.uid() is not null and not exists (
      select 1 from public.profiles
       where id = auth.uid() and role = 'admin'
    ) then
      raise exception 'Solo un administrador puede cambiar el rol de un usuario.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_role_change();


-- ---------------------------------------------------------------------
-- REORDENAR (drag & drop)
-- Recibe el array completo de IDs en su nuevo orden.
-- ---------------------------------------------------------------------
create or replace function public.reorder_process_steps(
  p_process_id  uuid,
  p_ordered_ids uuid[]
)
returns void
language plpgsql
security invoker
as $$
begin
  update public.process_steps s
     set sort_order = arr.ord
    from (
      select unnest(p_ordered_ids)                  as id,
             generate_subscripts(p_ordered_ids, 1)  as ord
    ) arr
   where s.id = arr.id
     and s.process_id = p_process_id;
end $$;


create or replace function public.reorder_template_steps(
  p_template_id uuid,
  p_ordered_ids uuid[]
)
returns void
language plpgsql
security invoker
as $$
begin
  update public.template_steps s
     set sort_order = arr.ord
    from (
      select unnest(p_ordered_ids)                  as id,
             generate_subscripts(p_ordered_ids, 1)  as ord
    ) arr
   where s.id = arr.id
     and s.template_id = p_template_id;
end $$;


-- ---------------------------------------------------------------------
-- CLONAR PLANTILLA → PROCESO
-- Calcula fechas en cascada a partir de default_duration_days.
-- ---------------------------------------------------------------------
create or replace function public.create_process_from_template(
  p_template_id uuid,
  p_name        text,
  p_start_date  date default current_date
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_process_id uuid;
  v_cursor     date := p_start_date;
  v_dur        integer;
  r            record;
begin
  if not exists (select 1 from public.process_templates where id = p_template_id) then
    raise exception 'La plantilla no existe.' using errcode = 'P0002';
  end if;

  insert into public.processes (template_id, name, description, owner_id, start_date, resource_url)
  select t.id, p_name, t.description, auth.uid(), p_start_date, t.resource_url
    from public.process_templates t
   where t.id = p_template_id
  returning id into v_process_id;

  for r in
    select * from public.template_steps
     where template_id = p_template_id
     order by sort_order, created_at
  loop
    v_dur := greatest(coalesce(r.default_duration_days, 1), 1);

    insert into public.process_steps
      (process_id, title, description, sort_order, type, priority, resource_url, start_date, end_date)
    values
      (v_process_id, r.title, r.description, r.sort_order, r.type, r.priority, r.resource_url,
       v_cursor, v_cursor + (v_dur - 1));

    v_cursor := v_cursor + v_dur;
  end loop;

  update public.processes
     set end_date = (select max(end_date) from public.process_steps where process_id = v_process_id)
   where id = v_process_id;

  perform public.recalc_process_progress(v_process_id);

  return v_process_id;
end $$;


-- ---------------------------------------------------------------------
-- VISTA: pasos que requieren atención (recordatorios y vencimientos)
-- Alimenta los badges del dashboard.
-- ---------------------------------------------------------------------
create or replace view public.v_steps_attention
with (security_invoker = true) as
select
  s.id,
  s.process_id,
  p.name          as process_name,
  s.title,
  s.status,
  s.priority,
  s.end_date,
  s.reminder_at,
  s.assignee_id,
  case
    when s.end_date    is not null and s.end_date    <  current_date then 'vencido'
    when s.end_date    is not null and s.end_date    =  current_date then 'vence_hoy'
    when s.reminder_at is not null and s.reminder_at <= now()        then 'recordatorio'
    else null
  end as flag
from public.process_steps s
join public.processes p on p.id = s.process_id
where s.status not in ('completado','omitido')
  and p.status not in ('completado','cancelado')
  and (
        (s.end_date    is not null and s.end_date    <= current_date)
     or (s.reminder_at is not null and s.reminder_at <= now())
  );


-- ---------------------------------------------------------------------
-- INSERTAR UN PASO EN UNA POSICION CONCRETA
-- p_after_order nulo = al final. Si no, corre los siguientes y deja hueco.
-- Va en Postgres y no en el frontend para que dos personas insertando a la
-- vez no terminen con dos pasos en el mismo sort_order.
-- ---------------------------------------------------------------------
create or replace function public.insert_process_step(
  p_process_id  uuid,
  p_title       text default 'Paso nuevo',
  p_after_order integer default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id    uuid;
  v_order integer;
begin
  if p_after_order is null then
    select coalesce(max(sort_order), 0) + 1
      into v_order
      from public.process_steps
     where process_id = p_process_id;
  else
    v_order := p_after_order + 1;

    update public.process_steps
       set sort_order = sort_order + 1
     where process_id = p_process_id
       and sort_order >= v_order;
  end if;

  insert into public.process_steps (process_id, title, sort_order)
  values (p_process_id, coalesce(nullif(btrim(p_title), ''), 'Paso nuevo'), v_order)
  returning id into v_id;

  return v_id;
end $$;


-- ---------------------------------------------------------------------
-- DUPLICAR UN PASO
-- Copia todo menos estado, observaciones y completed_at. Queda justo debajo.
-- ---------------------------------------------------------------------
create or replace function public.duplicate_process_step(p_step_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  s    public.process_steps%rowtype;
begin
  select * into s from public.process_steps where id = p_step_id;
  if not found then
    raise exception 'El paso no existe.' using errcode = 'P0002';
  end if;

  update public.process_steps
     set sort_order = sort_order + 1
   where process_id = s.process_id
     and sort_order > s.sort_order;

  insert into public.process_steps
    (process_id, title, description, sort_order, type, priority,
     start_date, end_date, reminder_at, resource_url, assignee_id)
  values
    (s.process_id, s.title || ' (copia)', s.description, s.sort_order + 1, s.type, s.priority,
     s.start_date, s.end_date, s.reminder_at, s.resource_url, s.assignee_id)
  returning id into v_id;

  return v_id;
end $$;


-- ---------------------------------------------------------------------
-- DUPLICAR UNA PLANTILLA COMPLETA
-- El nombre es unico, asi que se busca el primer sufijo libre.
-- ---------------------------------------------------------------------
create or replace function public.duplicate_template(p_template_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_new  uuid;
  v_base text;
  v_name text;
  i      integer := 1;
begin
  select name into v_base from public.process_templates where id = p_template_id;
  if not found then
    raise exception 'La plantilla no existe.' using errcode = 'P0002';
  end if;

  v_name := v_base || ' (copia)';
  while exists (select 1 from public.process_templates where name = v_name) loop
    i := i + 1;
    v_name := v_base || ' (copia ' || i || ')';
  end loop;

  insert into public.process_templates
    (name, description, icon, color, resource_url, is_active, created_by)
  select v_name, description, icon, color, resource_url, false, auth.uid()
    from public.process_templates
   where id = p_template_id
  returning id into v_new;

  insert into public.template_steps
    (template_id, title, description, sort_order, type, priority,
     default_duration_days, resource_url)
  select v_new, title, description, sort_order, type, priority,
         default_duration_days, resource_url
    from public.template_steps
   where template_id = p_template_id
   order by sort_order, created_at;

  return v_new;
end $$;


-- ---------------------------------------------------------------------
-- AGREGAR UN PASO AL FINAL DE UNA PLANTILLA
-- ---------------------------------------------------------------------
create or replace function public.insert_template_step(
  p_template_id uuid,
  p_title       text default 'Paso nuevo'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id    uuid;
  v_order integer;
begin
  select coalesce(max(sort_order), 0) + 1
    into v_order
    from public.template_steps
   where template_id = p_template_id;

  insert into public.template_steps (template_id, title, sort_order)
  values (p_template_id, coalesce(nullif(btrim(p_title), ''), 'Paso nuevo'), v_order)
  returning id into v_id;

  return v_id;
end $$;
