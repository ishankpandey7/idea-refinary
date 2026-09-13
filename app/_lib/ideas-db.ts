import type { SourceResult } from "@/types/source-result";
import { getSupabase } from "@/lib/supabase/client";
import type { Usage } from "@/lib/licence-rules";

export type Idea = {
  id: string;
  ownerId: string;
  query: string;
  savedAt: string;
  usage: Usage;
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
  usage_commercial: boolean | null;
  usage_modify: boolean | null;
  pins: PinRow[] | null;
};

async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getUser();
  return data.user?.id ?? null;
}

const PINS = "pins ( external_id, payload, created_at )";
const WITH_USAGE = `id, owner_id, query, created_at, usage_commercial, usage_modify, ${PINS}`;
const WITHOUT_USAGE = `id, owner_id, query, created_at, ${PINS}`;

/**
 * RLS limits this to ideas the signed-in user is a member of.
 *
 * The usage columns arrive in migration 0004, and a deploy can reach users
 * before someone has run it. Asking for a column that does not exist fails
 * the whole query, which would empty everyone's list — so fall back to the
 * older shape rather than showing people nothing.
 */
export async function listIdeas(): Promise<Idea[]> {
  const sb = getSupabase();

  const load = (columns: string) =>
    sb.from("ideas").select(columns).order("created_at", { ascending: false });

  const first = await load(WITH_USAGE);
  let { data } = first;
  const { error } = first;

  if (error) {
    console.error(`[ideas] list failed: ${error.message}`);
    const retry = await load(WITHOUT_USAGE);
    if (retry.error) {
      console.error(`[ideas] list retry failed: ${retry.error.message}`);
      return [];
    }
    console.error("[ideas] served without usage — run migration 0004");
    data = retry.data;
  }

  return ((data ?? []) as unknown as IdeaRow[]).map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    query: row.query,
    savedAt: row.created_at,
    usage: {
      commercial: row.usage_commercial ?? false,
      modify: row.usage_modify ?? false,
    },
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

/** Any member may set this — it describes the idea, not its owner. */
export async function setIdeaUsage(
  ideaId: string,
  usage: Usage,
): Promise<boolean> {
  const { error } = await getSupabase()
    .from("ideas")
    .update({
      usage_commercial: usage.commercial,
      usage_modify: usage.modify,
    })
    .eq("id", ideaId);

  if (error) {
    console.error(`[ideas] usage update failed: ${error.message}`);
    return false;
  }
  return true;
}
