export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex" aria-hidden="true">
        <span className="h-6 w-6 rounded-full bg-brand-orange" />
        <span className="-ml-1.5 h-6 w-6 rounded-full bg-brand-green" />
        <span className={`-ml-1.5 h-6 w-6 rounded-full ${light ? "bg-white" : "bg-brand-teal"}`} />
      </div>
      <span className={`text-base font-medium ${light ? "text-white" : "text-brand-ink"}`}>
        grupos pequeños
      </span>
    </div>
  );
}
