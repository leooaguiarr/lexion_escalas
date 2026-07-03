-- Lexion Escalas — schema Supabase
-- Execute este arquivo no SQL Editor do Supabase.

create extension if not exists pgcrypto;

-- Updated at helper
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role text not null check (role in ('owner', 'scheduler', 'tech')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_count integer;
  resolved_role text;
begin
  select count(*) into profile_count from public.profiles;

  if profile_count = 0 then
    resolved_role := 'owner';
  else
    resolved_role := coalesce(new.raw_user_meta_data ->> 'role', 'scheduler');
    if resolved_role not in ('owner', 'scheduler', 'tech') then
      resolved_role := 'scheduler';
    end if;
  end if;

  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    resolved_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Guards
create table if not exists public.guards (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  short_name text not null,
  phone text not null,
  hourly_rate numeric(10,2) not null default 0,
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Locations
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Schedule periods
create table if not exists public.schedule_periods (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete restrict,
  title text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_schedule_dates check (end_date >= start_date)
);

-- Shift templates per schedule
create table if not exists public.shift_templates (
  id uuid primary key default gen_random_uuid(),
  schedule_period_id uuid not null references public.schedule_periods(id) on delete cascade,
  name text not null,
  start_time time not null,
  end_time time not null,
  position int not null,
  created_at timestamptz not null default now(),
  constraint unique_shift_position_per_schedule unique (schedule_period_id, position),
  constraint valid_shift_time check (start_time <> end_time)
);

-- Guard availability per schedule/date
create table if not exists public.guard_availability (
  id uuid primary key default gen_random_uuid(),
  schedule_period_id uuid not null references public.schedule_periods(id) on delete cascade,
  guard_id uuid not null references public.guards(id) on delete cascade,
  availability_date date not null,
  availability_status text not null default 'not_informed'
    check (availability_status in ('available', 'unavailable', 'not_informed')),
  preference text not null default 'any'
    check (preference in ('day', 'night', 'any')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unique_guard_availability_per_date unique (
    schedule_period_id,
    guard_id,
    availability_date
  )
);

-- Actual assignments
create table if not exists public.schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  schedule_period_id uuid not null references public.schedule_periods(id) on delete cascade,
  shift_template_id uuid not null references public.shift_templates(id) on delete cascade,
  guard_id uuid references public.guards(id) on delete set null,
  service_date date not null,
  planned_start time not null,
  planned_end time not null,
  planned_hours numeric(5,2) not null default 0,
  completed boolean,
  worked_hours numeric(5,2),
  hourly_rate numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unique_assignment_per_shift_day unique (
    schedule_period_id,
    shift_template_id,
    service_date
  )
);

-- Payment records
create table if not exists public.payment_records (
  id uuid primary key default gen_random_uuid(),
  schedule_period_id uuid not null references public.schedule_periods(id) on delete cascade,
  guard_id uuid not null references public.guards(id) on delete cascade,
  total_hours numeric(6,2) not null default 0,
  hourly_rate numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null default 0,
  status text not null default 'pending_pickup'
    check (status in ('pending_pickup', 'picked_up')),
  picked_up_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unique_payment_per_guard_schedule unique (
    schedule_period_id,
    guard_id
  )
);

-- Audit logs
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

-- Triggers
-- Drop before create so the file can be re-run safely during development.
drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_guards_updated_at on public.guards;
create trigger set_guards_updated_at before update on public.guards
for each row execute function public.set_updated_at();

drop trigger if exists set_locations_updated_at on public.locations;
create trigger set_locations_updated_at before update on public.locations
for each row execute function public.set_updated_at();

drop trigger if exists set_schedule_periods_updated_at on public.schedule_periods;
create trigger set_schedule_periods_updated_at before update on public.schedule_periods
for each row execute function public.set_updated_at();

drop trigger if exists set_guard_availability_updated_at on public.guard_availability;
create trigger set_guard_availability_updated_at before update on public.guard_availability
for each row execute function public.set_updated_at();

drop trigger if exists set_schedule_assignments_updated_at on public.schedule_assignments;
create trigger set_schedule_assignments_updated_at before update on public.schedule_assignments
for each row execute function public.set_updated_at();

drop trigger if exists set_payment_records_updated_at on public.payment_records;
create trigger set_payment_records_updated_at before update on public.payment_records
for each row execute function public.set_updated_at();

-- Indexes
create index if not exists idx_guards_status on public.guards(status);
create index if not exists idx_locations_status on public.locations(status);
create index if not exists idx_schedule_periods_dates on public.schedule_periods(start_date, end_date);
create index if not exists idx_schedule_periods_location on public.schedule_periods(location_id);
create index if not exists idx_shift_templates_schedule on public.shift_templates(schedule_period_id);
create index if not exists idx_availability_schedule_date on public.guard_availability(schedule_period_id, availability_date);
create index if not exists idx_assignments_schedule_date on public.schedule_assignments(schedule_period_id, service_date);
create index if not exists idx_payments_schedule on public.payment_records(schedule_period_id);

-- RLS
alter table public.profiles enable row level security;
alter table public.guards enable row level security;
alter table public.locations enable row level security;
alter table public.schedule_periods enable row level security;
alter table public.shift_templates enable row level security;
alter table public.guard_availability enable row level security;
alter table public.schedule_assignments enable row level security;
alter table public.payment_records enable row level security;
alter table public.audit_logs enable row level security;

-- Simple MVP policies: authenticated users can operate system data.
-- Roles are stored in profiles and can be tightened later.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles',
    'guards',
    'locations',
    'schedule_periods',
    'shift_templates',
    'guard_availability',
    'schedule_assignments',
    'payment_records',
    'audit_logs'
  ] loop
    execute format('drop policy if exists "authenticated_read_%I" on public.%I', t, t);
    execute format('drop policy if exists "authenticated_insert_%I" on public.%I', t, t);
    execute format('drop policy if exists "authenticated_update_%I" on public.%I', t, t);
    execute format('drop policy if exists "authenticated_delete_%I" on public.%I', t, t);

    execute format('create policy "authenticated_read_%I" on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy "authenticated_insert_%I" on public.%I for insert to authenticated with check (true)', t, t);
    execute format('create policy "authenticated_update_%I" on public.%I for update to authenticated using (true) with check (true)', t, t);
    execute format('create policy "authenticated_delete_%I" on public.%I for delete to authenticated using (true)', t, t);
  end loop;
end $$;
