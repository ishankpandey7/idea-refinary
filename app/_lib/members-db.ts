import { getSupabase } from "@/lib/supabase/client";

export type Member = {
  userId: string;
  role: string;
  email: string | null;
  displayName: string | null;
};

export type InviteOutcome = { ok: true } | { ok: false; error: string };

type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
};

export function memberLabel(m: Member): string {
  return m.displayName ?? m.email ?? "Unknown member";
}

/**
 * Two round trips on purpose: idea_members.user_id points at auth.users, not
 * at profiles, so there is no foreign key for PostgREST to embed across.
 *
 * RLS limits both halves to ideas the signed-in user is a member of — the
 * profiles half via shares_idea_with().
 */
export async function listMembers(ideaId: string): Promise<Member[]> {
  const sb = getSupabase();

  const { data, error } = await sb
    .from("idea_members")
    .select("user_id, role")
    .eq("idea_id", ideaId);

  if (error) {
    console.error(`[members] list failed: ${error.message}`);
    return [];
  }

  const rows = (data ?? []) as { user_id: string; role: string }[];
  if (rows.length === 0) return [];

  const { data: profiles, error: profileError } = await sb
    .from("profiles")
    .select("id, email, display_name")
    .in(
      "id",
      rows.map((r) => r.user_id),
    );

  // A missing profile is not fatal — memberLabel falls back below.
  if (profileError)
    console.error(`[members] profiles failed: ${profileError.message}`);

  const byId = new Map(
    ((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p] as const),
  );

  return rows
    .map((r) => {
      const p = byId.get(r.user_id);
      return {
        userId: r.user_id,
        role: r.role,
        email: p?.email ?? null,
        displayName: p?.display_name ?? null,
      };
    })
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === "owner" ? -1 : 1;
      return memberLabel(a).localeCompare(memberLabel(b));
    });
}

/** Owner only, enforced in the function rather than here. */
export async function inviteMember(
  ideaId: string,
  email: string,
): Promise<InviteOutcome> {
  const address = email.trim();
  if (!address) return { ok: false, error: "Enter an email address." };

  const { data, error } = await getSupabase().rpc("invite_member_by_email", {
    p_idea_id: ideaId,
    p_email: address,
  });

  if (error) {
    console.error(`[members] invite failed: ${error.message}`);
    return { ok: false, error: error.message };
  }

  switch (data as string) {
    case "ok":
      return { ok: true };
    case "not_found":
      return { ok: false, error: `No account exists for ${address}.` };
    case "forbidden":
      return { ok: false, error: "Only the idea's owner can invite people." };
    default:
      return { ok: false, error: "Invite failed." };
  }
}

export async function removeMember(
  ideaId: string,
  userId: string,
): Promise<boolean> {
  const { error } = await getSupabase()
    .from("idea_members")
    .delete()
    .eq("idea_id", ideaId)
    .eq("user_id", userId);

  if (error) {
    console.error(`[members] remove failed: ${error.message}`);
    return false;
  }
  return true;
}
