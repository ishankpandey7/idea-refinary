"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { SourceResult } from "@/types/source-result";
import type { SearchResponse, SourceStat } from "@/lib/search-response";
import ResultCard from "../_components/ResultCard";
import {
  listIdeas,
  resultKey,
  saveResult,
  savedKeysFor,
  type Idea,
} from "../_lib/ideas-db";
import { useAuth } from "../_components/AuthProvider";
import CompliancePanel from "../_components/CompliancePanel";
import UsageQuestions from "../_components/UsageQuestions";
import { verdictForResult } from "@/lib/asserted";
import { useUsage } from "../_lib/usage";
import { tally } from "@/lib/credits";
import {
  keysFor,
  saveResult as saveLocal,
  useLocalIdeas,
} from "../_lib/ideas";
import { addToCheck, inCheck, useCheckPaste } from "../_lib/check-paste";
import { extractLinks } from "@/lib/links";

const CATEGORIES = [
  { id: "", label: "All" },
  { id: "research", label: "Research" },
  { id: "art", label: "Art" },
  { id: "writing", label: "Writing" },
] as const;

const LAST_SEARCH = "idea-refinery:last-search";

const EXAMPLE_QUERY = "a cancer awareness campaign for my campus";

/** Everything the envelope carries except the rows themselves. */
type SearchMeta = Omit<SearchResponse, "results">;

function duration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Client-only — it reads Date.now(), and the list arrives after mount. */
function ago(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;

  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;

  return new Date(then).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Suspense, because useSearchParams below needs one. See the checker. */
export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <Home />
    </Suspense>
  );
}

/** An explicit URL wins; otherwise this tab picks up where it left off. */
function opening(params: URLSearchParams): { q: string; cat: string } {
  const q = params.get("q")?.trim() ?? "";
  if (q) return { q, cat: params.get("category")?.trim() ?? "" };

  try {
    const raw = window.sessionStorage.getItem(LAST_SEARCH);
    const saved = raw ? (JSON.parse(raw) as { q?: string; cat?: string }) : null;
    return { q: saved?.q?.trim() ?? "", cat: saved?.cat?.trim() ?? "" };
  } catch {
    return { q: "", cat: "" };
  }
}

function Home() {
  const params = useSearchParams();
  // Only ever the opening value — the boundary above means this component's
  // first render is on the client, so there is no server HTML to disagree with.
  const start = useMemo(() => opening(params), [params]);

  const [query, setQuery] = useState(start.q);
  const [category, setCategory] = useState<string>(start.cat);
  const [results, setResults] = useState<SourceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // The query that was actually searched — this is the current project.
  const [currentIdea, setCurrentIdea] = useState("");
  const [dbKeys, setDbKeys] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Idea[]>([]);
  const [meta, setMeta] = useState<SearchMeta | null>(null);

  // The licence check is the reason to be here, so it must work before you
  // have an account. Signed out, picks and this preference live in
  // localStorage — and migrate-local lifts them into Postgres on first
  // sign-in, so nothing picked now is lost later.
  const [usage, changeUsage] = useUsage();

  const { user } = useAuth();

  const localIdeas = useLocalIdeas();

  // Signed out the picks are already in the store; signed in it is a query,
  // settled in a callback so nothing is set synchronously in the effect.
  useEffect(() => {
    if (!user || !currentIdea) return;
    let active = true;

    void savedKeysFor(currentIdea).then((keys) => {
      if (active) setDbKeys(keys);
    });

    return () => {
      active = false;
    };
  }, [user, currentIdea]);

  const savedKeys = user ? dbKeys : keysFor(localIdeas, currentIdea);

  // The check being built on `/`. Subscribed rather than read once, so a card
  // flips to "In your check" the moment it is added, and the count in the bar
  // moves with it.
  const [checkPaste] = useCheckPaste();
  const checkCount = useMemo(
    () => extractLinks(checkPaste).length,
    [checkPaste],
  );

  // RLS already scopes this to projects you are a member of, so shared ones
  // show up too.
  useEffect(() => {
    if (!user) return;
    let active = true;
    void listIdeas().then((all) => {
      if (active) setRecent(all.slice(0, 2));
    });
    return () => {
      active = false;
    };
  }, [user]);

  /** The network half, with no state in it, so both callers can share it. */
  const fetchSearch = useCallback(async (q: string, cat: string) => {
    const url = `/api/search?q=${encodeURIComponent(q)}${
      cat ? `&category=${encodeURIComponent(cat)}` : ""
    }`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as SearchResponse;
  }, []);

  const apply = useCallback(
    (body: SearchResponse | null, q: string, cat: string) => {
      setResults(body?.results ?? []);
      setMeta(
        body
          ? {
              sources: body.sources ?? [],
              fetched: body.fetched ?? 0,
              deduped: body.deduped ?? 0,
              totalMs: body.totalMs ?? null,
              demo: body.demo ?? false,
            }
          : null,
      );
      setCurrentIdea(q);
      setSearched(true);

      // This page is a client component, so its state is thrown away on
      // unmount. The URL makes a search shareable and survives reload; the
      // session copy also covers the header's "Search" link, which points at
      // a bare "/search" and so carries no query of its own.
      const qs = new URLSearchParams({ q });
      if (cat) qs.set("category", cat);
      window.history.replaceState(null, "", `/search?${qs.toString()}`);
      try {
        window.sessionStorage.setItem(LAST_SEARCH, JSON.stringify({ q, cat }));
      } catch {
        // Storage blocked — the URL still covers reload and back/forward.
      }
    },
    [],
  );

  async function runSearchFor(term: string, cat: string) {
    const q = term.trim();
    if (!q) return;
    setLoading(true);
    try {
      apply(await fetchSearch(q, cat), q, cat);
    } catch {
      apply(null, q, cat);
    } finally {
      setLoading(false);
    }
  }

  // The opening search, settled in a callback so nothing is set synchronously
  // here. `start` only ever changes when the URL does.
  useEffect(() => {
    if (!start.q) return;
    let active = true;

    void fetchSearch(start.q, start.cat).then(
      (body) => {
        if (active) apply(body, start.q, start.cat);
      },
      () => {
        if (active) apply(null, start.q, start.cat);
      },
    );

    return () => {
      active = false;
    };
  }, [start, fetchSearch, apply]);

  const busy = loading || (Boolean(start.q) && !searched);

  function runSearch(nextCategory = category) {
    void runSearchFor(query, nextCategory);
  }

  function pickCategory(id: string) {
    setCategory(id);
    if (searched) runSearch(id);
  }

  // Picked items come from whichever store the Save button writes to.
  const picked = user
    ? results.filter((r) => savedKeys.has(resultKey(r)))
    : (localIdeas.find((i) => i.query === currentIdea)?.results ?? []);

  const counts = searched && results.length > 0 ? tally(results, usage) : null;

  const cachedLabels = (meta?.sources ?? [])
    .filter((s) => s.cached && s.count > 0)
    .map((s) => s.label);

  async function onSave(r: SourceResult) {
    if (!user) {
      // The store notifies, so every count on the page redraws with it.
      saveLocal(currentIdea, r);
      setSaveError(null);
      return;
    }
    const outcome = await saveResult(currentIdea, r);
    // A save that fails silently is indistinguishable from one that worked
    // until you go looking in the database, so say so here.
    setSaveError(outcome.ok ? null : (outcome.error ?? "Save failed"));
    setDbKeys(await savedKeysFor(currentIdea));
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 pb-24 pt-16 sm:px-10">
      <h1 className="text-center font-serif text-5xl leading-[1.1] text-ink sm:text-6xl">
        Find material
        <br />
        you can use.
      </h1>

      <p className="mx-auto mt-6 max-w-xl text-center text-[15px] leading-relaxed text-body">
        Four open archives, one query. Every result arrives with its licence
        already judged against what you are doing &mdash; so you can tell
        before you use it, not after you ship.
      </p>

      <form
        className="mx-auto mt-10 max-w-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
      >
        {/* Stacked on a phone: the button inside the pill leaves the input
            too narrow to read what you typed. Nested again from sm up. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-0 sm:rounded-full sm:border sm:border-line sm:bg-raised sm:py-2 sm:pl-6 sm:pr-2 sm:focus-within:border-accent/70">
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full border border-line bg-raised px-6 py-3 focus-within:border-accent/70 sm:border-0 sm:bg-transparent sm:p-0 sm:focus-within:border-0">
            <span aria-hidden className="text-accent">
              &#8981;
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Describe your idea — e.g. a cancer awareness campaign"
              className="w-full min-w-0 bg-transparent text-[15px] text-ink placeholder:text-faint focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full shrink-0 rounded-full bg-brand px-7 py-3 text-[14px] font-medium text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {busy ? "Searching…" : "Refine →"}
          </button>
        </div>
      </form>

      <p className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[12px] text-muted">
        Try an example:
        <button
          type="button"
          onClick={() => {
            setQuery(EXAMPLE_QUERY);
            void runSearchFor(EXAMPLE_QUERY, category);
          }}
          className="rounded-full border border-line bg-raised px-4 py-1.5 text-[12px] text-body transition hover:border-accent hover:text-accent"
        >
          {EXAMPLE_QUERY} &#8599;
        </button>
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
        {CATEGORIES.map((c) => (
          <button
            key={c.id || "all"}
            type="button"
            onClick={() => pickCategory(c.id)}
            className={`rounded-full border px-5 py-2 text-[13px] transition ${
              category === c.id
                ? "border-ink bg-ink text-page"
                : "border-line text-body hover:border-ink"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* The way back. Search is not a destination — you came here because
          something in your project could not be used, and the replacement is
          no use sitting on this page. */}
      {checkCount > 0 ? (
        <p className="mt-8 flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-line bg-surface px-6 py-3 text-[12px] text-body">
          <span>
            {checkCount} {checkCount === 1 ? "link" : "links"} in your check.
            Add anything below to it.
          </span>
          <Link
            href="/"
            className="rounded-full border border-line px-5 py-1.5 text-[12px] text-body transition hover:border-accent hover:text-accent"
          >
            Back to the check &rarr;
          </Link>
        </p>
      ) : null}

      {searched ? (
        <div className="mt-14 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            {results.length} result{results.length === 1 ? "" : "s"}
          </p>
          {currentIdea && user ? (
            <p className="mt-2 text-[13px] text-muted">
              Saving to project{" "}
              <span className="text-body">
                &ldquo;{currentIdea}&rdquo;
              </span>
              {savedKeys.size > 0 ? (
                <>
                  {" · "}
                  <Link
                    href="/my-ideas"
                    className="text-accent underline-offset-2 hover:underline"
                  >
                    {savedKeys.size} saved
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}

          {meta && meta.sources.length > 0 ? (
            <div className="mx-auto mt-5 flex max-w-3xl flex-wrap items-center justify-center gap-x-5 gap-y-2">
              {meta.sources.map((s: SourceStat) => (
                <span
                  key={s.id}
                  className="flex items-center gap-2 text-[12px] text-muted"
                  title={s.failed ? "This source did not answer" : undefined}
                >
                  <span
                    aria-hidden
                    className={`size-1.5 rounded-full ${
                      s.failed ? "bg-line-strong" : "bg-brand"
                    }`}
                  />
                  {s.label} {s.failed ? "unavailable" : plural(s.count, "result")}
                  {s.cached ? (
                    <span className="font-medium text-accent">(cached)</span>
                  ) : s.ms !== null ? (
                    <span className="text-faint">({duration(s.ms)})</span>
                  ) : null}
                </span>
              ))}
            </div>
          ) : null}

          {meta ? (
            <p className="mt-3 text-[12px] text-faint">
              {meta.fetched} fetched
              {meta.deduped > 0
                ? ` · ${plural(meta.deduped, "duplicate")} collapsed`
                : ""}
              {meta.totalMs !== null ? ` · ${duration(meta.totalMs)} total` : ""}
              {meta.demo ? " · replayed from fixtures" : ""}
            </p>
          ) : null}

          {!meta?.demo && cachedLabels.length > 0 ? (
            <p className="mx-auto mt-2 max-w-xl text-[12px] leading-relaxed text-accent">
              {cachedLabels.join(" and ")}{" "}
              {cachedLabels.length === 1 ? "is" : "are"} unreachable from this
              host right now, so those rows are a saved copy from an earlier
              search &mdash; not live results.
            </p>
          ) : null}
        </div>
      ) : null}

      {counts ? (
        <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-line bg-surface p-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
            Licence check &mdash; all results
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-body">
            Say what you are doing with this material and every result below is
            judged against its licence. No account needed.
          </p>

          <div className="mt-5">
            <UsageQuestions usage={usage} onChange={changeUsage} />
          </div>

          <p className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            <span className="text-ok-fg">{counts.clear} clear</span>
            <span className="text-warn-fg">
              {counts.caution} with conditions
            </span>
            <span className="text-warn-fg">{counts.verify} to check</span>
            <span className={counts.blocked > 0 ? "text-stop-fg" : "text-faint"}>
              {counts.blocked} not usable
            </span>
          </p>
        </div>
      ) : null}

      {picked.length > 0 ? (
        <div className="mx-auto max-w-3xl">
          <CompliancePanel
            title={currentIdea}
            results={picked}
            usage={usage}
            onUsageChange={changeUsage}
            hideUsage
            heading="Credits — what you kept"
          />
        </div>
      ) : null}

      {saveError ? (
        <p className="mx-auto mt-6 max-w-xl rounded-2xl border border-accent/40 bg-brand/10 px-6 py-3 text-center text-[13px] text-accent">
          Could not save: {saveError}
        </p>
      ) : null}

      {searched && !busy && results.length === 0 ? (
        <p className="mt-6 text-center text-[15px] text-muted">
          Nothing came back. Try another query.
        </p>
      ) : null}

      <ul className="mt-8 grid gap-5 sm:grid-cols-2">
        {results.map((r) => {
          const saved = savedKeys.has(resultKey(r));
          const added = inCheck(checkPaste, r);
          return (
            <ResultCard
              key={resultKey(r)}
              result={r}
              verdict={verdictForResult(r, usage)}
              action={
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => addToCheck(r)}
                    disabled={added}
                    className={`rounded-full border px-4 py-1.5 text-[11px] font-medium transition ${
                      added
                        ? "cursor-default border-accent/40 bg-brand/10 text-accent"
                        : "border-line-strong bg-raised text-body hover:border-accent hover:text-accent"
                    }`}
                  >
                    {added ? "In your check" : "Add to check"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSave(r)}
                    disabled={saved}
                    className={`rounded-full border px-4 py-1.5 text-[11px] font-medium transition ${
                      saved
                        ? "cursor-default border-accent/40 bg-brand/10 text-accent"
                        : "border-line text-muted hover:border-accent hover:text-accent"
                    }`}
                  >
                    {saved ? "Kept" : "Keep"}
                  </button>
                </div>
              }
            />
          );
        })}
      </ul>

      {searched ? null : (
        <section className="mt-20">
          <div className="rounded-2xl border border-line bg-surface p-8 text-center">
            <h2 className="font-serif text-2xl text-ink">
              Already have the material?
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-[13px] leading-relaxed text-body">
              Search is for finding things you do not have yet. If you already
              know what you are using, paste the links instead and skip
              straight to the verdicts.
            </p>
            <Link
              href="/"
              className="mt-6 inline-block rounded-full border border-line-strong px-7 py-3 text-[13px] font-medium text-body transition hover:border-accent hover:text-accent"
            >
              Check what you have &rarr;
            </Link>
          </div>

          {recent.length > 0 ? (
            <div className="mt-16">
              <div className="flex items-end justify-between gap-4">
                <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.16em] text-accent">
                  <span aria-hidden>&#128193;</span> Recent projects
                </h2>
                <Link
                  href="/my-ideas"
                  className="text-[12px] text-muted underline-offset-2 transition hover:text-accent hover:underline"
                >
                  View all history
                </Link>
              </div>

              <ul className="mt-6 grid gap-5 sm:grid-cols-2">
                {recent.map((idea) => (
                  <li
                    key={idea.id}
                    className="flex flex-col rounded-2xl border border-line bg-surface p-6"
                  >
                    <span className="self-start rounded-full bg-brand/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                      {idea.results.length} source
                      {idea.results.length === 1 ? "" : "s"} saved
                    </span>

                    <p className="mt-4 font-serif text-lg leading-snug text-ink">
                      &ldquo;{idea.query}&rdquo;
                    </p>

                    <div className="mt-6 flex items-center gap-3 border-t border-line pt-4">
                      <span className="text-[12px] text-muted">
                        Saved {ago(idea.savedAt)}
                      </span>
                      <Link
                        href={`/my-ideas?idea=${encodeURIComponent(idea.id)}`}
                        className="ml-auto text-[12px] font-medium text-accent underline-offset-2 hover:underline"
                      >
                        Open project &rarr;
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      )}
    </main>
  );
}
