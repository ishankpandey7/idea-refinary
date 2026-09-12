-- Inviting people to an idea by email.
--
-- 0001 left three gaps that the invite UI runs straight into:
--   * profiles was readable only by its own owner, so neither the email
--     lookup nor "show me who is on this idea" could see anything;
--   * any member could add or remove any other member;
--   * nothing distinguished the owner from a member in policy terms.

create index if not exists profiles_email_idx on public.profiles (lower(email));

-- ------------------------------------------------------------- functions

-- SECURITY DEFINER for the same reason is_idea_member is: a policy that
-- reads the table it guards recurses into itself.
create or replace function public.is_idea_owner(p_idea_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.ideas
    where id = p_idea_id
      and owner_id = auth.uid()
  );
$$;

-- True when the caller and p_user_id both sit on at least one idea. Backs
-- the widened profiles policy: you can read the profile of someone you
-- actually share an idea with, and nobody else's.
create or replace function public.shares_idea_with(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.idea_members mine
    join public.idea_members theirs on theirs.idea_id = mine.idea_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_user_id
  );
$$;

-- Resolves an email to an account and puts it on the idea.
--
-- SECURITY DEFINER because the caller cannot see a stranger's profile row —
-- the lookup has to happen server-side, and this is the only thing that
-- exposes: a yes/no on "does this address have an account", which the UI has
-- to be able to answer anyway.
--
-- Returns 'ok' | 'not_found' | 'forbidden'. Re-inviting someone is 'ok' and
-- writes nothing, so the button is safe to press twice.
create or replace function public.invite_member_by_email(
  p_idea_id uuid,
  p_email   text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not public.is_idea_owner(p_idea_id) then
    return 'forbidden';
  end if;

  select id into v_user_id
  from public.profiles
  where lower(email) = lower(btrim(p_email))
  limit 1;

  if v_user_id is null then
    return 'not_found';
  end if;

  insert into public.idea_members (idea_id, user_id, role)
  values (p_idea_id, v_user_id, 'member')
  on conflict (idea_id, user_id) do nothing;

  return 'ok';
end;
$$;

revoke all on function public.invite_member_by_email(uuid, text) from public;
grant execute on function public.invite_member_by_email(uuid, text) to authenticated;

-- ------------------------------------------------------------------ rls

-- Widened from "your own row" so a member list can show a name instead of a
-- uuid. Still not a directory: shares_idea_with gates every other row.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.shares_idea_with(id));

-- Tightened. Adding people is the owner's call; the invite function is
-- DEFINER and the ideas_add_owner trigger already bypasses this.
drop policy if exists idea_members_insert on public.idea_members;
create policy idea_members_insert on public.idea_members
  for insert with check (public.is_idea_owner(idea_id));

-- Tightened. The owner removes anyone; anyone may remove themselves, so a
-- member is never stuck on an idea they no longer want.
drop policy if exists idea_members_delete on public.idea_members;
create policy idea_members_delete on public.idea_members
  for delete using (public.is_idea_owner(idea_id) or user_id = auth.uid());
