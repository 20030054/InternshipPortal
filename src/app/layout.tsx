import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, Source_Serif_4 } from "next/font/google";
import { AppHeader } from "@/components/app-header";
import "./globals.css";

// Self-hosted via next/font (downloaded at build time, served same-origin)
// so there is no third-party font CDN request at runtime — consistent with
// MASTER_PROMPT.md §6.3 "no CDN for authenticated assets."
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SCIT Internship Portal",
  description:
    "School of Computer & Information Technology, Beaconhouse National University — internship course administration.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // M14/§9: reading the per-request CSP nonce here (set by
  // src/middleware.ts) is what makes Next apply it to its own inline
  // hydration scripts automatically — and, as a side effect, opts every
  // route sharing this layout out of static generation, which nonce-
  // based CSP requires: a statically-prerendered page's scripts are
  // baked in at build time and can never match a fresh per-request
  // nonce.
  await headers();

  return (
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable}`}>
      <body className="font-sans antialiased">
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
