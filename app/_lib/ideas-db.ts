import type { SourceResult } from "@/types/source-result";
import { getSupabase } from "@/lib/supabase/client";

export type Idea = {
  id: string;
  ownerId: string;
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
  owner_id: string;
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
    .select(
      "id, owner_id, query, created_at, pins ( external_id, payload, created_at )",
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error(`[ideas] list failed: ${error.message}`);
    return [];
  }

  return ((data ?? []) as IdeaRow[]).map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
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

export type SaveOutcome = { ok: boolean; error?: string };

// unique (idea_id, external_id) makes a second save a no-op rather than a
// duplicate row.
async function insertPin(
  ideaId: string,
  userId: string,
  result: SourceResult,
): Promise<SaveOutcome> {
  const { error } = await getSupabase().from("pins").upsert(
    {
      idea_id: ideaId,
      external_id: resultKey(result),
      user_id: userId,
      payload: result,
    },
    { onConflict: "idea_id,external_id", ignoreDuplicates: true },
  );

  if (error) {
    console.error(`[ideas] pin failed: ${error.message}`);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Creates the idea if this is the first pin for that query. */
export async function saveResult(
  query: string,
  result: SourceResult,
): Promise<SaveOutcome> {
  const q = query.trim();
  if (!q) return { ok: false, error: "Empty query" };

  const sb = getSupabase();
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Not signed in" };

  let ideaId = await findIdeaByQuery(q);

  if (!ideaId) {
    // No .select() here on purpose. It would compile to RETURNING, which RLS
    // checks against the SELECT policy — and that policy needs an
    // idea_members row that the AFTER INSERT trigger has not written yet,
    // because AFTER ROW triggers fire at the end of the statement. Minting
    // the id client-side keeps the insert write-only and sidesteps it.
    const newIdeaId = crypto.randomUUID();
    const { error } = await sb
      .from("ideas")
      .insert({ id: newIdeaId, owner_id: userId, query: q });

    if (error) {
      console.error(`[ideas] create failed: ${error.message}`);
      return { ok: false, error: error.message };
    }
    ideaId = newIdeaId;
  }

  return insertPin(ideaId, userId, result);
}

/**
 * Adds a result to an idea that already exists. Separate from saveResult
 * because there is nothing to look up or create — the caller has the id.
 * RLS lets any member of the idea do this, not just the owner.
 */
export async function addResultToIdea(
  ideaId: string,
  result: SourceResult,
): Promise<SaveOutcome> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Not signed in" };
  return insertPin(ideaId, userId, result);
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
