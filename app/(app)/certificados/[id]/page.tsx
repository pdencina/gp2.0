import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { Logo } from "@/components/Logo";
import { PrintButton } from "@/components/PrintButton";
import { formatCode } from "@/lib/certificates";

export const dynamic = "force-dynamic";

type Cert = {
  id: string;
  code: string;
  kind: "etapa" | "programa";
  formative_year: number | null;
  status: "emitido" | "revocado";
  issued_at: string;
  issued_by: string | null;
  person_id: string;
  profiles: { full_name: string } | null;
  curriculums: { name: string; duration_years: number } | null;
  campuses: { name: string } | null;
};

const longDate = (iso: string) => new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Santiago" });

export default async function CertificadoPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { supabase, user } = await getSession();

  const { data } = await supabase
    .from("certificates")
    .select("id, code, kind, formative_year, status, issued_at, issued_by, person_id, profiles:person_id(full_name), curriculums:curriculum_id(name, duration_years), campuses:campus_id(name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const c = data as unknown as Cert;
  const { data: issuer } = c.issued_by ? await supabase.from("profiles").select("full_name").eq("id", c.issued_by).maybeSingle() : { data: null };
  const issuerName = (issuer as { full_name: string } | null)?.full_name;
  const mine = c.person_id === user.id;
  const revoked = c.status === "revocado";

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8 print:max-w-none print:p-0">
      <div className="mb-4 flex items-center justify-between text-sm print:hidden">
        <Link href={mine ? "/mi-progreso" : "/certificados"} className="text-brand-teal hover:underline">← Volver</Link>
        <span className="text-xs text-stone-500">Para guardarlo, usa Imprimir y elige “Guardar como PDF”.</span>
      </div>

      <article
        className={`relative rounded-2xl border-4 border-double bg-white p-8 text-center md:p-12 print:rounded-none print:border-stone-400 ${revoked ? "border-red-200" : "border-brand-teal/40"}`}
        aria-label="Certificado"
      >
        {revoked && (
          <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm font-medium text-red-700">Este certificado fue revocado. Ya no es válido.</p>
        )}
        <div className="mb-6 flex justify-center"><Logo /></div>
        <p className="text-sm uppercase tracking-[0.25em] text-stone-500">Certificado</p>
        <p className="mt-6 text-sm text-stone-500">Se certifica que</p>
        <h1 className="mt-2 text-3xl font-medium md:text-4xl">{c.profiles?.full_name || "—"}</h1>
        <p className="mt-6 text-sm text-stone-500">
          {c.kind === "programa" ? "completó el programa" : `cumplió el año ${c.formative_year} del programa`}
        </p>
        <h2 className="mt-2 text-2xl font-medium text-brand-teal md:text-3xl">{c.curriculums?.name}</h2>
        {c.kind === "etapa" && c.curriculums && (
          <p className="mt-1 text-sm text-stone-500">Etapa {c.formative_year} de {c.curriculums.duration_years}</p>
        )}
        <p className="mt-8 text-sm text-stone-600">
          {c.campuses?.name ? `Sede ${c.campuses.name} · ` : ""}
          {longDate(c.issued_at)}
        </p>
        {issuerName && <p className="mt-6 text-sm text-stone-500">Emitido por {issuerName}</p>}

        <div className="mt-8 border-t border-stone-200 pt-4 text-xs text-stone-500">
          <p>Código de verificación <strong className="font-mono text-sm text-stone-700">{formatCode(c.code)}</strong></p>
          <p className="mt-1">Verifícalo en <span className="font-mono">/verificar</span> de la plataforma de Grupos Pequeños ARM Global.</p>
        </div>
      </article>

      <p className="mt-4 text-center print:hidden">
        <PrintButton />
      </p>
    </div>
  );
}
