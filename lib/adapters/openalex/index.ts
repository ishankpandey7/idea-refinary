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
  open_access?: { is_oa?: boolean | null } | null;
};

const LICENCE_MAP: Record<string, Spdx> = {
  "cc0": "CC0-1.0",
  "cc-by": "CC-BY",
  "cc-by-sa": "CC-BY-SA",
  "cc-by-nc": "CC-BY-NC",
  "public-domain": "PD",
  "pd": "PD",
  "pdm": "PD",
};

function mapLicence(raw: string | null | undefined): Spdx {
  if (!raw) return "UNKNOWN";
  const key = raw.trim().toLowerCase();
  if (LICENCE_MAP[key]) return LICENCE_MAP[key];

  if (key.startsWith("cc0")) return "CC0-1.0";

  // Order matters: NC-SA / NC-ND / ND have no Spdx member, and a bare
  // "cc-by" prefix test would otherwise mislabel them as CC-BY.
  if (key.startsWith("cc-by-nc-")) return "UNKNOWN";
  if (key.startsWith("cc-by-nd")) return "UNKNOWN";

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

  const licenceRaw = work.best_oa_location?.license ?? null;
  const spdx = licenceRaw
    ? mapLicence(licenceRaw)
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
      url: work.best_oa_location?.landing_page_url ?? null,
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
