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

function t(
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

/** What the person intends to do with the material. */
export type Usage = { commercial: boolean; modify: boolean };

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

/**
 * Judges one licence against one intended use.
 *
 * "blocked" is only ever returned when the licence positively forbids what
 * the person said they were going to do. An unclear licence is "verify" —
 * telling someone they may not use something, when the truth is that nobody
 * has said, would be its own kind of wrong.
 */
export function verdictFor(spdx: Spdx, usage: Usage): Verdict {
  const terms = termsFor(spdx);
  const notes: string[] = [];

  if (terms.ambiguous) {
    notes.push(
      spdx === "OPEN-ACCESS"
        ? "Open access means free to read. It does not state reuse terms — check the publisher's page before using this."
        : "The source did not state a licence. Check the original page before using this.",
    );
    return {
      level: "verify",
      headline: "Check before using",
      notes,
    };
  }

  let level: Level = "clear";

  if (usage.commercial && !terms.commercial) {
    level = "blocked";
    notes.push("Non-commercial licence — not usable in a commercial project.");
  }
  if (usage.modify && !terms.modify) {
    level = "blocked";
    notes.push("No-derivatives licence — you may not crop, edit or remix it.");
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

  const headline =
    level === "blocked"
      ? "Not usable here"
      : level === "caution"
        ? "Usable with conditions"
        : terms.attribution
          ? "Clear — credit required"
          : "Clear";

  return { level, headline, notes };
}
