"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";

const LINKS = [
  { href: "/", label: "Search" },
  { href: "/my-ideas", label: "My Ideas" },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const { user, loading, configured, signOut } = useAuth();

  return (
    <header
      data-print-hide
      className="flex items-center justify-between gap-4 border-b border-[#3a1f14]/60 px-6 py-5 sm:px-10"
    >
      <Link href="/" className="flex items-center gap-2.5">
        <span aria-hidden className="text-lg text-[#e8451f]">
          &#10022;
        </span>
        <span className="font-serif text-xl tracking-tight text-[#f5a962]">
          Idea Refinery
        </span>
      </Link>

      <nav className="flex gap-8 text-sm">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={
              pathname === l.href
                ? "text-[#f5a962]"
                : "text-[#c9b6a8] transition hover:text-[#f5a962]"
            }
          >
            {l.label}
          </Link>
        ))}
      </nav>

      {!configured || loading ? (
        <div
          aria-hidden
          className="size-9 rounded-full border border-[#3a1f14]"
        />
      ) : user ? (
        <div className="flex items-center gap-3">
          <span className="hidden text-[13px] text-[#7a6558] sm:inline">
            {user.email}
          </span>
          <button
            type="button"
            onClick={signOut}
            className="rounded-full border border-[#3a1f14] px-4 py-1.5 text-[12px] text-[#b39c8c] transition hover:border-[#e8451f] hover:text-[#ff9c6b]"
          >
            Sign out
          </button>
        </div>
      ) : (
        <Link
          href="/login"
          className="rounded-full bg-[#e8451f] px-5 py-1.5 text-[12px] font-medium text-white transition hover:bg-[#ff5a2e]"
        >
          Sign in
        </Link>
      )}
    </header>
  );
}
