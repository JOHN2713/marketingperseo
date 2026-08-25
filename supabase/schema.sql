-- =====================================================================
-- MKT PROCESS · 01 · Esquema
-- Ejecutar primero, en el SQL Editor de Supabase.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
do $$ begin
  create type public.user_role       as enum ('admin','user');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.process_status  as enum ('planificado','en_curso','pausado','completado','cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.step_status     as enum ('pendiente','en_curso','bloqueado','completado','omitido');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.priority_level  as enum ('baja','media','alta','urgente');
exception when duplicate_object then null; end $$;


-- ---------------------------------------------------------------------
-- UTILIDAD: updated_at
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end $$;


-- ---------------------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        public.user_role not null default 'user',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Crea el perfil automáticamente al registrarse
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------
-- PROCESS TEMPLATES
-- ---------------------------------------------------------------------
create table if not exists public.process_templates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  description   text,
  icon          text default '📋',
  color         text default '#6D28D9',
  resource_url  text,
  is_active     boolean not null default true,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists process_templates_updated_at on public.process_templates;
create trigger process_templates_updated_at
  before update on public.process_templates
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- TEMPLATE STEPS
-- ---------------------------------------------------------------------
create table if not exists public.template_steps (
  id                     uuid primary key default gen_random_uuid(),
  template_id            uuid not null references public.process_templates(id) on delete cascade,
  title                  text not null,
  description            text,
  sort_order             integer not null default 0,
  type                   text,
  priority               public.priority_level not null default 'media',
  default_duration_days  integer not null default 1 check (default_duration_days between 0 and 365),
  resource_url           text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists template_steps_order_idx
  on public.template_steps (template_id, sort_order);

drop trigger if exists template_steps_updated_at on public.template_steps;
create trigger template_steps_updated_at
  before update on public.template_steps
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- PROCESSES
-- ---------------------------------------------------------------------
create table if not exists public.processes (
  id                 uuid primary key default gen_random_uuid(),
  template_id        uuid references public.process_templates(id) on delete set null,
  name               text not null,
  description        text,
  owner_id           uuid references public.profiles(id) on delete set null,
  status             public.process_status  not null default 'planificado',
  priority           public.priority_level  not null default 'media',
  start_date         date,
  end_date           date,
  resource_url       text,
  progress           numeric(5,2) not null default 0 check (progress between 0 and 100),
  progress_override  numeric(5,2) check (progress_override between 0 and 100),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists processes_status_idx on public.processes (status);
create index if not exists processes_owner_idx  on public.processes (owner_id);

drop trigger if exists processes_updated_at on public.processes;
create trigger processes_updated_at
  before update on public.processes
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- PROCESS STEPS
-- ---------------------------------------------------------------------
create table if not exists public.process_steps (
  id            uuid primary key default gen_random_uuid(),
  process_id    uuid not null references public.processes(id) on delete cascade,
  title         text not null,
  description   text,
  sort_order    integer not null default 0,
  observations  text,
  status        public.step_status    not null default 'pendiente',
  priority      public.priority_level not null default 'media',
  type          text,
  start_date    date,
  end_date      date,
  reminder_at   timestamptz,
  resource_url  text,
  assignee_id   uuid references public.profiles(id) on delete set null,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint process_steps_date_range check (
    start_date is null or end_date is null or end_date >= start_date
  )
);

create index if not exists process_steps_order_idx
  on public.process_steps (process_id, sort_order);
create index if not exists process_steps_status_idx
  on public.process_steps (status);
create index if not exists process_steps_reminder_idx
  on public.process_steps (reminder_at) where reminder_at is not null;
create index if not exists process_steps_due_idx
  on public.process_steps (end_date) where end_date is not null;
create index if not exists process_steps_assignee_idx
  on public.process_steps (assignee_id) where assignee_id is not null;

drop trigger if exists process_steps_updated_at on public.process_steps;
create trigger process_steps_updated_at
  before update on public.process_steps
  for each row execute function public.set_updated_at();
