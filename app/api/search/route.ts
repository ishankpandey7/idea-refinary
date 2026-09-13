import { NextResponse } from "next/server";
import { adaptersFor } from "@/lib/adapters/registry";
import { isDemo, isRecording, readFixture, writeFixture } from "@/lib/fixtures";
import type { Adapter, SourceResult } from "@/types/source-result";
import {
  dedupe,
  EMPTY_SEARCH,
  type SearchResponse,
  type SourceStat,
} from "@/lib/search-response";

const TIMEOUT_MS = 4000;

// No preferredRegion here, deliberately. It was set to "bom1" to try to dodge
// gutendex.com's 403, which it answers to Vercel and not to a residential IP.
// Two things came out of that, measured 2026-09-13, and both say leave it off:
// the export is ignored on the Hobby plan entirely (the response still came
// back `x-vercel-id: bom1::iad1::…` — edge in Mumbai, compute in Washington;
// the real knob is Project Settings -> Functions), and bom1 compute is worse
// for this app anyway, taking the three working sources from ~850ms to
// ~2059ms because the source APIs are farther away than the user is. Next 16
// has since deprecated the export, so it was only buying a build warning.

// Adapters accept an optional AbortSignal as a second argument; the frozen
// Adapter contract only declares the first, so narrow at the call site.
type SearchWithSignal = (
  query: string,
  signal?: AbortSignal,
) => Promise<SourceResult[]>;

function searchWithTimeout(
  adapter: Adapter,
  query: string,
): Promise<SourceResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => {
      reject(new Error(`timeout after ${TIMEOUT_MS}ms`));
    });
  });

  const run = (adapter.search as SearchWithSignal)(query, controller.signal);

  return Promise.race([run, aborted]).finally(() => clearTimeout(timer));
}

type Rows = { results: SourceResult[]; cached: boolean };

// DEMO short-circuits before any adapter runs, so no network is touched.
async function runAdapter(adapter: Adapter, query: string): Promise<Rows> {
  if (isDemo()) {
    return { results: await readFixture(adapter.id, query), cached: true };
  }

  const results = await searchWithTimeout(adapter, query);

  // An adapter that caught a failure returns [] exactly like a genuine zero,
  // so recording an empty result would let a source outage overwrite a good
  // fixture with []. Skip those: a genuine zero just becomes a fixture miss,
  // which replays as [] anyway.
  if (isRecording() && results.length > 0) {
    await writeFixture(adapter.id, query, results);
  }
  if (results.length > 0) return { results, cached: false };

  // Empty. Either a genuine zero or a source that failed and swallowed it,
  // which the adapter contract makes indistinguishable here. gutendex.com
  // refuses this host outright, so "writing" would otherwise always be
  // blank. If this query was recorded while the source was healthy, show
  // that — flagged as cached, never passed off as live.
  const saved = await readFixture(adapter.id, query);
  return saved.length > 0
    ? { results: saved, cached: true }
    : { results, cached: false };
}

type Run = { stat: SourceStat; results: SourceResult[] };

/**
 * Replaces the old Promise.allSettled pass. Same guarantee — this never
 * rejects — but it also records what each source actually returned, which
 * allSettled threw away.
 */
async function runTimed(adapter: Adapter, query: string): Promise<Run> {
  const demo = isDemo();
  const started = performance.now();
  const elapsed = () => (demo ? null : Math.round(performance.now() - started));

  try {
    const { results, cached } = await runAdapter(adapter, query);
    return {
      results,
      stat: {
        id: adapter.id,
        label: adapter.label,
        count: results.length,
        ms: cached ? null : elapsed(),
        failed: false,
        cached,
      },
    };
  } catch (reason) {
    console.error(`[${adapter.id}] ${String(reason)}`);
    return {
      results: [],
      stat: {
        id: adapter.id,
        label: adapter.label,
        count: 0,
        ms: elapsed(),
        failed: true,
        cached: false,
      },
    };
  }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim() ?? "";
  const category = params.get("category")?.trim() || null;

  if (!q) return NextResponse.json(EMPTY_SEARCH);

  const demo = isDemo();
  const selected = adaptersFor(category);
  const started = performance.now();

  const runs = await Promise.all(selected.map((a) => runTimed(a, q)));
  const fetched = runs.flatMap((r) => r.results);
  const { results, deduped } = dedupe(fetched);

  const body: SearchResponse = {
    results,
    sources: runs.map((r) => r.stat),
    fetched: fetched.length,
    deduped,
    totalMs: demo ? null : Math.round(performance.now() - started),
    demo,
  };
  return NextResponse.json(body);
}
