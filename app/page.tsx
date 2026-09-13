"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { SourceResult } from "@/types/source-result";
import type { SearchResponse, SourceStat } from "@/lib/search-response";
import ResultCard from "./_components/ResultCard";
import {
  listIdeas,
  resultKey,
  saveResult,
  savedKeysFor,
  type Idea,
} from "./_lib/ideas-db";
import { useAuth } from "./_components/AuthProvider";
import CompliancePanel from "./_components/CompliancePanel";
import { verdictFor, type Usage } from "@/lib/licence-rules";
import { tally } from "@/lib/credits";
import {
  readIdeas,
  saveResult as saveLocal,
  savedKeysFor as savedKeysLocal,
} from "./_lib/ideas";

const CATEGORIES = [
  { id: "", label: "All" },
  { id: "research", label: "Research" },
  { id: "art", label: "Art" },
  { id: "writing", label: "Writing" },
] as const;

const LAST_SEARCH = "idea-refinery:last-search";

/**
 * The cards under the hero, copied from the home mockup: icon, title, blurb —
 * no meta blocks, those belong to the angle-selection screen this app has no
 * route for. The mockup's fourth slot is POLICY, a source type with no
 * adapter, so it shows Collaborator instead.
 */
const ANGLES = [
  {
    glyph: "✦",
    title: "Research",
    blurb:
      "Papers, datasets and academic citations mapped directly to your central topic.",
    href: null,
    cta: null,
  },
  {
    glyph: "◈",
    title: "Art & creativity",
    blurb:
      "Public domain images, illustrations and open-licence media assets with source tracking.",
    href: null,
    cta: null,
  },
  {
    glyph: "✎",
    title: "Writing",
    blurb:
      "Contextual essays, primary source text blocks and public-domain language resources.",
    href: null,
    cta: null,
  },
  {
    glyph: "✉",
    title: "Collaborator",
    blurb:
      "Invite someone by email to an idea. Everyone on it can search, pin and remove sources.",
    href: "/my-ideas",
    cta: "Invite from My Ideas",
  },
] as const;

const EXAMPLE_QUERY = "a cancer awareness campaign for my campus";
const USAGE_KEY = "idea-refinery:usage";

function readUsage(): Usage {
  if (typeof window === "undefined") return { commercial: false, modify: false };
  try {
    const raw = window.localStorage.getItem(USAGE_KEY);
    if (!raw) return { commercial: false, modify: false };
    const parsed = JSON.parse(raw) as Partial<Usage>;
    return {
      commercial: parsed.commercial === true,
      modify: parsed.modify === true,
    };
  } catch {
    return { commercial: false, modify: false };
  }
}

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

export default function Home() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("");
  const [results, setResults] = useState<SourceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // The query that was actually searched — this is the current idea.
  const [currentIdea, setCurrentIdea] = useState("");
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Idea[]>([]);
  const [meta, setMeta] = useState<SearchMeta | null>(null);

  // The licence check is the reason to be here, so it must work before you
  // have an account. Signed out, picks and this preference live in
  // localStorage — and migrate-local lifts them into Postgres on first
  // sign-in, so nothing picked now is lost later.
  const [usage, setUsage] = useState<Usage>({
    commercial: false,
    modify: false,
  });

  const { user } = useAuth();

  useEffect(() => {
    setUsage(readUsage());
  }, []);

  function changeUsage(next: Usage) {
    setUsage(next);
    try {
      window.localStorage.setItem(USAGE_KEY, JSON.stringify(next));
    } catch {
      // Not persisted; the toggles still work for this visit.
    }
  }

  const refreshSaved = useCallback(
    async (idea: string) => {
      setSavedKeys(user ? await savedKeysFor(idea) : savedKeysLocal(idea));
    },
    [user],
  );

  useEffect(() => {
    if (currentIdea) void refreshSaved(currentIdea);
  }, [currentIdea, refreshSaved]);

  // RLS already scopes this to ideas you are a member of, so the home page
  // shows shared ones too.
  useEffect(() => {
    if (!user) {
      setRecent([]);
      return;
    }
    let active = true;
    void listIdeas().then((all) => {
      if (active) setRecent(all.slice(0, 2));
    });
    return () => {
      active = false;
    };
  }, [user]);

  const runSearchFor = useCallback(async (term: string, cat: string) => {
    const q = term.trim();
    if (!q) return;
    setLoading(true);
    try {
      const url = `/api/search?q=${encodeURIComponent(q)}${
        cat ? `&category=${encodeURIComponent(cat)}` : ""
      }`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const body = (await res.json()) as SearchResponse;
      setResults(body.results ?? []);
      setMeta({
        sources: body.sources ?? [],
        fetched: body.fetched ?? 0,
        deduped: body.deduped ?? 0,
        totalMs: body.totalMs ?? null,
        demo: body.demo ?? false,
      });
    } catch {
      setResults([]);
      setMeta(null);
    } finally {
      setCurrentIdea(q);
      setLoading(false);
      setSearched(true);

      // This page is a client component, so its state is thrown away on
      // unmount. The URL makes a search shareable and survives reload; the
      // session copy also covers the header's "Search" link, which points at
      // a bare "/" and so carries no query of its own.
      const qs = new URLSearchParams({ q });
      if (cat) qs.set("category", cat);
      window.history.replaceState(null, "", `/?${qs.toString()}`);
      try {
        window.sessionStorage.setItem(LAST_SEARCH, JSON.stringify({ q, cat }));
      } catch {
        // Storage blocked — the URL still covers reload and back/forward.
      }
    }
  }, []);

  // Restore once on mount: an explicit URL wins, otherwise this tab's last
  // search.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let q = params.get("q")?.trim() ?? "";
    let cat = params.get("category")?.trim() ?? "";

    if (!q) {
      try {
        const raw = window.sessionStorage.getItem(LAST_SEARCH);
        if (raw) {
          const saved = JSON.parse(raw) as { q?: string; cat?: string };
          q = saved.q?.trim() ?? "";
          cat = saved.cat?.trim() ?? "";
        }
      } catch {
        q = "";
      }
    }

    if (!q) return;
    setQuery(q);
    setCategory(cat);
    void runSearchFor(q, cat);
  }, [runSearchFor]);

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
    : (readIdeas().find((i) => i.query === currentIdea)?.results ?? []);

  const counts = searched && results.length > 0 ? tally(results, usage) : null;

  const cachedLabels = (meta?.sources ?? [])
    .filter((s) => s.cached && s.count > 0)
    .map((s) => s.label);

  async function onSave(r: SourceResult) {
    if (!user) {
      saveLocal(currentIdea, r);
      setSaveError(null);
      await refreshSaved(currentIdea);
      return;
    }
    const outcome = await saveResult(currentIdea, r);
    // A save that fails silently is indistinguishable from one that worked
    // until you go looking in the database, so say so here.
    setSaveError(outcome.ok ? null : (outcome.error ?? "Save failed"));
    await refreshSaved(currentIdea);
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 pb-24 pt-16 sm:px-10">
      <h1 className="text-center font-serif text-5xl leading-[1.1] text-ink sm:text-6xl">
        One idea in.
        <br />
        Open-licence sources out.
      </h1>

      <p className="mx-auto mt-6 max-w-xl text-center text-[15px] leading-relaxed text-body">
        Describe what you&rsquo;re trying to make. Idea Craft finds the
        research, visuals and language behind it &mdash; with reuse rights
        attached.
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
            disabled={loading}
            className="w-full shrink-0 rounded-full bg-brand px-7 py-3 text-[14px] font-medium text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {loading ? "Searching…" : "Refine →"}
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

      {searched ? (
        <div className="mt-14 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            {results.length} result{results.length === 1 ? "" : "s"}
          </p>
          {currentIdea && user ? (
            <p className="mt-2 text-[13px] text-muted">
              Saving to idea{" "}
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
            Licence check
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-body">
            Say what you are doing with this material and every result below is
            judged against its licence. No account needed.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={usage.commercial}
              onClick={() =>
                changeUsage({ ...usage, commercial: !usage.commercial })
              }
              className={`rounded-full border px-5 py-2 text-[13px] transition ${
                usage.commercial
                  ? "border-ink bg-ink text-page"
                  : "border-line text-body hover:border-ink"
              }`}
            >
              {usage.commercial ? "✓ " : ""}Commercial project
            </button>
            <button
              type="button"
              aria-pressed={usage.modify}
              onClick={() => changeUsage({ ...usage, modify: !usage.modify })}
              className={`rounded-full border px-5 py-2 text-[13px] transition ${
                usage.modify
                  ? "border-ink bg-ink text-page"
                  : "border-line text-body hover:border-ink"
              }`}
            >
              {usage.modify ? "✓ " : ""}I will edit or adapt it
            </button>
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
          />
        </div>
      ) : null}

      {saveError ? (
        <p className="mx-auto mt-6 max-w-xl rounded-2xl border border-accent/40 bg-brand/10 px-6 py-3 text-center text-[13px] text-accent">
          Could not save: {saveError}
        </p>
      ) : null}

      {searched && !loading && results.length === 0 ? (
        <p className="mt-6 text-center text-[15px] text-muted">
          Nothing came back. Try another query.
        </p>
      ) : null}

      <ul className="mt-8 grid gap-5 sm:grid-cols-2">
        {results.map((r) => {
          const saved = savedKeys.has(resultKey(r));
          return (
            <ResultCard
              key={resultKey(r)}
              result={r}
              verdict={verdictFor(r.licence.spdx, usage)}
              action={
                <button
                  type="button"
                  onClick={() => onSave(r)}
                  disabled={saved}
                  className={`rounded-full border px-4 py-1.5 text-[11px] font-medium transition ${
                    saved
                      ? "cursor-default border-accent/40 bg-brand/10 text-accent"
                      : "border-line-strong bg-raised text-body hover:border-accent hover:text-accent"
                  }`}
                >
                  {saved ? "Picked" : "Pick"}
                </button>
              }
            />
          );
        })}
      </ul>

      {searched ? null : (
        <section className="mt-24">
          <h2 className="text-center font-serif text-3xl text-ink">
            Start with an idea. We&rsquo;ll find the rest.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-[13px] text-muted">
            Instant discovery across trusted open archives, creative commons and
            public databases.
          </p>

          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ANGLES.map((a) => (
              <li
                key={a.title}
                className="flex flex-col rounded-2xl border border-line bg-surface p-6"
              >
                <span
                  aria-hidden
                  className="flex size-9 items-center justify-center rounded-xl border border-line bg-raised text-[15px] text-accent"
                >
                  {a.glyph}
                </span>

                <h3 className="mt-4 font-serif text-lg text-ink">
                  {a.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-body">
                  {a.blurb}
                </p>

                {a.href ? (
                  <Link
                    href={a.href}
                    className="mt-auto pt-5 text-[12px] font-medium text-accent underline-offset-2 hover:underline"
                  >
                    {a.cta} &rarr;
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>

          {recent.length > 0 ? (
            <div className="mt-20">
              <div className="flex items-end justify-between gap-4">
                <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.16em] text-accent">
                  <span aria-hidden>&#128193;</span> Recent Saved Ideas
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
                        Open board &rarr;
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
