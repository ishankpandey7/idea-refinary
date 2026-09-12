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
      className="flex items-center justify-between gap-3 border-b border-[#e5dccd] bg-[#fffdf9] px-4 py-4 sm:gap-4 sm:px-10 sm:py-5"
    >
      <Link href="/" className="flex items-baseline gap-1.5">
        <span className="whitespace-nowrap font-serif text-base tracking-tight text-[#1c1410] sm:text-xl">
          Idea Refinery
        </span>
        <span aria-hidden className="text-lg leading-none text-[#e8451f]">
          &bull;
        </span>
      </Link>

      <nav className="flex gap-3.5 text-[12px] sm:gap-8 sm:text-sm">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={
              pathname === l.href
                ? "whitespace-nowrap text-[#1c1410]"
                : "whitespace-nowrap text-[#8b8178] transition hover:text-[#1c1410]"
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
            className="whitespace-nowrap rounded-full border border-[#e5dccd] px-3 py-1.5 text-[12px] text-[#57504a] transition hover:border-[#e8451f] hover:text-[#e8451f] sm:px-4"
          >
            Sign out
          </button>
        </div>
      ) : (
        <Link
          href="/login"
          className="whitespace-nowrap rounded-full bg-[#e8451f] px-4 py-1.5 text-[12px] font-medium text-white transition hover:bg-[#d13d18] sm:px-5"
        >
          Sign in
        </Link>
      )}
    </header>
  );
}
