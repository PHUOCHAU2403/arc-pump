"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";

export function Navbar() {
  return (
    <nav className="sticky top-0 z-30 bg-paper/85 backdrop-blur-sm border-b border-line">
      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-4 flex justify-between items-center">
        <Link
          href="/"
          className="group flex items-baseline gap-3"
        >
          <span className="font-display text-xl text-ink tracking-tight">
            Arc<span className="italic text-accent">·</span>Pump
          </span>
          <span className="type-kicker hidden sm:inline">v0.1 / testnet</span>
        </Link>

        <div className="flex items-center gap-3 sm:gap-5">
          <Link
            href="/create"
            className="hidden sm:inline-flex items-center text-sm font-medium text-ink hover:text-accent transition-colors"
          >
            Launch token
            <span className="ml-1.5 text-ink-mute group-hover:text-accent">
              →
            </span>
          </Link>
          <ConnectButton
            showBalance={false}
            chainStatus="icon"
            accountStatus="address"
          />
        </div>
      </div>
    </nav>
  );
}
