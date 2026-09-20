"use client";

import { useState } from "react";
import {
  CUSTOM_ID,
  LICENCES,
  MEDIA_CHOICES,
  pickFor,
  suggestAttribution,
  toResult,
  verdictForResult,
  type Asserted,
} from "@/lib/asserted";
import { t, type Terms, type Usage } from "@/lib/licence-rules";
import { normaliseUrl } from "@/lib/links";
import type { MediaType } from "@/types/source-result";

/**
 * Describing one thing Idea Craft cannot read.
 *
 * The form answers a question the four sources never could, so it has to be
 * worth trusting: the verdict is shown live, before anything is saved, and
 * the credit line is only ever suggested — whatever is left in the box is
 * what gets stored, word for word.
 */

/** Conservative on purpose: permissions are ticked on, never assumed. */
const CUSTOM_START: Terms = t(false, false, true, false);

const GROUPS = LICENCES.reduce<string[]>((acc, l) => {
  if (!acc.includes(l.group)) acc.push(l.group);
  return acc;
}, []);

const VERDICT_TONE = {
  clear: "bg-ok-bg text-ok-fg",
  caution: "bg-warn-bg text-warn-fg",
  verify: "bg-warn-bg text-warn-fg",
  blocked: "bg-stop-bg text-stop-fg",
};

export default function AssetForm({
  initial,
  usage,
  knownUrls,
  editing = false,
  onSave,
  onCancel,
}: {
  initial: Asserted;
  usage: Usage;
  /** Normalised addresses a source already answered for. */
  knownUrls: Set<string>;
  editing?: boolean;
  onSave: (asset: Asserted) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Asserted>(initial);
  /** Until the credit line is touched, it follows the title and the creator. */
  const [ownCredit, setOwnCredit] = useState(initial.attribution.length > 0);

  const set = (patch: Partial<Asserted>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const attribution = ownCredit ? draft.attribution : suggestAttribution(draft);
  const asset: Asserted = { ...draft, attribution };

  const pick = pickFor(asset);
  const custom = draft.licenceId === CUSTOM_ID;
  const terms = custom ? (draft.customTerms ?? CUSTOM_START) : pick.terms;

  // Pure and cheap, and `asset` is a fresh object every render anyway, so a
  // memo here would only ever miss.
  const verdict = verdictForResult(toResult(asset), usage);

  const clash =
    draft.url.trim().length > 0 && knownUrls.has(normaliseUrl(draft.url.trim()));

  function setTerm(key: keyof Terms, value: boolean) {
    set({ customTerms: { ...terms, [key]: value, ambiguous: false } });
  }

  function pickLicence(id: string) {
    set({
      licenceId: id,
      customTerms: id === CUSTOM_ID ? (draft.customTerms ?? CUSTOM_START) : undefined,
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(asset);
      }}
      className="rounded-2xl border border-accent/40 bg-raised p-6"
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
        {editing ? "Edit your entry" : "Describe it yourself"}
      </p>
      <p className="mt-3 text-[13px] leading-relaxed text-body">
        Idea Craft cannot read this one, so you are the one saying what its
        licence is. Your answer is judged the same way as everything else, and
        labelled as yours everywhere it appears &mdash; in the credits, in the
        report and in the share link.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="What is it called?">
          <input
            type="text"
            value={draft.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="Inter, Track 3, hero photo…"
            className={INPUT}
          />
        </Field>

        <Field label="Who made it?">
          <input
            type="text"
            value={draft.creator}
            onChange={(e) => set({ creator: e.target.value })}
            placeholder="Rasmus Andersson"
            className={INPUT}
          />
        </Field>

        <Field label="What kind of thing?">
          <select
            value={draft.mediaType}
            onChange={(e) => set({ mediaType: e.target.value as MediaType })}
            className={INPUT}
          >
            {MEDIA_CHOICES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Licence">
          <select
            value={draft.licenceId}
            onChange={(e) => pickLicence(e.target.value)}
            className={INPUT}
          >
            {GROUPS.map((group) => (
              <optgroup key={group} label={group}>
                {LICENCES.filter((l) => l.group === group).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
      </div>

      {custom ? (
        <div className="mt-5 rounded-xl border border-line bg-surface p-4">
          <Field label="What is this licence called?">
            <input
              type="text"
              value={draft.customName ?? ""}
              onChange={(e) => set({ customName: e.target.value })}
              placeholder="Envato Elements, a client contract, a bundle licence…"
              className={INPUT}
            />
          </Field>

          <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
            What does it let you do?
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            Tick only what the licence actually says. Anything left unticked is
            treated as not permitted.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Tick
              on={terms.commercial}
              label="Commercial use allowed"
              onClick={() => setTerm("commercial", !terms.commercial)}
            />
            <Tick
              on={terms.modify}
              label="Editing allowed"
              onClick={() => setTerm("modify", !terms.modify)}
            />
            <Tick
              on={terms.attribution}
              label="Credit required"
              onClick={() => setTerm("attribution", !terms.attribution)}
            />
            <Tick
              on={terms.shareAlike}
              label="Share-alike"
              onClick={() => setTerm("shareAlike", !terms.shareAlike)}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <Field label="Link, if it has one">
          <input
            type="text"
            value={draft.url}
            onChange={(e) => set({ url: e.target.value })}
            placeholder="https://… — leave empty for a file on your machine"
            className={`${INPUT} font-mono text-[12px]`}
          />
        </Field>
        {clash ? (
          <p className="mt-2 text-[12px] leading-relaxed text-accent">
            A source already answered for that link, and its answer is in the
            list below. Adding this puts the same asset in twice &mdash; drop
            the link here, or edit the row that is already there.
          </p>
        ) : null}
      </div>

      <div className="mt-4">
        <Field label="Credit line">
          <textarea
            value={attribution}
            onChange={(e) => {
              setOwnCredit(true);
              set({ attribution: e.target.value });
            }}
            rows={2}
            className={`${INPUT} font-mono text-[12px] leading-relaxed`}
            placeholder="However this asset asks to be credited"
          />
        </Field>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          {ownCredit
            ? "Reproduced exactly as you have written it."
            : "Suggested from the title and the creator. Edit it and yours is used instead, word for word."}
          {terms.attribution && !attribution.trim()
            ? " This licence requires credit, and this line is empty."
            : ""}
        </p>
      </div>

      <div
        className={`mt-6 rounded-xl px-4 py-3 ${VERDICT_TONE[verdict.level]}`}
      >
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em]">
          {verdict.headline}
        </p>
        <ul className="mt-2 flex flex-col gap-1">
          {verdict.notes.map((note) => (
            <li key={note} className="text-[12px] leading-relaxed">
              {note}
            </li>
          ))}
        </ul>
        {pick.url ? (
          <a
            href={pick.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-[11px] underline underline-offset-2"
          >
            Read {pick.name} &#8599;
          </a>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="rounded-full bg-brand px-6 py-2.5 text-[13px] font-medium text-white transition hover:bg-brand-hover"
        >
          {editing ? "Save changes" : "Add to this check"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-[12px] text-muted underline-offset-2 transition hover:text-accent hover:underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

const INPUT =
  "mt-2 w-full rounded-xl border border-line bg-page px-4 py-2.5 text-[14px] text-ink placeholder:text-faint focus:border-accent/70 focus:outline-none";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function Tick({
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
      className={`inline-flex min-h-11 items-center rounded-full border px-4 text-[12px] transition ${
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
