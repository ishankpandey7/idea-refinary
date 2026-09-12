-- Idea Refinery — auth + shared ideas.
-- Run once in Supabase → SQL Editor.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- tables

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text
);

create table if not exists public.ideas (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  query      text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.idea_members (
  idea_id uuid not null references public.ideas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role    text not null default 'owner',
  unique (idea_id, user_id)
);

create table if not exists public.pins (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid not null references public.ideas (id) on delete cascade,
  external_id text not null,
  user_id     uuid not null references auth.users (id) on delete cascade,
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  unique (idea_id, external_id)
);

create index if not exists ideas_owner_idx        on public.ideas (owner_id);
create index if not exists idea_members_user_idx  on public.idea_members (user_id);
create index if not exists pins_idea_idx          on public.pins (idea_id);

-- ------------------------------------------------------------- functions

-- Membership is the single access rule for every table here. It has to be
-- SECURITY DEFINER: a policy on idea_members that queried idea_members
-- directly would recurse into itself and error at runtime.
create or replace function public.is_idea_member(p_idea_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.idea_members
    where idea_id = p_idea_id
      and user_id = auth.uid()
  );
$$;

-- The creator must land in idea_members or they lock themselves out of the
-- row they just made. A trigger keeps that atomic instead of trusting the
-- client to send two writes.
create or replace function public.add_owner_as_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.idea_members (idea_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (idea_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists ideas_add_owner on public.ideas;
create trigger ideas_add_owner
  after insert on public.ideas
  for each row execute function public.add_owner_as_member();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------ rls

alter table public.profiles     enable row level security;
alter table public.ideas        enable row level security;
alter table public.idea_members enable row level security;
alter table public.pins         enable row level security;

-- profiles: your own row only.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ideas: readable and writable by members; created by yourself; deleted by
-- the owner alone.
drop policy if exists ideas_select on public.ideas;
create policy ideas_select on public.ideas
  for select using (public.is_idea_member(id));

drop policy if exists ideas_insert on public.ideas;
create policy ideas_insert on public.ideas
  for insert with check (owner_id = auth.uid());

drop policy if exists ideas_update on public.ideas;
create policy ideas_update on public.ideas
  for update using (public.is_idea_member(id))
  with check (public.is_idea_member(id));

drop policy if exists ideas_delete on public.ideas;
create policy ideas_delete on public.ideas
  for delete using (owner_id = auth.uid());

-- idea_members: visible to members; only an existing member may add or
-- remove people. The owner's own row arrives via the trigger above, which
-- runs as definer and so is not blocked by this.
drop policy if exists idea_members_select on public.idea_members;
create policy idea_members_select on public.idea_members
  for select using (public.is_idea_member(idea_id));

drop policy if exists idea_members_insert on public.idea_members;
create policy idea_members_insert on public.idea_members
  for insert with check (public.is_idea_member(idea_id));

drop policy if exists idea_members_delete on public.idea_members;
create policy idea_members_delete on public.idea_members
  for delete using (public.is_idea_member(idea_id));

-- pins: members read and delete; you may only insert pins under your own id.
drop policy if exists pins_select on public.pins;
create policy pins_select on public.pins
  for select using (public.is_idea_member(idea_id));

drop policy if exists pins_insert on public.pins;
create policy pins_insert on public.pins
  for insert with check (public.is_idea_member(idea_id) and user_id = auth.uid());

drop policy if exists pins_delete on public.pins;
create policy pins_delete on public.pins
  for delete using (public.is_idea_member(idea_id));
