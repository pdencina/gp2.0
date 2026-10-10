import { notFound } from "next/navigation";
import Link from "next/link";
import { WelcomeDialog } from "@/components/WelcomeDialog";
import { profileCheck, type ProfileData } from "@/lib/profile-check";

// Ventana de bienvenida con datos de ejemplo: solo en desarrollo (en producción responde 404).
// ?caso=bloqueante | casi | completo | otro-pais
export const dynamic = "force-dynamic";

const BASE: ProfileData = {
  full_name: "Pablo Encina", phone: null, gender: null, country: "CL", city: null, birth_date: null,
  guardian_name: null, guardian_email: null, guardian_phone: null, terms_accepted_at: null, campus_id: null,
};

const CASES: Record<string, { label: string; profile: ProfileData; country: string | null }> = {
  bloqueante: { label: "Faltan datos para inscribirse", profile: BASE, country: "CL" },
  casi: {
    label: "Casi listo (faltan datos recomendados)",
    profile: { ...BASE, gender: "hombre", birth_date: "1990-05-01", terms_accepted_at: "2026-01-01" },
    country: "CL",
  },
  completo: {
    label: "Todo al día",
    profile: { ...BASE, gender: "hombre", birth_date: "1990-05-01", terms_accepted_at: "2026-01-01", phone: "+56912345678", city: "Santiago", campus_id: "c1" },
    country: "CL",
  },
  "otro-pais": {
    label: "Parece estar en otro lugar",
    profile: { ...BASE, gender: "hombre", birth_date: "1990-05-01", terms_accepted_at: "2026-01-01", phone: "+56912345678", city: "Santiago", campus_id: "c1", country: "VE" },
    country: "VE",
  },
};

export default async function DisenoBienvenida(props: { searchParams: Promise<{ caso?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await props.searchParams;
  const key = sp.caso && CASES[sp.caso] ? sp.caso : "bloqueante";
  const c = CASES[key];
  const check = profileCheck(c.profile, { campusesExist: true });
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="page-title">Ventana de bienvenida</h1>
      <p className="mb-4 mt-1 text-sm text-stone-500">Caso: {c.label}</p>
      <ul className="flex flex-wrap gap-2">
        {Object.entries(CASES).map(([k, v]) => (
          <li key={k}>
            <Link href={`/diseno/bienvenida?caso=${k}`} className={`btn btn-sm ${k === key ? "btn-primary" : "btn-secondary"}`}>{v.label}</Link>
          </li>
        ))}
      </ul>
      <WelcomeDialog
        key={key}
        userId="demo"
        signInKey={`demo-${key}-${Date.now()}`}
        firstName="Pablo"
        country={c.country}
        missing={check.missing}
        percent={check.percent}
        blocking={check.blocking}
      />
    </main>
  );
}
