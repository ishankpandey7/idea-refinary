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

export default function Home() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("");
  const [results, setResults] = useState<SourceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // The query that was actually searched — this is the current idea.
  const [currentIdea, setCurrentIdea] = useState("");
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());

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

  async function runSearch(nextCategory = category) {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    try {
      const url = `/api/search?q=${encodeURIComponent(q)}${
        nextCategory ? `&category=${encodeURIComponent(nextCategory)}` : ""
      }`;
      const res = await fetch(url);
      setResults(res.ok ? await res.json() : []);
    } catch {
      setResults([]);
    } finally {
      setCurrentIdea(q);
      setLoading(false);
      setSearched(true);
    }
  }

  function pickCategory(id: string) {
    setCategory(id);
    if (searched) runSearch(id);
  }

  async function onSave(r: SourceResult) {
    if (!user) return;
    await saveResult(currentIdea, r);
    await refreshSaved(currentIdea);
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 pb-24 pt-16 sm:px-10">
      <div className="flex justify-center">
        <span className="rounded-full border border-[#3a1f14] px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[#e8451f]">
          Where ideas take shape
        </span>
      </div>

      <h1 className="mt-10 text-center font-serif text-5xl leading-[1.08] text-[#f5a962] sm:text-6xl">
        Every great idea
        <br />
        starts with a <em className="italic text-[#ff7a3d]">what if?</em>
      </h1>

      <p className="mx-auto mt-6 max-w-xl text-center text-[15px] leading-relaxed text-[#b39c8c]">
        Search open-licence research, art and writing. Everything links back to
        the source &mdash; we never host the content.
      </p>

      <form
        className="mt-10 flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
      >
        <div className="flex flex-1 items-center gap-3 rounded-full border border-[#3a1f14] bg-[#120b08]/60 px-6 py-4 focus-within:border-[#e8451f]/70">
          <span aria-hidden className="text-[#e8451f]">
            &#8981;
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What are you curious about?"
            className="w-full bg-transparent text-[15px] text-[#e8d8cc] placeholder:text-[#7a6558] focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-[#e8451f] px-9 py-4 text-[15px] font-medium text-white transition hover:bg-[#ff5a2e] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Searching…" : "Explore →"}
        </button>
      </form>

      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
        {CATEGORIES.map((c) => (
          <button
            key={c.id || "all"}
            type="button"
            onClick={() => pickCategory(c.id)}
            className={`rounded-full border px-5 py-2 text-[13px] transition ${
              category === c.id
                ? "border-[#e8451f] bg-[#e8451f]/10 text-[#ff9c6b]"
                : "border-[#3a1f14] text-[#b39c8c] hover:border-[#e8451f]/60"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {searched ? (
        <div className="mt-14 text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#e8451f]">
            {results.length} result{results.length === 1 ? "" : "s"}
          </p>
          {currentIdea && user ? (
            <p className="mt-2 text-[13px] text-[#7a6558]">
              Saving to idea{" "}
              <span className="text-[#b39c8c]">
                &ldquo;{currentIdea}&rdquo;
              </span>
              {savedKeys.size > 0 ? (
                <>
                  {" · "}
                  <Link
                    href="/my-ideas"
                    className="text-[#ff9c6b] underline-offset-2 hover:underline"
                  >
                    {savedKeys.size} saved
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}

      {searched && !loading && results.length === 0 ? (
        <p className="mt-6 text-center text-[15px] text-[#7a6558]">
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
                        ? "cursor-default border-[#e8451f]/40 bg-[#e8451f]/15 text-[#ff9c6b]"
                        : "border-[#3a1f14] text-[#b39c8c] hover:border-[#e8451f] hover:text-[#ff9c6b]"
                    }`}
                  >
                    {saved ? "Saved" : "Save"}
                  </button>
                ) : (
                  <Link
                    href="/login"
                    className="rounded-full border border-[#3a1f14] px-4 py-1.5 text-[11px] font-medium text-[#7a6558] transition hover:border-[#e8451f] hover:text-[#ff9c6b]"
                  >
                    Sign in to save
                  </Link>
                )
              }
            />
          );
        })}
      </ul>
    </main>
  );
}
