import { useEffect, useRef, useState } from "react";

/**
 * Part 3 (Cinematic UI) - counts up from 0 to an already-given real
 * value over `durationMs`. Never generates or guesses the value
 * itself - purely a display animation over a number the caller
 * already computed from persisted data. Jumps straight to the final
 * value under `prefers-reduced-motion`, matching this project's
 * existing reduced-motion discipline everywhere else.
 */
export function AnimatedCounter({
  value,
  durationMs = 1200,
  decimals = 0,
  suffix = "",
}: {
  value: number;
  durationMs?: number;
  decimals?: number;
  suffix?: string;
}) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setDisplay(value);
      return;
    }

    const start = performance.now();
    function tick(now: number) {
      const progress = Math.min(1, (now - start) / durationMs);
      setDisplay(value * progress);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== undefined) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [value, durationMs]);

  return (
    <span className="animated-counter">
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
