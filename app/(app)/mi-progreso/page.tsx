import Link from "next/link";
import { getSession } from "@/lib/session";
import { scheduleLabel, type GroupOverview } from "@/lib/format";
import { Flash } from "@/components/Flash";
import {
  CE_LABEL,
  CE_STYLE,
  normalizeProgress,
  progressSummary,
  type CurriculumEnrollment,
  type CurriculumProgress,
} from "@/lib/progress";

export const dynamic = "force-dynamic";

type Row = CurriculumEnrollment & { curriculums: { name: string; offering: string | null } | null };

export default async function MiProgresoPage(props: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const searchParams = await props.searchParams;
  const { supabase, user } = await getSession();

  const { data } = await supabase
    .from("curriculum_enrollments")
    .select("id, curriculum_id, status, formative_year, started_at, paused_at, pause_reason, imported, curriculums(name, offering)")
    .eq("person_id", user.id)
    .in("status", ["activo", "pausado", "completado"])
    .order("started_at", { ascending: false });
  const rows = (data ?? []) as unknown as Row[];

  const progress = new Map<string, CurriculumProgress>();
  await Promise.all(
    rows.map(async (r) => {
      const { data: p } = await supabase.rpc("curriculum_progress", { ce: r.id });
      progress.set(r.id, normalizeProgress((p as Partial<CurriculumProgress>[] | null)?.[0]));
    }),
  );

  // Grupo vigente de cada inscripción
  const { data: mem } = rows.length
    ? await supabase
        .from("enrollments")
        .select("curriculum_enrollment_id, group_id")
        .in("curriculum_enrollment_id", rows.map((r) => r.id))
        .in("status", ["preinscrito", "en_curso"])
    : { data: [] };
  const memberships = (mem ?? []) as { curriculum_enrollment_id: string; group_id: string }[];
  const groupIds = memberships.map((m) => m.group_id);
  const { data: gs } = groupIds.length
    ? await supabase.from("group_overview").select("*").in("id", groupIds)
    : { data: [] };
  const groupOf = (ce: string) => {
    const m = memberships.find((x) => x.curriculum_enrollment_id === ce);
    return m ? ((gs ?? []) as GroupOverview[]).find((g) => g.id === m.group_id) : undefined;
  };

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <h1 className="text-2xl font-medium">Mi progreso</h1>
      <p className="mb-5 mt-1 text-sm text-stone-500">Tu camino en cada programa. Se conserva aunque cambies de grupo, de horario o de modalidad.</p>
      <Flash error={searchParams.error} ok={searchParams.ok} />

      {rows.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-white p-6 text-center">
          <p className="text-sm text-stone-500">Todavía no estás inscrito en ningún programa.</p>
          <Link href="/catalogo" className="mt-3 inline-block rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-medium text-white hover:brightness-95">
            Ver el catálogo
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const p = progress.get(r.id)!;
            const g = groupOf(r.id);
            return (
              <li key={r.id}>
                <Link href={`/mi-progreso/${r.id}`} className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-brand-teal">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-medium">{r.curriculums?.name ?? "Programa"}</h2>
                    <span className={`rounded px-2 py-0.5 text-xs ${CE_STYLE[r.status]}`}>{CE_LABEL[r.status]}</span>
                  </div>

                  {p.units_total > 0 ? (
                    <div className="mt-3">
                      <div className="h-2 overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-valuenow={p.units_done} aria-valuemin={0} aria-valuemax={p.units_total} aria-label="Avance">
                        <div className="h-full bg-brand-green" style={{ width: `${Math.min(100, Math.round(((p.units_done || 0) / p.units_total) * 100))}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-stone-500">
                        {progressSummary(p)}
                        {p.next_unit_title ? ` · Sigue: ${p.next_unit_title}` : ""}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-stone-400">{progressSummary(p)}</p>
                  )}

                  <p className="mt-3 text-sm text-stone-600">
                    {g ? (
                      <>
                        {g.name} <span className="text-stone-400">· {scheduleLabel(g)}</span>
                      </>
                    ) : r.status === "activo" ? (
                      <span className="text-amber-700">Aún no tienes grupo: elige uno →</span>
                    ) : r.status === "pausado" ? (
                      <span className="text-stone-500">En pausa{r.pause_reason ? ` · ${r.pause_reason}` : ""}. Retómalo cuando quieras →</span>
                    ) : null}
                  </p>
                  {p.stage_credits > 0 && (
                    <p className="mt-1 text-xs text-stone-400">
                      {p.stage_credits} {p.stage_credits === 1 ? "etapa" : "etapas"} de la plataforma anterior (en revisión)
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 text-center text-sm">
        <Link href="/catalogo" className="text-brand-teal hover:underline">
          Ver el catálogo de programas
        </Link>
      </p>
    </div>
  );
}
