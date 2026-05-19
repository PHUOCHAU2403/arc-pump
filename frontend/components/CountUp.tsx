"use client";

import { useEffect, useRef } from "react";
import { countUp } from "@/lib/motion";

type CountUpProps = {
  /** The final numeric value to count toward. */
  value: number;
  /**
   * Format the in-flight intermediate value into display text.
   * Defaults to integer toLocaleString.
   */
  format?: (value: number) => string;
  /** Tween duration in ms. Default 800. */
  duration?: number;
  /** ClassName forwarded to the span. */
  className?: string;
};

/**
 * Animate a numeric value from 0 → `value` once the element enters the
 * viewport. Re-animates when `value` changes (good for late-arriving data).
 *
 * Why IntersectionObserver: keeps the entrance feeling intentional even when
 * the stat strip is below the fold on small viewports.
 */
export function CountUp({
  value,
  format = (v) => Math.round(v).toLocaleString(),
  duration = 800,
  className,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const hasRun = useRef(false);
  const lastValue = useRef<number>(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // If value updates after first run (e.g. data refresh), tween from last
    // shown value to the new one — feels live, not jumpy.
    if (hasRun.current) {
      countUp(el, value, { duration, format, from: lastValue.current });
      lastValue.current = value;
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            countUp(el, value, { duration, format, from: 0 });
            lastValue.current = value;
            hasRun.current = true;
            io.disconnect();
          }
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);

    return () => io.disconnect();
  }, [value, duration, format]);

  // Pre-paint placeholder so the layout doesn't shift before the tween starts.
  return (
    <span ref={ref} className={className}>
      {format(0)}
    </span>
  );
}
