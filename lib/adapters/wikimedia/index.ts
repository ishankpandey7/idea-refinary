import type { Adapter, SourceResult, Spdx } from "@/types/source-result";

const SOURCE_ID = "wikimedia";
const ENDPOINT = "https://commons.wikimedia.org/w/api.php";

type ExtValue = { value?: string | null } | null;

type WikimediaImageInfo = {
  url?: string | null;
  descriptionurl?: string | null;
  thumburl?: string | null;
  extmetadata?: Record<string, ExtValue> | null;
};

type WikimediaPage = {
  pageid?: number | null;
  title?: string | null;
  imageinfo?: WikimediaImageInfo[] | null;
};

/** extmetadata values arrive as HTML fragments, so reduce them to plain text. */
function plain(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function ext(
  meta: Record<string, ExtValue> | null | undefined,
  key: string,
): string {
  return plain(meta?.[key]?.value ?? null);
}

/**
 * Commons reports the licence twice: `License` as a machine code
 * ("cc-by-sa-4.0") and `LicenseShortName` as a display string ("CC BY-SA 4.0").
 * Normalising both to the same dashed lowercase form lets one table serve both,
 * and the machine code is preferred because it never carries decoration.
 */
function mapLicence(machine: string, display: string): Spdx {
  const key = (machine || display).trim().toLowerCase().replace(/\s+/g, "-");

  if (!key) return "UNKNOWN";
  if (key.startsWith("cc0")) return "CC0-1.0";
  if (
    key.startsWith("public-domain") ||
    key === "pd" ||
    key.startsWith("pdm")
  ) {
    return "PD";
  }

  // Order matters: a bare "cc-by" test would otherwise swallow every NC / ND
  // variant and mislabel it as CC-BY.
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

function toResult(page: WikimediaPage): SourceResult | null {
  const info = page.imageinfo?.[0];
  const canonicalUrl = info?.descriptionurl ?? null;
  const pageid = page.pageid;
  if (!canonicalUrl || typeof pageid !== "number") return null;

  const meta = info?.extmetadata ?? null;
  // Page titles arrive namespaced as "File:Something.jpg".
  const title = (page.title ?? "Untitled").replace(/^File:/, "");

  const artist = ext(meta, "Artist");
  const authors = artist ? [artist] : [];
  const attribution = ext(meta, "Attribution");

  return {
    sourceId: SOURCE_ID,
    externalId: String(pageid),
    canonicalUrl,
    title,
    authors,
    publishedAt: null,
    mediaType: "image",
    licence: {
      spdx: mapLicence(ext(meta, "License"), ext(meta, "LicenseShortName")),
      url: ext(meta, "LicenseUrl") || null,
      assertedBy: SOURCE_ID,
      attribution: attribution || `${artist || "Unknown"} — ${title}`,
    },
    snippet: null,
    thumbnailUrl: info?.thumburl ?? null,
    raw: page,
  };
}

export const adapter: Adapter = {
  id: SOURCE_ID,
  label: "Wikimedia Commons",
  categories: ["art"],
  async search(query: string, signal?: AbortSignal): Promise<SourceResult[]> {
    try {
      const q = query.trim();
      if (!q) return [];

      const params = new URLSearchParams({
        action: "query",
        generator: "search",
        gsrsearch: q,
        gsrnamespace: "6",
        gsrlimit: "10",
        prop: "imageinfo",
        iiprop: "url|extmetadata",
        // Without a width the API returns no thumburl at all.
        iiurlwidth: "400",
        format: "json",
        origin: "*",
      });

      const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
        headers: { Accept: "application/json" },
        signal,
      });

      if (!res.ok) {
        console.error(`[${SOURCE_ID}] HTTP ${res.status}`);
        return [];
      }

      const body: unknown = await res.json();
      const pages = (
        body as { query?: { pages?: Record<string, WikimediaPage> } } | null
      )?.query?.pages;

      // A search with no hits omits query.pages entirely; that is not an error.
      if (!pages) return [];
      if (typeof pages !== "object") {
        console.error(`[${SOURCE_ID}] unexpected payload shape`);
        return [];
      }

      return Object.values(pages)
        .map(toResult)
        .filter((r): r is SourceResult => r !== null);
    } catch (err) {
      console.error(
        `[${SOURCE_ID}] ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  },
};

export const search = adapter.search;
