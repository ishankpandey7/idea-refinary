import { NextResponse } from "next/server";
import { adaptersFor } from "@/lib/adapters/registry";
import { isDemo, isRecording, readFixture, writeFixture } from "@/lib/fixtures";
import type { Adapter, SourceResult } from "@/types/source-result";

const TIMEOUT_MS = 4000;

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

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim() ?? "";
  const category = params.get("category")?.trim() || null;

  if (!q) return NextResponse.json([] as SourceResult[]);

  const selected = adaptersFor(category);
  const settled = await Promise.allSettled(
    selected.map((a) => runAdapter(a, q)),
  );

  const results: SourceResult[] = [];
  settled.forEach((outcome, i) => {
    if (outcome.status === "fulfilled") {
      results.push(...outcome.value);
    } else {
      console.error(`[${selected[i].id}] ${String(outcome.reason)}`);
    }
  });

  return NextResponse.json(results);
}
