import { Icon } from "@/components/Icon";

export function Flash({ error, ok }: { error?: string; ok?: string }) {
  if (error)
    return (
      <p role="alert" className="pop-in mb-4 flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <Icon name="alert" className="mt-0.5 h-4 w-4 text-red-600" />
        <span>{error}</span>
      </p>
    );
  if (ok)
    return (
      <p role="status" className="pop-in mb-4 flex items-start gap-2.5 rounded-2xl border border-brand-green/25 bg-brand-green-50 px-4 py-3 text-sm text-brand-green-800">
        <Icon name="check-circle" className="mt-0.5 h-4 w-4 text-brand-green" />
        <span>Listo, el cambio quedó guardado.</span>
      </p>
    );
  return null;
}

/** Mensaje de éxito con texto propio (los "avisos" de las acciones). */
export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="pop-in mb-4 flex items-start gap-2.5 rounded-2xl border border-brand-green/25 bg-brand-green-50 px-4 py-3 text-sm text-brand-green-800">
      <Icon name="check-circle" className="mt-0.5 h-4 w-4 text-brand-green" />
      <span>{children}</span>
    </p>
  );
}

export const fieldClass = "input";
export const primaryBtn = "btn btn-primary";
