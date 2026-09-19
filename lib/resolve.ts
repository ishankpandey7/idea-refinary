import type { SourceResult } from "@/types/source-result";
import { adapters, labelFor, resolvers } from "./adapters/registry";
import type { ResolveOutcome } from "./resolve-types";
import { MAX_LINKS, normaliseUrl, toUrl } from "./links";

/**
 * Turns a pile of pasted links into licence verdicts.
 *
 * The rule that shapes every message below: never imply a licence we did not
 * read. A link we cannot resolve is reported as unread, a source that did not
 * answer is reported as unanswered, and neither is ever softened into
 * something that looks like an answer. A wrong "clear" is the one failure
 * this product cannot survive.
 */

const TIMEOUT_MS = 8000;

export type CheckStatus =
  | "ok"
  | "unsupported"
  | "notfound"
  | "unreachable"
  | "invalid";

export type CheckItem = {
  /** Exactly what the person pasted, so they can find it in their own list. */
  input: string;
  sourceId: string | null;
  sourceLabel: string | null;
  status: CheckStatus;
  /** Plain-language explanation. Shown verbatim; safe to read as final. */
  reason: string;
  result: SourceResult | null;
};

export type CheckResponse = {
  items: CheckItem[];
  /** Links found in what was pasted, before the cap. */
  found: number;
  /** Links past MAX_LINKS that were dropped. */
  dropped: number;
  /** Links that pointed at something already in the list. */
  deduped: number;
  /** Licence deeds and the like — never material, so never a verdict. */
  ignored: number;
  ms: number | null;
};

export const EMPTY_CHECK: CheckResponse = {
  items: [],
  found: 0,
  dropped: 0,
  deduped: 0,
  ignored: 0,
  ms: null,
};

/**
 * A link back to Idea Craft itself.
 *
 * An exported credits file ends with the address that reopens the check —
 * that is how entries someone added by hand survive the trip, since they are
 * not links to anything a source could read. Paste that file back in and the
 * address is in it, so it gets skipped the same way a licence deed does:
 * correct to notice, useless to report.
 */
function isSelf(url: URL, host: string | null): boolean {
  if (!host) return false;
  const bare = (h: string) => h.toLowerCase().replace(/^www\./, "");
  return bare(url.host) === bare(host);
}

/**
 * A licence deed describes material; it is never the material. These turn up
 * constantly because Creative Commons attribution strings quote the deed URL,
 * so a re-check of an exported credits file would otherwise open with a row
 * saying we could not read creativecommons.org — true, useless, and alarming.
 */
function isDeed(url: URL): boolean {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "creativecommons.org") {
    return /^\/(licenses|publicdomain)\//.test(url.pathname);
  }
  return host === "spdx.org" || host === "rightsstatements.org";
}

// ---------------------------------------------------------------------------
// What to say when we cannot answer
// ---------------------------------------------------------------------------

const READS =
  "Idea Craft reads Wikimedia Commons, Openverse, OpenAlex (or any DOI) and Project Gutenberg";

/**
 * Host-specific notes, only where the note is true and useful. Everything
 * else gets the plain "we cannot read this" — a guess dressed up as a hint
 * would be the same mistake as a guessed licence.
 */
function unsupportedReason(url: URL): string {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  if (host.endsWith("wikipedia.org")) {
    return "That is a Wikipedia article, not a Commons file page. Open the image itself and paste the commons.wikimedia.org link from under it.";
  }
  if (host.endsWith("flickr.com")) {
    return `Flickr is not read directly, but Openverse indexes a lot of it — search the title there and you may find this exact photo with its licence attached. ${READS}.`;
  }
  if (
    host.endsWith("unsplash.com") ||
    host.endsWith("pexels.com") ||
    host.endsWith("pixabay.com")
  ) {
    return `${url.hostname} publishes its own terms rather than a standard licence, and Idea Craft does not read them. Open its licence page and check it yourself.`;
  }
  return `${READS}. We will not guess at ${url.hostname} — open the page and check its terms yourself.`;
}

function unreachableReason(sourceId: string, detail: string): string {
  const label = labelFor(sourceId);
  const timedOut = /abort|timeout|timed out/i.test(detail);

  if (sourceId === "gutendex") {
    if (detail.includes("403")) {
      return "Project Gutenberg's API refuses requests from this server, so this book is unchecked. That is a known block on the host, not a problem with your link — the same link works from a home connection.";
    }
    if (timedOut) {
      return `Project Gutenberg's API did not answer within ${TIMEOUT_MS / 1000} seconds, so this book is unchecked. Its first lookup for a given book is often slow; checking again usually works.`;
    }
  }

  if (timedOut) {
    return `${label} did not answer within ${TIMEOUT_MS / 1000} seconds, so this one is unchecked. Nothing about its licence is known from here — try again in a moment.`;
  }
  return `${label} did not answer (${detail}), so this one is unchecked. Nothing about its licence is known from here — try again in a moment.`;
}

// ---------------------------------------------------------------------------
// The pass itself
// ---------------------------------------------------------------------------

type Slot = {
  input: string;
  sourceId: string | null;
  key: string | null;
  status: CheckStatus;
  reason: string;
};

function claim(url: URL): { sourceId: string; key: string } | null {
  for (const adapter of adapters) {
    const key = resolvers[adapter.id]?.identify(url) ?? null;
    if (key) return { sourceId: adapter.id, key };
  }
  return null;
}

export async function checkLinks(
  rawInputs: string[],
  /** This deployment's own host, so a link home is not reported as a source. */
  selfHost: string | null = null,
): Promise<CheckResponse> {
  const started = performance.now();

  const seenInput = new Set<string>();
  const inputs = rawInputs
    .map((s) => s.trim())
    .filter((s) => {
      if (!s || seenInput.has(s)) return false;
      seenInput.add(s);
      return true;
    });

  const kept = inputs.slice(0, MAX_LINKS);
  const slots: Slot[] = [];
  const identities = new Set<string>();
  let deduped = 0;
  let ignored = 0;

  for (const input of kept) {
    const url = toUrl(input);
    if (!url) {
      slots.push({
        input,
        sourceId: null,
        key: null,
        status: "invalid",
        reason:
          "That is not a link. Paste the address of the page the material lives on.",
      });
      continue;
    }

    if (isDeed(url) || isSelf(url, selfHost)) {
      ignored += 1;
      continue;
    }

    const claimed = claim(url);
    if (!claimed) {
      slots.push({
        input,
        sourceId: null,
        key: null,
        status: "unsupported",
        reason: unsupportedReason(url),
      });
      continue;
    }

    // Two links to the same asset — a thumbnail and its file page, say — are
    // one asset, and one credit line.
    const identity = `${claimed.sourceId}:${claimed.key}`;
    if (identities.has(identity)) {
      deduped += 1;
      continue;
    }
    identities.add(identity);

    slots.push({
      input,
      sourceId: claimed.sourceId,
      key: claimed.key,
      status: "ok",
      reason: "",
    });
  }

  const bySource = new Map<string, string[]>();
  for (const slot of slots) {
    if (!slot.sourceId || !slot.key) continue;
    const keys = bySource.get(slot.sourceId) ?? [];
    keys.push(slot.key);
    bySource.set(slot.sourceId, keys);
  }

  const outcomes = new Map<string, ResolveOutcome>();

  await Promise.all(
    [...bySource].map(async ([sourceId, keys]) => {
      const resolver = resolvers[sourceId];

      /** Backstop for keys the resolver never answered for. */
      const fillGaps = (detail: string): void => {
        for (const key of keys) {
          const at = `${sourceId}:${key}`;
          if (!outcomes.has(at)) {
            outcomes.set(at, { status: "unreachable", detail });
          }
        }
      };

      if (!resolver) return fillGaps("no resolver");

      // One controller and one timer per source, not one for all four.
      // Shared, the first source to burn the budget aborted the other three
      // mid-flight and every one of them reported "did not answer within 8
      // seconds" — and gutendex, which resolves its keys sequentially and is
      // documented above as 10-15s cold, burns it routinely. The timeout is
      // meant to bound one slow source, not to let it take the others down.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const answered = await resolver.resolveBatch(keys, controller.signal);
        for (const key of keys) {
          const outcome = answered[key];
          if (outcome) outcomes.set(`${sourceId}:${key}`, outcome);
        }
        fillGaps("no answer");
      } catch (err) {
        // Resolvers catch their own failures, so this is the timeout path.
        console.error(`[${sourceId}] resolve batch ${String(err)}`);
        fillGaps(err instanceof Error ? err.message : String(err));
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  const items: CheckItem[] = slots.map((slot) => {
    const sourceLabel = slot.sourceId ? labelFor(slot.sourceId) : null;

    if (!slot.sourceId || !slot.key) {
      return {
        input: slot.input,
        sourceId: slot.sourceId,
        sourceLabel,
        status: slot.status,
        reason: slot.reason,
        result: null,
      };
    }

    const outcome = outcomes.get(`${slot.sourceId}:${slot.key}`);
    const base = {
      input: slot.input,
      sourceId: slot.sourceId,
      sourceLabel,
    };

    if (outcome?.status === "ok") {
      return {
        ...base,
        status: "ok" as const,
        reason: "",
        result: outcome.result,
      };
    }
    if (outcome?.status === "unreachable") {
      return {
        ...base,
        status: "unreachable" as const,
        reason: unreachableReason(slot.sourceId, outcome.detail),
        result: null,
      };
    }
    return {
      ...base,
      status: "notfound" as const,
      reason: `${sourceLabel} has no record at that address. Check the link, or open it to see whether the page still exists.`,
      result: null,
    };
  });

  // An Openverse row credits its foreign landing page (Flickr, and others),
  // which nothing here can read — so an exported credits file names the same
  // asset twice, once readably and once not. Both lines are correct and only
  // one is a result, so the unreadable twin is a duplicate, not a failure.
  // Matched on the resolved canonicalUrl, so this is an identity, not a guess.
  const resolved = new Set(
    items
      .filter((i) => i.status === "ok" && i.result)
      .map((i) => normaliseUrl((i.result as SourceResult).canonicalUrl)),
  );

  const visible = items.filter((i) => {
    if (i.status === "ok") return true;
    if (!resolved.has(normaliseUrl(i.input))) return true;
    deduped += 1;
    return false;
  });

  return {
    items: visible,
    found: inputs.length,
    dropped: Math.max(0, inputs.length - kept.length),
    deduped,
    ignored,
    ms: Math.round(performance.now() - started),
  };
}
