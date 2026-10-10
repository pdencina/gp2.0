import Link from "next/link";
import { getSession } from "@/lib/session";
import { scheduleLabel, todayInChile, type GroupOverview } from "@/lib/format";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { EmptyState, ProgressRing } from "@/components/ui";
import { dayMonth, weekdayName } from "@/lib/calendar";
import {
  CE_LABEL,
  CE_STYLE,
  normalizeProgress,
  progressSummary,
  type CurriculumEnrollment,
  type CurriculumProgress,
} from "@/lib/progress";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi progreso" };

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

  // Grupo vigente de cada inscripción y su próxima reunión
  const { data: mem } = rows.length
    ? await supabase
        .from("enrollments")
        .select("curriculum_enrollment_id, group_id")
        .in("curriculum_enrollment_id", rows.map((r) => r.id))
        .in("status", ["preinscrito", "en_curso"])
    : { data: [] };
  const memberships = (mem ?? []) as { curriculum_enrollment_id: string; group_id: string }[];
  const groupIds = memberships.map((m) => m.group_id);
  const [{ data: gs }, { data: mt }] = groupIds.length
    ? await Promise.all([
        supabase.from("group_overview").select("*").in("id", groupIds),
        supabase.from("meetings").select("group_id, held_on").in("group_id", groupIds).in("status", ["planificada", "reprogramada"]).gte("held_on", todayInChile()).order("held_on"),
      ])
    : [{ data: [] }, { data: [] }];
  const groupOf = (ce: string) => {
    const m = memberships.find((x) => x.curriculum_enrollment_id === ce);
    return m ? ((gs ?? []) as GroupOverview[]).find((g) => g.id === m.group_id) : undefined;
  };
  const nextOf = (gid: string) => ((mt ?? []) as { group_id: string; held_on: string }[]).find((x) => x.group_id === gid)?.held_on;

  return (
    <div className="mx-auto max-w-4xl p-4 pb-16 md:p-8 md:pb-16">
      <header className="enter mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Mi progreso</h1>
          <p className="page-sub">Tu camino en cada programa. Se conserva aunque cambies de grupo, de horario o de modalidad.</p>
        </div>
        <Link href="/catalogo" className="btn btn-secondary">
          <Icon name="plus" className="h-4 w-4" />
          Otro programa
        </Link>
      </header>
      <Flash error={searchParams.error} ok={searchParams.ok} />

      {rows.length === 0 ? (
        <EmptyState icon="route" title="Todavía no estás inscrito en ningún programa" action={{ href: "/catalogo", label: "Ver el catálogo" }}>
          Elige un programa y empieza tu camino. Después podrás escoger tu grupo y tu horario.
        </EmptyState>
      ) : (
        <ul className="stagger space-y-3">
          {rows.map((r) => {
            const p = progress.get(r.id)!;
            const g = groupOf(r.id);
            const next = g ? nextOf(g.id) : undefined;
            const pct = p.units_total > 0 ? (p.units_done / p.units_total) * 100 : 0;
            return (
              <li key={r.id}>
                <Link href={`/mi-progreso/${r.id}`} className="card card-hover group flex items-center gap-4 p-4 md:gap-5 md:p-5">
                  <ProgressRing value={pct} size={72} stroke={8} label={`Avance de ${r.curriculums?.name ?? "tu programa"}`}>
                    {p.units_total > 0 ? `${Math.round(pct)}%` : <Icon name="route" className="h-6 w-6 text-stone-400" />}
                  </ProgressRing>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-semibold">{r.curriculums?.name ?? "Programa"}</h2>
                      <span className={`chip ${CE_STYLE[r.status]}`}>{CE_LABEL[r.status]}</span>
                      {r.formative_year > 1 && <span className="chip bg-stone-100 text-stone-600">Año {r.formative_year}</span>}
                    </div>

                    <p className="mt-1 text-sm text-stone-500">
                      {p.units_total > 0
                        ? `${progressSummary(p)}${p.next_unit_title ? ` · Sigue: ${p.next_unit_title}` : ""}`
                        : progressSummary(p)}
                    </p>

                    <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      {g ? (
                        <>
                          <span className="inline-flex items-center gap-1.5 text-stone-600">
                            <Icon name={g.modality === "virtual" ? "video" : "pin"} className="h-4 w-4 text-brand-teal" />
                            {g.name} · {scheduleLabel(g)}
                          </span>
                          {next && (
                            <span className="inline-flex items-center gap-1.5 font-medium text-brand-teal-800">
                              <Icon name="calendar-check" className="h-4 w-4" />
                              {weekdayName(next)} {dayMonth(next).slice(0, 5)}
                            </span>
                          )}
                        </>
                      ) : r.status === "activo" ? (
                        <span className="font-medium text-amber-700">Aún no tienes grupo: elige uno</span>
                      ) : r.status === "pausado" ? (
                        <span className="text-stone-500">En pausa{r.pause_reason ? ` · ${r.pause_reason}` : ""}. Retómalo cuando quieras</span>
                      ) : null}
                    </p>
                    {p.stage_credits > 0 && (
                      <p className="mt-1 text-xs text-stone-400">
                        {p.stage_credits} {p.stage_credits === 1 ? "etapa" : "etapas"} de la plataforma anterior (en revisión)
                      </p>
                    )}
                  </div>

                  <Icon name="chevron-right" className="hidden h-5 w-5 shrink-0 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-brand-teal sm:block" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
