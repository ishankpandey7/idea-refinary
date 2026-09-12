"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { SourceResult } from "@/types/source-result";
import ResultCard from "./_components/ResultCard";
import {
  listIdeas,
  resultKey,
  saveResult,
  savedKeysFor,
  type Idea,
} from "./_lib/ideas-db";
import { useAuth } from "./_components/AuthProvider";

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

  const { user } = useAuth();

  const refreshSaved = useCallback(
    async (idea: string) => {
      if (!user) {
        setSavedKeys(new Set());
        return;
      }
      setSavedKeys(await savedKeysFor(idea));
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
      setResults(res.ok ? await res.json() : []);
    } catch {
      setResults([]);
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

  async function onSave(r: SourceResult) {
    if (!user) return;
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
              action={
                user ? (
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
                    {saved ? "Saved" : "Save"}
                  </button>
                ) : (
                  <Link
                    href="/login"
                    className="rounded-full border border-line-strong bg-raised px-4 py-1.5 text-[11px] font-medium text-muted transition hover:border-accent hover:text-accent"
                  >
                    Sign in to save
                  </Link>
                )
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
