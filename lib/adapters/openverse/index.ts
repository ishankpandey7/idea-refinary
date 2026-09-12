import type { Adapter, SourceResult, Spdx } from "@/types/source-result";

const SOURCE_ID = "openverse";
const ENDPOINT = "https://api.openverse.org/v1/images/";

type OpenverseImage = {
  id?: string | null;
  title?: string | null;
  creator?: string | null;
  foreign_landing_url?: string | null;
  url?: string | null;
  thumbnail?: string | null;
  license?: string | null;
  license_version?: string | null;
  license_url?: string | null;
  attribution?: string | null;
  created_on?: string | null;
};

function mapLicence(
  license: string | null | undefined,
  version: string | null | undefined,
): Spdx {
  if (!license) return "UNKNOWN";
  const code = license.trim().toLowerCase();
  const v = (version ?? "").trim();

  if (code === "cc0") return "CC0-1.0";
  if (code === "pdm") return "PD";
  if (code === "by") return v === "4.0" ? "CC-BY-4.0" : "CC-BY";
  if (code === "by-sa") return v === "4.0" ? "CC-BY-SA-4.0" : "CC-BY-SA";
  if (code === "by-nc") return "CC-BY-NC";
  return "UNKNOWN";
}

function toResult(image: OpenverseImage): SourceResult | null {
  const canonicalUrl = image.foreign_landing_url ?? image.url ?? null;
  const externalId = image.id ?? null;
  if (!canonicalUrl || !externalId) return null;

  const creator = image.creator?.trim();
  const authors = creator ? [creator] : [];
  const title = image.title ?? "Untitled";

  return {
    sourceId: SOURCE_ID,
    externalId,
    canonicalUrl,
    title,
    authors,
    publishedAt: image.created_on ?? null,
    mediaType: "image",
    licence: {
      spdx: mapLicence(image.license, image.license_version),
      url: image.license_url ?? null,
      assertedBy: SOURCE_ID,
      attribution: image.attribution ?? `${authors.join(", ") || "Unknown"} — ${title}`,
    },
    snippet: null,
    thumbnailUrl: image.thumbnail ?? null,
    raw: image,
  };
}

export const adapter: Adapter = {
  id: SOURCE_ID,
  label: "Openverse",
  categories: ["art"],
  async search(query: string, signal?: AbortSignal): Promise<SourceResult[]> {
    try {
      const q = query.trim();
      if (!q) return [];

      const url = `${ENDPOINT}?q=${encodeURIComponent(q)}&page_size=10`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal,
      });

      if (!res.ok) {
        console.error(`[${SOURCE_ID}] HTTP ${res.status}`);
        return [];
      }

      const body: unknown = await res.json();
      const images = (body as { results?: OpenverseImage[] } | null)?.results;
      if (!Array.isArray(images)) {
        console.error(`[${SOURCE_ID}] unexpected payload shape`);
        return [];
      }

      return images
        .map(toResult)
        .filter((r): r is SourceResult => r !== null);
    } catch (err) {
      console.error(`[${SOURCE_ID}] ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  },
};

export const search = adapter.search;
