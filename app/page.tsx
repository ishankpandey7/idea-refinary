"use client";

import { useState } from "react";
import type { SourceResult } from "@/types/source-result";

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SourceResult[]>([]);
  const [loading, setLoading] = useState(false);

  async function runSearch() {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      setResults(res.ok ? await res.json() : []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>Idea Refinery</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
        />
        <button type="submit" disabled={loading}>
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {!loading && results.length === 0 ? <p>No results.</p> : null}

      <ul>
        {results.map((r) => (
          <li key={`${r.sourceId}:${r.externalId}`}>
            <a href={r.canonicalUrl} target="_blank" rel="noopener noreferrer">
              {r.title}
            </a>
            <div>{r.authors.join(", ") || "Unknown"}</div>
            <div>
              <span>{r.licence.spdx}</span>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
