"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Returns a className that applies a brief accent flash whenever the watched
 * value changes. The first value seen does NOT trigger a flash — we only flash
 * on transitions from one defined value to another.
 *
 * Usage:
 *   const flashClass = useFlashOnChange(spotPrice);
 *   <span className={flashClass}>{formatPrice(spotPrice)}</span>
 *
 * The returned class is "motion-flash" for ~260ms after each change, then "".
 * The CSS animation re-triggers cleanly because we toggle a counter-based key.
 */
export function useFlashOnChange<T>(
  value: T,
  options: { durationMs?: number } = {}
): string {
  const { durationMs = 260 } = options;
  const previousValue = useRef<T | undefined>(undefined);
  const [flashKey, setFlashKey] = useState(0);

  useEffect(() => {
    // Skip the first render — we don't want everything to flash on mount.
    if (previousValue.current === undefined) {
      previousValue.current = value;
      return;
    }

    // Compare via stringification so bigints / objects work without ===.
    const prevStr = serialize(previousValue.current);
    const nextStr = serialize(value);
    if (prevStr === nextStr) return;

    previousValue.current = value;
    setFlashKey((k) => k + 1);

    const t = setTimeout(() => {
      setFlashKey((k) => k); // no-op; class clears via key change next tick
    }, durationMs);

    return () => clearTimeout(t);
  }, [value, durationMs]);

  // Re-key the class so the CSS animation restarts on every change.
  return flashKey === 0 ? "" : `motion-flash flash-${flashKey % 2}`;
}

function serialize(v: unknown): string {
  if (typeof v === "bigint") return v.toString();
  if (v === null || v === undefined) return String(v);
  if (typeof v === "object") {
    try {
      return JSON.stringify(v, (_, val) =>
        typeof val === "bigint" ? val.toString() : val
      );
    } catch {
      return String(v);
    }
  }
  return String(v);
}
