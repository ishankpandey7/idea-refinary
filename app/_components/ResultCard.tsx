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
    <li className="flex flex-col rounded-2xl border border-[#3a1f14] bg-[#100a07]/70 p-6 transition hover:border-[#e8451f]/60">
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
            known
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
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>

      <p className="mt-3 line-clamp-2 text-[11px] leading-relaxed text-[#6f5a4d]">
        {r.licence.attribution}
      </p>
    </li>
  );
}
