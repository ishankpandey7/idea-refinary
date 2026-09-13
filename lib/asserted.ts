import type { MediaType, SourceResult, Spdx } from "@/types/source-result";
import {
  t,
  termsFor,
  verdictForTerms,
  type Level,
  type Terms,
  type Usage,
  type Verdict,
} from "./licence-rules";

/**
 * Material Idea Craft cannot read, described by the person using it.
 *
 * The four sources answer for maybe a fifth of a real project. The rest is a
 * typeface, a music bed, an icon set, a stock photo, a screenshot of
 * someone's docs — and on every one of those the honest answer was "we
 * cannot tell you", which is honest and useless.
 *
 * So the person tells us. They pick the licence; we do what we have always
 * done with a licence — judge it against what they said they were doing, and
 * write the credit line. The rule that nothing here may guess at a licence is
 * untouched: we still do not guess. Someone who knows is stating it, and
 * every place that row surfaces says so, because a verdict whose provenance
 * is invisible is a verdict nobody can check.
 */

/** Not a source. The sourceId that marks a row as the person's own word. */
export const SELF_SOURCE = "you";

export const SELF_LABEL = "Your own entry";

/**
 * Said on every asserted row, everywhere — card, credits, printed report.
 * First in the list on purpose: it changes how everything after it reads.
 */
export const SELF_NOTE =
  "You stated this licence. Idea Craft did not read it from the source, and cannot vouch for it.";

export type LicencePick = {
  id: string;
  /** What it is called, in the words the person will recognise. */
  name: string;
  group: string;
  /**
   * The nearest tag in the frozen enum, or UNKNOWN where the licence has no
   * place in it. The verdict never comes from this — `terms` decides — so
   * UNKNOWN here does not mean "nobody knows".
   */
  spdx: Spdx;
  url: string | null;
  terms: Terms;
  atLeast?: Level;
  /** The part of this licence that catches people out. */
  note?: string;
};

const CC = "Creative Commons";
const PUBLIC = "Public domain";
const CODE = "Code and fonts";
const STOCK = "Stock and media sites";
const OTHER = "Anything else";

export const LICENCES: LicencePick[] = [
  {
    id: "cc0",
    name: "CC0 1.0",
    group: CC,
    spdx: "CC0-1.0",
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
    terms: t(true, true, false, false),
  },
  {
    id: "cc-by-4.0",
    name: "CC BY 4.0",
    group: CC,
    spdx: "CC-BY-4.0",
    url: "https://creativecommons.org/licenses/by/4.0/",
    terms: t(true, true, true, false),
  },
  {
    id: "cc-by-sa-4.0",
    name: "CC BY-SA 4.0",
    group: CC,
    spdx: "CC-BY-SA-4.0",
    url: "https://creativecommons.org/licenses/by-sa/4.0/",
    terms: t(true, true, true, true),
  },
  {
    id: "cc-by-nd-4.0",
    name: "CC BY-ND 4.0",
    group: CC,
    spdx: "CC-BY-ND",
    url: "https://creativecommons.org/licenses/by-nd/4.0/",
    terms: t(true, false, true, false),
  },
  {
    id: "cc-by-nc-4.0",
    name: "CC BY-NC 4.0",
    group: CC,
    spdx: "CC-BY-NC",
    url: "https://creativecommons.org/licenses/by-nc/4.0/",
    terms: t(false, true, true, false),
  },
  {
    id: "cc-by-nc-sa-4.0",
    name: "CC BY-NC-SA 4.0",
    group: CC,
    spdx: "CC-BY-NC-SA",
    url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
    terms: t(false, true, true, true),
  },
  {
    id: "cc-by-nc-nd-4.0",
    name: "CC BY-NC-ND 4.0",
    group: CC,
    spdx: "CC-BY-NC-ND",
    url: "https://creativecommons.org/licenses/by-nc-nd/4.0/",
    terms: t(false, false, true, false),
  },

  {
    id: "public-domain",
    name: "Public domain",
    group: PUBLIC,
    spdx: "PD",
    url: "https://creativecommons.org/publicdomain/mark/1.0/",
    terms: t(true, true, false, false),
    note: "Public domain is decided country by country. A work that is free where you are may still be in copyright where your audience is.",
  },

  {
    id: "mit",
    name: "MIT",
    group: CODE,
    spdx: "UNKNOWN",
    url: "https://opensource.org/license/mit",
    terms: t(true, true, true, false),
    note: "The copyright notice and the licence text have to travel with the code, including inside a compiled product.",
  },
  {
    id: "apache-2.0",
    name: "Apache 2.0",
    group: CODE,
    spdx: "UNKNOWN",
    url: "https://www.apache.org/licenses/LICENSE-2.0",
    terms: t(true, true, true, false),
    note: "Keep the NOTICE file if there is one, and say which files you changed.",
  },
  {
    id: "bsd-3-clause",
    name: "BSD 3-Clause",
    group: CODE,
    spdx: "UNKNOWN",
    url: "https://opensource.org/license/bsd-3-clause",
    terms: t(true, true, true, false),
    note: "You may not use the author's name to promote what you built with it.",
  },
  {
    id: "gpl-3.0",
    name: "GPL v3",
    group: CODE,
    spdx: "UNKNOWN",
    url: "https://www.gnu.org/licenses/gpl-3.0.html",
    terms: t(true, true, true, true),
    note: "Anything you distribute that includes this has to be released under the GPL as well, source and all.",
  },
  {
    id: "ofl-1.1",
    name: "SIL Open Font Licence 1.1",
    group: CODE,
    spdx: "UNKNOWN",
    url: "https://openfontlicense.org/",
    terms: t(true, true, true, true),
    note: "The font may be bundled and sold with your work, but never sold on its own, and a modified copy stays under the OFL.",
  },

  {
    id: "unsplash",
    name: "Unsplash Licence",
    group: STOCK,
    spdx: "UNKNOWN",
    url: "https://unsplash.com/license",
    terms: t(true, true, false, false),
    note: "No credit required. You may not sell the photo unaltered, or use Unsplash photos to build a rival stock service.",
  },
  {
    id: "pexels",
    name: "Pexels Licence",
    group: STOCK,
    spdx: "UNKNOWN",
    url: "https://www.pexels.com/license/",
    terms: t(true, true, false, false),
    note: "No credit required. You may not sell the file unaltered, and identifiable people or brands in it need their own permission.",
  },
  {
    id: "pixabay",
    name: "Pixabay Content Licence",
    group: STOCK,
    spdx: "UNKNOWN",
    url: "https://pixabay.com/service/license-summary/",
    terms: t(true, true, false, false),
    note: "No credit required. You may not redistribute the file itself, on Pixabay or anywhere else.",
  },
  {
    id: "stock-paid",
    name: "A stock licence I paid for",
    group: STOCK,
    spdx: "UNKNOWN",
    url: null,
    terms: t(true, true, false, false),
    atLeast: "caution",
    note: "Paid stock licences cap print runs and audience size, and nearly all of them forbid using the asset in a logo or a trademark. Read the one you bought.",
  },

  {
    id: "free-with-credit",
    name: "Free to use, credit required",
    group: OTHER,
    spdx: "UNKNOWN",
    url: null,
    terms: t(true, true, true, false),
  },
  {
    id: "free-non-commercial",
    name: "Free for non-commercial use only",
    group: OTHER,
    spdx: "UNKNOWN",
    url: null,
    terms: t(false, true, true, false),
  },
  {
    id: "permission",
    name: "I have the rights holder's permission",
    group: OTHER,
    spdx: "UNKNOWN",
    url: null,
    terms: t(true, true, false, false),
    atLeast: "caution",
    note: "Your whole claim to this rests on that permission. Keep a copy of it, in writing, with the project.",
  },
  {
    id: "own-work",
    name: "I made it myself",
    group: OTHER,
    spdx: "UNKNOWN",
    url: null,
    terms: t(true, true, false, false),
    note: "Only if nothing went into it that someone else owns — a font, a sample, a photo you traced.",
  },
  {
    id: "all-rights-reserved",
    name: "All rights reserved",
    group: OTHER,
    spdx: "UNKNOWN",
    url: null,
    terms: t(false, false, true, false),
    atLeast: "verify",
    note: "Nobody has granted you anything here. Even unchanged, even privately, using this needs the rights holder's say-so.",
  },
  {
    id: "custom",
    name: "Something else — I will describe it",
    group: OTHER,
    spdx: "UNKNOWN",
    url: null,
    terms: t(false, false, true, false),
    atLeast: "verify",
  },
];

export const CUSTOM_ID = "custom";

const BY_ID = new Map(LICENCES.map((l) => [l.id, l]));

const FALLBACK = LICENCES[LICENCES.length - 1];

export const MEDIA_CHOICES: { value: MediaType; label: string }[] = [
  { value: "image", label: "Image, icon or illustration" },
  { value: "text", label: "Writing or text" },
  { value: "paper", label: "Paper or article" },
  { value: "record", label: "Font, audio, video or anything else" },
];

/**
 * One asset the person described.
 *
 * Only the choice is stored, never the terms it implies — so a correction to
 * the table above reaches every project that used it, instead of leaving old
 * entries judged by rules nobody agrees with any more. A custom licence is
 * the exception: nothing else knows what it means.
 */
export type Asserted = {
  id: string;
  /** Where it came from. May be empty — a font on disk has no address. */
  url: string;
  title: string;
  creator: string;
  /** Exactly what the person typed. Never composed here. */
  attribution: string;
  licenceId: string;
  customName?: string;
  customTerms?: Terms;
  mediaType: MediaType;
};

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function newAsserted(url = ""): Asserted {
  return {
    id: newId(),
    url,
    title: "",
    creator: "",
    attribution: "",
    licenceId: "cc-by-4.0",
    mediaType: url ? "image" : "record",
  };
}

/** The catalogue entry behind an asset, with a described licence filled in. */
export function pickFor(a: Asserted): LicencePick {
  const base = BY_ID.get(a.licenceId) ?? FALLBACK;
  if (a.licenceId !== CUSTOM_ID) return base;

  return {
    ...base,
    name: a.customName?.trim() || "A licence you described",
    terms: a.customTerms ?? base.terms,
    // The four questions have been answered, so this is no longer a shrug.
    atLeast: a.customTerms ? undefined : base.atLeast,
    note: undefined,
  };
}

/** The licence name to show. Asserted rows have one the enum cannot hold. */
export function licenceLabel(r: SourceResult): string {
  const a = assertedOf(r);
  return a ? pickFor(a).name : r.licence.spdx;
}

// ---------------------------------------------------------------------------
// Crossing into the shape the rest of the app already speaks
// ---------------------------------------------------------------------------

type SelfRaw = { asserted: Asserted };

function isSelfRaw(raw: unknown): raw is SelfRaw {
  if (typeof raw !== "object" || raw === null) return false;
  const a = (raw as { asserted?: unknown }).asserted;
  return typeof a === "object" && a !== null && "licenceId" in a;
}

/** The asset behind a result, or null when a source answered for this one. */
export function assertedOf(r: SourceResult): Asserted | null {
  if (r.sourceId !== SELF_SOURCE) return null;
  return isSelfRaw(r.raw) ? r.raw.asserted : null;
}

export function isAsserted(r: SourceResult): boolean {
  return assertedOf(r) !== null;
}

/**
 * A described asset as a SourceResult, so everything that already counts,
 * credits, prints and keeps results goes on doing it without knowing this
 * feature exists. `assertedBy` is the field in the frozen contract that was
 * always meant to carry this, and here it names a person, not a source.
 */
export function toResult(a: Asserted): SourceResult {
  const pick = pickFor(a);
  return {
    sourceId: SELF_SOURCE,
    externalId: a.id,
    canonicalUrl: a.url.trim(),
    title: a.title.trim() || "Untitled",
    authors: a.creator.trim() ? [a.creator.trim()] : [],
    publishedAt: null,
    mediaType: a.mediaType,
    licence: {
      spdx: pick.spdx,
      url: pick.url,
      assertedBy: "you",
      attribution: a.attribution.trim(),
    },
    snippet: null,
    thumbnailUrl: null,
    raw: { asserted: a } satisfies SelfRaw,
  };
}

/** The one verdict call the whole app uses. Handles both kinds of row. */
export function verdictForResult(r: SourceResult, usage: Usage): Verdict {
  const a = assertedOf(r);
  if (!a) {
    return verdictForTerms(termsFor(r.licence.spdx), usage, {
      ambiguousNote:
        r.licence.spdx === "OPEN-ACCESS"
          ? "Open access means free to read. It does not state reuse terms — check the publisher's page before using this."
          : undefined,
    });
  }

  const pick = pickFor(a);
  return verdictForTerms(pick.terms, usage, {
    atLeast: pick.atLeast,
    notes: [SELF_NOTE, pick.note ?? ""],
    voice: "stated",
  });
}

/**
 * A credit line built from what has been typed so far.
 *
 * Only ever a suggestion in the form: whatever is left in the box is what
 * gets stored and printed, verbatim — the same promise the adapters make
 * about a provider's own attribution string.
 */
export function suggestAttribution(a: Asserted): string {
  const pick = pickFor(a);
  const title = a.title.trim();
  const creator = a.creator.trim();
  if (!title && !creator) return "";

  const head = title || "Untitled";
  const by = creator ? ` by ${creator}` : "";
  return `${head}${by} (${pick.name})`;
}

// ---------------------------------------------------------------------------
// Carrying them between visits, and into a shared link
// ---------------------------------------------------------------------------

/** More than this and it is an inventory, not a project. Matches MAX_LINKS. */
export const MAX_ASSERTED = 40;

type Packed = {
  i: string;
  u?: string;
  t?: string;
  c?: string;
  a?: string;
  l: string;
  n?: string;
  x?: string;
  m?: MediaType;
};

/** The four permissions as "1010", so a shared link stays a link. */
function packTerms(terms: Terms): string {
  return [terms.commercial, terms.modify, terms.attribution, terms.shareAlike]
    .map((b) => (b ? "1" : "0"))
    .join("");
}

function unpackTerms(raw: string): Terms | undefined {
  if (!/^[01]{4}$/.test(raw)) return undefined;
  return t(raw[0] === "1", raw[1] === "1", raw[2] === "1", raw[3] === "1");
}

export function encodeAsserted(list: Asserted[]): string {
  const packed: Packed[] = list.slice(0, MAX_ASSERTED).map((a) => {
    const row: Packed = { i: a.id, l: a.licenceId };
    if (a.url) row.u = a.url;
    if (a.title) row.t = a.title;
    if (a.creator) row.c = a.creator;
    if (a.attribution) row.a = a.attribution;
    if (a.customName) row.n = a.customName;
    if (a.customTerms) row.x = packTerms(a.customTerms);
    if (a.mediaType !== "record") row.m = a.mediaType;
    return row;
  });
  return JSON.stringify(packed);
}

const MEDIA: MediaType[] = ["paper", "image", "text", "record"];

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Never throws. A link somebody mangled loses rows, not the whole check. */
export function decodeAsserted(raw: string): Asserted[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: Asserted[] = [];
  for (const row of parsed.slice(0, MAX_ASSERTED)) {
    if (typeof row !== "object" || row === null) continue;
    const p = row as Partial<Packed>;
    const licenceId = str(p.l);
    if (!licenceId) continue;

    const media = str(p.m) as MediaType;
    out.push({
      id: str(p.i) || newId(),
      url: str(p.u),
      title: str(p.t),
      creator: str(p.c),
      attribution: str(p.a),
      licenceId: BY_ID.has(licenceId) ? licenceId : CUSTOM_ID,
      customName: str(p.n) || undefined,
      customTerms: unpackTerms(str(p.x)),
      mediaType: MEDIA.includes(media) ? media : "record",
    });
  }
  return out;
}
