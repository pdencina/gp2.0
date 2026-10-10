// Marca: tres círculos que se enlazan (comunidad) y el nombre.
export function Logo({ light = false, size = "md" }: { light?: boolean; size?: "sm" | "md" | "lg" }) {
  const dot = size === "lg" ? "h-8 w-8" : size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const text = size === "lg" ? "text-xl" : size === "sm" ? "text-sm" : "text-base";
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex" aria-hidden="true">
        <span className={`${dot} rounded-full bg-brand-orange-400`} />
        <span className={`${dot} -ml-2 rounded-full bg-brand-green-400 ${light ? "ring-2 ring-brand-teal-700/40" : "mix-blend-multiply"}`} />
        <span className={`${dot} -ml-2 rounded-full ${light ? "bg-white" : "bg-brand-teal-400"}`} />
      </div>
      <span className={`${text} font-semibold tracking-tight ${light ? "text-white" : "text-brand-ink"}`}>
        grupos pequeños
      </span>
    </div>
  );
}
