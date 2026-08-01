"use client";

import { useEffect, useState } from "react";

interface Props {
  target: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
}

export function AnimatedCounter({ target, prefix = "", suffix = "", decimals = 2, duration = 1200, className = "" }: Props) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (target === 0) {
      // Deferred rather than a synchronous setState, which would trigger a
      // cascading render. Matters when a target resets from non-zero to 0.
      const reset = setTimeout(() => setCurrent(0), 0);
      return () => clearTimeout(reset);
    }

    let frame = 0;
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(eased * target);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    // requestAnimationFrame is paused while the tab is backgrounded, so a user
    // who switches away mid-audit would come back to a headline figure frozen
    // at $0.00. Timers still fire when hidden, so guarantee the final value.
    const settle = setTimeout(() => setCurrent(target), duration + 50);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [target, duration]);

  return (
    <span className={className}>
      {prefix}{current.toFixed(decimals)}{suffix}
    </span>
  );
}
