"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ResultCard, {
  CATEGORY_LABELS,
  categoryOf,
} from "../_components/ResultCard";
import PrintSheet from "../_components/PrintSheet";
import MembersPanel from "../_components/MembersPanel";
import IdeaSearch from "../_components/IdeaSearch";
import CompliancePanel from "../_components/CompliancePanel";
import { verdictFor, type Usage } from "@/lib/licence-rules";
import {
  listIdeas,
  removeIdea,
  removeResult,
  resultKey,
  setIdeaUsage,
  type Idea,
} from "../_lib/ideas-db";
import { useAuth } from "../_components/AuthProvider";
import {
  readIdeas as readLocalIdeas,
  removeIdea as removeLocalIdea,
  removeResult as removeLocalResult,
} from "../_lib/ideas";
import { readUsage, writeUsage } from "../_lib/usage";

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

/** Stands in for owner_id on projects that only exist in this browser. */
const LOCAL_OWNER = "local";

/** Marks a project someone else owns and shared with you. */
function SharedBadge() {
  return (
    <span className="rounded-full border border-accent/40 bg-brand/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-accent">
      Shared
    </span>
  );
}

export default function MyIdeas() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [ready, setReady] = useState(false);

  const { user, loading: authLoading, configured, imported } = useAuth();

  /**
   * Signed out, picks live in this browser — the licence check never needed
   * an account, so neither does looking at what it found. The local store has
   * no owner and no per-idea usage, so those are filled in from the one place
   * a signed-out person can set them: the shared usage preference.
   */
  const localIdeas = useCallback((): Idea[] => {
    const usage = readUsage();
    return readLocalIdeas().map((i) => ({
      id: i.id,
      ownerId: LOCAL_OWNER,
      query: i.query,
      savedAt: i.savedAt,
      usage,
      results: i.results,
    }));
  }, []);

  const reload = useCallback(async () => {
    setIdeas(user ? await listIdeas() : localIdeas());
    setReady(true);
  }, [user, localIdeas]);

  // Ideas live in the database now, so the list arrives after mount — and
  // again after the first sign-in import finishes.
  useEffect(() => {
    if (authLoading) return;
    void reload();
  }, [authLoading, reload, imported]);

  async function onRemoveResult(ideaId: string, key: string) {
    if (!user) {
      removeLocalResult(ideaId, key);
    } else {
      await removeResult(ideaId, key);
    }
    const next = user ? await listIdeas() : localIdeas();
    setIdeas(next);
    if (!next.some((i) => i.id === ideaId)) setOpenId(null);
  }

  // Optimistic: the panel recomputes every verdict from this, and waiting a
  // round trip to redraw a toggle feels broken.
  async function onUsageChange(ideaId: string, usage: Usage) {
    // Signed out there is nowhere per-idea to put this, so it moves the one
    // shared preference — and every idea on screen with it.
    if (!user) {
      writeUsage(usage);
      setIdeas((prev) => prev.map((i) => ({ ...i, usage })));
      return;
    }
    setIdeas((prev) =>
      prev.map((i) => (i.id === ideaId ? { ...i, usage } : i)),
    );
    if (!(await setIdeaUsage(ideaId, usage))) setIdeas(await listIdeas());
  }

  async function onRemoveIdea(ideaId: string) {
    if (!user) {
      removeLocalIdea(ideaId);
      setIdeas(localIdeas());
    } else {
      await removeIdea(ideaId);
      setIdeas(await listIdeas());
    }
    if (openId === ideaId) setOpenId(null);
  }

  // Deep link from the search page's "Open project" — the list arrives after
  // mount, so this just parks the id and `open` resolves once it lands.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("idea");
    if (id) setOpenId(id);
  }, []);

  // Closing an idea, or switching to another one, puts the invite form away.
  useEffect(() => {
    setInviteOpen(false);
  }, [openId]);

  const open = ideas.find((i) => i.id === openId) ?? null;
  // A local idea is yours by definition — it is in your browser.
  const ownsOpen = Boolean(
    open && (user ? open.ownerId === user.id : open.ownerId === LOCAL_OWNER),
  );

  return (
    <>
      <main
        data-print-hide
        className="mx-auto w-full max-w-5xl px-6 pb-24 pt-16 sm:px-10"
      >
        <div className="flex justify-center">
          <span className="rounded-full border border-line px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
            My Projects
          </span>
        </div>

        <h1 className="mt-10 text-center font-serif text-5xl leading-[1.08] text-ink sm:text-6xl">
          Everything <em className="italic text-accent">you are using.</em>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-center text-[15px] leading-relaxed text-body">
          Every source you keep lands in a project, with the licence verdicts
          and the credits that go with it. Open one to see what is inside.
        </p>

        {imported ? (
          <p className="mx-auto mt-8 max-w-xl rounded-2xl border border-accent/40 bg-brand/10 px-6 py-4 text-center text-[13px] text-accent">
            Moved {imported.results} saved result
            {imported.results === 1 ? "" : "s"} from this browser into your
            account.
          </p>
        ) : null}

        {!authLoading && ready && !user && ideas.length > 0 ? (
          <p className="mx-auto mt-8 max-w-xl rounded-2xl border border-line bg-surface px-6 py-4 text-center text-[13px] leading-relaxed text-body">
            These projects are kept in this browser only.{" "}
            {configured ? (
              <>
                <Link
                  href="/login"
                  className="text-accent underline-offset-2 hover:underline"
                >
                  Sign in
                </Link>{" "}
                and they move into your account &mdash; nothing here is lost.
              </>
            ) : (
              "Clearing site data clears them."
            )}
          </p>
        ) : null}

        {authLoading || !ready ? null : ideas.length === 0 ? (
          <div className="mt-16 text-center">
            <p className="text-[15px] text-muted">
              {user
                ? "No projects yet."
                : "Nothing kept in this browser yet."}
            </p>
            <Link
              href="/"
              className="mt-6 inline-block rounded-full bg-brand px-9 py-4 text-[15px] font-medium text-white transition hover:bg-brand-hover"
            >
              Check your material &rarr;
            </Link>
            {!user ? (
              <p className="mt-6 text-[13px] text-muted">
                {configured ? (
                  <>
                    Already kept some elsewhere?{" "}
                    <Link
                      href="/login"
                      className="text-accent underline-offset-2 hover:underline"
                    >
                      Sign in
                    </Link>
                    .
                  </>
                ) : (
                  "Sign-in is unavailable: this deployment has no Supabase keys set."
                )}
              </p>
            ) : null}
          </div>
        ) : open ? (
          <section className="mt-14">
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="rounded-full border border-line px-5 py-2 text-[13px] text-body transition hover:border-accent hover:text-accent"
              >
                &larr; All projects
              </button>
              <h2 className="font-serif text-2xl text-ink">
                &ldquo;{open.query}&rdquo;
              </h2>
              <span className="text-[12px] text-muted">
                {open.results.length} saved &middot; {when(open.savedAt)}
              </span>
              {ownsOpen ? null : <SharedBadge />}

              <div className="ml-auto" />

              {user && ownsOpen ? (
                <button
                  type="button"
                  onClick={() => setInviteOpen((v) => !v)}
                  className="rounded-full border border-line px-5 py-2 text-[13px] text-body transition hover:border-accent hover:text-accent"
                >
                  Invite
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-full bg-brand px-5 py-2 text-[13px] font-medium text-white transition hover:bg-brand-hover"
              >
                Export PDF
              </button>
              {ownsOpen ? (
                <button
                  type="button"
                  onClick={() => onRemoveIdea(open.id)}
                  className="rounded-full border border-line px-5 py-2 text-[13px] text-muted transition hover:border-accent hover:text-accent"
                >
                  Delete project
                </button>
              ) : null}
            </div>

            {/* Sharing is a database idea. A local one has nobody to share
                with, and the panel's queries need a signed-in session. */}
            {user ? (
              <MembersPanel
                ideaId={open.id}
                isOwner={ownsOpen}
                currentUserId={user.id}
                inviteOpen={inviteOpen}
                onCloseInvite={() => setInviteOpen(false)}
              />
            ) : null}

            <CompliancePanel
              title={open.query}
              results={open.results}
              usage={open.usage}
              onUsageChange={(u) => void onUsageChange(open.id, u)}
            />

            {/* Keyed so switching ideas clears the query and its results.
                Adding writes a pin row, so this is signed-in only. */}
            {user ? (
              <IdeaSearch
                key={open.id}
                ideaId={open.id}
                savedKeys={new Set(open.results.map(resultKey))}
                onAdded={reload}
              />
            ) : null}

            {CATEGORY_LABELS.map((label) => {
              const group = open.results.filter((r) => categoryOf(r) === label);
              if (group.length === 0) return null;
              return (
                <div key={label} className="mt-12">
                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
                    {label} &middot; {group.length}
                  </p>
                  <ul className="mt-6 grid gap-5 sm:grid-cols-2">
                    {group.map((r) => (
                      <ResultCard
                        key={resultKey(r)}
                        result={r}
                        verdict={verdictFor(r.licence.spdx, open.usage)}
                        action={
                          <button
                            type="button"
                            onClick={() =>
                              onRemoveResult(open.id, resultKey(r))
                            }
                            className="rounded-full border border-line px-4 py-1.5 text-[11px] font-medium text-muted transition hover:border-accent hover:text-accent"
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
                  className="flex flex-col rounded-2xl border border-line bg-surface p-6 transition hover:border-accent"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full border border-line px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-accent">
                      {idea.results.length} saved
                    </span>
                    <span className="text-[12px] text-muted">
                      {when(idea.savedAt)}
                    </span>
                  </div>

                  {user && idea.ownerId !== user.id ? (
                    <div className="mt-3">
                      <SharedBadge />
                    </div>
                  ) : null}

                  <h2 className="mt-4 font-serif text-xl leading-snug text-ink">
                    {idea.query}
                  </h2>

                  <p className="mt-2 text-[13px] text-body">
                    {counts.map((c) => `${c.label} ${c.n}`).join("  ·  ")}
                  </p>

                  <div className="mt-6 flex items-center gap-2 border-t border-line pt-4">
                    <button
                      type="button"
                      onClick={() => setOpenId(idea.id)}
                      className="rounded-full bg-brand px-5 py-2 text-[12px] font-medium text-white transition hover:bg-brand-hover"
                    >
                      Open
                    </button>
                    {user && idea.ownerId === user.id ? (
                      <button
                        type="button"
                        onClick={() => onRemoveIdea(idea.id)}
                        className="ml-auto rounded-full border border-line px-5 py-2 text-[12px] text-muted transition hover:border-accent hover:text-accent"
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      {open ? (
        <PrintSheet
          title={open.query}
          results={open.results}
          usage={open.usage}
          savedAt={open.savedAt}
        />
      ) : null}
    </>
  );
}
