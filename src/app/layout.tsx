import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
