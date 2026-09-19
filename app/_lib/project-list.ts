"use client";

import type { Usage } from "@/lib/licence-rules";
import {
  decodeAsserted,
  encodeAsserted,
  type Asserted,
} from "@/lib/asserted";

/**
 * What a project is a record of.
 *
 * Pins hold what each source said at the moment you kept it — right for a
 * report, useless for a ledger. You cannot re-run a check from a snapshot,
 * because a snapshot does not know it was ever part of a batch.
 *
 * This is the input instead: the material box as it was typed, and every
 * entry stated by hand. Keep that with the project and "re-check before the
 * next release" stops meaning "go and find all those links again".
 */
export type ProjectList = {
  /** Exactly what was in the box, prose and all. Links are extracted later. */
  paste: string;
  asserted: Asserted[];
  /** What it was judged as. A list without its question is half an answer. */
  usage: Usage;
};

export const EMPTY_LIST: ProjectList = {
  paste: "",
  asserted: [],
  usage: { commercial: null, modify: null },
};

export function hasContent(list: ProjectList | null): boolean {
  if (!list) return false;
  return list.paste.trim().length > 0 || list.asserted.length > 0;
}

type Stored = {
  paste?: unknown;
  asserted?: unknown;
  commercial?: unknown;
  modify?: unknown;
};

/** Shaped for storage: asserted through its own codec, never raw. */
export function encodeList(list: ProjectList): Stored {
  return {
    paste: list.paste,
    asserted: encodeAsserted(list.asserted),
    commercial: list.usage.commercial,
    modify: list.usage.modify,
  };
}

/**
 * Never throws. A row written by an older build, or by a hand that got it
 * wrong, comes back as an empty list rather than taking the page down.
 */
export function decodeList(raw: unknown): ProjectList | null {
  if (typeof raw !== "object" || raw === null) return null;
  const s = raw as Stored;

  return {
    paste: typeof s.paste === "string" ? s.paste : "",
    asserted:
      typeof s.asserted === "string" ? decodeAsserted(s.asserted) : [],
    // A row written before the question had a third answer stored `false`
    // for "not asked". It reads back as "no" here, which is the answer the
    // person was shown at the time, so the saved verdicts do not move under
    // them. Only a genuinely absent value is unanswered.
    usage: {
      commercial: s.commercial === true ? true : s.commercial === false ? false : null,
      modify: s.modify === true ? true : s.modify === false ? false : null,
    },
  };
}
