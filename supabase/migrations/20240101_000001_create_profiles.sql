-- 2024‑01‑01: Create profiles table linked to Supabase auth.users

-- 1️⃣ Table definition -------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'student',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2️⃣ Role constraint (admin • teacher • student) --------------------------
alter table public.profiles
  add constraint role_check check (role in ('admin','teacher','student'));

-- 3️⃣ Updated‑at trigger ------------------------------------------------------
create function public.update_profile_timestamp()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_timestamp
before update on public.profiles
for each row execute function public.update_profile_timestamp();

-- 4️⃣ Row‑Level Security -----------------------------------------------------
alter table public.profiles enable row level security;

-- 5️⃣ Helper to check CampusOS admin status -----------------------------------
create function public.is_admin()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  u_role text;
begin
  -- This function runs with definer rights, bypassing RLS, to safely read the caller's role.
  select role into u_role
  from public.profiles
  where id = auth.uid();
  return u_role = 'admin';
end;
$$;

-- Restrict execution of helper functions to the authenticated role only.
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
-- 6️⃣ RLS policies ----------------------------------------------------------

-- a) Users can read *their own* profile
create policy "own profile read"
  on public.profiles
  for select
  using (auth.uid() = id);

-- b) Admins can read any profile
create policy "admin profile read"
  on public.profiles
  for select
  using (public.is_admin());

-- c) Users can update *their own* profile – only mutable column is full_name.
--    Immutable columns are enforced by a BEFORE UPDATE trigger (see 7️⃣).
create policy "own profile update"
  on public.profiles
  for update
  using (auth.uid() = id);

-- d) Admins can update any profile (including role changes)
create policy "admin profile update"
  on public.profiles
  for update
  using (public.is_admin());

-- 7️⃣ Trigger to enforce immutable columns and admin‑only role changes --------
create function public.protect_profile_updates()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if NEW.id <> OLD.id then
    raise exception 'id column is immutable';
  end if;
  if NEW.created_at <> OLD.created_at then
    raise exception 'created_at column is immutable';
  end if;
  if NEW.role <> OLD.role then
    if not public.is_admin() then
      raise exception 'Only admin can change role';
    end if;
  end if;
  return NEW;
end;
$$;

create trigger protect_profile_updates
  before update on public.profiles
  for each row execute function public.protect_profile_updates();

-- 8️⃣ Auto‑create profile when a new auth user is inserted -------------------
create function public.create_profile_for_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.email, ''), 'student');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_profile_for_user();
