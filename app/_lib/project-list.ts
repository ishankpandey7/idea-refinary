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
  v?: unknown;
};

/**
 * Bumped when `false` stopped meaning "not asked", for the same reason and
 * on the same terms as the version in app/_lib/usage.ts.
 *
 * A list written by an older build stored false/false for a pair nobody had
 * answered. Reading that back as a stated "no" is bad on its own, and worse
 * now that reopening a project writes the pair into the site-wide key: one
 * legacy project would teach the whole site that the answer to both
 * questions was no, and CC BY-NC-ND would read clear everywhere after.
 */
const VERSION = 2;

/** Shaped for storage: asserted through its own codec, never raw. */
export function encodeList(list: ProjectList): Stored {
  return {
    paste: list.paste,
    asserted: encodeAsserted(list.asserted),
    commercial: list.usage.commercial,
    modify: list.usage.modify,
    v: VERSION,
  };
}

/**
 * Never throws. A row written by an older build, or by a hand that got it
 * wrong, comes back as an empty list rather than taking the page down.
 */
export function decodeList(raw: unknown): ProjectList | null {
  if (typeof raw !== "object" || raw === null) return null;
  const s = raw as Stored;

  const answered = s.v === VERSION;

  return {
    paste: typeof s.paste === "string" ? s.paste : "",
    asserted:
      typeof s.asserted === "string" ? decodeAsserted(s.asserted) : [],
    // Only a versioned row is trusted to mean what it says. Before the
    // version existed, `false` was written for a question nobody had been
    // asked, and there is no way to tell the two apart afterwards.
    usage: {
      commercial: answered && typeof s.commercial === "boolean" ? s.commercial : null,
      modify: answered && typeof s.modify === "boolean" ? s.modify : null,
    },
  };
}
