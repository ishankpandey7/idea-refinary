"use client";

import { useMemo, useState } from "react";
import type { SourceResult } from "@/types/source-result";
import type { Usage } from "@/lib/licence-rules";
import { tally } from "@/lib/credits";
import { buildCredits, type CreditsFormat } from "@/lib/credits";

const FORMATS: { id: CreditsFormat; label: string }[] = [
  { id: "text", label: "Plain text" },
  { id: "markdown", label: "Markdown" },
  { id: "csv", label: "CSV" },
];

export default function CompliancePanel({
  title,
  results,
  usage,
  onUsageChange,
  hideUsage = false,
}: {
  title: string;
  results: SourceResult[];
  usage: Usage;
  onUsageChange: (next: Usage) => void;
  /** The caller already renders the toggles, so do not repeat them. */
  hideUsage?: boolean;
}) {
  const [format, setFormat] = useState<CreditsFormat>("text");
  const [showCredits, setShowCredits] = useState(false);
  const [copied, setCopied] = useState(false);

  const counts = useMemo(() => tally(results, usage), [results, usage]);
  const credits = useMemo(
    () => buildCredits({ title, results, usage }, format),
    [title, results, usage, format],
  );

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
        Licence check
      </p>

      {hideUsage ? null : (
        <>
          <p className="mt-3 text-[13px] leading-relaxed text-body">
            Tell us what you are doing with this material and every saved
            source is judged against its licence.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <Toggle
              on={usage.commercial}
              label="Commercial project"
              onClick={() =>
                onUsageChange({ ...usage, commercial: !usage.commercial })
              }
            />
            <Toggle
              on={usage.modify}
              label="I will edit or adapt it"
              onClick={() => onUsageChange({ ...usage, modify: !usage.modify })}
            />
          </div>
        </>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat n={counts.clear} label="Clear" tone="text-ok-fg" />
        <Stat n={counts.caution} label="Conditions" tone="text-warn-fg" />
        <Stat n={counts.verify} label="Check licence" tone="text-warn-fg" />
        <Stat n={counts.blocked} label="Not usable" tone="text-stop-fg" />
      </dl>

      {counts.blocked > 0 ? (
        <p className="mt-5 rounded-xl bg-stop-bg px-4 py-3 text-[13px] leading-relaxed text-stop-fg">
          {counts.blocked} saved source{counts.blocked === 1 ? "" : "s"} cannot
          be used the way you described. They are marked below.
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-5">
        <button
          type="button"
          onClick={() => setShowCredits((v) => !v)}
          className="rounded-full bg-brand px-6 py-2.5 text-[13px] font-medium text-white transition hover:bg-brand-hover"
        >
          {showCredits ? "Hide credits" : "Build credits"}
        </button>
        {showCredits ? (
          <>
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
            <button
              type="button"
              onClick={copy}
              className="ml-auto rounded-full border border-line px-5 py-2 text-[12px] text-body transition hover:border-accent hover:text-accent"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </>
        ) : null}
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
        Licence tags are as published by each source, and attribution lines are
        reproduced exactly as the source supplied them. This is a compliance
        aid, not legal advice.
      </p>
    </section>
  );
}

function Toggle({
  on,
  label,
  onClick,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-5 py-2 text-[13px] transition ${
        on
          ? "border-ink bg-ink text-page"
          : "border-line text-body hover:border-ink"
      }`}
    >
      {on ? "✓ " : ""}
      {label}
    </button>
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
