"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Aquí se enviaría el error a un servicio de monitoreo (por ejemplo Sentry).
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <h1 className="text-2xl font-medium">Algo salió mal</h1>
        <p className="mt-2 text-sm text-stone-600">
          No pudimos cargar esta página. Inténtalo de nuevo; si sigue pasando, avísale a tu coordinador.
        </p>
        {error.digest && <p className="mt-2 text-xs text-stone-400">Código: {error.digest}</p>}
        <button
          onClick={reset}
          className="mt-5 h-10 rounded-lg bg-brand-orange px-5 text-sm font-medium text-white hover:brightness-95"
        >
          Reintentar
        </button>
      </div>
    </main>
  );
}
