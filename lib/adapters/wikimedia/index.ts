import type { Adapter, SourceResult, Spdx } from "@/types/source-result";
import { SOURCE_LABELS } from "@/lib/source-labels";
import { fillMissing, type ResolveOutcome, type Resolver } from "@/lib/resolve-types";

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
  label: SOURCE_LABELS.wikimedia,
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

// ---------------------------------------------------------------------------
// Resolve: a Commons link someone already has -> the same SourceResult.
// ---------------------------------------------------------------------------

/**
 * MediaWiki title normalisation, the part of it that matters here: underscores
 * are spaces and the first letter is always capitalised. Doing it on both ends
 * lets a response be matched back to the key that asked for it.
 */
function canon(name: string): string {
  const s = name.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function decode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    // A stray % makes this throw. The link is malformed, not ours.
    return null;
  }
}

/** Strips the "File:" / "Image:" namespace, whichever the link used. */
function unnamespace(title: string): string | null {
  const m = title.match(/^(?:File|Image):(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * Accepts every shape a Commons link arrives in: the file page, a FilePath
 * shortcut, an index.php?title= link, and the raw upload.wikimedia.org URL
 * that browsers give you from "copy image address" — including its /thumb/
 * form, where the real file name is the second-to-last segment.
 */
function identify(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "upload.wikimedia.org") {
    const parts = url.pathname.split("/").filter(Boolean);
    // /wikipedia/commons/9/97/Name.jpg
    // /wikipedia/commons/thumb/9/97/Name.jpg/500px-Name.jpg
    if (parts[0] !== "wikipedia" || parts[1] !== "commons") return null;
    const name = parts[2] === "thumb" ? parts.at(-2) : parts.at(-1);
    if (!name) return null;
    const decoded = decode(name);
    return decoded ? canon(decoded) : null;
  }

  if (host !== "commons.wikimedia.org" && host !== "commons.m.wikimedia.org") {
    return null;
  }

  const wiki = url.pathname.match(/^\/wiki\/(.+)$/);
  const raw = wiki ? decode(wiki[1]) : url.searchParams.get("title");
  if (!raw) return null;

  const title = raw.replace(/_/g, " ").trim();

  const filePath = title.match(/^Special:FilePath\/(.+)$/i);
  if (filePath) return canon(filePath[1]);

  const file = unnamespace(title);
  return file ? canon(file) : null;
}

/** The API takes up to 50 titles per call, and there is no reason to push it. */
const TITLES_PER_CALL = 50;

async function resolveChunk(
  keys: string[],
  signal?: AbortSignal,
): Promise<Record<string, ResolveOutcome>> {
  const params = new URLSearchParams({
    action: "query",
    titles: keys.map((k) => `File:${k}`).join("|"),
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "400",
    format: "json",
    origin: "*",
  });

  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!res.ok) {
    console.error(`[${SOURCE_ID}] resolve HTTP ${res.status}`);
    return fillMissing({}, keys, {
      status: "unreachable",
      detail: `HTTP ${res.status}`,
    });
  }

  const body = (await res.json()) as {
    query?: {
      pages?: Record<string, WikimediaPage>;
      normalized?: { from?: string; to?: string }[];
      redirects?: { from?: string; to?: string }[];
    } | null;
  } | null;

  const query = body?.query;

  // MediaWiki answers under the title it normalised or redirected to, which
  // is not always the one that was asked for. Walk the chain backwards so a
  // renamed file still lands on the link the person pasted.
  const back = new Map<string, string>();
  for (const hop of [...(query?.normalized ?? []), ...(query?.redirects ?? [])]) {
    const from = hop.from ? unnamespace(hop.from) : null;
    const to = hop.to ? unnamespace(hop.to) : null;
    if (from && to) back.set(canon(to), canon(from));
  }

  const wanted = new Map(keys.map((k) => [canon(k), k]));
  const out: Record<string, ResolveOutcome> = {};

  for (const page of Object.values(query?.pages ?? {})) {
    let title = canon(unnamespace(page.title ?? "") ?? "");
    for (let hop = 0; hop < 4 && !wanted.has(title) && back.has(title); hop++) {
      title = back.get(title) as string;
    }

    const key = wanted.get(title);
    if (!key) continue;

    const result = toResult(page);
    out[key] = result ? { status: "ok", result } : { status: "notfound" };
  }

  return fillMissing(out, keys, { status: "notfound" });
}

export const resolver: Resolver = {
  identify,
  async resolveBatch(keys, signal) {
    const out: Record<string, ResolveOutcome> = {};
    try {
      for (let i = 0; i < keys.length; i += TITLES_PER_CALL) {
        const chunk = keys.slice(i, i + TITLES_PER_CALL);
        Object.assign(out, await resolveChunk(chunk, signal));
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`[${SOURCE_ID}] resolve ${detail}`);
      return fillMissing(out, keys, { status: "unreachable", detail });
    }
    return out;
  },
};
