"use client";

import { useState } from "react";
import type { SourceResult } from "@/types/source-result";

const CATEGORIES = [
  { id: "", label: "All" },
  { id: "research", label: "Research" },
  { id: "art", label: "Art" },
] as const;

const OPEN_LICENCES = new Set([
  "CC0-1.0",
  "CC-BY",
  "CC-BY-4.0",
  "CC-BY-SA",
  "CC-BY-SA-4.0",
  "CC-BY-NC",
  "PD",
  "OPEN-ACCESS",
]);

function year(publishedAt: string | null): string | null {
  if (!publishedAt) return null;
  const y = publishedAt.slice(0, 4);
  return /^\d{4}$/.test(y) ? y : null;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("");
  const [results, setResults] = useState<SourceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

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
      setLoading(false);
      setSearched(true);
    }
  }

  function pickCategory(id: string) {
    setCategory(id);
    if (searched) runSearch(id);
  }

  return (
    <div className="min-h-screen bg-[#0a0605] text-[#e8d8cc] selection:bg-[#e8451f]/30">
      <header className="flex items-center justify-between border-b border-[#3a1f14]/60 px-6 py-5 sm:px-10">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="text-lg text-[#e8451f]">
            &#10022;
          </span>
          <span className="font-serif text-xl tracking-tight text-[#f5a962]">
            Idea Refinery
          </span>
        </div>
        <nav className="hidden gap-8 text-sm text-[#c9b6a8] sm:flex">
          <span className="cursor-default text-[#f5a962]">Research</span>
          <span className="cursor-default">Art</span>
          <span className="cursor-default">My Ideas</span>
        </nav>
        <div aria-hidden className="size-9 rounded-full border border-[#3a1f14]" />
      </header>

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
          Search open-licence research and art. Everything links back to the
          source &mdash; we never host the content.
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
          <p className="mt-14 text-center text-[11px] font-medium uppercase tracking-[0.18em] text-[#e8451f]">
            {results.length} result{results.length === 1 ? "" : "s"}
          </p>
        ) : null}

        {searched && !loading && results.length === 0 ? (
          <p className="mt-6 text-center text-[15px] text-[#7a6558]">
            Nothing came back. Try another query.
          </p>
        ) : null}

        <ul className="mt-8 grid gap-5 sm:grid-cols-2">
          {results.map((r) => {
            const y = year(r.publishedAt);
            const open = OPEN_LICENCES.has(r.licence.spdx);
            return (
              <li
                key={`${r.sourceId}:${r.externalId}`}
                className="flex flex-col rounded-2xl border border-[#3a1f14] bg-[#100a07]/70 p-6 transition hover:border-[#e8451f]/60"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full border border-[#3a1f14] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-[#e8451f]">
                    {r.sourceId}
                  </span>
                  {y ? <span className="text-[12px] text-[#7a6558]">{y}</span> : null}
                </div>

                {r.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.hidden = true;
                    }}
                    className="mt-4 h-40 w-full rounded-xl border border-[#3a1f14]/70 object-cover"
                  />
                ) : null}

                <h2 className="mt-4 font-serif text-xl leading-snug">
                  <a
                    href={r.canonicalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#f5a962] underline-offset-4 hover:text-[#ff7a3d] hover:underline"
                  >
                    {r.title}
                  </a>
                </h2>

                <p className="mt-2 line-clamp-2 text-[13px] text-[#b39c8c]">
                  {r.authors.join(", ") || "Unknown"}
                </p>

                {r.snippet ? (
                  <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-[#8d7768]">
                    {r.snippet}
                  </p>
                ) : null}

                <div className="mt-5 flex items-center gap-2 border-t border-[#3a1f14]/60 pt-4">
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                      open
                        ? "bg-[#e8451f]/15 text-[#ff9c6b]"
                        : "bg-[#2a1a12] text-[#8d7768]"
                    }`}
                  >
                    {r.licence.spdx}
                  </span>
                  {r.licence.url ? (
                    <a
                      href={r.licence.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-[#7a6558] underline-offset-2 hover:text-[#b39c8c] hover:underline"
                    >
                      licence
                    </a>
                  ) : null}
                </div>

                <p className="mt-3 line-clamp-2 text-[11px] leading-relaxed text-[#6f5a4d]">
                  {r.licence.attribution}
                </p>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
