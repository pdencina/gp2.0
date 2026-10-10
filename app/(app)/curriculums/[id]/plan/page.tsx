import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Flash, fieldClass, primaryBtn } from "@/components/Flash";
import { guardarPosicion, proponerDistribucion } from "@/app/actions/curriculo";
import { STATUS_LABEL, STATUS_STYLE, isEditable, type EditorialStatus } from "@/lib/versions";

export const dynamic = "force-dynamic";

const KINDS: Record<string, string> = {
  contenido: "Contenido",
  integracion: "Integración",
  practica: "Práctica",
  evaluacion: "Evaluación",
  recuperacion: "Recuperación",
  cierre: "Cierre",
  actividad: "Actividad",
};

type Version = { id: string; version: number; label: string | null; status: EditorialStatus; content_frozen: boolean };
type Cycle = { id: string; number: number; title: string | null; formative_year: number };
type Unit = { id: string; number: number; title: string; cycle_id: string };
type Slot = { id: string; position: number; kind: string; title: string | null; notes: string | null };

export default async function PlanPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string; v?: string; year?: string }>;
}) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const { supabase, role } = await getSession();
  if (role !== "admin" && role !== "coordinador") redirect("/inicio");

  const { data: curriculum } = await supabase.from("curriculums").select("id, name, duration_years").eq("id", id).maybeSingle();
  if (!curriculum) notFound();
  const { data: vrows } = await supabase
    .from("curriculum_versions")
    .select("id, version, label, status, content_frozen, is_current")
    .eq("curriculum_id", id)
    .order("version", { ascending: false });
  const versions = (vrows ?? []) as (Version & { is_current: boolean })[];
  const version = versions.find((v) => v.id === sp.v) ?? versions.find((v) => v.is_current) ?? versions[0];
  if (!version) notFound();
  const editable = isEditable(version);

  const { data: cycleRows } = await supabase
    .from("cycles")
    .select("id, number, title, formative_year")
    .eq("version_id", version.id)
    .order("formative_year")
    .order("number");
  const cycles = (cycleRows ?? []) as Cycle[];
  const maxYear = Math.max(curriculum.duration_years ?? 1, ...cycles.map((c) => c.formative_year), 1);
  const year = Math.min(maxYear, Math.max(1, parseInt(sp.year ?? "1", 10) || 1));
  const yearCycles = cycles.filter((c) => c.formative_year === year);

  const { data: unitRows } = yearCycles.length
    ? await supabase.from("lessons").select("id, number, title, cycle_id").in("cycle_id", yearCycles.map((c) => c.id)).order("number")
    : { data: [] };
  const units = (unitRows ?? []) as Unit[];
  const cycleNo = new Map(yearCycles.map((c) => [c.id, c.number]));
  const ordered = [...units].sort((a, b) => (cycleNo.get(a.cycle_id) ?? 0) - (cycleNo.get(b.cycle_id) ?? 0) || a.number - b.number);
  const unitById = new Map(ordered.map((u) => [u.id, u]));
  const label = (u: Unit) => `${cycleNo.get(u.cycle_id)}.${u.number}`;

  const { data: planRow } = await supabase
    .from("annual_learning_plans")
    .select("id, status")
    .eq("version_id", version.id)
    .eq("formative_year", year)
    .maybeSingle();
  const planId = (planRow as { id: string } | null)?.id;

  const [slotsR, suR, covR] = planId
    ? await Promise.all([
        supabase.from("learning_plan_slots").select("id, position, kind, title, notes").eq("plan_id", planId).order("position"),
        supabase.from("learning_plan_slot_units").select("slot_id, unit_id"),
        supabase.rpc("plan_coverage", { pid: planId }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const slots = new Map(((slotsR.data ?? []) as Slot[]).map((s) => [s.position, s]));
  const slotIds = new Set(Array.from(slots.values()).map((s) => s.id));
  const unitsOf = new Map<string, string[]>();
  for (const r of (suR.data ?? []) as { slot_id: string; unit_id: string }[]) {
    if (!slotIds.has(r.slot_id)) continue;
    unitsOf.set(r.slot_id, [...(unitsOf.get(r.slot_id) ?? []), r.unit_id]);
  }
  const coverage = (covR.data ?? []) as { problema: string; detalle: string }[];
  const uncovered = coverage.filter((c) => c.problema === "unidad_sin_cobertura");
  const emptyWeeks = coverage.filter((c) => c.problema === "semana_vacia").length;
  const hasAssignments = Array.from(unitsOf.values()).some((l) => l.length > 0);

  const lastPosition = Math.max(36, ...Array.from(slots.keys()));
  const positions = Array.from({ length: lastPosition }, (_, i) => i + 1);
  const here = `?v=${version.id}`;

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <Link href={`/curriculums/${id}${here}`} className="text-sm text-brand-teal hover:underline">← {curriculum.name}</Link>
      <h1 className="mt-2 text-2xl font-medium">Plan de 36 encuentros</h1>
      <p className="mb-4 mt-1 text-sm text-stone-500">
        Cómo se reparte el material en las semanas del año. Las 36 semanas son planificación pedagógica: no tienen que coincidir con la cantidad de capítulos del material original.
      </p>
      <Flash error={sp.error} ok={sp.ok} />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Versión {version.version}</span>
        <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[version.status]}`}>{STATUS_LABEL[version.status]}</span>
        {versions.length > 1 && (
          <span className="flex gap-1 text-xs">
            {versions.filter((v) => v.id !== version.id).map((v) => (
              <Link key={v.id} href={`/curriculums/${id}/plan?v=${v.id}&year=${year}`} className="rounded border border-stone-200 px-2 py-0.5 text-stone-500 hover:border-brand-teal">
                Ver versión {v.version}
              </Link>
            ))}
          </span>
        )}
      </div>

      {maxYear > 1 && (
        <nav aria-label="Año formativo" className="mb-4 flex gap-2">
          {Array.from({ length: maxYear }, (_, i) => i + 1).map((y) => (
            <Link
              key={y}
              href={`/curriculums/${id}/plan?v=${version.id}&year=${y}`}
              aria-current={y === year ? "page" : undefined}
              className={`rounded-lg border px-3 py-1.5 text-sm ${y === year ? "border-brand-teal bg-brand-teal/10 font-medium text-brand-teal" : "border-stone-200 bg-white text-stone-600"}`}
            >
              Año {y}
            </Link>
          ))}
        </nav>
      )}

      {!editable && (
        <p className="mb-4 rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600">
          Esta versión no se puede editar. Copia la versión desde el currículum para cambiar el plan.
        </p>
      )}

      {units.length === 0 ? (
        <p className="rounded-xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
          No hay unidades en el año {year} de esta versión. Carga los módulos y unidades del material original primero.
        </p>
      ) : (
        <>
          <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4">
            <p className="text-sm text-stone-600">
              {units.length} {units.length === 1 ? "unidad" : "unidades"} en {yearCycles.length} {yearCycles.length === 1 ? "módulo" : "módulos"} ·{" "}
              {planId ? (
                <>
                  <span className={emptyWeeks > 0 ? "text-amber-700" : ""}>{emptyWeeks} semanas sin definir</span> ·{" "}
                  <span className={uncovered.length > 0 ? "text-red-700" : ""}>{uncovered.length} unidades sin semana</span>
                </>
              ) : (
                "sin plan todavía"
              )}
            </p>
            {editable && !hasAssignments && (
              <form action={proponerDistribucion}>
                <input type="hidden" name="curriculum_id" value={id} />
                <input type="hidden" name="version_id" value={version.id} />
                <input type="hidden" name="year" value={year} />
                <button className="h-10 rounded-lg border border-brand-teal px-3 text-sm text-brand-teal hover:bg-brand-teal hover:text-white">
                  Proponer una distribución pareja
                </button>
              </form>
            )}
          </section>
          {editable && !hasAssignments && (
            <p className="mb-4 text-xs text-stone-500">
              La propuesta reparte las unidades en orden a lo largo de las 36 semanas (una unidad puede ocupar varias semanas, o una semana puede agrupar varias unidades). Es solo un punto de partida: después se ajusta semana por semana.
            </p>
          )}

          <ol className="space-y-2">
            {positions.map((pos) => {
              const slot = slots.get(pos);
              const assigned = (slot ? unitsOf.get(slot.id) ?? [] : []).map((uid) => unitById.get(uid)).filter(Boolean) as Unit[];
              const defined = slot && (slot.kind !== "contenido" || assigned.length > 0 || slot.title);
              return (
                <li key={pos} id={`semana-${pos}`} className={`rounded-xl border bg-white p-3 ${defined ? "border-stone-200" : "border-dashed border-stone-300"}`}>
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
                      <span>
                        <span className="font-medium">Semana {pos}</span>
                        {slot && slot.kind !== "contenido" && (
                          <span className="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">{KINDS[slot.kind] ?? slot.kind}</span>
                        )}
                        {slot?.title && <span className="ml-2 text-stone-600">{slot.title}</span>}
                      </span>
                      <span className="text-xs text-stone-500">
                        {assigned.length > 0 ? assigned.map((u) => `${label(u)} ${u.title}`).join(" · ") : defined ? "" : "Sin definir"}
                      </span>
                    </summary>

                    {editable ? (
                      <form action={guardarPosicion} className="mt-3 space-y-3 border-t border-stone-100 pt-3">
                        <input type="hidden" name="curriculum_id" value={id} />
                        <input type="hidden" name="version_id" value={version.id} />
                        <input type="hidden" name="year" value={year} />
                        <input type="hidden" name="position" value={pos} />
                        <div className="grid gap-2 md:grid-cols-3">
                          <select name="kind" defaultValue={slot?.kind ?? "contenido"} aria-label="Tipo de encuentro" className={fieldClass}>
                            {Object.entries(KINDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                          <input name="title" defaultValue={slot?.title ?? ""} placeholder="Título del encuentro (opcional)" aria-label="Título" className={`${fieldClass} md:col-span-2`} />
                        </div>
                        <input name="notes" defaultValue={slot?.notes ?? ""} placeholder="Notas para el líder (opcional)" aria-label="Notas" className={fieldClass} />
                        <fieldset>
                          <legend className="mb-1 text-xs text-stone-500">Unidades del material que se trabajan esta semana</legend>
                          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg bg-stone-50 p-2">
                            {ordered.map((u) => (
                              <label key={u.id} className="flex items-start gap-2 text-sm">
                                <input type="checkbox" name="unit" value={u.id} defaultChecked={assigned.some((a) => a.id === u.id)} className="mt-1" />
                                <span><span className="text-stone-400">{label(u)}</span> {u.title}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <button className={primaryBtn}>Guardar semana {pos}</button>
                      </form>
                    ) : slot?.notes ? (
                      <p className="mt-2 text-sm text-stone-500">{slot.notes}</p>
                    ) : null}
                  </details>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
