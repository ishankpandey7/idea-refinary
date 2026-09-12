"use client";

import { useState, type FormEvent } from "react";
import type { SourceResult } from "@/types/source-result";
import ResultCard from "./ResultCard";
import { addResultToIdea, resultKey } from "../_lib/ideas-db";

/**
 * Search from inside an open idea, so anyone on it can add to it. The search
 * page pins by query — which only ever resolves to your own idea — so it is
 * no use to a member who was invited to someone else's.
 */
export default function IdeaSearch({
  ideaId,
  savedKeys,
  onAdded,
}: {
  ideaId: string;
  savedKeys: Set<string>;
  onAdded: () => Promise<void> | void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SourceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      setResults(res.ok ? await res.json() : []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }

  async function onAdd(r: SourceResult) {
    const key = resultKey(r);
    setAdding(key);
    const outcome = await addResultToIdea(ideaId, r);
    setAdding(null);

    if (!outcome.ok) {
      setError(outcome.error ?? "Could not add that result.");
      return;
    }
    setError(null);
    await onAdded();
  }

  return (
    <section className="mt-10 rounded-2xl border border-line bg-surface p-6">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
        Add to this idea
      </p>

      <form className="mt-5 flex flex-col gap-3 sm:flex-row" onSubmit={onSearch}>
        <div className="flex flex-1 items-center gap-3 rounded-full border border-line bg-raised px-6 py-3 focus-within:border-accent/70">
          <span aria-hidden className="text-accent">
            &#8981;
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for something to add"
            className="w-full bg-transparent text-[15px] text-ink placeholder:text-muted focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-brand px-6 py-2.5 text-[13px] font-medium text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Searching…" : "Search →"}
        </button>
      </form>

      {error ? (
        <p className="mt-4 text-[13px] text-accent">{error}</p>
      ) : null}

      {searched && !loading && results.length === 0 ? (
        <p className="mt-5 text-[13px] text-muted">
          Nothing came back. Try another query.
        </p>
      ) : null}

      {results.length > 0 ? (
        <>
          <p className="mt-6 text-[12px] text-muted">
            {results.length} result{results.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-5 grid gap-5 sm:grid-cols-2">
            {results.map((r) => {
              const key = resultKey(r);
              const saved = savedKeys.has(key);
              return (
                <ResultCard
                  key={key}
                  result={r}
                  action={
                    <button
                      type="button"
                      onClick={() => onAdd(r)}
                      disabled={saved || adding === key}
                      className={`rounded-full border px-4 py-1.5 text-[11px] font-medium transition ${
                        saved
                          ? "cursor-default border-accent/40 bg-brand/15 text-accent"
                          : "border-line text-body hover:border-accent hover:text-accent disabled:opacity-60"
                      }`}
                    >
                      {saved
                        ? "In this idea"
                        : adding === key
                          ? "Adding…"
                          : "Add to idea"}
                    </button>
                  }
                />
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}
