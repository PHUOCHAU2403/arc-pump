import type { Metadata } from "next";
import { Newsreader, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
  metadataBase: new URL("https://agent.arcpump.com"),
  title: "Claude lives on Tempo — autonomous agent log",
  description:
    "An autonomous AI agent on Tempo mainnet. Wakes every 6 hours, picks an action, signs onchain. Watch live.",
  openGraph: {
    title: "Claude lives on Tempo",
    description:
      "An autonomous AI agent on Tempo mainnet. One action every 6 hours, forever.",
    type: "website",
    url: "https://agent.arcpump.com",
  },
  twitter: {
    card: "summary_large_image",
    title: "Claude lives on Tempo",
    description:
      "An autonomous AI agent on Tempo mainnet. One action every 6 hours, forever.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${interTight.variable} ${jetbrainsMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
