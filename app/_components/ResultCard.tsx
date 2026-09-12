"use client";

import type { ReactNode } from "react";
import type { SourceResult } from "@/types/source-result";

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

function year(publishedAt: string | null): string | null {
  if (!publishedAt) return null;
  const y = publishedAt.slice(0, 4);
  return /^\d{4}$/.test(y) ? y : null;
}

export default function ResultCard({
  result: r,
  action,
}: {
  result: SourceResult;
  action?: ReactNode;
}) {
  const y = year(r.publishedAt);
  const known = KNOWN_LICENCES.has(r.licence.spdx);

  return (
    <li className="flex flex-col rounded-2xl border border-line bg-surface p-6 transition hover:border-accent/50">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
          {r.sourceId}
        </span>
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
        <a
          href={r.canonicalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink underline-offset-4 hover:text-accent hover:underline"
        >
          {r.title}
        </a>
      </h2>

      <p className="mt-2 line-clamp-2 text-[13px] text-body">
        {r.authors.join(", ") || "Unknown"}
      </p>

      <div
        className={`mt-4 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 ${
          known ? "bg-ok-bg" : "bg-unknown-bg"
        }`}
      >
        <span
          className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
            known ? "bg-ok-fg text-page" : "bg-line-strong text-body"
          }`}
        >
          {r.licence.spdx}
        </span>
        {r.licence.url ? (
          <a
            href={r.licence.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-[11px] underline-offset-2 hover:underline ${
              known ? "text-ok-fg" : "text-muted"
            }`}
          >
            licence
          </a>
        ) : null}
      </div>

      {r.snippet ? (
        <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-soft">
          {r.snippet}
        </p>
      ) : null}

      <p className="mt-3 line-clamp-2 text-[11px] leading-relaxed text-faint">
        {r.licence.attribution}
      </p>

      <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
        <a
          href={r.canonicalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-medium text-body underline-offset-2 transition hover:text-accent hover:underline"
        >
          Open source &#8599;
        </a>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
    </li>
  );
}
