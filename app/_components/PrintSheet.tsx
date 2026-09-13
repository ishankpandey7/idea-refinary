"use client";

import type { SourceResult } from "@/types/source-result";
import { verdictFor, type Level, type Usage } from "@/lib/licence-rules";
import { tally } from "@/lib/credits";
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
 * Sections in the order you have to act in, not the order things were saved.
 * A printed report is read top-down once, so what cannot be used has to be
 * the first thing on the page.
 */
const SECTIONS: { level: Level; heading: string }[] = [
  { level: "blocked", heading: "Not usable for this project" },
  { level: "verify", heading: "Check the licence before using" },
  { level: "caution", heading: "Usable with conditions" },
  { level: "clear", heading: "Clear to use" },
];

function intentLine(usage: Usage): string {
  return [
    usage.commercial ? "commercial use" : "non-commercial use",
    usage.modify ? "adapted or edited" : "used unmodified",
  ].join(", ");
}

/**
 * Hidden on screen, shown only by the `@media print` block in globals.css.
 * Rendered as plain text so the browser's print-to-PDF gets a clean document
 * instead of a screenshot of the dark UI.
 *
 * This is the copy that leaves the building — it goes to a client, a legal
 * review, an app store form. So it carries the verdicts and the intent they
 * were reached under, not just a list of links: a reader who cannot see what
 * question was asked cannot check the answer.
 */
export default function PrintSheet({
  title,
  results,
  usage,
  savedAt,
}: {
  title: string;
  results: SourceResult[];
  usage: Usage;
  /** Omitted by the checker, where nothing has been saved yet. */
  savedAt?: string;
}) {
  const counts = tally(results, usage);

  return (
    <section data-print-sheet className="hidden">
      <header data-print-head>
        <h1>{title}</h1>
        <p>
          Licence report &middot; {results.length} source
          {results.length === 1 ? "" : "s"} checked for {intentLine(usage)}
        </p>
        <p>
          {savedAt ? `Saved ${day(savedAt)} · ` : ""}Exported{" "}
          {day(new Date().toISOString())}
        </p>
        <p>
          {counts.clear} clear &middot; {counts.caution} with conditions
          &middot; {counts.verify} to check &middot; {counts.blocked} not usable
        </p>
      </header>

      {counts.blocked > 0 ? (
        <section data-print-group>
          <p data-print-meta>
            {counts.blocked} of these {results.length} cannot be used the way
            this report describes. They are listed first.
          </p>
        </section>
      ) : null}

      {SECTIONS.map(({ level, heading }) => {
        const group = results.filter(
          (r) => verdictFor(r.licence.spdx, usage).level === level,
        );
        if (group.length === 0) return null;

        return (
          <section key={level} data-print-group>
            <h2>
              {heading} ({group.length})
            </h2>
            <ol>
              {group.map((r) => {
                const verdict = verdictFor(r.licence.spdx, usage);
                return (
                  <li key={resultKey(r)} data-print-item>
                    <h3>{r.title}</h3>
                    <p data-print-meta>
                      {r.authors.join(", ") || "Unknown"}
                      {r.publishedAt ? ` · ${r.publishedAt}` : ""}
                    </p>
                    <p data-print-meta>
                      Source: {r.sourceId} &middot; Licence: {r.licence.spdx}
                    </p>
                    {verdict.notes.map((note) => (
                      <p key={note} data-print-meta>
                        {note}
                      </p>
                    ))}
                    <p data-print-url>{r.canonicalUrl}</p>
                    <p data-print-attr>{r.licence.attribution}</p>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}

      <footer data-print-group>
        <p data-print-meta>
          Licence tags are as published by each source, and attribution lines
          are reproduced exactly as the source supplied them. Idea Craft is a
          compliance aid, not legal advice.
        </p>
      </footer>
    </section>
  );
}
