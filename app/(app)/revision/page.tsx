import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { STATUS_LABEL, STATUS_STYLE, hasErrors, type EditorialStatus, type Issue } from "@/lib/versions";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  curriculum_id: string;
  version: number;
  label: string | null;
  status: EditorialStatus;
  curriculums: { name: string } | null;
};

const ORDER: EditorialStatus[] = ["en_revision_pastoral", "aprobado", "en_adaptacion", "cargado"];
const TITLE: Record<string, string> = {
  en_revision_pastoral: "Esperan revisión pastoral",
  aprobado: "Aprobadas, listas para publicar",
  en_adaptacion: "En adaptación",
  cargado: "Recién cargadas",
};

export default async function RevisionPage() {
  const { supabase, role } = await getSession();
  if (role !== "admin" && role !== "coordinador") redirect("/inicio");

  const { data, error } = await supabase
    .from("curriculum_versions")
    .select("id, curriculum_id, version, label, status, curriculums(name)")
    .in("status", ORDER)
    .order("version", { ascending: false });
  const rows = (data ?? []) as unknown as Row[];

  const issues = new Map<string, Issue[]>();
  await Promise.all(
    rows.map(async (r) => {
      const { data: i } = await supabase.rpc("version_readiness", { vid: r.id });
      issues.set(r.id, (i ?? []) as Issue[]);
    }),
  );

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <h1 className="text-2xl font-medium">Revisión curricular</h1>
      <p className="mb-5 mt-1 text-sm text-stone-500">
        Las versiones de los programas que están en camino a publicarse. Un contenido solo llega a los participantes después de la aprobación pastoral.
      </p>
      {error && (
        <p className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          Falta instalar el flujo editorial: ejecuta <code>supabase/v2/009_biblioteca.sql</code> en el SQL Editor de Supabase.
        </p>
      )}
      {!error && rows.length === 0 && (
        <p className="rounded-xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
          No hay versiones en preparación. Para empezar una, entra a un currículum y copia su versión.
        </p>
      )}

      {ORDER.map((st) => {
        const list = rows.filter((r) => r.status === st);
        if (list.length === 0) return null;
        return (
          <section key={st} className="mb-6">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-400">{TITLE[st]}</h2>
            <ul className="space-y-2">
              {list.map((r) => {
                const iss = issues.get(r.id) ?? [];
                const errors = iss.filter((i) => i.level === "error").length;
                const warnings = iss.length - errors;
                return (
                  <li key={r.id}>
                    <Link href={`/curriculums/${r.curriculum_id}?v=${r.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white p-4 hover:border-brand-teal">
                      <span className="text-sm">
                        <span className="font-medium">{r.curriculums?.name}</span>
                        <span className="ml-2 text-stone-500">Versión {r.version}{r.label ? ` · ${r.label}` : ""}</span>
                      </span>
                      <span className="flex items-center gap-2 text-xs">
                        {errors > 0 && <span className="rounded bg-red-50 px-2 py-0.5 text-red-700">{errors} por resolver</span>}
                        {warnings > 0 && !hasErrors(iss) && <span className="rounded bg-stone-100 px-2 py-0.5 text-stone-600">{warnings} avisos</span>}
                        <span className={`rounded px-2 py-0.5 ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
