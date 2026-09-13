import type { Adapter } from "@/types/source-result";
import type { Resolver } from "@/lib/resolve-types";
import { adapter as openalex, resolver as openalexResolver } from "./openalex";
import { adapter as openverse, resolver as openverseResolver } from "./openverse";
import { adapter as gutendex, resolver as gutendexResolver } from "./gutendex";
import { adapter as wikimedia, resolver as wikimediaResolver } from "./wikimedia";

export const adapters: Adapter[] = [openalex, openverse, gutendex, wikimedia];

/**
 * The same four sources, asked the other question: not "what matches this
 * query" but "what is this link". Keyed by adapter id so the two halves can
 * never drift apart — a source with no resolver simply has no entry, and
 * links to it come back as unrecognised rather than guessed at.
 */
export const resolvers: Record<string, Resolver> = {
  [openalex.id]: openalexResolver,
  [openverse.id]: openverseResolver,
  [gutendex.id]: gutendexResolver,
  [wikimedia.id]: wikimediaResolver,
};

export function labelFor(sourceId: string): string {
  return adapters.find((a) => a.id === sourceId)?.label ?? sourceId;
}

export type Category = Adapter["categories"][number];

export function adaptersFor(category: string | null): Adapter[] {
  if (!category) return adapters;
  return adapters.filter((a) =>
    (a.categories as readonly string[]).includes(category),
  );
}
