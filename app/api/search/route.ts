import { NextResponse } from "next/server";
import { adaptersFor } from "@/lib/adapters/registry";
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

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim() ?? "";
  const category = params.get("category")?.trim() || null;

  if (!q) return NextResponse.json([] as SourceResult[]);

  const selected = adaptersFor(category);
  const settled = await Promise.allSettled(
    selected.map((a) => searchWithTimeout(a, q)),
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
