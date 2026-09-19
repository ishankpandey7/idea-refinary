import type { Spdx } from "@/types/source-result";

/**
 * What a licence actually permits, and what it obliges you to do.
 *
 * Derived from the Spdx enum, never stored — types/source-result.ts is
 * frozen and this has to stay a pure function of the tag the adapter
 * already produced.
 *
 * This is not legal advice and the UI must not pretend otherwise. It
 * encodes the plain terms of the Creative Commons licence family so that a
 * person can see, at a glance, which of their sources need a second look.
 */
export type Terms = {
  commercial: boolean;
  modify: boolean;
  attribution: boolean;
  shareAlike: boolean;
  /** True when the tag does not actually settle the reuse question. */
  ambiguous: boolean;
};

const TERMS: Record<Spdx, Terms> = {
  "CC0-1.0": t(true, true, false, false),
  PD: t(true, true, false, false),

  "CC-BY": t(true, true, true, false),
  "CC-BY-4.0": t(true, true, true, false),

  "CC-BY-SA": t(true, true, true, true),
  "CC-BY-SA-4.0": t(true, true, true, true),

  "CC-BY-ND": t(true, false, true, false),

  "CC-BY-NC": t(false, true, true, false),
  "CC-BY-NC-SA": t(false, true, true, true),
  "CC-BY-NC-ND": t(false, false, true, false),

  // Open access is a *reading* right. It says the paper is free to read,
  // not that it is free to reuse — publishers attach their own terms. Being
  // honest about that is the whole point of this file.
  "OPEN-ACCESS": { ...t(false, false, true, false), ambiguous: true },
  UNKNOWN: { ...t(false, false, true, false), ambiguous: true },
};

export function t(
  commercial: boolean,
  modify: boolean,
  attribution: boolean,
  shareAlike: boolean,
): Terms {
  return { commercial, modify, attribution, shareAlike, ambiguous: false };
}

export function termsFor(spdx: Spdx): Terms {
  return TERMS[spdx] ?? TERMS.UNKNOWN;
}

/**
 * What the person intends to do with the material.
 *
 * `null` is the third state and the one that matters: it means nobody has
 * said. It is not the same as `false`, and treating the two alike is the
 * worst mistake this file can make — `false` for both is the *most*
 * permissive question you can ask a licence, because nothing is forbidden
 * until you have said you want to do it. A stranger who has answered nothing
 * would be told CC BY-NC-ND was clear to use.
 */
export type Usage = { commercial: boolean | null; modify: boolean | null };

/** True once both questions have an answer — either answer. */
export function isStated(usage: Usage): boolean {
  return usage.commercial !== null && usage.modify !== null;
}

export type Level = "clear" | "caution" | "verify" | "blocked";

export type Verdict = {
  level: Level;
  /** One short line, safe to render in a chip. */
  headline: string;
  /** Every obligation or problem, longest-form. */
  notes: string[];
};

const LEVEL_RANK: Record<Level, number> = {
  clear: 0,
  caution: 1,
  verify: 2,
  blocked: 3,
};

export function worst(levels: Level[]): Level {
  return levels.reduce<Level>(
    (acc, l) => (LEVEL_RANK[l] > LEVEL_RANK[acc] ? l : acc),
    "clear",
  );
}

const UNSTATED =
  "The source did not state a licence. Check the original page before using this.";

/**
 * Said when the licence withholds a permission and nobody has said whether
 * they need it. The verdict is floored at "verify" alongside it, because the
 * alternative is reading silence as "no, I do not need that" — which is the
 * one reading that can turn a licence you may not use into a green tick.
 */
const UNDECIDED =
  "You have not said what you are doing with this. It is restricted in a way that may or may not matter — answer the two questions and this becomes a verdict.";

export type VerdictOptions = {
  /**
   * Never report better than this, however permissive the terms look.
   *
   * For licences whose text permits a lot but whose small print decides the
   * answer — a paid stock licence, a private permission, no licence at all.
   * Permissions alone would read as "clear", and a clear verdict on a thing
   * nobody has actually cleared is the one output this tool must not produce.
   */
  atLeast?: Level | null;
  /** Said before anything the licence itself says. */
  notes?: string[];
  /** Replaces the generic wording when the terms are ambiguous. */
  ambiguousNote?: string;
  /**
   * Whose permissions these are.
   *
   * "Non-commercial licence" is exactly right for CC BY-NC and nonsense for a
   * row that says nobody granted a licence at all, so a set of terms someone
   * typed in gets told back to them in their own voice.
   */
  voice?: "licence" | "stated";
};

/**
 * Judges a set of permissions against one intended use.
 *
 * "blocked" is only ever returned when the terms positively forbid what the
 * person said they were going to do. Terms nobody has stated are "verify" —
 * telling someone they may not use something, when the truth is that nobody
 * has said, would be its own kind of wrong.
 *
 * The mirror of that: an intent nobody has stated is "verify" too, wherever
 * the intent is what decides. Both blocking branches below are guarded by
 * the intent, so with no intent neither can fire, and the licence that
 * withholds the most would come back looking like the licence that withholds
 * nothing.
 */
export function verdictForTerms(
  terms: Terms,
  usage: Usage,
  opts: VerdictOptions = {},
): Verdict {
  const notes = (opts.notes ?? []).filter(Boolean);
  let level: Level = "clear";

  // Only where an answer could actually change the outcome. CC0 is clear
  // whatever you are doing with it, and asking about it would be noise; a
  // no-derivatives licence with "will you edit it?" unanswered is not.
  const undecided =
    !terms.ambiguous &&
    ((usage.commercial === null && !terms.commercial) ||
      (usage.modify === null && !terms.modify));

  if (undecided) notes.push(UNDECIDED);

  if (terms.ambiguous) {
    level = "verify";
    notes.push(opts.ambiguousNote ?? UNSTATED);
  } else {
    const stated = opts.voice === "stated";

    if (usage.commercial === true && !terms.commercial) {
      level = "blocked";
      notes.push(
        stated
          ? "You did not mark commercial use as permitted, so this is not usable in a commercial project."
          : "Non-commercial licence — not usable in a commercial project.",
      );
    }
    if (usage.modify && !terms.modify) {
      level = "blocked";
      notes.push(
        stated
          ? "You did not mark editing as permitted, so you may not crop, edit or remix it."
          : "No-derivatives licence — you may not crop, edit or remix it.",
      );
    }

    if (level !== "blocked" && terms.shareAlike) {
      level = "caution";
      notes.push(
        usage.modify
          ? "Share-alike: anything you make from this must carry the same licence."
          : "Share-alike: if you adapt it later, your version must carry the same licence.",
      );
    }

    if (terms.attribution) {
      notes.push("Credit is required. The attribution line is in your credits.");
    } else {
      notes.push("No credit required, though it is still good practice.");
    }
  }

  // Both floors at once: what the caller asked for, and "verify" when the
  // intent that would decide this has not been given. Whichever is worse
  // wins, and neither can lower a level the terms already earned.
  const floor = worst([
    opts.atLeast ?? "clear",
    undecided ? "verify" : "clear",
  ]);
  if (LEVEL_RANK[floor] > LEVEL_RANK[level]) {
    level = floor;
  }

  const headline =
    level === "blocked"
      ? "Not usable here"
      : level === "verify"
        ? "Check before using"
        : level === "caution"
          ? "Usable with conditions"
          : terms.attribution
            ? "Clear — credit required"
            : "Clear";

  return { level, headline, notes };
}

/** Judges one licence tag against one intended use. */
export function verdictFor(spdx: Spdx, usage: Usage): Verdict {
  return verdictForTerms(termsFor(spdx), usage, {
    ambiguousNote:
      spdx === "OPEN-ACCESS"
        ? "Open access means free to read. It does not state reuse terms — check the publisher's page before using this."
        : UNSTATED,
  });
}
