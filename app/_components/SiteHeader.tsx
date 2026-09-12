"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Search" },
  { href: "/my-ideas", label: "My Ideas" },
];

export default function SiteHeader() {
  const pathname = usePathname();

  return (
    <header data-print-hide className="flex items-center justify-between border-b border-[#3a1f14]/60 px-6 py-5 sm:px-10">
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
      <div aria-hidden className="size-9 rounded-full border border-[#3a1f14]" />
    </header>
  );
}
