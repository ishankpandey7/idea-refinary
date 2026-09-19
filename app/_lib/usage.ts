"use client";

import { useCallback, useMemo } from "react";
import type { Usage } from "@/lib/licence-rules";
import { useStored } from "./stored";

/**
 * What the person is doing with the material, kept in localStorage.
 *
 * One key for the whole site: the answer to "commercial?" does not change
 * between the checker and search, and being asked twice would suggest it
 * might. Signed in, `ideas.usage_*` holds the same pair per saved project.
 *
 * Null/null is the only safe default. False/false looks cautious and is the
 * exact opposite — a licence forbids only what you have said you want to do,
 * so "no to both" is the most permissive question you can ask one.
 */
export const USAGE_KEY = "idea-refinery:usage";
const KEY = USAGE_KEY;

export const DEFAULT_USAGE: Usage = { commercial: null, modify: null };

const DEFAULT_RAW = JSON.stringify(DEFAULT_USAGE);

/** Anything that is not a literal true or false has not been answered. */
function answer(value: unknown): boolean | null {
  return value === true ? true : value === false ? false : null;
}

function parse(raw: string): Usage {
  try {
    const value = JSON.parse(raw) as Partial<Usage>;
    return {
      commercial: answer(value.commercial),
      modify: answer(value.modify),
    };
  } catch {
    return DEFAULT_USAGE;
  }
}

/**
 * Every page that judges anything reads this, so they all move together —
 * ticking Commercial on the checker is ticked on search too, which is the
 * only behaviour that makes sense for one question about one project.
 */
export function useUsage(): [Usage, (next: Usage) => void] {
  const [raw, setRaw] = useStored(KEY, DEFAULT_RAW);

  // Keyed off the raw string so the object identity only changes when the
  // stored value does — verdicts are memoised on it.
  const usage = useMemo(() => parse(raw), [raw]);

  const set = useCallback(
    (next: Usage) => setRaw(JSON.stringify(next)),
    [setRaw],
  );

  return [usage, set];
}

/**
 * One line describing the pair, for headings and summaries.
 *
 * Says so plainly when a question has no answer. The old wording read an
 * unanswered pair back as "a non-commercial project, used unmodified", which
 * told the person their own intent was something they had never said.
 */
export function usageLabel(usage: Usage): string {
  if (usage.commercial === null && usage.modify === null) {
    return "material you have not told us what you are doing with";
  }
  return [
    usage.commercial === null
      ? "a project you have not said is commercial or not"
      : usage.commercial
        ? "a commercial project"
        : "a non-commercial project",
    usage.modify === null
      ? "edited or not, you have not said"
      : usage.modify
        ? "edited or adapted"
        : "used unmodified",
  ].join(", ");
}
