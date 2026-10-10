import { BrandLogo, type LogoAnim } from "@/components/BrandLogo";

// Marca de GP 2.0: los tres personajes de Grupos Pequeños, el nombre y la insignia "2.0".
export function Logo({
  light = false,
  size = "md",
  anim = "idle",
  badge = true,
}: {
  light?: boolean;
  size?: "sm" | "md" | "lg";
  anim?: LogoAnim;
  badge?: boolean;
}) {
  const h = size === "lg" ? "h-12" : size === "sm" ? "h-7" : "h-9";
  return (
    <span className="inline-flex items-center gap-2">
      <BrandLogo variant="horizontal" tone={light ? "light" : "dark"} anim={anim} className={`${h} w-auto`} />
      {badge && (
        <span
          aria-label="versión 2.0"
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none tracking-wide text-white ${
            light ? "bg-brand-orange-400 text-brand-teal-900 ring-1 ring-white/30" : "bg-brand-orange"
          }`}
        >
          2.0
        </span>
      )}
    </span>
  );
}
