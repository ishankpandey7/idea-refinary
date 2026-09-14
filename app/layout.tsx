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
  title: "Idea Craft",
  description:
    "Paste the links to everything in your project and get the attribution you are obliged to publish — text, Markdown, CSV or a PDF licence report — with anything you cannot legally use flagged before you ship.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {/* Runs before the first paint so a stored choice does not flash the
            other theme. Absent attribute = follow the OS, which is what the
            prefers-color-scheme block in globals.css keys off. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("idea-refinery:theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})()`,
          }}
        />
        {/* globals.css styles `body` unlayered, which beats Tailwind's layered
            utilities — so the page shell lives on a wrapper, not on body. */}
        <AuthProvider>
          <div
            data-print-shell
            className="flex min-h-screen flex-col bg-page text-body selection:bg-brand/20"
          >
            <SiteHeader />
            {children}

            <footer
              data-print-hide
              className="mt-auto border-t border-line px-6 py-10 text-center sm:px-10"
            >
              <p className="text-[13px] text-body">
                <span className="font-serif text-[15px] text-ink">
                  Idea Craft
                </span>
                <span aria-hidden className="mx-2 text-accent">
                  &bull;
                </span>
                Credits and licence reports for what you are using
              </p>
              <p className="mx-auto mt-3 max-w-xl text-[11px] leading-relaxed text-faint">
                &copy; 2026 Idea Craft. Results link back to the source and
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
