import type { SourceResult } from "@/types/source-result";
import { getSupabase } from "@/lib/supabase/client";
import type { Usage } from "@/lib/licence-rules";
import { decodeList, encodeList, type ProjectList } from "./project-list";

export type Idea = {
  id: string;
  ownerId: string;
  query: string;
  savedAt: string;
  usage: Usage;
  results: SourceResult[];
  /** The check this project records. Null until 0005 is run, or never saved. */
  list: ProjectList | null;
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
  source_list: unknown;
  pins: PinRow[] | null;
};

async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getUser();
  return data.user?.id ?? null;
}

const PINS = "pins ( external_id, payload, created_at )";
const BASE = `id, owner_id, query, created_at`;
const USAGE = `usage_commercial, usage_modify`;

/**
 * Newest shape first, each fallback dropping the columns a migration adds.
 *
 * A deploy reaches users before a migration does, and asking Postgres for a
 * column that is not there fails the whole select — which would empty every
 * list rather than serve a slightly older one.
 */
const SHAPES = [
  `${BASE}, ${USAGE}, source_list, ${PINS}`,
  `${BASE}, ${USAGE}, ${PINS}`,
  `${BASE}, ${PINS}`,
];

/**
 * RLS limits this to ideas the signed-in user is a member of.
 *
 * Columns arrive with migrations and a deploy can reach users before someone
 * has run one. Asking for a column that does not exist fails the whole query,
 * which would empty everyone's list — so this walks SHAPES until one answers
 * rather than showing people nothing.
 */
export async function listIdeas(): Promise<Idea[]> {
  const sb = getSupabase();

  const load = (columns: string) =>
    sb.from("ideas").select(columns).order("created_at", { ascending: false });

  let data: unknown[] | null = null;

  for (let i = 0; i < SHAPES.length; i += 1) {
    const attempt = await load(SHAPES[i]);
    if (!attempt.error) {
      if (i > 0) {
        console.error(
          `[ideas] served on an older shape — run the pending migration (${i} column set${i === 1 ? "" : "s"} behind)`,
        );
      }
      data = attempt.data;
      break;
    }
    console.error(`[ideas] list shape ${i} failed: ${attempt.error.message}`);
  }

  if (data === null) return [];

  return ((data ?? []) as unknown as IdeaRow[]).map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    query: row.query,
    savedAt: row.created_at,
    // NULL means nobody answered. 0004 created these `not null default
    // false` — this comment used to claim they were already nullable, which
    // was read off the defensive TypeScript type above rather than the
    // schema, and it was wrong: writing null failed with 23502 and took the
    // whole save with it. 0006 drops the constraint; writeIdeaRow copes
    // until it has run.
    usage: {
      commercial: row.usage_commercial ?? null,
      modify: row.usage_modify ?? null,
    },
    list: decodeList(row.source_list),
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

export type SaveOutcome = {
  ok: boolean;
  error?: string;
  /** Saved, but not everything asked for could be kept. */
  warning?: string;
};

// unique (idea_id, external_id) turns a second save into an update of the
// payload rather than a duplicate row. It has to be an update, not a skip: a
// re-check that found new terms is usually the reason someone saved again,
// and created_at is left out of the write so the order it was first kept in
// survives.
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
    { onConflict: "idea_id,external_id", ignoreDuplicates: false },
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
  return new Set((await savedResultsFor(query)).keys());
}

/**
 * What each source said about this project last time, keyed by result.
 *
 * Carries the payload, not just the key, because the point of keeping a list
 * is being able to run it again — and "what changed?" needs the old answer
 * still sitting there to compare against. One query either way.
 */
export async function savedResultsFor(
  query: string,
): Promise<Map<string, SourceResult>> {
  const q = query.trim();
  if (!q) return new Map();

  const ideaId = await findIdeaByQuery(q);
  if (!ideaId) return new Map();

  const { data, error } = await getSupabase()
    .from("pins")
    .select("external_id, payload")
    .eq("idea_id", ideaId);

  if (error) {
    console.error(`[ideas] saved results failed: ${error.message}`);
    return new Map();
  }
  return new Map(
    (data ?? []).map((p: { external_id: string; payload: SourceResult }) => [
      p.external_id,
      p.payload,
    ]),
  );
}

/**
 * Records what the project is a list of, creating it if it is new.
 *
 * Silent when the column is missing: the ledger simply has not been switched
 * on yet, and failing a save the person did not ask for would be worse than
 * doing nothing. listIdeas already logs which migration is pending.
 */
export async function saveList(
  query: string,
  list: ProjectList,
): Promise<SaveOutcome> {
  const q = query.trim();
  if (!q) return { ok: false, error: "Empty query" };

  const sb = getSupabase();
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Not signed in" };

  let ideaId = await findIdeaByQuery(q);

  if (!ideaId) {
    // Write-only insert, for the RLS reason spelled out in saveResult.
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

  return writeIdeaRow(ideaId, list);
}

/** Postgres says which migration is missing; guess at nothing else. */
const UNDEFINED_COLUMN = "42703";
const NOT_NULL_VIOLATION = "23502";

function code(error: { code?: string } | null): string {
  return error?.code ?? "";
}

/** The two intent columns with the unanswered ones left out entirely. */
function statedOnly(usage: Usage): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (usage.commercial !== null) out.usage_commercial = usage.commercial;
  if (usage.modify !== null) out.usage_modify = usage.modify;
  return out;
}

/**
 * Writes the project row, dropping only what this database cannot take.
 *
 * `listIdeas` walks SHAPES because a deploy reaches users before a migration
 * does; the write side has to do the same or saving breaks for exactly the
 * window that rule exists to cover. Two migrations are in play:
 *
 * - 0005 adds `source_list`. Without it the whole update was rejected, and
 *   because the checker returns early on a failed list save, the results
 *   were lost too.
 * - 0006 makes the intent columns nullable. 0004 created them `not null`,
 *   so writing "nobody answered" — now the default state of every new
 *   visit — failed with 23502 and lost the save the same way.
 *
 * Each step is taken only when Postgres names that exact cause. Falling back
 * on any error at all meant a dropped packet was reported to the person as a
 * missing database column, with `ok: true` on top of it.
 */
async function writeIdeaRow(
  ideaId: string,
  list: ProjectList,
): Promise<SaveOutcome> {
  const sb = getSupabase();
  const update = (patch: Record<string, unknown>) =>
    sb.from("ideas").update(patch).eq("id", ideaId);

  const intent = {
    usage_commercial: list.usage.commercial,
    usage_modify: list.usage.modify,
  };
  const unanswered =
    list.usage.commercial === null || list.usage.modify === null;

  let listKept = true;
  let intentKept = true;
  let patch: Record<string, unknown> = {
    source_list: encodeList(list),
    ...intent,
  };

  // At most three attempts, each dropping one named thing.
  for (let i = 0; i < 3; i += 1) {
    const { error } = await update(patch);
    if (!error) break;

    console.error(`[ideas] list save failed (${code(error)}): ${error.message}`);

    if (code(error) === UNDEFINED_COLUMN && "source_list" in patch) {
      const { source_list: _dropped, ...rest } = patch;
      void _dropped;
      patch = rest;
      listKept = false;
      continue;
    }
    if (code(error) === NOT_NULL_VIOLATION && unanswered && intentKept) {
      const { usage_commercial: _c, usage_modify: _m, ...rest } = patch;
      void _c;
      void _m;
      patch = { ...rest, ...statedOnly(list.usage) };
      intentKept = false;
      continue;
    }
    return { ok: false, error: error.message };
  }

  if (listKept && intentKept) return { ok: true };

  const missing = [
    listKept
      ? null
      : "the list it was checked from, so it cannot be re-checked in one click",
    intentKept ? null : "the questions you left unanswered",
  ].filter(Boolean);

  return {
    ok: true,
    warning: `This project's intent was saved, but not ${missing.join(" or ")}. The database is behind the app by a migration.`,
  };
}

/**
 * Any member may set this — it describes the idea, not its owner.
 *
 * Writes the list's copy of the intent as well as the columns. They are two
 * records of the same answer, and `/my-ideas` reads the list's copy first
 * (and hands it to "Re-check this project"), so updating only the columns
 * left the re-check running under an intent the person had already changed.
 */
export async function setIdeaUsage(
  ideaId: string,
  usage: Usage,
  list?: ProjectList | null,
): Promise<boolean> {
  const sb = getSupabase();
  const patch: Record<string, unknown> = {
    usage_commercial: usage.commercial,
    usage_modify: usage.modify,
  };
  if (list) patch.source_list = encodeList({ ...list, usage });

  const first = await sb.from("ideas").update(patch).eq("id", ideaId);
  if (!first.error) return true;
  console.error(
    `[ideas] usage update failed (${code(first.error)}): ${first.error.message}`,
  );

  // Same two migrations, same reason as writeIdeaRow.
  const retry: Record<string, unknown> = { ...statedOnly(usage) };
  if (Object.keys(retry).length === 0) return false;

  const second = await sb.from("ideas").update(retry).eq("id", ideaId);
  if (second.error) {
    console.error(`[ideas] usage retry failed: ${second.error.message}`);
    return false;
  }
  return true;
}
