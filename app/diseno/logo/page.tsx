import { notFound } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";

// Comparación del logo original y el vectorizado: solo en desarrollo (en producción responde 404).
export const dynamic = "force-dynamic";

export default function DisenoLogo() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="page-title">Logo: original y vectorizado</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-4">
          <p className="eyebrow mb-2">Original (imagen)</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/original-wordmark-oscuro.webp" alt="" className="w-full" />
        </section>
        <section className="card p-4">
          <p className="eyebrow mb-2">Vectorizado (apilado)</p>
          <BrandLogo variant="stacked" anim="none" className="w-full" />
        </section>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <section className="card p-4">
          <p className="eyebrow mb-2">Solo isotipo · idle</p>
          <BrandLogo variant="mark" className="mx-auto h-40" />
        </section>
        <section className="card p-4">
          <p className="eyebrow mb-2">Horizontal · pasa el mouse</p>
          <BrandLogo variant="horizontal" className="h-12" />
          <BrandLogo variant="horizontal" className="mt-4 h-8" />
        </section>
        <section className="card p-4">
          <p className="eyebrow mb-2">Cargando · triste (404)</p>
          <div className="flex items-center justify-around">
            <BrandLogo variant="mark" anim="loading" className="h-24" />
            <BrandLogo variant="mark" mood="sad" className="h-24" />
          </div>
        </section>
      </div>
      <section className="rounded-3xl bg-gradient-to-br from-brand-teal-800 via-brand-teal-700 to-brand-teal p-8">
        <p className="eyebrow mb-2 !text-white/70">Fondo oscuro · entrada</p>
        <BrandLogo variant="stacked" tone="light" anim="intro" className="mx-auto h-64" />
      </section>
    </main>
  );
}
