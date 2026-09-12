"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  inviteMember,
  listMembers,
  memberLabel,
  removeMember,
  type Member,
} from "../_lib/members-db";

export default function MembersPanel({
  ideaId,
  isOwner,
  currentUserId,
  inviteOpen,
  onCloseInvite,
}: {
  ideaId: string;
  isOwner: boolean;
  currentUserId: string | null;
  inviteOpen: boolean;
  onCloseInvite: () => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setMembers(await listMembers(ideaId));
  }, [ideaId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // A different idea starts with a clean form.
  useEffect(() => {
    setEmail("");
    setError(null);
    setNotice(null);
  }, [ideaId]);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const address = email.trim();
    const outcome = await inviteMember(ideaId, address);
    setBusy(false);

    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    setNotice(`${address} now has access.`);
    setEmail("");
    await reload();
  }

  async function onRemove(userId: string) {
    setError(null);
    setNotice(null);
    if (!(await removeMember(ideaId, userId))) {
      setError("Could not remove that person.");
      return;
    }
    await reload();
  }

  return (
    <section className="mt-10 rounded-2xl border border-[#3a1f14] bg-[#100a07]/70 p-6">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#e8451f]">
        People &middot; {members.length}
      </p>

      <ul className="mt-5 flex flex-col gap-2">
        {members.map((m) => (
          <li
            key={m.userId}
            className="flex items-center gap-3 border-b border-[#3a1f14]/50 pb-2 last:border-0 last:pb-0"
          >
            <span className="text-[14px] text-[#e8d8cc]">
              {memberLabel(m)}
              {m.userId === currentUserId ? (
                <span className="text-[#7a6558]"> (you)</span>
              ) : null}
            </span>
            <span className="rounded-full border border-[#3a1f14] px-3 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-[#7a6558]">
              {m.role}
            </span>
            {isOwner && m.role !== "owner" ? (
              <button
                type="button"
                onClick={() => onRemove(m.userId)}
                className="ml-auto rounded-full border border-[#3a1f14] px-4 py-1.5 text-[11px] font-medium text-[#7a6558] transition hover:border-[#e8451f] hover:text-[#ff9c6b]"
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {isOwner && inviteOpen ? (
        <form className="mt-6 flex flex-col gap-3" onSubmit={onInvite}>
          <div className="flex items-center gap-3 rounded-full border border-[#3a1f14] bg-[#120b08]/60 px-6 py-3 focus-within:border-[#e8451f]/70">
            <span aria-hidden className="text-[#e8451f]">
              &#9993;
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="they@example.com"
              className="w-full bg-transparent text-[15px] text-[#e8d8cc] placeholder:text-[#7a6558] focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-[#e8451f] px-6 py-2.5 text-[13px] font-medium text-white transition hover:bg-[#ff5a2e] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Adding…" : "Add to idea"}
            </button>
            <button
              type="button"
              onClick={onCloseInvite}
              className="rounded-full border border-[#3a1f14] px-6 py-2.5 text-[13px] text-[#7a6558] transition hover:border-[#e8451f] hover:text-[#ff9c6b]"
            >
              Cancel
            </button>
          </div>
          <p className="text-[12px] leading-relaxed text-[#7a6558]">
            They need an Idea Refinery account already &mdash; this shares the
            idea, it does not send a signup invitation.
          </p>
        </form>
      ) : null}

      {error ? (
        <p className="mt-4 text-[13px] text-[#ff9c6b]">{error}</p>
      ) : null}
      {notice ? (
        <p className="mt-4 text-[13px] text-[#b39c8c]">{notice}</p>
      ) : null}
    </section>
  );
}
