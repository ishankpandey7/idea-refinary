import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SiteHeader from "./_components/SiteHeader";
import AuthProvider from "./_components/AuthProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Idea Refinery",
  description:
    "Federated open-licence search. One query fans out to open sources; every result links back to where it lives.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {/* globals.css styles `body` unlayered, which beats Tailwind's layered
            utilities — so the page shell lives on a wrapper, not on body. */}
        <AuthProvider>
          <div
            data-print-shell
            className="flex min-h-screen flex-col bg-[#faf7f2] text-[#57504a] selection:bg-[#e8451f]/20"
          >
            <SiteHeader />
            {children}

            <footer
              data-print-hide
              className="mt-auto border-t border-[#e5dccd] px-6 py-10 text-center sm:px-10"
            >
              <p className="text-[13px] text-[#57504a]">
                <span className="font-serif text-[15px] text-[#1c1410]">
                  Idea Refinery
                </span>
                <span aria-hidden className="mx-2 text-[#e8451f]">
                  &bull;
                </span>
                Open-licence resource discovery engine
              </p>
              <p className="mx-auto mt-3 max-w-xl text-[11px] leading-relaxed text-[#9a9089]">
                &copy; 2026 Idea Refinery. Results link back to the source and
                carry the licence and attribution the provider published &mdash;
                we never host the content.
              </p>
            </footer>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
