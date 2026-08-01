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
    if (target === 0) return;
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(eased * target);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);

  return (
    <span className={className}>
      {prefix}{current.toFixed(decimals)}{suffix}
    </span>
  );
}
