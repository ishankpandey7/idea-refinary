-- 0002's `revoke all on function ... from public` did not do what it looks
-- like it does.
--
-- Supabase ships ALTER DEFAULT PRIVILEGES granting EXECUTE on new functions
-- in `public` to anon, authenticated and service_role by name. So the invite
-- function was created carrying a *direct* grant to anon, and revoking from
-- the PUBLIC pseudo-role left that grant untouched.
--
-- Verified live 2026-09-13: an anonymous POST to
-- /rest/v1/rpc/invite_member_by_email answered 200 "forbidden" instead of
-- 42501. Nothing leaked — is_idea_owner() is false when auth.uid() is null,
-- so the function returns before it looks any email up — but anon has no
-- business reaching it at all.
--
-- Only this function is revoked. is_idea_member(), is_idea_owner() and
-- shares_idea_with() are called from inside RLS policies and must stay
-- executable by every role those policies apply to.

revoke all on function public.invite_member_by_email(uuid, text) from anon;
