"use client";

import type { Usage } from "@/lib/licence-rules";

/**
 * The two questions every verdict on this site depends on.
 *
 * Deliberately Yes/No rather than a pair of on/off switches. A switch has two
 * positions and three meanings — off reads as "no" and as "I have not said",
 * and those are opposites here: "no" is the permissive answer, because a
 * licence only forbids what you have told it you want to do. An unanswered
 * switch therefore produced the most generous possible verdict on the most
 * restrictive possible licence, which is the one output this tool must never
 * produce. Neither is preselected, and nothing reads better than "check
 * before using" until both have been answered.
 *
 * One component, used by the checker, the search page and the credits panel,
 * so the three can never ask the same question in three different shapes.
 */
export default function UsageQuestions({
  usage,
  onChange,
  size = "normal",
}: {
  usage: Usage;
  onChange: (next: Usage) => void;
  /** The credits panel and /my-ideas sit in tighter space than the checker. */
  size?: "normal" | "compact";
}) {
  return (
    <div className="flex flex-col gap-3">
      <Question
        label="Is this a commercial project?"
        value={usage.commercial}
        size={size}
        onChange={(v) => onChange({ ...usage, commercial: v })}
      />
      <Question
        label="Will you edit or adapt the material?"
        value={usage.modify}
        size={size}
        onChange={(v) => onChange({ ...usage, modify: v })}
      />
    </div>
  );
}

function Question({
  label,
  value,
  onChange,
  size,
}: {
  label: string;
  value: boolean | null;
  onChange: (next: boolean) => void;
  size: "normal" | "compact";
}) {
  const text = size === "compact" ? "text-[12px]" : "text-[13px]";

  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-wrap items-center gap-x-3 gap-y-2"
    >
      <span className={`${text} text-body`}>{label}</span>
      <div className="flex gap-2">
        <Answer on={value === true} text={text} onClick={() => onChange(true)}>
          Yes
        </Answer>
        <Answer on={value === false} text={text} onClick={() => onChange(false)}>
          No
        </Answer>
      </div>
      {value === null ? (
        <span className={`${text} text-accent`}>Not answered</span>
      ) : null}
    </div>
  );
}

function Answer({
  on,
  onClick,
  text,
  children,
}: {
  on: boolean;
  onClick: () => void;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      // min-h-11 is the 44px touch target; px-5 keeps the hit area wide
      // enough on a phone, where these are the first things anyone taps.
      className={`inline-flex min-h-11 min-w-16 items-center justify-center rounded-full border px-5 ${text} transition ${
        on
          ? "border-ink bg-ink text-page"
          : "border-line text-body hover:border-ink"
      }`}
    >
      {on ? "✓ " : ""}
      {children}
    </button>
  );
}
