import type { Adapter, SourceResult, Spdx } from "@/types/source-result";

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
