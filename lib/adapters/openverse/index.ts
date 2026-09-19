import type { Adapter, SourceResult, Spdx } from "@/types/source-result";
import { SOURCE_LABELS } from "@/lib/source-labels";
import { mapLimit, type ResolveOutcome, type Resolver } from "@/lib/resolve-types";

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
  if (code === "by-nc-sa") return "CC-BY-NC-SA";
  if (code === "by-nc-nd") return "CC-BY-NC-ND";
  if (code === "by-nd") return "CC-BY-ND";
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
  label: SOURCE_LABELS.openverse,
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

// ---------------------------------------------------------------------------
// Resolve: an Openverse link someone already has -> the same SourceResult.
// ---------------------------------------------------------------------------

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Openverse items are addressed by uuid, in one of a few wrappers:
 * openverse.org/image/<uuid>, the localised /en/image/<uuid>, the old
 * wordpress.org/openverse/ path, and the API's own /v1/images/<uuid>.
 *
 * Only images. The adapter searches images, so audio would be a licence
 * verdict on a row this app cannot otherwise produce.
 */
function identify(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (
    host !== "openverse.org" &&
    host !== "api.openverse.org" &&
    host !== "wordpress.org"
  ) {
    return null;
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const at = parts.findIndex((p) => p === "image" || p === "images");
  if (at === -1) return null;

  const id = parts[at + 1];
  return id && UUID.test(id) ? id.toLowerCase() : null;
}

/** The detail endpoint takes one id, so this is a pool rather than a batch. */
const IN_FLIGHT = 5;

async function resolveOne(
  id: string,
  signal?: AbortSignal,
): Promise<ResolveOutcome> {
  try {
    const res = await fetch(`${ENDPOINT}${id}/`, {
      headers: { Accept: "application/json" },
      signal,
    });

    if (res.status === 404) return { status: "notfound" };
    if (!res.ok) {
      console.error(`[${SOURCE_ID}] resolve HTTP ${res.status}`);
      return { status: "unreachable", detail: `HTTP ${res.status}` };
    }

    const image = (await res.json()) as OpenverseImage | null;
    const result = image ? toResult(image) : null;
    return result ? { status: "ok", result } : { status: "notfound" };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[${SOURCE_ID}] resolve ${detail}`);
    return { status: "unreachable", detail };
  }
}

export const resolver: Resolver = {
  identify,
  async resolveBatch(keys, signal) {
    const outcomes = await mapLimit(keys, IN_FLIGHT, (id) =>
      resolveOne(id, signal),
    );
    const out: Record<string, ResolveOutcome> = {};
    keys.forEach((key, i) => {
      out[key] = outcomes[i];
    });
    return out;
  },
};
