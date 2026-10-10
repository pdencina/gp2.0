import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, type Person } from "@/lib/session";
import { Flash, fieldClass, primaryBtn } from "@/components/Flash";
import {
  agregarPastor,
  emitirCertificado,
  emitirVarios,
  quitarPastor,
  revocarCertificado,
} from "@/app/actions/certificados";
import { canOpenCertificates, certificateTitle, formatCode } from "@/lib/certificates";

export const dynamic = "force-dynamic";

type Program = { id: string; name: string; duration_years: number };
type Candidate = {
  ce_id: string;
  person_name: string;
  campus: string | null;
  kind: "etapa" | "programa";
  formative_year: number | null;
  pct: number | string | null;
  can_issue: boolean;
};
type Issued = {
  id: string;
  code: string;
  kind: "etapa" | "programa";
  formative_year: number | null;
  status: "emitido" | "revocado";
  issued_at: string;
  profiles: { full_name: string } | null;
  campuses: { name: string } | null;
};

const dateEs = (iso: string) => new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });

export default async function CertificadosPage(props: {
  searchParams: Promise<{ error?: string; ok?: string; aviso?: string; programa?: string; anio?: string }>;
}) {
  const sp = await props.searchParams;
  const { supabase, user, role } = await getSession();
  const { data: pastorRows, error: pErr } = await supabase.from("campus_pastors").select("campus_id").eq("person_id", user.id);
  const isPastor = (pastorRows ?? []).length > 0;
  if (!canOpenCertificates(role, isPastor)) redirect("/inicio");
  const isAdmin = role === "admin";

  if (pErr) {
    return (
      <div className="enter mx-auto max-w-3xl p-4 pb-16 md:p-8 md:pb-16">
        <h1 className="page-title">Certificados</h1>
        <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          Falta instalar los certificados en la base de datos: ejecuta <code>supabase/v2/010_certificados.sql</code> en el SQL Editor de Supabase.
        </p>
      </div>
    );
  }

  const { data: progRows } = await supabase.from("curriculums").select("id, name, duration_years").eq("certifiable", true).order("name");
  const programs = (progRows ?? []) as Program[];
  const program = programs.find((p) => p.id === sp.programa) ?? programs[0];
  const year = program && program.duration_years > 1 && /^\d+$/.test(sp.anio ?? "") ? parseInt(sp.anio!, 10) : null;

  const [candR, issuedR, campusR] = await Promise.all([
    program ? supabase.rpc("certificate_candidates", { cid: program.id, y: year, lim: 200 }) : Promise.resolve({ data: [], error: null }),
    program
      ? supabase
          .from("certificates")
          .select("id, code, kind, formative_year, status, issued_at, profiles:person_id(full_name), campuses:campus_id(name)")
          .eq("curriculum_id", program.id)
          .order("issued_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] }),
    supabase.from("campuses").select("id, name").eq("active", true).order("name"),
  ]);
  const candidates = (candR.data ?? []) as Candidate[];
  const issued = (issuedR.data ?? []) as unknown as Issued[];
  const campuses = (campusR.data ?? []) as { id: string; name: string }[];
  const issuable = candidates.filter((c) => c.can_issue).length;

  let pastors: { person_id: string; campus_id: string }[] = [];
  let names = new Map<string, string>();
  let people: Person[] = [];
  if (isAdmin) {
    const { data } = await supabase.from("campus_pastors").select("person_id, campus_id");
    pastors = (data ?? []) as typeof pastors;
    const ids = Array.from(new Set(pastors.map((p) => p.person_id)));
    if (ids.length) {
      const { data: n } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      names = new Map(((n ?? []) as Person[]).map((p) => [p.id, p.full_name]));
    }
    people = (((await supabase.rpc("assignable_people", { r: "lider" })).data ?? []) as Person[]);
  }
  const scopeFields = (
    <>
      <input type="hidden" name="programa" value={program?.id ?? ""} />
      <input type="hidden" name="anio" value={year ?? ""} />
    </>
  );

  return (
    <div className="enter mx-auto max-w-4xl p-4 pb-16 md:p-8 md:pb-16">
      <h1 className="page-title">Certificados</h1>
      <p className="mb-5 mt-1 text-sm text-stone-500">
        Emiten el administrador y los pastores designados en cada sede. Un certificado se emite solo cuando la persona cumple los requisitos de la etapa o del programa.
      </p>
      <Flash error={sp.error} ok={sp.ok} />
      {sp.aviso && <p role="status" className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{sp.aviso}</p>}

      {programs.length === 0 ? (
        <p className="empty">
          Ningún programa entrega certificado todavía. El administrador lo activa en Currículums → Clasificar.
        </p>
      ) : (
        <>
          <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
            <label className="text-xs text-stone-500">
              Programa
              <select name="programa" defaultValue={program?.id} className={`${fieldClass} mt-1 min-w-[14rem]`}>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            {program && program.duration_years > 1 && (
              <label className="text-xs text-stone-500">
                Certificado de
                <select name="anio" defaultValue={year ?? ""} className={`${fieldClass} mt-1`}>
                  <option value="">Programa completo</option>
                  {Array.from({ length: program.duration_years }, (_, i) => i + 1).map((y) => <option key={y} value={y}>Año {y}</option>)}
                </select>
              </label>
            )}
            <button className="btn btn-secondary">Ver</button>
          </form>

          <section className="mb-6">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="section-title">
                Listos para certificar {candidates.length > 0 && <span className="font-normal text-stone-500">({candidates.length}{candidates.length >= 200 ? "+" : ""})</span>}
              </h2>
              {issuable > 1 && (
                <form action={emitirVarios}>
                  {scopeFields}
                  <button className={primaryBtn}>Emitir a quienes puedo certificar (hasta 100)</button>
                </form>
              )}
            </div>
            {candR.error ? (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{candR.error.message}</p>
            ) : candidates.length === 0 ? (
              <p className="empty">
                Nadie cumple todavía los requisitos de {year ? `el año ${year}` : "este programa"}, o ya tienen su certificado.
              </p>
            ) : (
              <ul className="space-y-2">
                {candidates.map((c) => (
                  <li key={c.ce_id} className="flex flex-wrap items-center justify-between gap-2 card p-3 text-sm">
                    <span>
                      <Link href={`/mi-progreso/${c.ce_id}`} className="font-medium hover:underline">{c.person_name || "Sin nombre"}</Link>
                      <span className="ml-2 text-stone-500">{c.campus ?? "Sin sede"}</span>
                    </span>
                    {c.can_issue ? (
                      <form action={emitirCertificado}>
                        {scopeFields}
                        <input type="hidden" name="ce" value={c.ce_id} />
                        <input type="hidden" name="year" value={c.formative_year ?? ""} />
                        <button className="btn btn-primary">Emitir</button>
                      </form>
                    ) : (
                      <span className="text-xs text-stone-400">Lo emite el pastor de su sede o el administrador</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mb-6">
            <h2 className="mb-2 section-title">Emitidos</h2>
            {issued.length === 0 ? (
              <p className="empty">Todavía no hay certificados emitidos de este programa.</p>
            ) : (
              <ul className="space-y-2">
                {issued.map((c) => (
                  <li key={c.id} className="card p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <Link href={`/certificados/${c.id}`} className="font-medium link">{c.profiles?.full_name || "Sin nombre"}</Link>
                        <span className="ml-2 text-stone-500">{certificateTitle(c, program?.name ?? "")}</span>
                      </span>
                      <span className="text-xs text-stone-500">
                        {c.status === "revocado" && <span className="mr-2 chip bg-red-50 text-red-700">Revocado</span>}
                        {formatCode(c.code)} · {c.campuses?.name ?? "Sin sede"} · {dateEs(c.issued_at)}
                      </span>
                    </div>
                    {isAdmin && c.status === "emitido" && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-stone-500">Revocar</summary>
                        <form action={revocarCertificado} className="mt-2 flex flex-wrap items-center gap-2">
                          {scopeFields}
                          <input type="hidden" name="id" value={c.id} />
                          <input name="reason" placeholder="Motivo (obligatorio)" aria-label="Motivo" className={`${fieldClass} md:max-w-xs`} />
                          <button className="btn btn-danger">Revocar certificado</button>
                        </form>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {isAdmin && (
        <section className="card p-4">
          <h2 className="mb-1 section-title">Pastores designados por sede</h2>
          <p className="mb-3 text-xs text-stone-500">
            Pueden emitir certificados de las personas de su sede (la del grupo en que participan o, si no tienen, la de su perfil). Una persona sin sede solo la certifica el administrador.
          </p>
          {pastors.length === 0 ? (
            <p className="text-sm text-stone-400">Todavía no hay pastores designados.</p>
          ) : (
            <ul className="mb-3 space-y-1 text-sm">
              {pastors.map((p) => (
                <li key={`${p.person_id}-${p.campus_id}`} className="flex items-center justify-between gap-2">
                  <span>{names.get(p.person_id) || "Sin nombre"} <span className="text-stone-500">· {campuses.find((c) => c.id === p.campus_id)?.name}</span></span>
                  <form action={quitarPastor}>
                    <input type="hidden" name="person" value={p.person_id} />
                    <input type="hidden" name="campus" value={p.campus_id} />
                    <button className="text-xs text-stone-500 hover:text-red-700 hover:underline">Quitar</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={agregarPastor} className="flex flex-wrap items-center gap-2">
            <select name="person" defaultValue="" aria-label="Persona" className={`${fieldClass} md:max-w-xs`}>
              <option value="" disabled>Persona…</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.full_name || "Sin nombre"}</option>)}
            </select>
            <select name="campus" defaultValue="" aria-label="Sede" className={`${fieldClass} md:max-w-[12rem]`}>
              <option value="" disabled>Sede…</option>
              {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="btn btn-outline">Designar</button>
          </form>
        </section>
      )}
    </div>
  );
}
