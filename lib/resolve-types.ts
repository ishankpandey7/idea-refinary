import type { SourceResult } from "@/types/source-result";

/**
 * The other half of the adapter contract: turn a link someone already has
 * into the same normalised SourceResult that search returns.
 *
 * Search answers "what is out there". This answers "what is this thing I am
 * already using", which is the question a person with a half-finished project
 * actually has. Same four sources, same licence mapping — a resolver that
 * guessed a licence from a URL would be worse than saying nothing, so an
 * unrecognised link is reported as unrecognised and never inferred.
 */
export type ResolveOutcome =
  | { status: "ok"; result: SourceResult }
  /** The source answered, and has no record at that address. */
  | { status: "notfound" }
  /** The source did not answer. Never conflate this with "does not exist". */
  | { status: "unreachable"; detail: string };

export type Resolver = {
  /**
   * Does this source own the link? Returns the lookup key — a Commons file
   * name, an Openverse uuid, an OpenAlex work id, a Gutenberg ebook number —
   * or null when the link belongs to someone else.
   *
   * Must be cheap and must not touch the network.
   */
  identify: (url: URL) => string | null;

  /**
   * Resolves every key in one go. Batched on purpose: a pasted asset list is
   * mostly one source, and four API calls beat forty.
   *
   * Never throws. Every key passed in comes back with an outcome.
   */
  resolveBatch: (
    keys: string[],
    signal?: AbortSignal,
  ) => Promise<Record<string, ResolveOutcome>>;
};

/** Fills in the keys a batch never answered for — used by every resolver. */
export function fillMissing(
  out: Record<string, ResolveOutcome>,
  keys: string[],
  fallback: ResolveOutcome,
): Record<string, ResolveOutcome> {
  for (const key of keys) if (!out[key]) out[key] = fallback;
  return out;
}

/** Runs `fn` over `items` with at most `limit` in flight. Order is preserved. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });

  await Promise.all(workers);
  return out;
}
