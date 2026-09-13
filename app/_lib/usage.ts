import type { Usage } from "@/lib/licence-rules";

/**
 * What the person is doing with the material, kept in localStorage.
 *
 * One key for the whole site: the answer to "commercial?" does not change
 * between the checker and search, and being asked twice would suggest it
 * might. Signed in, `ideas.usage_*` holds the same pair per saved idea.
 *
 * False/false is the safe default — nothing reads as clear until someone has
 * actually said what they are doing.
 */
const KEY = "idea-refinery:usage";

export const DEFAULT_USAGE: Usage = { commercial: false, modify: false };

export function readUsage(): Usage {
  if (typeof window === "undefined") return DEFAULT_USAGE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_USAGE;
    const parsed = JSON.parse(raw) as Partial<Usage>;
    return {
      commercial: parsed.commercial === true,
      modify: parsed.modify === true,
    };
  } catch {
    return DEFAULT_USAGE;
  }
}

export function writeUsage(usage: Usage): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(usage));
  } catch {
    // Not persisted; the toggles still work for this visit.
  }
}

/** One line describing the pair, for headings and summaries. */
export function usageLabel(usage: Usage): string {
  return [
    usage.commercial ? "a commercial project" : "a non-commercial project",
    usage.modify ? "edited or adapted" : "used unmodified",
  ].join(", ");
}
