import { BrandLogo } from "@/components/BrandLogo";

// Mientras carga cualquier pantalla del menú, se ve el esqueleto de la página (no una pantalla en blanco).
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl p-4 pb-16 md:p-8" aria-busy="true" aria-label="Cargando">
      <div className="mb-2 flex items-center gap-3">
        <BrandLogo variant="mark" anim="loading" className="h-10 w-auto" label={null} />
        <div className="skeleton h-8 w-64" />
      </div>
      <div className="skeleton mb-8 h-4 w-96 max-w-full" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card p-4">
            <div className="skeleton mb-3 h-3 w-20" />
            <div className="skeleton h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="card p-5">
        <div className="skeleton mb-5 h-4 w-40" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 border-b border-stone-100 py-3 last:border-0">
            <div className="skeleton h-9 w-9 !rounded-full" />
            <div className="flex-1">
              <div className="skeleton mb-2 h-3.5 w-1/3" />
              <div className="skeleton h-3 w-1/2" />
            </div>
            <div className="skeleton h-6 w-16 !rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
