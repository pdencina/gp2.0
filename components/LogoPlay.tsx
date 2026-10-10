"use client";

import { useEffect, useRef, useState } from "react";

// Envuelve el logo para jugar con él: los ojos siguen al puntero y, al tocarlo, los tres saltan.
// Con "reducir movimiento" no hace nada más que dejar el logo quieto.
export function LogoPlay({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [giggle, setGiggle] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2);
      const c = (v: number) => Math.max(-1, Math.min(1, v));
      el.style.setProperty("--gp-ex", `${(c(dx) * 11).toFixed(1)}px`);
      el.style.setProperty("--gp-ey", `${(c(dy) * 8).toFixed(1)}px`);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <button
      ref={ref}
      type="button"
      aria-label="Saludar al logo"
      onClick={() => {
        setGiggle(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setGiggle(false), 1000);
      }}
      className={`block cursor-pointer rounded-3xl bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${giggle ? "gp-giggle" : ""} ${className}`}
    >
      {children}
    </button>
  );
}
