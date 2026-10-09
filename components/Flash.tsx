export function Flash({ error, ok }: { error?: string; ok?: string }) {
  if (error)
    return (
      <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </p>
    );
  if (ok)
    return (
      <p role="status" className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
        Listo, el cambio quedó guardado.
      </p>
    );
  return null;
}

export const fieldClass =
  "h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20";
export const primaryBtn =
  "h-10 rounded-lg bg-brand-orange px-4 text-sm font-medium text-white hover:brightness-95";
