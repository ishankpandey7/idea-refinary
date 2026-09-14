"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { SourceResult } from "@/types/source-result";
import type { CheckItem, CheckResponse } from "@/lib/resolve";
import { extractLinks, MAX_LINKS, MAX_TEXT, normaliseUrl } from "@/lib/links";
import type { Level, Usage } from "@/lib/licence-rules";
import {
  decodeAsserted,
  encodeAsserted,
  MAX_ASSERTED,
  newAsserted,
  toResult,
  verdictForResult,
  type Asserted,
} from "@/lib/asserted";
import ResultCard, { categoryOf } from "./_components/ResultCard";
import AssetForm from "./_components/AssetForm";
import CompliancePanel from "./_components/CompliancePanel";
import PrintSheet from "./_components/PrintSheet";
import { useAuth } from "./_components/AuthProvider";
import { useUsage, usageLabel } from "./_lib/usage";
import { useStored } from "./_lib/stored";
import { mergeIntoCheck, useCheckPaste } from "./_lib/check-paste";
import { resultKey, saveResult, savedKeysFor } from "./_lib/ideas-db";
import { keysFor, saveResult as saveLocal, useLocalIdeas } from "./_lib/ideas";

const PROJECT_KEY = "idea-refinery:check-project";
const ASSERTED_KEY = "idea-refinery:asserted";

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

function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}

/** One row in the list of answers, whoever supplied the answer. */
type Row = {
  key: string;
  result: SourceResult;
  /** Set when the person described this one themselves. */
  asset: Asserted | null;
};

/**
 * The share link is read with useSearchParams, which Next requires a Suspense
 * boundary around. Everything on this page is client state anyway — the shell
 * renders immediately and the check fills in — so an empty fallback costs
 * nothing a reader would notice.
 */
export default function CheckPage() {
  return (
    <Suspense fallback={null}>
      <Check />
    </Suspense>
  );
}

function Check() {
  const params = useSearchParams();

  const [project, setProject] = useStored(PROJECT_KEY, DEFAULT_PROJECT);
  const [paste, setPaste] = useCheckPaste();
  const [usage, setUsage] = useUsage();

  const [response, setResponse] = useState<CheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const [only, setOnly] = useState<Level | null>(null);
  /** The links the current response is about, for rebuilding the share link. */
  const [checked_, setChecked] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const [dbKeys, setDbKeys] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);

  const { user } = useAuth();

  // -------------------------------------------------------------------------
  // The half of the project no source can answer for
  // -------------------------------------------------------------------------

  const [assertedRaw, setAssertedRaw] = useStored(ASSERTED_KEY, "[]");
  const asserted = useMemo(() => decodeAsserted(assertedRaw), [assertedRaw]);

  /** The asset being described, and whether it is already in the list. */
  const [editor, setEditor] = useState<{
    asset: Asserted;
    existing: boolean;
  } | null>(null);

  const setAsserted = useCallback(
    (list: Asserted[]) => setAssertedRaw(encodeAsserted(list)),
    [setAssertedRaw],
  );

  /**
   * The form lives in one fixed place, so opening it from a row forty lines
   * down has to take you there. A tick late, so it exists to scroll to.
   */
  function openForm(asset: Asserted, existing: boolean) {
    setEditor({ asset, existing });
    window.setTimeout(
      () =>
        document
          .getElementById("by-hand")
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      0,
    );
  }

  function describe(url = "") {
    openForm(newAsserted(url), false);
  }

  function saveAsset(next: Asserted) {
    setAsserted(
      asserted.some((a) => a.id === next.id)
        ? asserted.map((a) => (a.id === next.id ? next : a))
        : [...asserted, next].slice(0, MAX_ASSERTED),
    );
    setEditor(null);
  }

  function dropAsset(id: string) {
    setAsserted(asserted.filter((a) => a.id !== id));
    setEditor((e) => (e?.asset.id === id ? null : e));
  }

  // -------------------------------------------------------------------------
  // Arriving on a shared check
  // -------------------------------------------------------------------------

  const sharedLinksParam = params.get("l");
  const sharedAssetsParam = params.get("a");
  const arrived = sharedLinksParam !== null || sharedAssetsParam !== null;

  /**
   * Memoised on the joined links rather than the raw parameter, so that
   * rewriting the address bar with the same links does not hand the effect
   * below a new array and set the whole check running a second time.
   */
  const sharedKey = sharedLinksParam
    ? extractLinks(sharedLinksParam).join("\n")
    : "";
  const sharedLinks = useMemo(
    () => (sharedKey ? sharedKey.split("\n") : []),
    [sharedKey],
  );

  /** The network half, with no state in it, so both callers can share it. */
  const resolve = useCallback(async (links: string[]) => {
    const res = await fetch("/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: links }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as CheckResponse;
  }, []);

  const apply = useCallback((body: CheckResponse, links: string[]) => {
    setResponse(body);
    setChecked(links);
    setFailed(false);
  }, []);

  async function runCheck(links: string[]) {
    if (links.length === 0) return;
    setLoading(true);
    setFailed(false);
    try {
      apply(await resolve(links), links);
    } catch {
      setResponse(null);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  // A share link carries the intent it was judged under, and that has to win
  // over whatever this browser last had — someone who followed one came to
  // see that check, not their own. Written to the shared store rather than
  // held separately, so the toggles and /search agree with it immediately.
  const sharedIntent = useMemo(
    (): Usage => ({
      commercial: params.get("c") === "1",
      modify: params.get("m") === "1",
    }),
    [params],
  );

  /**
   * Seeding runs once. The effect below rewrites the address bar as soon as
   * anything moves, and re-reading our own writing would undo whatever the
   * person had just changed.
   */
  const seeded = useRef(false);

  useEffect(() => {
    if (!arrived || seeded.current) return;
    seeded.current = true;

    setUsage(sharedIntent);
    // Only what the link actually carried, and always added rather than
    // substituted: a link with entries of your own but no material must not
    // empty the box, and a link whose material is a subset of the box must
    // not throw the rest of it away.
    if (sharedLinks.length > 0) mergeIntoCheck(sharedLinks);
    if (sharedAssetsParam !== null) setAssertedRaw(sharedAssetsParam);
  }, [
    arrived,
    sharedLinks,
    sharedAssetsParam,
    sharedIntent,
    setUsage,
    setAssertedRaw,
  ]);

  // Runs the arrival check. Settled in a callback, so nothing is set
  // synchronously here; the spinner comes from `busy` below instead.
  useEffect(() => {
    if (sharedLinks.length === 0) return;
    // The address bar describes whatever check is on screen, including one
    // this page just ran itself — writing the links into it is what makes a
    // check shareable, and without this guard it also asked the four sources
    // the same question a second time, every time.
    if (checked_.join("\n") === sharedLinks.join("\n")) return;

    let active = true;

    void resolve(sharedLinks).then(
      (body) => {
        if (active) apply(body, sharedLinks);
      },
      () => {
        if (active) setFailed(true);
      },
    );

    return () => {
      active = false;
    };
  }, [sharedLinks, checked_, resolve, apply]);

  /**
   * The whole check as one address: the links, the things you described
   * yourself, and the intent all of it was judged against.
   *
   * A check is only worth sending to someone if it carries the question too —
   * the same list under "commercial" and under "personal" are different
   * answers, and a link that dropped the intent would quietly show the reader
   * the wrong one. Derived rather than stored, so the three can never
   * disagree with what is on screen.
   */
  const sharePath = useMemo(() => {
    // Until a check of its own has run, the links this page arrived on are
    // the links it is about. Leaving them out while that first check is still
    // in flight would rewrite them out of the address bar and cancel it.
    const links = checked_.length > 0 ? checked_ : sharedLinks;
    if (links.length === 0 && asserted.length === 0) return null;

    const qs = new URLSearchParams();
    if (usage.commercial) qs.set("c", "1");
    if (usage.modify) qs.set("m", "1");
    if (links.length > 0) qs.set("l", links.join("\n"));
    if (asserted.length > 0) qs.set("a", encodeAsserted(asserted));

    return `/?${qs.toString()}`;
  }, [checked_, sharedLinks, asserted, usage]);

  useEffect(() => {
    if (sharePath) window.history.replaceState(null, "", sharePath);
  }, [sharePath]);

  // The credits file quotes this, so it has to be the whole address. Guarded
  // because the shell prerenders, and there is nothing to share until a check
  // has happened anyway.
  const shareUrl =
    sharePath && typeof window !== "undefined"
      ? `${window.location.origin}${sharePath}`
      : undefined;

  // An old link into the search page still works; this route no longer
  // answers it. Navigation, not state, so it belongs in an effect.
  useEffect(() => {
    if (params.get("q")) {
      window.location.replace(`/search?${params.toString()}`);
    }
  }, [params]);

  // Signed out the answer is already in the store and needs no round trip;
  // signed in it is a query, settled in a callback.
  const localIdeas = useLocalIdeas();

  useEffect(() => {
    const title = project.trim();
    if (!user || !title) return;
    let active = true;

    void savedKeysFor(title).then((keys) => {
      if (active) setDbKeys(keys);
    });

    return () => {
      active = false;
    };
  }, [user, project]);

  const savedKeys = user ? dbKeys : keysFor(localIdeas, project.trim());

  /** True while the arrival check is still in flight, before `loading` owns it. */
  const busy =
    loading || (sharedLinks.length > 0 && response === null && !failed);

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

  const pending = useMemo(() => extractLinks(paste), [paste]);

  /**
   * Links in the box that the answers on screen do not cover yet.
   *
   * Usually these arrived from /search, on the other side of a "find a
   * replacement" — you come back to a page full of verdicts and nothing
   * obvious saying the new one is not among them.
   */
  const unchecked = useMemo(
    () => pending.filter((link) => !checked_.includes(link)),
    [pending, checked_],
  );

  // -------------------------------------------------------------------------
  // One list, however each answer was arrived at
  // -------------------------------------------------------------------------

  /** Addresses a source answered for, so the form can spot a double entry. */
  const knownUrls = useMemo(() => {
    const out = new Set<string>();
    for (const i of response?.items ?? []) {
      if (i.status !== "ok" || !i.result) continue;
      out.add(normaliseUrl(i.input));
      out.add(normaliseUrl(i.result.canonicalUrl));
    }
    return out;
  }, [response]);

  /** A link somebody has since answered for themselves is no longer unread. */
  const assertedUrls = useMemo(
    () =>
      new Set(
        asserted
          .map((a) => a.url.trim())
          .filter(Boolean)
          .map(normaliseUrl),
      ),
    [asserted],
  );

  const unread = useMemo(
    () =>
      (response?.items ?? []).filter(
        (i) => i.status !== "ok" && !assertedUrls.has(normaliseUrl(i.input)),
      ),
    [response, assertedUrls],
  );

  const answered = useMemo(
    () =>
      (response?.items ?? []).filter((i) => i.status !== "ok").length -
      unread.length,
    [response, unread],
  );

  // Worst first. Paste order is how you typed it; this is the order you need
  // to act in, and with forty assets the two are not the same thing.
  //
  // Keyed off `response` rather than a derived array — `response?.items ?? []`
  // is a fresh array on every render, which would make this memo do nothing.
  const rows = useMemo((): Row[] => {
    const read: Row[] = (response?.items ?? [])
      .filter((i) => i.status === "ok" && i.result)
      .map((i) => ({
        key: i.input,
        result: i.result as SourceResult,
        asset: null,
      }));

    const mine: Row[] = asserted.map((a) => ({
      key: `you:${a.id}`,
      result: toResult(a),
      asset: a,
    }));

    return [...read, ...mine];
  }, [response, asserted]);

  const checked = useMemo(
    () =>
      rows
        .map((row) => ({ ...row, verdict: verdictForResult(row.result, usage) }))
        .sort((a, b) => RANK[a.verdict.level] - RANK[b.verdict.level]),
    [rows, usage],
  );

  const results = useMemo(() => checked.map((c) => c.result), [checked]);

  const byLevel = (level: Level) =>
    checked.filter((c) => c.verdict.level === level).length;

  // Changing the intent re-judges everything, so a filter can end up pinned to
  // a level that is now empty. Resolving that here rather than in an effect
  // means there is never a render showing an empty grid.
  const active = only && byLevel(only) > 0 ? only : null;
  const shown = active
    ? checked.filter((c) => c.verdict.level === active)
    : checked;

  const unkept = results.filter((r) => !savedKeys.has(resultKey(r)));

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
      if (user) setDbKeys(await savedKeysFor(title));
    } finally {
      setKeeping(false);
    }
  }

  async function onSave(r: SourceResult) {
    const title = project.trim() || DEFAULT_PROJECT;
    if (!user) {
      // The store notifies, so the card, the count and /my-ideas all redraw.
      saveLocal(title, r);
      setSaveError(null);
      return;
    }
    const outcome = await saveResult(title, r);
    setSaveError(outcome.ok ? null : (outcome.error ?? "Save failed"));
    setDbKeys(await savedKeysFor(title));
  }

  const savedCount = savedKeys.size;
  const full = asserted.length >= MAX_ASSERTED;

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
          {/* True of a link someone sent you and of a reload of your own
              work, because since hand entries there is no difference: the
              address bar is where a check lives. */}
          Everything below came from the address bar &mdash; the material, and
          the intent it was judged under. Change either and the answers change
          with it; copy the link to hand someone else the same check.
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
          onChange={(e) => setProject(e.target.value)}
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
            onClick={() => setUsage({ ...usage, commercial: !usage.commercial })}
          />
          <Toggle
            on={usage.modify}
            label="I will edit or adapt it"
            onClick={() => setUsage({ ...usage, modify: !usage.modify })}
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
          onChange={(e) => setPaste(e.target.value)}
          rows={8}
          spellCheck={false}
          placeholder={PLACEHOLDER}
          className="mt-3 w-full rounded-xl border border-line bg-raised p-4 font-mono text-[12px] leading-relaxed text-body placeholder:text-faint focus:border-accent/70 focus:outline-none"
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void runCheck(pending)}
            disabled={busy || pending.length === 0}
            className="rounded-full bg-brand px-7 py-3 text-[14px] font-medium text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy
              ? "Checking…"
              : pending.length === 0
                ? "Check licences"
                : `Check ${plural(Math.min(pending.length, MAX_LINKS), "link")}`}
          </button>

          <button
            type="button"
            onClick={() => setPaste(EXAMPLE)}
            className="rounded-full border border-line px-5 py-2.5 text-[12px] text-body transition hover:border-accent hover:text-accent"
          >
            Use an example
          </button>

          {paste ? (
            <button
              type="button"
              onClick={() => {
                setPaste("");
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

        {response && unchecked.length > 0 ? (
          <p className="mt-3 text-[12px] leading-relaxed text-accent">
            {plural(unchecked.length, "link")} in the box{" "}
            {unchecked.length === 1 ? "is" : "are"} not in the answers below
            yet &mdash; check again to judge {unchecked.length === 1 ? "it" : "them"}.
          </p>
        ) : null}

        {/* Saying nothing here would drop the tail of a long paste without
            anyone noticing, which is the one thing this tool must not do. */}
        {paste.length > MAX_TEXT ? (
          <p className="mt-3 text-[12px] leading-relaxed text-accent">
            That is longer than {MAX_TEXT.toLocaleString()} characters. Only
            the links in the first {MAX_TEXT.toLocaleString()} are read &mdash;
            split the rest into a second check.
          </p>
        ) : null}

        {/* The four sources cover a slice of a real project. Everything else
            — the typeface, the music, the icon set, the stock photo — has to
            come from the person, or the report is a report about a fifth of
            their work. */}
        <div className="mt-6 border-t border-line pt-5">
          <p className="text-[13px] leading-relaxed text-body">
            Using a font, a music track, an icon set, a stock photo? Idea Craft
            cannot read those, but you can tell it what their licence is and
            they go into the same verdicts, credits and report &mdash; marked
            as yours.
          </p>
          <button
            type="button"
            onClick={() => describe()}
            disabled={full}
            className="mt-4 rounded-full border border-line-strong bg-raised px-5 py-2.5 text-[13px] text-body transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            + Add something by hand
          </button>
          {asserted.length > 0 ? (
            <span className="ml-3 text-[12px] text-faint">
              {plural(asserted.length, "entry", "entries")} of your own
            </span>
          ) : null}
          {full ? (
            <p className="mt-3 text-[12px] text-accent">
              That is {MAX_ASSERTED} entries of your own, which is the limit for
              one check. Split the project in two.
            </p>
          ) : null}
        </div>
      </section>

      <div id="by-hand" className="mx-auto mt-8 max-w-3xl scroll-mt-24">
        {editor ? (
          <AssetForm
            key={editor.asset.id}
            initial={editor.asset}
            usage={usage}
            knownUrls={knownUrls}
            editing={editor.existing}
            onSave={saveAsset}
            onCancel={() => setEditor(null)}
          />
        ) : null}
      </div>

      {failed ? (
        <p className="mx-auto mt-6 max-w-3xl rounded-2xl border border-accent/40 bg-brand/10 px-6 py-3 text-center text-[13px] text-accent">
          The check did not complete. Nothing is known about these links — try
          again.
        </p>
      ) : null}

      {response ? (
        <p className="mx-auto mt-10 max-w-3xl text-center text-[12px] text-faint">
          {plural(response.found, "link")} in ·{" "}
          {plural(rows.filter((r) => !r.asset).length, "source")} read
          {unread.length > 0 ? ` · ${unread.length} not read` : ""}
          {answered > 0 ? ` · ${answered} answered by you` : ""}
          {response.deduped > 0
            ? ` · ${plural(response.deduped, "duplicate")} collapsed`
            : ""}
          {/* Licence deeds, and the link home an exported credits file ends
              with. References to material, never material. */}
          {response.ignored > 0
            ? ` · ${plural(response.ignored, "reference link")} ignored`
            : ""}
          {response.dropped > 0
            ? ` · ${response.dropped} past the ${MAX_LINKS}-link limit`
            : ""}
          {response.ms !== null ? ` · ${response.ms}ms` : ""}
        </p>
      ) : null}

      {sharePath ? (
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
            onUsageChange={setUsage}
            hideUsage
            shareUrl={shareUrl}
          />
        </div>
      ) : null}

      {unread.length > 0 ? (
        <section className="mx-auto mt-10 max-w-3xl rounded-2xl border border-line bg-surface p-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
            Not checked &middot; {unread.length}
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-body">
            These are missing from the counts above and from your credits. We
            would rather leave a gap than fill it with a guess &mdash; but if
            you know what the licence is, say so and the gap closes.
          </p>
          <ul className="mt-5 flex flex-col gap-4">
            {unread.map((item) => (
              <Unread
                key={item.input}
                item={item}
                onDescribe={() => describe(item.input)}
                disabled={full}
              />
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
                {keeping ? "Keeping…" : `Keep all ${unkept.length}`}
              </button>
            ) : null}
          </div>

          <ul className="mt-6 grid gap-5 sm:grid-cols-2">
            {shown.map(({ key, result: r, verdict, asset }) => {
              const saved = savedKeys.has(resultKey(r));
              return (
                <ResultCard
                  key={key}
                  result={r}
                  verdict={verdict}
                  action={
                    <div className="flex items-center gap-2">
                      {asset ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openForm(asset, true)}
                            className="rounded-full border border-line px-4 py-1.5 text-[11px] font-medium text-muted transition hover:border-accent hover:text-accent"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => dropAsset(asset.id)}
                            className="rounded-full border border-line px-4 py-1.5 text-[11px] font-medium text-muted transition hover:border-accent hover:text-accent"
                          >
                            Remove
                          </button>
                        </>
                      ) : verdict.level === "blocked" ||
                        verdict.level === "verify" ? (
                        // A source you cannot use is the only kind that needs
                        // anything from you, and what it needs is a different
                        // source. This is what search is for.
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
        each source published them; anything you added by hand is reproduced as
        you stated it, and labelled that way. This is a compliance aid, not
        legal advice.
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

/** A link that produced no verdict, the honest reason why, and a way out. */
function Unread({
  item,
  onDescribe,
  disabled,
}: {
  item: CheckItem;
  onDescribe: () => void;
  disabled: boolean;
}) {
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

      {/* Not offered for "not a link": there is nothing there to describe. */}
      {item.status === "invalid" ? null : (
        <button
          type="button"
          onClick={onDescribe}
          disabled={disabled}
          className="mt-3 rounded-full border border-line-strong px-4 py-1.5 text-[11px] font-medium text-body transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          I know this licence &rarr;
        </button>
      )}
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
