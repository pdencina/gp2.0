import Link from "next/link";

export const metadata = { title: "Política de privacidad · Grupos Pequeños" };

export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-2xl p-6 md:p-10">
      <Link href="/login" className="text-sm text-brand-teal hover:underline">
        ← Volver
      </Link>
      <h1 className="mb-4 mt-4 text-2xl font-medium">Política de privacidad</h1>
      <div className="space-y-3 text-sm leading-relaxed text-stone-700">
        <p>
          Grupos Pequeños ARM Global guarda tu nombre, correo y tu participación en grupos (asistencia y avance)
          para que tu líder y tus responsables puedan acompañarte.
        </p>
        <p>Solo ven tus datos las personas de tu grupo y quienes lo supervisan. No vendemos ni compartimos tu información con terceros.</p>
        <p>Puedes pedir que corrijamos o eliminemos tus datos escribiendo a tu coordinador.</p>
        <p className="text-stone-500">Texto provisional: reemplázalo por la política oficial de ARM Global.</p>
      </div>
    </main>
  );
}
