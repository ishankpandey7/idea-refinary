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
 * False/false is the safe default — nothing reads as clear until someone has
 * actually said what they are doing.
 */
export const USAGE_KEY = "idea-refinery:usage";
const KEY = USAGE_KEY;

export const DEFAULT_USAGE: Usage = { commercial: false, modify: false };

const DEFAULT_RAW = JSON.stringify(DEFAULT_USAGE);

function parse(raw: string): Usage {
  try {
    const value = JSON.parse(raw) as Partial<Usage>;
    return {
      commercial: value.commercial === true,
      modify: value.modify === true,
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

/** One line describing the pair, for headings and summaries. */
export function usageLabel(usage: Usage): string {
  return [
    usage.commercial ? "a commercial project" : "a non-commercial project",
    usage.modify ? "edited or adapted" : "used unmodified",
  ].join(", ");
}
