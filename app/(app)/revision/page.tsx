import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Icon } from "@/components/Icon";
import { Callout, EmptyState, PageHeader } from "@/components/ui";
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
    <div className="enter mx-auto max-w-4xl p-4 pb-16 md:p-8 md:pb-16">
      <PageHeader
        title="Revisión curricular"
        subtitle="Las versiones de los programas que están en camino a publicarse. Un contenido solo llega a los participantes después de la aprobación pastoral."
      />
      {error && (
        <Callout tone="warn" className="mb-4">
          Falta instalar el flujo editorial: ejecuta <code>supabase/v2/009_biblioteca.sql</code> en el SQL Editor de Supabase.
        </Callout>
      )}
      {!error && rows.length === 0 && (
        <EmptyState icon="book" title="No hay versiones en preparación" action={{ href: "/curriculums", label: "Ir a los currículums" }}>
          Para empezar una, entra a un currículum y copia su versión.
        </EmptyState>
      )}

      {ORDER.map((st) => {
        const list = rows.filter((r) => r.status === st);
        if (list.length === 0) return null;
        return (
          <section key={st} className="mb-6">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-400">{TITLE[st]}</h2>
            <ul className="stagger space-y-2">
              {list.map((r) => {
                const iss = issues.get(r.id) ?? [];
                const errors = iss.filter((i) => i.level === "error").length;
                const warnings = iss.length - errors;
                return (
                  <li key={r.id}>
                    <Link href={`/curriculums/${r.curriculum_id}?v=${r.id}`} className="flex flex-wrap items-center justify-between gap-2 card card-hover p-4">
                      <span className="flex items-center gap-3 text-sm">
                        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-teal-50 text-brand-teal">
                          <Icon name="book" className="h-[18px] w-[18px]" />
                        </span>
                        <span>
                          <span className="font-semibold">{r.curriculums?.name}</span>
                          <span className="block text-xs text-stone-500">Versión {r.version}{r.label ? ` · ${r.label}` : ""}</span>
                        </span>
                      </span>
                      <span className="flex items-center gap-2 text-xs">
                        {errors > 0 && <span className="chip bg-red-50 text-red-700">{errors} por resolver</span>}
                        {warnings > 0 && !hasErrors(iss) && <span className="chip bg-stone-100 text-stone-600">{warnings} avisos</span>}
                        <span className={`chip ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
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
