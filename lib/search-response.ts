import type { SourceResult } from "@/types/source-result";

/**
 * The envelope /api/search returns. It wraps SourceResult rather than adding
 * to it, so types/source-result.ts stays frozen.
 */
export type SourceStat = {
  id: string;
  label: string;
  count: number;
  /** null when the rows came off disk, so a duration would be a lie. */
  ms: number | null;
  failed: boolean;
  /** Rows came from a recorded fixture, not a live call. Must be shown. */
  cached: boolean;
};

export type SearchResponse = {
  results: SourceResult[];
  sources: SourceStat[];
  /** Rows the adapters returned, before dedupe. */
  fetched: number;
  deduped: number;
  totalMs: number | null;
  demo: boolean;
};

export const EMPTY_SEARCH: SearchResponse = {
  results: [],
  sources: [],
  fetched: 0,
  deduped: 0,
  totalMs: null,
  demo: false,
};

function normUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    return `${host}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

function normText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Two rules, both deliberately narrow — a wrong collapse silently hides a
 * real result, which is worse than showing a near-duplicate.
 *
 * 1. Same canonical URL. That is the same page whoever returned it.
 * 2. Same title + first author + media type, but from a *different* source.
 *    Openverse indexes Wikimedia Commons, so the overlap is real. The
 *    cross-source condition matters: within one source the same title is
 *    routinely several distinct works — Openverse will return a dozen
 *    different photos all called "Billy Ocean".
 *
 * First occurrence wins, so registry order decides which source is kept.
 */
export function dedupe(rows: SourceResult[]): {
  results: SourceResult[];
  deduped: number;
} {
  const seenUrl = new Set<string>();
  const workSource = new Map<string, string>();
  const results: SourceResult[] = [];

  for (const row of rows) {
    const urlKey = normUrl(row.canonicalUrl);
    if (urlKey && seenUrl.has(urlKey)) continue;

    const title = normText(row.title);
    const workKey = title
      ? `${row.mediaType}|${title}|${normText(row.authors[0] ?? "")}`
      : null;

    // An untitled row has nothing to match on, so rule 2 sits it out.
    if (workKey) {
      const from = workSource.get(workKey);
      if (from && from !== row.sourceId) continue;
      workSource.set(workKey, row.sourceId);
    }

    if (urlKey) seenUrl.add(urlKey);
    results.push(row);
  }

  return { results, deduped: rows.length - results.length };
}
