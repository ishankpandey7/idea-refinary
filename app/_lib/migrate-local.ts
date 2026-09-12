import { readIdeas } from "./ideas";
import { saveResult } from "./ideas-db";

/**
 * One-time lift of the pre-auth localStorage store into the database.
 *
 * The flag is keyed by user id, so a second account signing in on the same
 * browser does not silently inherit the first one's ideas — it imports the
 * same local store once for itself, which is the sane reading of "these are
 * the ideas on this machine".
 */
function flagKey(userId: string): string {
  return `idea-refinery:imported:${userId}`;
}

export function hasImported(userId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(flagKey(userId)) === "1";
  } catch {
    // Storage blocked: treat as done rather than re-importing on every load.
    return true;
  }
}

function markImported(userId: string): void {
  try {
    window.localStorage.setItem(flagKey(userId), "1");
  } catch {
    // Nothing to do — worst case the import is attempted again, and the
    // unique (idea_id, external_id) constraint makes it idempotent anyway.
  }
}

export type ImportOutcome = { ideas: number; results: number };

export async function importLocalIdeas(
  userId: string,
): Promise<ImportOutcome | null> {
  if (hasImported(userId)) return null;

  const local = readIdeas();
  if (local.length === 0) {
    markImported(userId);
    return null;
  }

  let results = 0;
  for (const idea of local) {
    for (const r of idea.results) {
      await saveResult(idea.query, r);
      results += 1;
    }
  }

  markImported(userId);
  return { ideas: local.length, results };
}
