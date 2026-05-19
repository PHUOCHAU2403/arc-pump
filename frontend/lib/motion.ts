"use client";

/**
 * Motion helpers — thin wrappers around anime.js v4.
 *
 * Design rules (Strategist Minimal):
 *   - 200–250ms ease-out by default. No springs, no bounce.
 *   - Respect prefers-reduced-motion: helpers no-op when the user opts out.
 *   - Pre-paint targets are responsible for their own initial state (opacity
 *     0, transform translateY(...)) so there's no flash of unanimated content.
 */

import { animate, stagger } from "animejs";

const DEFAULT_DURATION = 220;
const DEFAULT_EASE = "outQuart";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Stagger a fade-up across a list of elements.
 * Each element should start with `opacity: 0; transform: translateY(8px)`
 * via Tailwind/inline styles to avoid pre-paint flicker.
 */
export function staggerFadeUp(
  targets: Element[] | NodeListOf<Element> | string,
  opts: { delay?: number; gap?: number; duration?: number } = {}
) {
  if (prefersReducedMotion()) {
    const list =
      typeof targets === "string"
        ? Array.from(document.querySelectorAll(targets))
        : Array.from(targets as ArrayLike<Element>);
    for (const el of list) {
      (el as HTMLElement).style.opacity = "1";
      (el as HTMLElement).style.transform = "none";
    }
    return;
  }

  const { delay = 0, gap = 40, duration = DEFAULT_DURATION } = opts;
  animate(targets, {
    opacity: [0, 1],
    translateY: [8, 0],
    duration,
    delay: stagger(gap, { start: delay }),
    ease: DEFAULT_EASE,
  });
}

/**
 * Count a number up from 0 → final inside the given element.
 * Format hook lets us reuse the page's own formatter (e.g. formatUsdc).
 *
 * For non-numeric values (e.g. "Linear") this is a no-op; the caller should
 * not invoke it for those.
 */
export function countUp(
  el: HTMLElement,
  to: number,
  opts: {
    duration?: number;
    format?: (value: number) => string;
    from?: number;
  } = {}
): void {
  const { duration = 800, format = (v) => Math.round(v).toString(), from = 0 } =
    opts;

  if (prefersReducedMotion() || to === 0) {
    el.textContent = format(to);
    return;
  }

  const state = { value: from };
  animate(state, {
    value: to,
    duration,
    ease: DEFAULT_EASE,
    // anime.js v4 renamed `update` → `onUpdate`. Using the wrong name silently
    // no-ops, leaving the text stuck at its initial value.
    onUpdate: () => {
      el.textContent = format(state.value);
    },
  });
}
