# AI Agent Brief — arc-pump

> Read this BEFORE writing any code in this repo.

## 1. What this project is

`arc-pump` is a memecoin launchpad on **Arc Network testnet** (chain id 5042002).
Anyone pays **1 USDC** to deploy a `MemeToken` + paired `BondingCurve`.
Traders then buy/sell on the linear curve using native USDC (Arc's native gas token).

Stack:
- Contracts: Solidity 0.8.35 + Foundry, deployed at `0x18c0f8f2a6D29328F5ea62c6D6960CdC560B7830`.
- Frontend (`/frontend`): Next.js 16.2 + App Router + Turbopack.
- Web3: wagmi 2.19 + viem 2.49 + RainbowKit 2.2 + @tanstack/react-query 5.
- Styling: Tailwind 4 (via `@import "tailwindcss"`).
- Fonts: Newsreader (display, serif), Inter Tight (body), JetBrains Mono (numbers).

## 2. NON-NEGOTIABLE design system: Strategist Minimal

This dApp is deliberately **the opposite of pump.fun aesthetics**.
Think Paradigm / Anthropic / Stripe / Linear. Editorial, restrained, premium.

Reference document: `frontend/app/globals.css`. Do not edit globals.css.

### Colors (use Tailwind classes; the tokens already exist)

| Purpose | Token | Hex |
|---|---|---|
| Page background | `bg-paper` | `#FAFAF7` warm off-white |
| Card surface | `bg-paper` | (same) |
| Subtle surface | `bg-paper-soft` | `#F4F4EE` |
| Strongest surface | `bg-paper-mute` | `#EBEBE3` |
| Primary text | `text-ink` | `#0A0A0A` near-black |
| Soft text | `text-ink-soft` | `#2A2A2A` |
| Muted text | `text-ink-mute` | `#6B6B6B` |
| Faint text | `text-ink-faint` | `#9A9A92` |
| Hairline border | `border-line` | `#E5E5DD` |
| Stronger border | `border-line-strong` | `#CFCFC4` |
| THE accent (single, sparing) | `text-accent` / `bg-accent` | `#C2410C` warm orange |
| Good (status only) | `text-good` | `#166534` |
| Bad (status only) | `text-bad` | `#991B1B` |

### Typography — use these utility classes, do not roll your own

- `.type-display` — hero serif headlines (`clamp(2.75rem, 7vw, 5.5rem)`, weight 500, tight tracking).
- `.type-headline` — section headlines (`clamp(1.75rem, 3vw, 2.5rem)`).
- `.type-kicker` — small uppercase eyebrows (`11px`, tracking 0.18em, muted color).
- `.type-mono-stat` — JetBrains Mono with tabular numerals (use for ALL numbers).
- `.font-display` — applies Newsreader serif to any element.
- `.font-mono` — applies JetBrains Mono.
- Body text inherits Inter Tight.
- Italic serif (`<span className="font-display italic text-accent">...</span>`) is the
  signature emphasis. Use it for ONE word per heading max.

### Components — already-styled utility classes

- `.card` — 1px hairline-border surface. `card:hover` shifts border darker.
- `.btn-primary` — solid black button. No shadow. Hover darkens slightly.
- `.btn-ghost` — outlined button.
- `.link-quiet` — underlined link with offset, hovers to accent.
- `.dot-live` — 6px green pulsing dot (use sparingly for "live" badges).
- `.grid-paper` — Bauhaus-style 32px grid background (use sparingly).

### Motion

- Default `transition: 200ms ease-out` is applied globally to buttons/links/inputs.
- **No spring physics.** No bouncy `cubic-bezier(0.34, 1.56, 0.64, 1)`.
- Subtle scale on hover OK (max `scale(1.02)`).
- Page transitions: fade only.

### Copy tone

- Editorial sentences. Full stops. No exclamation marks.
- Confidence without flexing. Technical when it earns its place.
- "Capital formation for ideas." — that's the register.
- **No emojis in headlines.** One subtle emoji in body OK if it earns its place.

### Anti-patterns (REJECT)

- Chunky cartoon shadows (`box-shadow: 4px 4px 0 #000`)
- Bouncy spring animations
- Rainbow gradients (one subtle gradient OK)
- Comic Sans / Lilita One / playful display fonts
- Neon/electric colors
- Emoji-heavy copy
- Pure white `#FFFFFF` backgrounds (use `bg-paper`)
- Pure black `#000000` text (use `text-ink`)

## 3. Files you MUST NOT modify

These define the system. Read them, don't touch them.

- `frontend/app/globals.css` — theme tokens & utility classes
- `frontend/app/layout.tsx` — font registration & metadata
- `frontend/app/providers.tsx` — wagmi/RainbowKit config
- `frontend/components/Navbar.tsx` — global nav
- `frontend/lib/wagmi.ts` — wallet config
- `frontend/lib/chains.ts` — Arc Testnet definition
- `frontend/lib/factory.ts` — MemeFactory ABI + deployed address
- `frontend/lib/curve.ts` — BondingCurve ABI
- `frontend/lib/token.ts` — MemeToken ABI
- `frontend/lib/events.ts` — event ABIs + decoders
- `frontend/lib/blockchain.ts` — block/format helpers
- `frontend/lib/types.ts` — shared TypeScript types

If you think one of these needs a change, open a PR with the change isolated and a
1-paragraph justification. Do not silently modify.

## 4. Hooks you MUST USE (do not reinvent)

All in `frontend/hooks/`:

- `useTradeHistory(curveAddress, opts?)` — newest-first Trade[] for a curve.
- `useTokenStats(curveAddress)` — 24h volume, trade count, last price, % change.
- `usePriceHistory(curveAddress, opts?)` — chart-ready PricePoint[] (oldest → newest).
- `useUserPortfolio()` — connected user's holdings across ALL tokens.
- `useActivityFeed(limit?)` — global FeedItem[] across every token (home page).

All return React Query results. Respect their cache; do not call `getLogs` directly
in components — use these hooks.

## 5. Routing & code structure

```
frontend/
  app/
    layout.tsx          DO NOT TOUCH
    page.tsx            Home / token list (existing)
    providers.tsx       DO NOT TOUCH
    globals.css         DO NOT TOUCH
    create/
      page.tsx          Create token form (existing)
    token/
      [address]/
        page.tsx        Token detail (existing — modify carefully)
    portfolio/
      page.tsx          ← NEW (Phase D)
  components/
    Navbar.tsx          DO NOT TOUCH
    ...                 ← Add new components here
  hooks/                ← Hooks live here
  lib/                  ← Shared utils (mostly frozen)
```

For new feature work, prefer **dedicated components** in `components/` and import
them into the existing page rather than ballooning the page file.

## 6. TypeScript & quality rules

- TypeScript strict; no `any` (use `unknown` + narrow if necessary).
- All wagmi hook callers must be Client Components (`"use client";` at top).
- Mandatory states for every data-dependent UI: loading, empty, error.
- All on-chain numbers display via `.type-mono-stat` and the helpers in
  `lib/blockchain.ts` (`formatUsdc`, `formatTokens`, etc.).
- Addresses always shown via `shortAddr()` unless the full hash is required.
- Mobile-first: every feature must work at 375px width.

## 7. The phases — who owns what

Phases assigned to Codex are isolated features that build on the foundation
hooks. Style-critical phases stay with Claude.

### Codex-owned phases

- **Phase C** — Trade history feed per token (new `components/TradeFeed.tsx`,
  mount on `/token/[address]`). Uses `useTradeHistory`.
- **Phase D** — `/portfolio` route with user holdings + per-token value.
  Uses `useUserPortfolio`. Empty state when nothing held.
- **Phase E** — Filter + sort tokens on home page (newest / top volume / top
  market cap). Volume needs `useTokenStats` per visible card — render lazily.
- **Phase F** — USDC ↔ Token amount toggle on the trade panel + slippage tolerance
  setting. Inverse math for "I want to spend X USDC, how many tokens?" Add binary
  search if no closed-form solution.
- **Phase H** — Holders list per token (Transfer event scan) + token search box
  on home.
- **Phase I** — IPFS image upload via Pinata (requires `NEXT_PUBLIC_PINATA_JWT`
  env var). Used in `/create` form as alternative to URL paste.

### Claude-owned phases

- **Phase B** — Price chart on token detail (lightweight-charts integration).
- **Phase G** — Activity feed on home + 24h global stats.
- **Phase J** — Mobile responsive review.
- **Phase K** — Launch content.

## 8. PR / commit etiquette

- One phase = one branch (e.g. `phase-c-trade-feed`).
- One PR per phase.
- Include screenshots showing the feature at desktop AND 375px width.
- Run `npm run build` from `/frontend` before opening the PR; it must pass.
- Commit message format: `feat(phase-X): short imperative description`.

## 9. Quick reference patterns

### A page-level data hook usage

```tsx
"use client";

import { useTokenStats } from "@/hooks/useTokenStats";
import { formatUsdc } from "@/lib/blockchain";

export function TokenStatsCard({ curveAddress }: { curveAddress: `0x${string}` }) {
  const { stats, isLoading } = useTokenStats(curveAddress);

  if (isLoading) return <div className="text-ink-mute text-sm">Loading…</div>;
  if (!stats) return null;

  return (
    <div className="card p-6">
      <div className="type-kicker mb-3">24h volume</div>
      <div className="type-mono-stat text-2xl">
        {formatUsdc(stats.volume24h, 2)} <span className="text-sm text-ink-mute">USDC</span>
      </div>
    </div>
  );
}
```

### An empty state

```tsx
<div className="border border-line border-dashed py-16 text-center">
  <div className="type-kicker mb-3">Nothing here</div>
  <h3 className="type-headline mb-3">An empty market is an open one.</h3>
  <p className="text-ink-mute text-sm">Description of why empty + what to do next.</p>
</div>
```

### A button row

```tsx
<div className="flex gap-3">
  <button className="btn-primary px-6 py-3 text-sm rounded-sm">Primary →</button>
  <a className="btn-ghost px-6 py-3 text-sm rounded-sm">Ghost</a>
</div>
```

## 10. When in doubt

Open the home page (`app/page.tsx`) and the token detail page
(`app/token/[address]/page.tsx`). They are the canonical examples of the
Strategist Minimal style applied to real data. Match their texture.

If a design decision is ambiguous, default to **less**: less color, less weight,
less motion, less copy.
