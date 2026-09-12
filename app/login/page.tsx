"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { useAuth } from "../_components/AuthProvider";

export default function Login() {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;

    setSending(true);
    setError(null);
    try {
      const { error } = await getSupabase().auth.signInWithOtp({
        email: address,
        options: { emailRedirectTo: `${window.location.origin}/my-ideas` },
      });
      if (error) setError(error.message);
      else setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl px-6 pb-24 pt-24 sm:px-10">
      <div className="flex justify-center">
        <span className="rounded-full border border-[#e5dccd] px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[#e8451f]">
          Sign in
        </span>
      </div>

      <h1 className="mt-10 text-center font-serif text-5xl leading-[1.08] text-[#1c1410]">
        Keep your <em className="italic text-[#e8451f]">ideas.</em>
      </h1>

      {!isSupabaseConfigured ? (
        <p className="mx-auto mt-8 max-w-md text-center text-[15px] leading-relaxed text-[#57504a]">
          Sign-in is unavailable: this deployment has no Supabase keys set.
          Everything else works without an account.
        </p>
      ) : loading ? null : user ? (
        <div className="mt-8 text-center">
          <p className="text-[15px] text-[#57504a]">
            Signed in as <span className="text-[#1c1410]">{user.email}</span>
          </p>
          <Link
            href="/my-ideas"
            className="mt-6 inline-block rounded-full bg-[#e8451f] px-9 py-4 text-[15px] font-medium text-white transition hover:bg-[#d13d18]"
          >
            Go to My Ideas &rarr;
          </Link>
        </div>
      ) : sent ? (
        <p className="mx-auto mt-8 max-w-md text-center text-[15px] leading-relaxed text-[#57504a]">
          Link sent to <span className="text-[#1c1410]">{email.trim()}</span>.
          Open it on this device and you will land back here signed in.
        </p>
      ) : (
        <>
          <p className="mx-auto mt-6 max-w-md text-center text-[15px] leading-relaxed text-[#57504a]">
            We email you a link &mdash; no password to remember. Ideas already
            saved in this browser move across on your first sign-in.
          </p>

          <form className="mt-10 flex flex-col gap-3" onSubmit={sendLink}>
            <div className="flex items-center gap-3 rounded-full border border-[#e5dccd] bg-[#fffdf9] px-6 py-4 focus-within:border-[#e8451f]/70">
              <span aria-hidden className="text-[#e8451f]">
                &#9993;
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-transparent text-[15px] text-[#1c1410] placeholder:text-[#8b8178] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={sending}
              className="rounded-full bg-[#e8451f] px-9 py-4 text-[15px] font-medium text-white transition hover:bg-[#d13d18] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? "Sending…" : "Email me a link →"}
            </button>
          </form>
        </>
      )}

      {error ? (
        <p className="mt-6 text-center text-[13px] text-[#e8451f]">{error}</p>
      ) : null}
    </main>
  );
}
