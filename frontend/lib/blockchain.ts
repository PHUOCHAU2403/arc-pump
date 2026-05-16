// Low-level blockchain utilities — block time approximation, formatting.

const ARC_AVG_BLOCK_TIME_SECONDS = 0.5; // Arc Testnet has ~500ms blocks

/**
 * Approximate the unix timestamp of a past block, given the latest block as anchor.
 * Avoids N+1 RPC calls for batches of historical events.
 */
export function approxTimestamp(
  targetBlock: bigint,
  latestBlock: bigint,
  latestTimestamp: bigint
): number {
  const diff = Number(latestBlock - targetBlock);
  return Number(latestTimestamp) - diff * ARC_AVG_BLOCK_TIME_SECONDS;
}

/** How many blocks ago is `block`? */
export function blocksAgo(block: bigint, latest: bigint): number {
  return Number(latest - block);
}

/** Format wei to human-readable USDC (6 decimals shown by default). */
export function formatUsdc(
  wei: bigint | undefined,
  decimals: number = 6
): string {
  if (wei === undefined) return "—";
  return (Number(wei) / 1e18).toFixed(decimals);
}

/** Format MemeToken wei to whole-token count. */
export function formatTokens(wei: bigint | undefined): string {
  if (wei === undefined) return "—";
  const n = Number(wei) / 1e18;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(0);
}

/** Short address: 0xabcd...1234 */
export function shortAddr(addr: string | undefined): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Human "X ago" from unix seconds. */
export function timeAgo(ts: number): string {
  const seconds = Math.floor(Date.now() / 1000) - ts;
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/** Default lookback window for getLogs (in blocks). 24h on Arc ≈ 172,800 blocks. */
export const DEFAULT_LOOKBACK_BLOCKS = 200_000n;
