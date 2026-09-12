import type { SourceResult } from "@/types/source-result";
import { getSupabase } from "@/lib/supabase/client";

export type Idea = {
  id: string;
  query: string;
  savedAt: string;
  results: SourceResult[];
};

export function resultKey(r: SourceResult): string {
  return `${r.sourceId}:${r.externalId}`;
}

type PinRow = {
  external_id: string;
  payload: SourceResult;
  created_at: string;
};
type IdeaRow = {
  id: string;
  query: string;
  created_at: string;
  pins: PinRow[] | null;
};

async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getUser();
  return data.user?.id ?? null;
}

/** RLS limits this to ideas the signed-in user is a member of. */
export async function listIdeas(): Promise<Idea[]> {
  const { data, error } = await getSupabase()
    .from("ideas")
    .select("id, query, created_at, pins ( external_id, payload, created_at )")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(`[ideas] list failed: ${error.message}`);
    return [];
  }

  return ((data ?? []) as IdeaRow[]).map((row) => ({
    id: row.id,
    query: row.query,
    savedAt: row.created_at,
    results: (row.pins ?? [])
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((p) => p.payload),
  }));
}

async function findIdeaByQuery(query: string): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from("ideas")
    .select("id")
    .eq("query", query)
    .limit(1);

  if (error) {
    console.error(`[ideas] lookup failed: ${error.message}`);
    return null;
  }
  return data?.[0]?.id ?? null;
}

/** Creates the idea if this is the first pin for that query. */
export async function saveResult(
  query: string,
  result: SourceResult,
): Promise<void> {
  const q = query.trim();
  if (!q) return;

  const sb = getSupabase();
  const userId = await currentUserId();
  if (!userId) return;

  let ideaId = await findIdeaByQuery(q);

  if (!ideaId) {
    const { data, error } = await sb
      .from("ideas")
      .insert({ owner_id: userId, query: q })
      .select("id")
      .single();

    if (error || !data) {
      console.error(`[ideas] create failed: ${error?.message}`);
      return;
    }
    ideaId = data.id;
  }

  // unique (idea_id, external_id) makes a second save a no-op rather than a
  // duplicate row.
  const { error } = await sb.from("pins").upsert(
    {
      idea_id: ideaId,
      external_id: resultKey(result),
      user_id: userId,
      payload: result,
    },
    { onConflict: "idea_id,external_id", ignoreDuplicates: true },
  );

  if (error) console.error(`[ideas] pin failed: ${error.message}`);
}

/** Removes one pin. An idea left with no pins is dropped, as before. */
export async function removeResult(
  ideaId: string,
  externalId: string,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from("pins")
    .delete()
    .eq("idea_id", ideaId)
    .eq("external_id", externalId);

  if (error) {
    console.error(`[ideas] unpin failed: ${error.message}`);
    return;
  }

  const { count } = await sb
    .from("pins")
    .select("id", { count: "exact", head: true })
    .eq("idea_id", ideaId);

  if (count === 0) await removeIdea(ideaId);
}

export async function removeIdea(ideaId: string): Promise<void> {
  const { error } = await getSupabase().from("ideas").delete().eq("id", ideaId);
  if (error) console.error(`[ideas] delete failed: ${error.message}`);
}

export async function savedKeysFor(query: string): Promise<Set<string>> {
  const q = query.trim();
  if (!q) return new Set();

  const ideaId = await findIdeaByQuery(q);
  if (!ideaId) return new Set();

  const { data, error } = await getSupabase()
    .from("pins")
    .select("external_id")
    .eq("idea_id", ideaId);

  if (error) {
    console.error(`[ideas] keys failed: ${error.message}`);
    return new Set();
  }
  return new Set(
    (data ?? []).map((p: { external_id: string }) => p.external_id),
  );
}
