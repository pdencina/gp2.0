import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { BrandLogo } from "@/components/BrandLogo";
import { PrintButton } from "@/components/PrintButton";
import { Icon } from "@/components/Icon";
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
        <Link href={mine ? "/mi-progreso" : "/certificados"} className="inline-flex items-center gap-1 font-medium text-stone-500 transition hover:text-brand-teal">
          <Icon name="arrow-left" className="h-4 w-4" />
          Volver
        </Link>
        <span className="text-xs text-stone-500">Para guardarlo, usa Imprimir y elige “Guardar como PDF”.</span>
      </div>

      <article
        className={`pop-in relative overflow-hidden rounded-3xl border-4 border-double bg-white p-8 text-center shadow-lg md:p-14 print:rounded-none print:border-stone-400 print:shadow-none ${revoked ? "border-red-200" : "border-brand-teal/40"}`}
        aria-label="Certificado"
      >
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-brand-teal-400 via-brand-green-400 to-brand-orange-400" />
        <span aria-hidden="true" className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-brand-orange-400/10 print:hidden" />
        <span aria-hidden="true" className="absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-brand-teal-400/10 print:hidden" />
        <div className="relative">
        {revoked && (
          <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">Este certificado fue revocado. Ya no es válido.</p>
        )}
        <div className="mb-6 flex justify-center"><BrandLogo variant="stacked" anim="intro" className="h-24 w-auto md:h-28" /></div>
        <span aria-hidden="true" className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full ring-4 ${revoked ? "bg-red-50 text-red-500 ring-red-100" : "bg-brand-teal-50 text-brand-teal ring-brand-teal-100"}`}>
          <Icon name="award" className="h-7 w-7" />
        </span>
        <p className="text-sm uppercase tracking-[0.25em] text-stone-500">Certificado</p>
        <p className="mt-6 text-sm text-stone-500">Se certifica que</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">{c.profiles?.full_name || "—"}</h1>
        <span aria-hidden="true" className="mx-auto mt-4 block h-0.5 w-24 rounded-full bg-gradient-to-r from-brand-teal-400 to-brand-orange-400" />
        <p className="mt-6 text-sm text-stone-500">
          {c.kind === "programa" ? "completó el programa" : `cumplió el año ${c.formative_year} del programa`}
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-brand-teal md:text-4xl">{c.curriculums?.name}</h2>
        {c.kind === "etapa" && c.curriculums && (
          <p className="mt-2"><span className="chip bg-brand-teal-50 text-brand-teal-800">Etapa {c.formative_year} de {c.curriculums.duration_years}</span></p>
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
        </div>
      </article>

      <p className="mt-4 text-center print:hidden">
        <PrintButton />
      </p>
    </div>
  );
}
