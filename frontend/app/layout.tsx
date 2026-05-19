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
  metadataBase: new URL("https://arcpump.com"),
  title: "Arc Pump — Where ideas become markets",
  description:
    "A USDC-native launchpad for bonding-curve markets on Arc Network. Deploy in one transaction. Permanent liquidity. Economics you control.",
  openGraph: {
    title: "Arc Pump",
    description: "Where ideas become markets. Built on Arc Network.",
    type: "website",
    url: "https://arcpump.com",
    siteName: "Arc Pump",
  },
  twitter: {
    card: "summary_large_image",
    title: "Arc Pump",
    description: "Where ideas become markets. Built on Arc Network.",
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
