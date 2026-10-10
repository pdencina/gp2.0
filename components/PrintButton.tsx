"use client";

export function PrintButton({ label = "Imprimir o guardar como PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-medium text-white hover:brightness-95"
    >
      {label}
    </button>
  );
}
