import { notFound } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";

// Comparación del logo original y el vectorizado, y de colores para el nombre: solo en desarrollo (en producción responde 404).
export const dynamic = "force-dynamic";

const OPCIONES: { nombre: string; ink?: string | [string, string] }[] = [
  { nombre: "A · Original (gris casi negro)" },
  { nombre: "B · Gris suave", ink: "#5B6470" },
  { nombre: "C · Verde azulado oscuro", ink: "#1B6B6D" },
  { nombre: "D · Dos tonos: gris suave + turquesa", ink: ["#5B6470", "#1E8082"] },
  { nombre: "E · Dos tonos: gris suave + naranja", ink: ["#5B6470", "#C2501A"] },
  { nombre: "F · Dos tonos: turquesa + gris suave", ink: ["#1E8082", "#5B6470"] },
];

export default function DisenoLogo() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="page-title">Logo: color del nombre</h1>
      <p className="text-sm text-stone-500">Se muestra en el tamaño real del menú (como en el computador y en el celular).</p>
      <ul className="grid gap-4 md:grid-cols-2">
        {OPCIONES.map((o) => (
          <li key={o.nombre} className="card p-4">
            <p className="eyebrow mb-3">{o.nombre}</p>
            <div className="flex items-center gap-4 rounded-xl bg-white p-3">
              <BrandLogo variant="horizontal" ink={o.ink} anim="none" className="h-9 w-auto" />
              <span className="rounded-full bg-brand-orange px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">2.0</span>
            </div>
            <div className="mt-3 flex items-center gap-4">
              <BrandLogo variant="horizontal" ink={o.ink} anim="none" className="h-7 w-auto" />
              <BrandLogo variant="stacked" ink={o.ink} anim="none" className="h-14 w-auto" />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
