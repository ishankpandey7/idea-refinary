"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { SourceResult } from "@/types/source-result";
import type { CheckItem, CheckResponse } from "@/lib/resolve";
import { extractLinks, MAX_LINKS, MAX_TEXT } from "@/lib/links";
import { verdictFor, type Level, type Usage } from "@/lib/licence-rules";
import ResultCard, { categoryOf } from "./_components/ResultCard";
import CompliancePanel from "./_components/CompliancePanel";
import PrintSheet from "./_components/PrintSheet";
import { useAuth } from "./_components/AuthProvider";
import { readUsage, writeUsage, DEFAULT_USAGE, usageLabel } from "./_lib/usage";
import { resultKey, saveResult, savedKeysFor } from "./_lib/ideas-db";
import {
  readIdeas,
  saveResult as saveLocal,
  savedKeysFor as savedKeysLocal,
} from "./_lib/ideas";

const PASTE_KEY = "idea-refinery:check-paste";
const PROJECT_KEY = "idea-refinery:check-project";

const DEFAULT_PROJECT = "My project";

/** Act on the blocked ones first; a clear source needs nothing from you. */
const RANK: Record<Level, number> = {
  blocked: 0,
  verify: 1,
  caution: 2,
  clear: 3,
};

const LEVELS: { level: Level; label: string }[] = [
  { level: "blocked", label: "Not usable" },
  { level: "verify", label: "Check licence" },
  { level: "caution", label: "Conditions" },
  { level: "clear", label: "Clear" },
];

/**
 * Five links that between them show the whole answer: public domain, a
 * non-commercial licence that flips to unusable the moment you tick
 * "commercial", an open-access paper, a Gutenberg book, and one link we
 * refuse to guess about.
 */
const EXAMPLE = [
  "https://commons.wikimedia.org/wiki/File:The_Earth_seen_from_Apollo_17.jpg",
  "https://openverse.org/image/bcefaf9d-d07b-4fc0-b652-98344a3a2a4c",
  "https://doi.org/10.7717/peerj.4375",
  "https://www.gutenberg.org/ebooks/1342",
  "https://en.wikipedia.org/wiki/Blue_Marble",
].join("\n");

const PLACEHOLDER = [
  "Paste the links to everything you are using — one per line, or a whole",
  "credits block. Anything without a link is ignored.",
  "",
  "https://commons.wikimedia.org/wiki/File:Example.jpg",
  "https://doi.org/10.7717/peerj.4375",
].join("\n");

function read(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked — the box still works for this visit.
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export default function Check() {
  const [project, setProject] = useState(DEFAULT_PROJECT);
  const [paste, setPaste] = useState("");
  const [usage, setUsage] = useState<Usage>(DEFAULT_USAGE);

  const [response, setResponse] = useState<CheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const [only, setOnly] = useState<Level | null>(null);
  /** The links the current response is about, for rebuilding the share link. */
  const [checked_, setChecked] = useState<string[]>([]);
  /** True when this page was opened from someone else's share link. */
  const [arrived, setArrived] = useState(false);
  const [copied, setCopied] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);

  const { user } = useAuth();

  /**
   * Puts the whole check in the address bar: the links, and the intent they
   * were judged against. A check is only worth sending to someone if it
   * carries the question too — the same list under "commercial" and under
   * "personal" are different answers, and a link that dropped the intent
   * would quietly show the reader the wrong one.
   */
  const syncUrl = useCallback((links: string[], intent: Usage) => {
    const qs = new URLSearchParams();
    if (intent.commercial) qs.set("c", "1");
    if (intent.modify) qs.set("m", "1");
    qs.set("l", links.join("\n"));
    window.history.replaceState(null, "", `/?${qs.toString()}`);
  }, []);

  const runCheck = useCallback(
    async (links: string[], intent: Usage) => {
      if (links.length === 0) return;
      setLoading(true);
      setFailed(false);
      try {
        const res = await fetch("/api/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls: links }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setResponse((await res.json()) as CheckResponse);
        setChecked(links);
        syncUrl(links, intent);
      } catch {
        setResponse(null);
        setFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [syncUrl],
  );

  // Restore once on mount. A shared link wins over this browser's own state —
  // someone who followed one came to see that check, not their last one.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // An old link into the search page still works; this route no longer
    // answers it.
    if (params.get("q")) {
      window.location.replace(`/search${window.location.search}`);
      return;
    }

    setProject(read(PROJECT_KEY, DEFAULT_PROJECT));

    const shared = params.get("l");
    if (shared) {
      const intent: Usage = {
        commercial: params.get("c") === "1",
        modify: params.get("m") === "1",
      };
      setUsage(intent);
      writeUsage(intent);
      setPaste(shared);
      write(PASTE_KEY, shared);
      setArrived(true);
      void runCheck(extractLinks(shared), intent);
      return;
    }

    setUsage(readUsage());
    setPaste(read(PASTE_KEY, ""));
  }, [runCheck]);

  const refreshSaved = useCallback(
    async (title: string) => {
      setSavedKeys(user ? await savedKeysFor(title) : savedKeysLocal(title));
    },
    [user],
  );

  useEffect(() => {
    if (project.trim()) void refreshSaved(project.trim());
  }, [project, refreshSaved]);

  function changeUsage(next: Usage) {
    setUsage(next);
    writeUsage(next);
    // The verdicts on screen just changed, so the link that reproduces them
    // has to change with them.
    if (checked_.length > 0) syncUrl(checked_, next);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked. The address bar already holds the same link, so
      // there is still a way to get it — just do not claim this worked.
      setCopied(false);
    }
  }

  function changeProject(next: string) {
    setProject(next);
    write(PROJECT_KEY, next);
  }

  function changePaste(next: string) {
    setPaste(next);
    write(PASTE_KEY, next);
  }

  const pending = useMemo(() => extractLinks(paste), [paste]);




  const unread = useMemo(
    () => (response?.items ?? []).filter((i) => i.status !== "ok"),
    [response],
  );

  // Worst first. Paste order is how you typed it; this is the order you need
  // to act in, and with forty assets the two are not the same thing.
  //
  // Keyed off `response` rather than a derived array — `response?.items ?? []`
  // is a fresh array on every render, which would make this memo do nothing.
  const checked = useMemo(() => {
    const rows = (response?.items ?? [])
      .filter((i) => i.status === "ok" && i.result)
      .map((i) => ({
        item: i,
        result: i.result as SourceResult,
        verdict: verdictFor((i.result as SourceResult).licence.spdx, usage),
      }));
    return rows.sort((a, b) => RANK[a.verdict.level] - RANK[b.verdict.level]);
  }, [response, usage]);

  const results = checked.map((c) => c.result);

  const byLevel = (level: Level) =>
    checked.filter((c) => c.verdict.level === level).length;

  // Changing the intent re-judges everything, so a filter can end up pinned to
  // a level that is now empty. Resolving that here rather than in an effect
  // means there is never a render showing an empty grid.
  const active = only && byLevel(only) > 0 ? only : null;
  const shown = active
    ? checked.filter((c) => c.verdict.level === active)
    : checked;

  const unkept = checked
    .map((c) => c.result)
    .filter((r) => !savedKeys.has(resultKey(r)));

  /**
   * Signed in this is one round trip per source, which is slow and fine — the
   * alternative is forty clicks. Sequential on purpose: `saveResult` creates
   * the idea on its first call, and running them at once would race to create
   * it several times over.
   */
  async function keepAll() {
    const title = project.trim() || DEFAULT_PROJECT;
    setKeeping(true);
    try {
      for (const r of unkept) {
        if (!user) {
          saveLocal(title, r);
          continue;
        }
        const outcome = await saveResult(title, r);
        if (!outcome.ok) {
          setSaveError(outcome.error ?? "Save failed");
          break;
        }
      }
      await refreshSaved(title);
    } finally {
      setKeeping(false);
    }
  }

  async function onSave(r: SourceResult) {
    const title = project.trim() || DEFAULT_PROJECT;
    if (!user) {
      saveLocal(title, r);
      setSaveError(null);
      await refreshSaved(title);
      return;
    }
    const outcome = await saveResult(title, r);
    setSaveError(outcome.ok ? null : (outcome.error ?? "Save failed"));
    await refreshSaved(title);
  }

  const savedCount = user
    ? savedKeys.size
    : (readIdeas().find((i) => i.query === project.trim())?.results.length ?? 0);

  return (
    <>
      <main
        data-print-hide
        className="mx-auto w-full max-w-5xl px-6 pb-24 pt-16 sm:px-10"
      >
      <h1 className="text-center font-serif text-5xl leading-[1.1] text-ink sm:text-6xl">
        Can you actually
        <br />
        use it?
      </h1>

      <p className="mx-auto mt-6 max-w-xl text-center text-[15px] leading-relaxed text-body">
        Paste the links to the material in your project. Idea Craft reads each
        licence, judges it against what you are doing, and writes the credits
        you owe. No account needed.
      </p>

      {arrived ? (
        <p className="mx-auto mt-8 max-w-2xl rounded-2xl border border-line bg-surface px-6 py-4 text-center text-[13px] leading-relaxed text-body">
          Opened from a shared check. The material and the intent below both
          came from that link &mdash; change either and the answers change with
          it.
        </p>
      ) : null}

      <section className="mx-auto mt-12 max-w-3xl rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <label
          htmlFor="project"
          className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent"
        >
          Project
        </label>
        <input
          id="project"
          type="text"
          value={project}
          onChange={(e) => changeProject(e.target.value)}
          placeholder={DEFAULT_PROJECT}
          className="mt-3 w-full rounded-xl border border-line bg-raised px-4 py-3 text-[15px] text-ink placeholder:text-faint focus:border-accent/70 focus:outline-none"
        />

        <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
          What are you doing with it?
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Toggle
            on={usage.commercial}
            label="Commercial project"
            onClick={() =>
              changeUsage({ ...usage, commercial: !usage.commercial })
            }
          />
          <Toggle
            on={usage.modify}
            label="I will edit or adapt it"
            onClick={() => changeUsage({ ...usage, modify: !usage.modify })}
          />
        </div>
        <p className="mt-3 text-[12px] text-muted">
          Judging everything below as {usageLabel(usage)}.
        </p>

        <label
          htmlFor="paste"
          className="mt-8 block text-[11px] font-medium uppercase tracking-[0.18em] text-accent"
        >
          Your material
        </label>
        <textarea
          id="paste"
          value={paste}
          onChange={(e) => changePaste(e.target.value)}
          rows={8}
          spellCheck={false}
          placeholder={PLACEHOLDER}
          className="mt-3 w-full rounded-xl border border-line bg-raised p-4 font-mono text-[12px] leading-relaxed text-body placeholder:text-faint focus:border-accent/70 focus:outline-none"
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void runCheck(pending, usage)}
            disabled={loading || pending.length === 0}
            className="rounded-full bg-brand px-7 py-3 text-[14px] font-medium text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? "Checking…"
              : pending.length === 0
                ? "Check licences"
                : `Check ${plural(Math.min(pending.length, MAX_LINKS), "link")}`}
          </button>

          <button
            type="button"
            onClick={() => changePaste(EXAMPLE)}
            className="rounded-full border border-line px-5 py-2.5 text-[12px] text-body transition hover:border-accent hover:text-accent"
          >
            Use an example
          </button>

          {paste ? (
            <button
              type="button"
              onClick={() => {
                changePaste("");
                setResponse(null);
              }}
              className="text-[12px] text-muted underline-offset-2 transition hover:text-accent hover:underline"
            >
              Clear
            </button>
          ) : null}

          <span className="ml-auto text-[12px] text-faint">
            {pending.length === 0
              ? "No links found yet"
              : `${plural(pending.length, "link")} found`}
            {pending.length > MAX_LINKS
              ? ` · only the first ${MAX_LINKS} are checked`
              : ""}
          </span>
        </div>

        {/* Saying nothing here would drop the tail of a long paste without
            anyone noticing, which is the one thing this tool must not do. */}
        {paste.length > MAX_TEXT ? (
          <p className="mt-3 text-[12px] leading-relaxed text-accent">
            That is longer than {MAX_TEXT.toLocaleString()} characters. Only
            the links in the first {MAX_TEXT.toLocaleString()} are read &mdash;
            split the rest into a second check.
          </p>
        ) : null}
      </section>

      {failed ? (
        <p className="mx-auto mt-6 max-w-3xl rounded-2xl border border-accent/40 bg-brand/10 px-6 py-3 text-center text-[13px] text-accent">
          The check did not complete. Nothing is known about these links — try
          again.
        </p>
      ) : null}

      {response ? (
        <>
          <p className="mx-auto mt-10 max-w-3xl text-center text-[12px] text-faint">
            {plural(response.found, "link")} in ·{" "}
            {plural(checked.length, "source")} read
            {unread.length > 0 ? ` · ${unread.length} not read` : ""}
            {response.deduped > 0
              ? ` · ${plural(response.deduped, "duplicate")} collapsed`
              : ""}
            {response.ignored > 0
              ? ` · ${plural(response.ignored, "licence link")} ignored`
              : ""}
            {response.dropped > 0
              ? ` · ${response.dropped} past the ${MAX_LINKS}-link limit`
              : ""}
            {response.ms !== null ? ` · ${response.ms}ms` : ""}
          </p>

          {checked_.length > 0 ? (
            <p className="mt-4 flex flex-wrap items-center justify-center gap-3 text-[12px] text-muted">
              <button
                type="button"
                onClick={() => void copyLink()}
                className="rounded-full border border-line px-5 py-2 text-[12px] text-body transition hover:border-accent hover:text-accent"
              >
                {copied ? "Link copied" : "Copy link to this check"}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-full border border-line px-5 py-2 text-[12px] text-body transition hover:border-accent hover:text-accent"
              >
                Export PDF
              </button>
              The link reopens this check; the PDF is the report to hand over.
            </p>
          ) : null}

          {results.length > 0 ? (
            <div className="mx-auto max-w-3xl">
              <CompliancePanel
                title={project.trim() || DEFAULT_PROJECT}
                results={results}
                usage={usage}
                onUsageChange={changeUsage}
                hideUsage
              />
            </div>
          ) : null}

          {unread.length > 0 ? (
            <section className="mx-auto mt-10 max-w-3xl rounded-2xl border border-line bg-surface p-6">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
                Not checked &middot; {unread.length}
              </p>
              <p className="mt-3 text-[13px] leading-relaxed text-body">
                These are missing from the counts above and from your credits.
                We would rather leave a gap than fill it with a guess.
              </p>
              <ul className="mt-5 flex flex-col gap-4">
                {unread.map((item) => (
                  <Unread key={item.input} item={item} />
                ))}
              </ul>
            </section>
          ) : null}

          {saveError ? (
            <p className="mx-auto mt-6 max-w-3xl rounded-2xl border border-accent/40 bg-brand/10 px-6 py-3 text-center text-[13px] text-accent">
              Could not save: {saveError}
            </p>
          ) : null}

          {results.length > 0 ? (
            <>
              <div className="mt-12 flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-serif text-2xl text-ink">
                  {plural(results.length, "source")} checked
                </h2>
                {savedCount > 0 ? (
                  <Link
                    href="/my-ideas"
                    className="text-[12px] text-accent underline-offset-2 hover:underline"
                  >
                    {savedCount} kept in &ldquo;{project.trim()}&rdquo; &rarr;
                  </Link>
                ) : (
                  <span className="text-[12px] text-muted">
                    Keep any of these and they become a project you can reopen.
                  </span>
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <Chip on={active === null} onClick={() => setOnly(null)}>
                  Everything {checked.length}
                </Chip>
                {LEVELS.map(({ level, label }) => {
                  const n = byLevel(level);
                  if (n === 0) return null;
                  return (
                    <Chip
                      key={level}
                      on={active === level}
                      onClick={() => setOnly(active === level ? null : level)}
                    >
                      {label} {n}
                    </Chip>
                  );
                })}
                <span className="text-[12px] text-faint">Worst first.</span>

                {unkept.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => void keepAll()}
                    disabled={keeping}
                    className="ml-auto rounded-full border border-line px-5 py-2 text-[12px] text-body transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {keeping
                      ? "Keeping…"
                      : `Keep all ${unkept.length}`}
                  </button>
                ) : null}
              </div>

              <ul className="mt-6 grid gap-5 sm:grid-cols-2">
                {shown.map(({ item, result: r, verdict }) => {
                  const saved = savedKeys.has(resultKey(r));
                  return (
                    <ResultCard
                      key={item.input}
                      result={r}
                      verdict={verdict}
                      action={
                        <div className="flex items-center gap-2">
                          {/* A source you cannot use is the only kind that
                              needs anything from you, and what it needs is a
                              different source. This is what search is for. */}
                          {verdict.level === "blocked" ||
                          verdict.level === "verify" ? (
                            <Link
                              href={`/search?q=${encodeURIComponent(
                                r.title,
                              )}&category=${categoryOf(r).toLowerCase()}`}
                              className="rounded-full border border-line px-4 py-1.5 text-[11px] font-medium text-muted transition hover:border-accent hover:text-accent"
                            >
                              Find a replacement &rarr;
                            </Link>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => onSave(r)}
                            disabled={saved}
                            className={`rounded-full border px-4 py-1.5 text-[11px] font-medium transition ${
                              saved
                                ? "cursor-default border-accent/40 bg-brand/10 text-accent"
                                : "border-line-strong bg-raised text-body hover:border-accent hover:text-accent"
                            }`}
                          >
                            {saved ? "Kept" : "Keep"}
                          </button>
                        </div>
                      }
                    />
                  );
                })}
              </ul>
            </>
          ) : null}
        </>
      ) : null}

      <section className="mt-24 rounded-2xl border border-line bg-surface p-8 text-center">
        <h2 className="font-serif text-2xl text-ink">Need more material?</h2>
        <p className="mx-auto mt-3 max-w-lg text-[13px] leading-relaxed text-body">
          Search four open archives at once &mdash; research papers, images and
          public-domain writing &mdash; and every result arrives with its
          licence already judged against the same two questions.
        </p>
        <Link
          href="/search"
          className="mt-6 inline-block rounded-full bg-brand px-8 py-3 text-[14px] font-medium text-white transition hover:bg-brand-hover"
        >
          Search open sources &rarr;
        </Link>
      </section>

      <p className="mx-auto mt-10 max-w-2xl text-center text-[11px] leading-relaxed text-faint">
        Idea Craft reads Wikimedia Commons, Openverse, OpenAlex (or any DOI) and
        Project Gutenberg. Licence tags and attribution lines are reproduced as
        each source published them. This is a compliance aid, not legal advice.
      </p>
      </main>

      {results.length > 0 ? (
        <PrintSheet
          title={project.trim() || DEFAULT_PROJECT}
          results={results}
          usage={usage}
        />
      ) : null}
    </>
  );
}

/** A link that produced no verdict, and the honest reason why. */
function Unread({ item }: { item: CheckItem }) {
  const LABEL: Record<string, string> = {
    unsupported: "Not a source we read",
    notfound: "No record",
    unreachable: "Source did not answer",
    invalid: "Not a link",
  };

  return (
    <li className="rounded-xl border border-line bg-raised px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-line-strong px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-body">
          {LABEL[item.status] ?? item.status}
        </span>
        {item.sourceLabel ? (
          <span className="text-[11px] uppercase tracking-[0.14em] text-accent">
            {item.sourceLabel}
          </span>
        ) : null}
      </div>

      <p className="mt-2 break-all font-mono text-[11px] text-soft">
        {item.input}
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-body">
        {item.reason}
      </p>
    </li>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-4 py-1.5 text-[12px] transition ${
        on
          ? "border-ink bg-ink text-page"
          : "border-line text-body hover:border-ink"
      }`}
    >
      {children}
    </button>
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
