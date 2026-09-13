import type { Adapter, SourceResult, Spdx } from "@/types/source-result";
import { fillMissing, type ResolveOutcome, type Resolver } from "@/lib/resolve-types";

const SOURCE_ID = "openalex";
const ENDPOINT = "https://api.openalex.org/works";
// OpenAlex polite pool: opt-in, set OPENALEX_MAILTO in .env.local.
// Unset is fine - the request just goes to the common pool.
const MAILTO = process.env.OPENALEX_MAILTO?.trim() ?? "";

type OpenAlexAuthorship = {
  author?: { display_name?: string | null } | null;
};

type OpenAlexLocation = {
  license?: string | null;
  landing_page_url?: string | null;
};

type OpenAlexWork = {
  id?: string | null;
  doi?: string | null;
  display_name?: string | null;
  title?: string | null;
  publication_date?: string | null;
  authorships?: OpenAlexAuthorship[] | null;
  best_oa_location?: OpenAlexLocation | null;
  primary_location?: OpenAlexLocation | null;
  locations?: (OpenAlexLocation | null)[] | null;
  open_access?: { is_oa?: boolean | null } | null;
};

/**
 * OpenAlex spreads the licence across several places and often fills only one
 * of them, so walk them in order of confidence before giving up.
 */
function pickLicence(work: OpenAlexWork): {
  raw: string | null;
  url: string | null;
} {
  const candidates: (OpenAlexLocation | null | undefined)[] = [
    work.best_oa_location,
    work.primary_location,
    ...(work.locations ?? []),
  ];

  for (const loc of candidates) {
    const raw = loc?.license?.trim();
    if (raw) return { raw, url: loc?.landing_page_url ?? null };
  }

  const fallbackUrl =
    work.best_oa_location?.landing_page_url ??
    work.primary_location?.landing_page_url ??
    null;
  return { raw: null, url: fallbackUrl };
}

const LICENCE_MAP: Record<string, Spdx> = {
  "cc0": "CC0-1.0",
  "cc-by": "CC-BY",
  "cc-by-sa": "CC-BY-SA",
  "cc-by-nc": "CC-BY-NC",
  "cc-by-nc-sa": "CC-BY-NC-SA",
  "cc-by-nc-nd": "CC-BY-NC-ND",
  "cc-by-nd": "CC-BY-ND",
  "public-domain": "PD",
  "pd": "PD",
  "pdm": "PD",
};

function mapLicence(raw: string | null | undefined): Spdx {
  if (!raw) return "UNKNOWN";
  const key = raw.trim().toLowerCase();
  if (LICENCE_MAP[key]) return LICENCE_MAP[key];

  if (key.startsWith("cc0")) return "CC0-1.0";

  // Order matters: a bare "cc-by" prefix test would otherwise swallow every
  // NC / ND variant and mislabel it as CC-BY.
  if (key.startsWith("cc-by-nc-sa")) return "CC-BY-NC-SA";
  if (key.startsWith("cc-by-nc-nd")) return "CC-BY-NC-ND";
  if (key.startsWith("cc-by-nd")) return "CC-BY-ND";

  if (key.startsWith("cc-by-sa")) {
    return key.includes("4.0") ? "CC-BY-SA-4.0" : "CC-BY-SA";
  }
  if (key.startsWith("cc-by-nc")) return "CC-BY-NC";
  if (key.startsWith("cc-by")) {
    return key.includes("4.0") ? "CC-BY-4.0" : "CC-BY";
  }
  return "UNKNOWN";
}

function toResult(work: OpenAlexWork): SourceResult | null {
  const canonicalUrl = work.id ?? work.doi ?? null;
  if (!canonicalUrl) return null;

  const title = work.display_name ?? work.title ?? "Untitled";
  const authors = (work.authorships ?? [])
    .map((a) => a?.author?.display_name)
    .filter((n): n is string => typeof n === "string" && n.length > 0);

  // A licence string that has no Spdx member (cc-by-nc-nd, other-oa, ...) must
  // not bury the fact that the work is open access, so fall through to is_oa
  // rather than stopping at UNKNOWN.
  const licence = pickLicence(work);
  const mapped = licence.raw ? mapLicence(licence.raw) : "UNKNOWN";
  const spdx =
    mapped !== "UNKNOWN"
      ? mapped
      : work.open_access?.is_oa
        ? "OPEN-ACCESS"
        : "UNKNOWN";

  return {
    sourceId: SOURCE_ID,
    externalId: canonicalUrl.replace("https://openalex.org/", ""),
    canonicalUrl,
    title,
    authors,
    publishedAt: work.publication_date ?? null,
    mediaType: "paper",
    licence: {
      spdx,
      url: licence.url,
      assertedBy: SOURCE_ID,
      attribution: `${authors.join(", ") || "Unknown"} — ${title}`,
    },
    snippet: null,
    thumbnailUrl: null,
    raw: work,
  };
}

export const adapter: Adapter = {
  id: SOURCE_ID,
  label: "OpenAlex",
  categories: ["research"],
  async search(query: string, signal?: AbortSignal): Promise<SourceResult[]> {
    try {
      const q = query.trim();
      if (!q) return [];

      const params = new URLSearchParams({ search: q, "per-page": "10" });
      if (MAILTO) params.set("mailto", MAILTO);
      const url = `${ENDPOINT}?${params.toString()}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal,
      });

      if (!res.ok) {
        console.error(`[${SOURCE_ID}] HTTP ${res.status}`);
        return [];
      }

      const body: unknown = await res.json();
      const works = (body as { results?: OpenAlexWork[] } | null)?.results;
      if (!Array.isArray(works)) {
        console.error(`[${SOURCE_ID}] unexpected payload shape`);
        return [];
      }

      return works
        .map(toResult)
        .filter((r): r is SourceResult => r !== null);
    } catch (err) {
      console.error(`[${SOURCE_ID}] ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  },
};

export const search = adapter.search;

// ---------------------------------------------------------------------------
// Resolve: a paper link someone already has -> the same SourceResult.
// ---------------------------------------------------------------------------

const DOI_KEY = "doi:";

/**
 * Two ways a paper gets referenced: an OpenAlex work id, or a DOI — which is
 * how papers are actually cited, so doi.org links matter more than
 * openalex.org ones here.
 */
function identify(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "doi.org" || host === "dx.doi.org") {
    const doi = decodeURIComponent(url.pathname.replace(/^\//, "")).trim();
    return /^10\.\d{4,9}\//.test(doi) ? `${DOI_KEY}${doi.toLowerCase()}` : null;
  }

  if (host === "openalex.org" || host === "api.openalex.org") {
    // openalex.org/W123 · openalex.org/works/W123 · api.openalex.org/works/W123
    const id = parts.at(-1) ?? "";
    return /^W\d+$/i.test(id) ? id.toUpperCase() : null;
  }

  return null;
}

/** OpenAlex takes 200 per page; 50 keeps the URL a sane length. */
const PER_CALL = 50;

function keyForWork(work: OpenAlexWork): string[] {
  const keys: string[] = [];
  const id = work.id?.replace("https://openalex.org/", "").trim();
  if (id) keys.push(id.toUpperCase());
  const doi = work.doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim();
  if (doi) keys.push(`${DOI_KEY}${doi.toLowerCase()}`);
  return keys;
}

async function fetchWorks(
  filter: string,
  signal?: AbortSignal,
): Promise<OpenAlexWork[] | { unreachable: string }> {
  const params = new URLSearchParams({
    filter,
    "per-page": String(PER_CALL),
  });
  if (MAILTO) params.set("mailto", MAILTO);

  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!res.ok) {
    console.error(`[${SOURCE_ID}] resolve HTTP ${res.status}`);
    return { unreachable: `HTTP ${res.status}` };
  }

  const body: unknown = await res.json();
  const works = (body as { results?: OpenAlexWork[] } | null)?.results;
  return Array.isArray(works) ? works : { unreachable: "unexpected payload" };
}

/**
 * A DOI is allowed to contain a comma, and a comma is how OpenAlex separates
 * AND-ed filters — so those few cannot ride in a batch and are asked for one
 * at a time instead. `|` is the OR separator and gets the same treatment.
 */
function batchable(doi: string): boolean {
  return !doi.includes(",") && !doi.includes("|");
}

async function collect(
  keys: string[],
  filterFor: (keys: string[]) => string,
  out: Record<string, ResolveOutcome>,
  signal?: AbortSignal,
): Promise<void> {
  for (let i = 0; i < keys.length; i += PER_CALL) {
    const chunk = keys.slice(i, i + PER_CALL);
    const works = await fetchWorks(filterFor(chunk), signal);

    if ("unreachable" in works) {
      fillMissing(out, chunk, { status: "unreachable", detail: works.unreachable });
      continue;
    }

    for (const work of works) {
      const result = toResult(work);
      if (!result) continue;
      // A work answers to both its OpenAlex id and its DOI; whichever of the
      // two was pasted is the one that needs filling in.
      for (const key of keyForWork(work)) {
        if (keys.includes(key) && !out[key]) out[key] = { status: "ok", result };
      }
    }
    fillMissing(out, chunk, { status: "notfound" });
  }
}

export const resolver: Resolver = {
  identify,
  async resolveBatch(keys, signal) {
    const out: Record<string, ResolveOutcome> = {};
    const ids = keys.filter((k) => !k.startsWith(DOI_KEY));
    const dois = keys
      .filter((k) => k.startsWith(DOI_KEY))
      .map((k) => k.slice(DOI_KEY.length));

    try {
      if (ids.length > 0) {
        await collect(ids, (c) => `ids.openalex:${c.join("|")}`, out, signal);
      }

      const wide = dois.filter(batchable);
      if (wide.length > 0) {
        await collect(
          wide.map((d) => `${DOI_KEY}${d}`),
          (c) =>
            `doi:${c
              .map((k) => `https://doi.org/${k.slice(DOI_KEY.length)}`)
              .join("|")}`,
          out,
          signal,
        );
      }

      for (const odd of dois.filter((d) => !batchable(d))) {
        await collect(
          [`${DOI_KEY}${odd}`],
          () => `doi:https://doi.org/${odd}`,
          out,
          signal,
        );
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`[${SOURCE_ID}] resolve ${detail}`);
      return fillMissing(out, keys, { status: "unreachable", detail });
    }

    return fillMissing(out, keys, { status: "notfound" });
  },
};
