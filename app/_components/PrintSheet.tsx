"use client";

import type { Idea } from "../_lib/ideas";
import { CATEGORY_LABELS, categoryOf } from "./ResultCard";
import { resultKey } from "../_lib/ideas";

function day(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
}

/**
 * Hidden on screen, shown only by the `@media print` block in globals.css.
 * Rendered as plain text so the browser's print-to-PDF gets a clean document
 * instead of a screenshot of the dark UI.
 */
export default function PrintSheet({ idea }: { idea: Idea }) {
  return (
    <section data-print-sheet className="hidden">
      <header data-print-head>
        <h1>{idea.query}</h1>
        <p>
          Saved {day(idea.savedAt)} &middot; {idea.results.length} result
          {idea.results.length === 1 ? "" : "s"} &middot; exported{" "}
          {day(new Date().toISOString())}
        </p>
        <p>Idea Refinery &mdash; every item links back to its source.</p>
      </header>

      {CATEGORY_LABELS.map((label) => {
        const group = idea.results.filter((r) => categoryOf(r) === label);
        if (group.length === 0) return null;

        return (
          <section key={label} data-print-group>
            <h2>
              {label} ({group.length})
            </h2>
            <ol>
              {group.map((r) => (
                <li key={resultKey(r)} data-print-item>
                  <h3>{r.title}</h3>
                  <p data-print-meta>
                    {r.authors.join(", ") || "Unknown"}
                    {r.publishedAt ? ` · ${r.publishedAt}` : ""}
                  </p>
                  <p data-print-meta>
                    Source: {r.sourceId} &middot; Licence: {r.licence.spdx}
                  </p>
                  <p data-print-url>{r.canonicalUrl}</p>
                  <p data-print-attr>{r.licence.attribution}</p>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </section>
  );
}
