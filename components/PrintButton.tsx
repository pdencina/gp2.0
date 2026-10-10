"use client";

export function PrintButton({ label = "Imprimir o guardar como PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn btn-primary"
    >
      {label}
    </button>
  );
}
