import type { Metadata } from "next";
import { Newsreader, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const newsreader = Newsreader({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const interTight = Inter_Tight({
  variable: "--font-body",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "ARC PUMP — Memecoin launchpad on Arc",
  description:
    "Capital formation for ideas, on Arc Network. Linear bonding curve. USDC native. One USDC to launch.",
  openGraph: {
    title: "ARC PUMP",
    description: "Capital formation for ideas, on Arc Network.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${interTight.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
