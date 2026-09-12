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

// gutendex.com answers 403 to Vercel's default region and 200 from a
// residential IP, header-independent — so the block is on the IP range.
// Moving just this route is the cheap test: everything else in the app
// stays where it was.
export const preferredRegion = "bom1";


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

// DEMO short-circuits before any adapter runs, so no network is touched.
async function runAdapter(
  adapter: Adapter,
  query: string,
): Promise<SourceResult[]> {
  if (isDemo()) return readFixture(adapter.id, query);

  const results = await searchWithTimeout(adapter, query);

  // An adapter that caught a failure returns [] exactly like a genuine zero,
  // so recording an empty result would let a source outage overwrite a good
  // fixture with []. Skip those: a genuine zero just becomes a fixture miss,
  // which replays as [] anyway.
  if (isRecording() && results.length > 0) {
    await writeFixture(adapter.id, query, results);
  }
  return results;
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
    const results = await runAdapter(adapter, query);
    return {
      results,
      stat: {
        id: adapter.id,
        label: adapter.label,
        count: results.length,
        ms: elapsed(),
        failed: false,
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
