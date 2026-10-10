"use client";

import { useEffect, useRef, useState } from "react";

// Una cifra que "cuenta" hasta su valor al aparecer. Con "reducir movimiento" muestra el valor final de inmediato.
export function CountUp({
  value,
  duration = 900,
  decimals = 0,
  suffix = "",
  className,
}: {
  value: number;
  duration?: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  const first = useRef(true);

  useEffect(() => {
    if (!Number.isFinite(value)) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !first.current) {
      first.current = false;
      setShown(value);
      return;
    }
    first.current = false;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    setShown(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  const text = shown.toLocaleString("es-CL", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (
    <span className={`tabular ${className ?? ""}`} aria-label={`${value.toLocaleString("es-CL")}${suffix}`}>
      {text}
      {suffix}
    </span>
  );
}
