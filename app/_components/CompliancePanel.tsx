"use client";

import { useMemo, useState } from "react";
import type { SourceResult } from "@/types/source-result";
import { LEVEL_COPY, type Usage } from "@/lib/licence-rules";
import { tally } from "@/lib/credits";
import { buildCredits, type CreditsFormat } from "@/lib/credits";
import UsageQuestions from "./UsageQuestions";

const FORMATS: {
  id: CreditsFormat;
  label: string;
  ext: string;
  mime: string;
}[] = [
  { id: "text", label: "Plain text", ext: "txt", mime: "text/plain" },
  { id: "markdown", label: "Markdown", ext: "md", mime: "text/markdown" },
  { id: "csv", label: "CSV", ext: "csv", mime: "text/csv" },
];

/** Filename-safe, and recognisable as the project it came from. */
function slug(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "credits"
  );
}

export default function CompliancePanel({
  title,
  results,
  usage,
  onUsageChange,
  hideUsage = false,
  heading = "Your credits",
  shareUrl,
}: {
  title: string;
  results: SourceResult[];
  usage: Usage;
  onUsageChange: (next: Usage) => void;
  /** Where this check reopens. Only the checker has one. */
  shareUrl?: string;
  /** The caller already renders the toggles, so do not repeat them. */
  hideUsage?: boolean;
  /** Set this when another credits block already sits on the page. */
  heading?: string;
}) {
  const [format, setFormat] = useState<CreditsFormat>("text");
  // Open. The credits are the thing you came for; making you press a
  // button to see them said the verdicts were the product and these were a
  // footnote, which is backwards.
  const [showCredits, setShowCredits] = useState(true);
  const [copied, setCopied] = useState(false);

  const counts = useMemo(() => tally(results, usage), [results, usage]);
  const credits = useMemo(
    () => buildCredits({ title, results, usage, shareUrl }, format),
    [title, results, usage, shareUrl, format],
  );

  /**
   * The credits are the thing you hand to someone else — a licence review, a
   * repo, an app store form. A textarea you have to select is not that, so
   * this writes the actual file.
   */
  function download() {
    const spec = FORMATS.find((f) => f.id === format) ?? FORMATS[0];
    const url = URL.createObjectURL(
      new Blob([credits], { type: `${spec.mime};charset=utf-8` }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `credits-${slug(title)}.${spec.ext}`;
    a.click();
    // Revoked on the next tick: the click has already started the save, and
    // holding the blob forever leaks it.
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(credits);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the textarea below is selectable, so there is
      // still a way out. Just do not claim it worked.
      setCopied(false);
    }
  }

  return (
    <section className="mt-10 rounded-2xl border border-line bg-surface p-6">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
        {heading}
      </p>

      {hideUsage ? null : (
        <>
          <p className="mt-3 text-[13px] leading-relaxed text-body">
            Tell us what you are doing with this material and every source
            below is judged against its licence.
          </p>

          <div className="mt-5">
            <UsageQuestions
              usage={usage}
              onChange={onUsageChange}
              size="compact"
            />
          </div>
        </>
      )}

      {/* The safety net, above the thing you came for: a credits file is only
          worth publishing once you know nothing in it is unusable. */}
      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          n={counts.clear}
          label={LEVEL_COPY.clear.short}
          tone="text-ok-fg"
        />
        <Stat
          n={counts.caution}
          label={LEVEL_COPY.caution.short}
          tone="text-warn-fg"
        />
        <Stat
          n={counts.verify}
          label={LEVEL_COPY.verify.short}
          tone="text-warn-fg"
        />
        <Stat
          n={counts.blocked}
          label={LEVEL_COPY.blocked.short}
          tone="text-stop-fg"
        />
      </dl>

      {counts.asserted > 0 ? (
        <p className="mt-5 rounded-xl border border-accent/40 bg-brand/10 px-4 py-3 text-[13px] leading-relaxed text-accent">
          {counts.asserted} of these {counts.asserted === 1 ? "is" : "are"} your
          own entry. Those licences are as you stated them &mdash; Idea Craft
          did not read them &mdash; and every credits file and report says so.
        </p>
      ) : null}

      {counts.blocked > 0 ? (
        <p className="mt-5 rounded-xl bg-stop-bg px-4 py-3 text-[13px] leading-relaxed text-stop-fg">
          {counts.blocked === 1
            ? "1 source cannot be used the way you described. It is marked below, and flagged in your credits."
            : `${counts.blocked} sources cannot be used the way you described. They are marked below, and flagged in your credits.`}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-5">
        <button
          type="button"
          onClick={download}
          className="rounded-full bg-brand px-6 py-2.5 text-[13px] font-medium text-white transition hover:bg-brand-hover"
        >
          Download credits
        </button>
        {FORMATS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFormat(f.id)}
            className={`rounded-full border px-4 py-2 text-[12px] transition ${
              format === f.id
                ? "border-ink bg-ink text-page"
                : "border-line text-body hover:border-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={copy}
            className="rounded-full border border-line px-5 py-2 text-[12px] text-body transition hover:border-accent hover:text-accent"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={() => setShowCredits((v) => !v)}
            className="inline-flex min-h-11 items-center px-2 text-[12px] text-muted underline-offset-2 transition hover:text-accent hover:underline"
          >
            {showCredits ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      {showCredits ? (
        <textarea
          readOnly
          value={credits}
          rows={14}
          spellCheck={false}
          className="mt-4 w-full rounded-xl border border-line bg-raised p-4 font-mono text-[12px] leading-relaxed text-body focus:outline-none"
        />
      ) : null}

      <p className="mt-4 text-[11px] leading-relaxed text-faint">
        Licence tags are as published by each source
        {counts.asserted > 0
          ? ", apart from your own entries, which are as you stated them"
          : ""}
        , and attribution lines are reproduced exactly as supplied. This is a
        compliance aid, not legal advice.
      </p>
    </section>
  );
}


function Stat({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div className="rounded-xl border border-line bg-raised px-4 py-3">
      <dt className="text-[11px] uppercase tracking-[0.12em] text-muted">
        {label}
      </dt>
      <dd className={`mt-1 font-serif text-2xl ${n === 0 ? "text-faint" : tone}`}>
        {n}
      </dd>
    </div>
  );
}
