import type { Adapter, SourceResult, Spdx } from "@/types/source-result";
import { fillMissing, type ResolveOutcome, type Resolver } from "@/lib/resolve-types";

const SOURCE_ID = "gutendex";
// The no-slash form 301s to this; go straight there to skip the extra hop.
const ENDPOINT = "https://gutendex.com/books/";

type GutendexAuthor = {
  name?: string | null;
};

type GutendexBook = {
  id?: number | null;
  title?: string | null;
  authors?: GutendexAuthor[] | null;
  formats?: Record<string, string> | null;
  copyright?: boolean | null;
};

/**
 * Gutendex exposes Project Gutenberg's own `copyright` flag. Almost everything
 * is public domain, but a few titles are hosted under permission and are not —
 * so only `copyright: false` is asserted as PD. `true` or `null` stays UNKNOWN
 * rather than guessing.
 */
function mapLicence(copyright: boolean | null | undefined): Spdx {
  return copyright === false ? "PD" : "UNKNOWN";
}

function toResult(book: GutendexBook): SourceResult | null {
  const id = book.id;
  if (typeof id !== "number") return null;

  const formats = book.formats ?? {};
  const canonicalUrl =
    formats["text/html"] ?? `https://www.gutenberg.org/ebooks/${id}`;

  const title = book.title ?? "Untitled";
  const authors = (book.authors ?? [])
    .map((a) => a?.name)
    .filter((n): n is string => typeof n === "string" && n.length > 0);

  return {
    sourceId: SOURCE_ID,
    externalId: String(id),
    canonicalUrl,
    title,
    authors,
    publishedAt: null,
    mediaType: "text",
    licence: {
      spdx: mapLicence(book.copyright),
      url: null,
      assertedBy: SOURCE_ID,
      attribution: `${authors.join(", ") || "Unknown"} — ${title}`,
    },
    snippet: null,
    thumbnailUrl: formats["image/jpeg"] ?? null,
    raw: book,
  };
}

/** Named so a maintainer on the other end can see who is calling. */
const UA = "IdeaCraft/1.0 (+https://idea-refinery-ten.vercel.app)";

export const adapter: Adapter = {
  id: SOURCE_ID,
  label: "Project Gutenberg",
  categories: ["writing"],
  async search(query: string, signal?: AbortSignal): Promise<SourceResult[]> {
    try {
      const q = query.trim();
      if (!q) return [];

      const params = new URLSearchParams({ search: q });
      const url = `${ENDPOINT}?${params.toString()}`;
      // The UA is courtesy, not a fix. gutendex answers 403 to every call
      // from Vercel and 200 from a residential IP, with or without this
      // header — measured both ways on 2026-09-13. The block is on the IP
      // range, so Writing stays empty on the deployed site until the adapter
      // talks to something other than gutendex.com.
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": UA,
        },
        signal,
      });

      if (!res.ok) {
        console.error(`[${SOURCE_ID}] HTTP ${res.status}`);
        return [];
      }

      const body: unknown = await res.json();
      const books = (body as { results?: GutendexBook[] } | null)?.results;
      if (!Array.isArray(books)) {
        console.error(`[${SOURCE_ID}] unexpected payload shape`);
        return [];
      }

      return books
        .slice(0, 10)
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
// Resolve: a Gutenberg link someone already has -> the same SourceResult.
// ---------------------------------------------------------------------------

/**
 * Every Gutenberg URL carries the ebook number somewhere, and there are four
 * places it hides: /ebooks/1342, the download forms /ebooks/1342.html.images
 * and /files/1342/..., the /cache/epub/1342/... mirror, and gutendex's own
 * /books/1342.
 */
function identify(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  const after = (segment: string): string | null => {
    const at = parts.indexOf(segment);
    if (at === -1) return null;
    const id = (parts[at + 1] ?? "").match(/^\d+/)?.[0];
    return id || null;
  };

  if (host === "gutendex.com") return after("books");
  if (host !== "gutenberg.org") return null;

  return after("ebooks") ?? after("files") ?? after("epub");
}

/** gutendex takes a comma-separated id list, so this is one call for many. */
const IDS_PER_CALL = 50;

async function resolveChunk(
  keys: string[],
  signal?: AbortSignal,
): Promise<Record<string, ResolveOutcome>> {
  const params = new URLSearchParams({ ids: keys.join(",") });
  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal,
  });

  if (!res.ok) {
    console.error(`[${SOURCE_ID}] resolve HTTP ${res.status}`);
    // 403 here is the known Vercel block, not a missing book. Saying
    // "not found" would be a lie that reads as a licence answer.
    return fillMissing({}, keys, {
      status: "unreachable",
      detail: `HTTP ${res.status}`,
    });
  }

  const body: unknown = await res.json();
  const books = (body as { results?: GutendexBook[] } | null)?.results;
  if (!Array.isArray(books)) {
    return fillMissing({}, keys, {
      status: "unreachable",
      detail: "unexpected payload",
    });
  }

  const out: Record<string, ResolveOutcome> = {};
  for (const book of books) {
    const result = toResult(book);
    if (result) out[String(book.id)] = { status: "ok", result };
  }
  return fillMissing(out, keys, { status: "notfound" });
}

export const resolver: Resolver = {
  identify,
  async resolveBatch(keys, signal) {
    const out: Record<string, ResolveOutcome> = {};
    try {
      for (let i = 0; i < keys.length; i += IDS_PER_CALL) {
        const chunk = keys.slice(i, i + IDS_PER_CALL);
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
