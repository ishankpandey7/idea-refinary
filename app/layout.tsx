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
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
