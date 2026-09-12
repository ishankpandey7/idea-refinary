"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ResultCard, {
  CATEGORY_LABELS,
  categoryOf,
} from "../_components/ResultCard";
import PrintSheet from "../_components/PrintSheet";
import {
  readIdeas,
  removeIdea,
  removeResult,
  resultKey,
  type Idea,
} from "../_lib/ideas";

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

export default function MyIdeas() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // localStorage is only available after mount, so read it there to keep the
  // server-rendered markup and the first client render in agreement.
  useEffect(() => {
    setIdeas(readIdeas());
    setReady(true);
  }, []);

  function onRemoveResult(ideaId: string, key: string) {
    const next = removeResult(ideaId, key);
    setIdeas(next);
    if (!next.some((i) => i.id === ideaId)) setOpenId(null);
  }

  function onRemoveIdea(ideaId: string) {
    setIdeas(removeIdea(ideaId));
    if (openId === ideaId) setOpenId(null);
  }

  const open = ideas.find((i) => i.id === openId) ?? null;

  return (
    <>
      <main
        data-print-hide
        className="mx-auto w-full max-w-5xl px-6 pb-24 pt-16 sm:px-10"
      >
        <div className="flex justify-center">
          <span className="rounded-full border border-[#3a1f14] px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[#e8451f]">
            My Ideas
          </span>
        </div>

        <h1 className="mt-10 text-center font-serif text-5xl leading-[1.08] text-[#f5a962] sm:text-6xl">
          Streams of <em className="italic text-[#ff7a3d]">thought.</em>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-center text-[15px] leading-relaxed text-[#b39c8c]">
          Every search you save becomes an idea. Open one to see what you kept.
        </p>

        {!ready ? null : ideas.length === 0 ? (
          <div className="mt-16 text-center">
            <p className="text-[15px] text-[#7a6558]">Nothing saved yet.</p>
            <Link
              href="/"
              className="mt-6 inline-block rounded-full bg-[#e8451f] px-9 py-4 text-[15px] font-medium text-white transition hover:bg-[#ff5a2e]"
            >
              Start a search &rarr;
            </Link>
          </div>
        ) : open ? (
          <section className="mt-14">
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="rounded-full border border-[#3a1f14] px-5 py-2 text-[13px] text-[#b39c8c] transition hover:border-[#e8451f]/60 hover:text-[#ff9c6b]"
              >
                &larr; All ideas
              </button>
              <h2 className="font-serif text-2xl text-[#f5a962]">
                &ldquo;{open.query}&rdquo;
              </h2>
              <span className="text-[12px] text-[#7a6558]">
                {open.results.length} saved &middot; {when(open.savedAt)}
              </span>
              <button
                type="button"
                onClick={() => window.print()}
                className="ml-auto rounded-full bg-[#e8451f] px-5 py-2 text-[13px] font-medium text-white transition hover:bg-[#ff5a2e]"
              >
                Export PDF
              </button>
              <button
                type="button"
                onClick={() => onRemoveIdea(open.id)}
                className="rounded-full border border-[#3a1f14] px-5 py-2 text-[13px] text-[#7a6558] transition hover:border-[#e8451f] hover:text-[#ff9c6b]"
              >
                Delete idea
              </button>
            </div>

            {CATEGORY_LABELS.map((label) => {
              const group = open.results.filter((r) => categoryOf(r) === label);
              if (group.length === 0) return null;
              return (
                <div key={label} className="mt-12">
                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#e8451f]">
                    {label} &middot; {group.length}
                  </p>
                  <ul className="mt-6 grid gap-5 sm:grid-cols-2">
                    {group.map((r) => (
                      <ResultCard
                        key={resultKey(r)}
                        result={r}
                        action={
                          <button
                            type="button"
                            onClick={() =>
                              onRemoveResult(open.id, resultKey(r))
                            }
                            className="rounded-full border border-[#3a1f14] px-4 py-1.5 text-[11px] font-medium text-[#7a6558] transition hover:border-[#e8451f] hover:text-[#ff9c6b]"
                          >
                            Remove
                          </button>
                        }
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        ) : (
          <ul className="mt-14 grid gap-5 sm:grid-cols-2">
            {ideas.map((idea) => {
              const counts = CATEGORY_LABELS.map((label) => ({
                label,
                n: idea.results.filter((r) => categoryOf(r) === label).length,
              })).filter((c) => c.n > 0);

              return (
                <li
                  key={idea.id}
                  className="flex flex-col rounded-2xl border border-[#3a1f14] bg-[#100a07]/70 p-6 transition hover:border-[#e8451f]/60"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full border border-[#3a1f14] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-[#e8451f]">
                      {idea.results.length} saved
                    </span>
                    <span className="text-[12px] text-[#7a6558]">
                      {when(idea.savedAt)}
                    </span>
                  </div>

                  <h2 className="mt-4 font-serif text-xl leading-snug text-[#f5a962]">
                    {idea.query}
                  </h2>

                  <p className="mt-2 text-[13px] text-[#b39c8c]">
                    {counts.map((c) => `${c.label} ${c.n}`).join("  ·  ")}
                  </p>

                  <div className="mt-6 flex items-center gap-2 border-t border-[#3a1f14]/60 pt-4">
                    <button
                      type="button"
                      onClick={() => setOpenId(idea.id)}
                      className="rounded-full bg-[#e8451f] px-5 py-2 text-[12px] font-medium text-white transition hover:bg-[#ff5a2e]"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveIdea(idea.id)}
                      className="ml-auto rounded-full border border-[#3a1f14] px-5 py-2 text-[12px] text-[#7a6558] transition hover:border-[#e8451f] hover:text-[#ff9c6b]"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      {open ? <PrintSheet idea={open} /> : null}
    </>
  );
}
