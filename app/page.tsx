"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { SourceResult } from "@/types/source-result";
import ResultCard from "./_components/ResultCard";
import { resultKey, saveResult, savedKeysFor } from "./_lib/ideas-db";
import { useAuth } from "./_components/AuthProvider";

const CATEGORIES = [
  { id: "", label: "All" },
  { id: "research", label: "Research" },
  { id: "art", label: "Art" },
  { id: "writing", label: "Writing" },
] as const;

const LAST_SEARCH = "idea-refinery:last-search";

/**
 * The angle cards from the design. Three describe what the adapters return;
 * the fourth slot is POLICY in the mockup, which is a source type this app has
 * no adapter for, so it shows Collaborator instead — a feature that does
 * exist. Provider names are the four real adapters and nothing else.
 */
const ANGLES = [
  {
    glyph: "✦",
    title: "Research",
    blurb: "Open-access papers and datasets behind the idea.",
    metaLabel: "Focus areas",
    meta: "Literature · Reviews · Datasets",
    sources: "OpenAlex",
    href: null,
    cta: null,
  },
  {
    glyph: "◈",
    title: "Art & creativity",
    blurb: "Openly licensed images and artwork you can actually reuse.",
    metaLabel: "Focus areas",
    meta: "Photography · Illustration · Museum artworks",
    sources: "Openverse · Wikimedia Commons",
    href: null,
    cta: null,
  },
  {
    glyph: "✒",
    title: "Writing",
    blurb: "Public-domain texts and reference works to write from.",
    metaLabel: "Focus areas",
    meta: "Reference texts · Primary sources",
    sources: "Gutendex",
    href: null,
    cta: null,
  },
  {
    glyph: "✉",
    title: "Collaborator",
    blurb:
      "Invite someone by email and work an idea together. Everyone on it can search, pin and remove sources.",
    metaLabel: "What you get",
    meta: "Shared boards · shared pins",
    sources: "My Ideas",
    href: "/my-ideas",
    cta: "Open My Ideas",
  },
] as const;

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
      <h1 className="text-center font-serif text-5xl leading-[1.1] text-[#1c1410] sm:text-6xl">
        One idea in.
        <br />
        Open-licence sources out.
      </h1>

      <p className="mx-auto mt-6 max-w-xl text-center text-[15px] leading-relaxed text-[#57504a]">
        Describe what you&rsquo;re trying to make. Idea Refinery finds the
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
        <div className="flex items-center gap-3 rounded-full border border-[#e5dccd] bg-[#fffdf9] py-2 pl-6 pr-2 focus-within:border-[#e8451f]/70">
          <span aria-hidden className="text-[#e8451f]">
            &#8981;
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Describe your idea — e.g. a cancer awareness campaign for my campus"
            className="w-full bg-transparent text-[15px] text-[#1c1410] placeholder:text-[#9a9089] focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="shrink-0 rounded-full bg-[#e8451f] px-7 py-3 text-[14px] font-medium text-white transition hover:bg-[#d13d18] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Searching…" : "Refine →"}
          </button>
        </div>
      </form>

      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
        {CATEGORIES.map((c) => (
          <button
            key={c.id || "all"}
            type="button"
            onClick={() => pickCategory(c.id)}
            className={`rounded-full border px-5 py-2 text-[13px] transition ${
              category === c.id
                ? "border-[#1c1410] bg-[#1c1410] text-[#faf7f2]"
                : "border-[#e5dccd] text-[#57504a] hover:border-[#1c1410]"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {searched ? (
        <div className="mt-14 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#e8451f]">
            {results.length} result{results.length === 1 ? "" : "s"}
          </p>
          {currentIdea && user ? (
            <p className="mt-2 text-[13px] text-[#8b8178]">
              Saving to idea{" "}
              <span className="text-[#57504a]">
                &ldquo;{currentIdea}&rdquo;
              </span>
              {savedKeys.size > 0 ? (
                <>
                  {" · "}
                  <Link
                    href="/my-ideas"
                    className="text-[#e8451f] underline-offset-2 hover:underline"
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
        <p className="mx-auto mt-6 max-w-xl rounded-2xl border border-[#e8451f]/40 bg-[#e8451f]/10 px-6 py-3 text-center text-[13px] text-[#c13c16]">
          Could not save: {saveError}
        </p>
      ) : null}

      {searched && !loading && results.length === 0 ? (
        <p className="mt-6 text-center text-[15px] text-[#8b8178]">
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
                        ? "cursor-default border-[#e8451f]/40 bg-[#e8451f]/10 text-[#e8451f]"
                        : "border-[#d9cdb9] bg-[#fffdf9] text-[#57504a] hover:border-[#e8451f] hover:text-[#e8451f]"
                    }`}
                  >
                    {saved ? "Saved" : "Save"}
                  </button>
                ) : (
                  <Link
                    href="/login"
                    className="rounded-full border border-[#d9cdb9] bg-[#fffdf9] px-4 py-1.5 text-[11px] font-medium text-[#8b8178] transition hover:border-[#e8451f] hover:text-[#e8451f]"
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
          <h2 className="text-center font-serif text-3xl text-[#1c1410]">
            Start with an idea. We&rsquo;ll find the rest.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-[13px] text-[#8b8178]">
            Instant discovery across trusted open archives, creative commons and
            public databases.
          </p>

          <ul className="mt-10 grid gap-5 sm:grid-cols-2">
            {ANGLES.map((a) => (
              <li
                key={a.title}
                className="flex flex-col rounded-2xl border border-[#e5dccd] bg-[#f4eee4] p-6"
              >
                <span
                  aria-hidden
                  className="flex size-9 items-center justify-center rounded-xl border border-[#e5dccd] bg-[#fffdf9] text-[15px] text-[#e8451f]"
                >
                  {a.glyph}
                </span>

                <h3 className="mt-4 font-serif text-xl text-[#1c1410]">
                  {a.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[#57504a]">
                  {a.blurb}
                </p>

                <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a9089]">
                  {a.metaLabel}
                </p>
                <p className="mt-1.5 text-[12px] text-[#8b8178]">{a.meta}</p>

                <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a9089]">
                  {a.href ? "Where it lives" : "Sources"}
                </p>
                <p className="mt-1.5 text-[12px] text-[#e8451f]">{a.sources}</p>

                {a.href ? (
                  <Link
                    href={a.href}
                    className="mt-6 inline-block self-start rounded-full bg-[#e8451f] px-6 py-2.5 text-[13px] font-medium text-white transition hover:bg-[#d13d18]"
                  >
                    {a.cta} &rarr;
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
