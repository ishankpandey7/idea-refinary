"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import ThemeToggle from "./ThemeToggle";

// `short` is what fits on a 375px phone once there are three of these.
const LINKS = [
  { href: "/", label: "Check", short: "Check" },
  { href: "/search", label: "Search", short: "Search" },
  { href: "/my-ideas", label: "My Projects", short: "Projects" },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const { user, loading, configured, signOut } = useAuth();

  return (
    <header
      data-print-hide
      className="flex items-center justify-between gap-2 border-b border-line bg-raised px-4 py-4 sm:gap-4 sm:px-10 sm:py-5"
    >
      <Link href="/" className="flex items-baseline gap-1.5">
        <span className="whitespace-nowrap font-serif text-base tracking-tight text-ink sm:text-xl">
          Idea Craft
        </span>
        <span
          aria-hidden
          className="hidden text-lg leading-none text-accent sm:inline"
        >
          &bull;
        </span>
      </Link>

      <nav className="flex gap-3 text-[12px] sm:gap-8 sm:text-sm">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={
              pathname === l.href
                ? "whitespace-nowrap text-ink"
                : "whitespace-nowrap text-muted transition hover:text-ink"
            }
          >
            <span className="sm:hidden">{l.short}</span>
            <span className="hidden sm:inline">{l.label}</span>
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-2 sm:gap-3">
        <ThemeToggle />

        {!configured || loading ? (
          <div aria-hidden className="size-8 rounded-full border border-line" />
        ) : user ? (
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden text-[13px] text-muted sm:inline">
              {user.email}
            </span>
            <button
              type="button"
              onClick={signOut}
              className="whitespace-nowrap rounded-full border border-line px-3 py-1.5 text-[12px] text-body transition hover:border-accent hover:text-accent sm:px-4"
            >
              Sign out
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="whitespace-nowrap rounded-full bg-brand px-4 py-1.5 text-[12px] font-medium text-white transition hover:bg-brand-hover sm:px-5"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
