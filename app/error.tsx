"use client";

import { useEffect } from "react";
import { BrandLogo } from "@/components/BrandLogo";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Aquí se enviaría el error a un servicio de monitoreo (por ejemplo Sentry).
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="enter max-w-sm text-center">
        <BrandLogo variant="mark" mood="sad" anim="idle" className="mx-auto mb-4 h-28 w-auto" label="Los tres personajes del logo, preocupados" />
        <h1 className="page-title">Algo salió mal</h1>
        <p className="mt-2 text-sm text-stone-600">
          No pudimos cargar esta página. Inténtalo de nuevo; si sigue pasando, avísale a tu coordinador.
        </p>
        {error.digest && <p className="mt-2 text-xs text-stone-400">Código: {error.digest}</p>}
        <button onClick={reset} className="btn btn-primary mt-5">
          Reintentar
        </button>
      </div>
    </main>
  );
}
