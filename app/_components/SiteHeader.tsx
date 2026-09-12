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
      className="flex items-center justify-between gap-4 border-b border-[#e5dccd] bg-[#fffdf9] px-6 py-5 sm:px-10"
    >
      <Link href="/" className="flex items-center gap-2.5">
        <span aria-hidden className="text-lg text-[#e8451f]">
          &#10022;
        </span>
        <span className="font-serif text-xl tracking-tight text-[#1c1410]">
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
                ? "text-[#1c1410]"
                : "text-[#8b8178] transition hover:text-[#1c1410]"
            }
          >
            {l.label}
          </Link>
        ))}
      </nav>

      {!configured || loading ? (
        <div
          aria-hidden
          className="size-9 rounded-full border border-[#e5dccd]"
        />
      ) : user ? (
        <div className="flex items-center gap-3">
          <span className="hidden text-[13px] text-[#8b8178] sm:inline">
            {user.email}
          </span>
          <button
            type="button"
            onClick={signOut}
            className="rounded-full border border-[#e5dccd] px-4 py-1.5 text-[12px] text-[#57504a] transition hover:border-[#e8451f] hover:text-[#e8451f]"
          >
            Sign out
          </button>
        </div>
      ) : (
        <Link
          href="/login"
          className="rounded-full bg-[#e8451f] px-5 py-1.5 text-[12px] font-medium text-white transition hover:bg-[#d13d18]"
        >
          Sign in
        </Link>
      )}
    </header>
  );
}
