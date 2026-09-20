"use client";

import type { ReactNode } from "react";
import type { SourceResult } from "@/types/source-result";
import type { Verdict } from "@/lib/licence-rules";
import { isAsserted, licenceLabel, SELF_LABEL } from "@/lib/asserted";
import { sourceLabel } from "@/lib/source-labels";

// "Known" rather than "open": NC and ND variants are Creative Commons but are
// not open under the Open Definition. They are styled apart from UNKNOWN
// because naming the licence is still more useful than saying nothing.
const KNOWN_LICENCES = new Set([
  "CC0-1.0",
  "CC-BY",
  "CC-BY-4.0",
  "CC-BY-SA",
  "CC-BY-SA-4.0",
  "CC-BY-NC",
  "CC-BY-NC-SA",
  "CC-BY-NC-ND",
  "CC-BY-ND",
  "PD",
  "OPEN-ACCESS",
]);

export const CATEGORY_LABELS = ["Research", "Art", "Writing"] as const;
export type CategoryLabel = (typeof CATEGORY_LABELS)[number];

const CATEGORY_BY_SOURCE: Record<string, CategoryLabel> = {
  openalex: "Research",
  openverse: "Art",
  gutendex: "Writing",
  wikimedia: "Art",
};

export function categoryOf(r: SourceResult): CategoryLabel {
  return (
    CATEGORY_BY_SOURCE[r.sourceId] ??
    (r.mediaType === "image"
      ? "Art"
      : r.mediaType === "text"
        ? "Writing"
        : "Research")
  );
}

/**
 * How a saved project is broken up on screen.
 *
 * Separate from CATEGORY_LABELS because that one also names a search filter,
 * and there is nothing to search for here. A typeface is not research, and
 * filing it under research because "record" had nowhere else to go was the
 * kind of small lie that makes a report hard to trust.
 */
export const GROUP_LABELS = [...CATEGORY_LABELS, "Your own"] as const;
export type GroupLabel = (typeof GROUP_LABELS)[number];

export function groupOf(r: SourceResult): GroupLabel {
  return isAsserted(r) ? "Your own" : categoryOf(r);
}

function year(publishedAt: string | null): string | null {
  if (!publishedAt) return null;
  const y = publishedAt.slice(0, 4);
  return /^\d{4}$/.test(y) ? y : null;
}

const VERDICT_STYLE: Record<Verdict["level"], string> = {
  clear: "bg-ok-fg text-page",
  caution: "bg-warn-fg text-page",
  verify: "bg-warn-fg text-page",
  blocked: "bg-stop-fg text-page",
};

export default function ResultCard({
  result: r,
  action,
  verdict,
  was,
}: {
  result: SourceResult;
  action?: ReactNode;
  verdict?: Verdict;
  /** The licence this row carried last time the project was saved. */
  was?: string;
}) {
  const y = year(r.publishedAt);
  const mine = isAsserted(r);
  const licence = licenceLabel(r);

  // Strictly the tag, even on a row somebody entered themselves: green here
  // means "a recognised open licence", and painting "all rights reserved"
  // green because a human typed it would be the worst possible read.
  const known = KNOWN_LICENCES.has(r.licence.spdx);

  // A font on a hard drive has no address, and a card that linked to nowhere
  // would be worse than one that does not link at all.
  const href = r.canonicalUrl.trim() ? r.canonicalUrl : null;

  // The pill names the licence; its colour must not contradict the verdict
  // sitting beside it. KNOWN_LICENCES includes CC BY-NC, ND and NC-ND, so
  // "recognised tag" painted a green licence next to a red "Not usable here"
  // on the same row. A recognised-but-unjudged tag still reads green; once
  // there is a verdict, the verdict decides.
  // Outlined rather than filled. line-strong is a *border* token, and
  // strengthening it for the dark card borders took body text on it down to
  // 2.69:1; swapping the fill to unknown-bg then put the pill on a wrapper
  // of the same colour, 1.00:1, so it had no edge at all. As an outline it
  // reads against whichever tint is behind it — 6.3:1 either way — and the
  // border is what makes it a pill.
  const licencePill = verdict
    ? VERDICT_STYLE[verdict.level]
    : known
      ? "bg-ok-fg text-page"
      : "border border-line-strong text-body";

  return (
    <li className="flex flex-col rounded-2xl border border-line bg-surface p-6 transition hover:border-accent/50">
      <div className="flex items-center justify-between gap-3">
        {mine ? (
          <span className="rounded-full border border-accent/50 bg-brand/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
            {SELF_LABEL}
          </span>
        ) : (
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
            {sourceLabel(r.sourceId)}
          </span>
        )}
        {y ? <span className="text-[12px] text-muted">{y}</span> : null}
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
          className="mt-4 h-40 w-full rounded-xl border border-line bg-raised object-cover"
        />
      ) : null}

      <h2 className="mt-3 font-serif text-xl leading-snug">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink underline-offset-4 hover:text-accent hover:underline"
          >
            {r.title}
          </a>
        ) : (
          <span className="text-ink">{r.title}</span>
        )}
      </h2>

      <p className="mt-2 line-clamp-2 text-[13px] text-body">
        {r.authors.join(", ") || "Unknown"}
      </p>

      <div
        className={`mt-4 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 ${
          verdict
            ? verdict.level === "blocked"
              ? "bg-stop-bg"
              : verdict.level === "clear"
                ? "bg-ok-bg"
                : "bg-warn-bg"
            : known
              ? "bg-ok-bg"
              : "bg-unknown-bg"
        }`}
      >
        <span
          className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${licencePill}`}
        >
          {licence}
        </span>
        {r.licence.url ? (
          <a
            href={r.licence.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-[11px] underline-offset-2 hover:underline ${
              verdict && verdict.level !== "clear"
                ? "text-muted"
                : known
                  ? "text-ok-fg"
                  : "text-muted"
            }`}
          >
            licence
          </a>
        ) : null}

        {verdict ? (
          <span
            className={`ml-auto rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${VERDICT_STYLE[verdict.level]}`}
          >
            {verdict.headline}
          </span>
        ) : null}
      </div>

      {was ? (
        <p className="mt-2 rounded-lg border border-accent/50 bg-brand/10 px-3 py-2 text-[12px] leading-relaxed text-accent">
          Changed since you last saved this project &mdash; it was{" "}
          <span className="font-semibold">{was}</span>.
        </p>
      ) : null}

      {verdict ? (
        <ul className="mt-2 flex flex-col gap-1">
          {verdict.notes.map((note) => (
            <li key={note} className="text-[12px] leading-relaxed text-soft">
              {note}
            </li>
          ))}
        </ul>
      ) : null}

      {r.snippet ? (
        <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-soft">
          {r.snippet}
        </p>
      ) : null}

      <p className="mt-3 line-clamp-2 text-[11px] leading-relaxed text-faint">
        {r.licence.attribution || "No credit line given."}
      </p>

      <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-medium text-body underline-offset-2 transition hover:text-accent hover:underline"
          >
            {mine ? "Open link" : "Open source"} &#8599;
          </a>
        ) : (
          <span className="text-[11px] text-faint">No link given</span>
        )}
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
    </li>
  );
}
