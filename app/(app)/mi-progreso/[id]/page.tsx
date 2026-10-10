import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { scheduleLabel, ENROLLMENT_LABEL, WEEKDAYS, todayInChile, type GroupOverview } from "@/lib/format";
import { dayMonth, weekdayName } from "@/lib/calendar";
import { LocalTime } from "@/components/LocalTime";
import { avanzarAnio } from "@/app/actions/certificados";
import { certificateTitle, formatCode, normalizeYear, routeSummary, type CertificateRow, type YearStatus } from "@/lib/certificates";
import { Flash, fieldClass, primaryBtn } from "@/components/Flash";
import {
  cambiarGrupo,
  pausarInscripcion,
  pedirRecuperacion,
  reanudarInscripcion,
} from "@/app/actions/programa";
import {
  CE_LABEL,
  CE_STYLE,
  filterGroups,
  normalizeProgress,
  progressSummary,
  type CompatibleGroup,
  type CurriculumEnrollment,
  type CurriculumProgress,
} from "@/lib/progress";

export const dynamic = "force-dynamic";

type Row = CurriculumEnrollment & { person_id: string; curriculums: { name: string; description: string | null } | null };
type Membership = { id: string; group_id: string; status: string; enrolled_at: string; closed_at: string | null; left_reason: string | null };
type Unit = { id: string; title: string; number: number; cycle_id: string };
type Module = { id: string; number: number; title: string | null; formative_year: number };

const LEFT_REASON: Record<string, string> = { cambio_de_grupo: "Cambio de grupo", pausa: "Pausa" };
const dateEs = (iso: string) => new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });

export default async function ProgresoDetallePage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string; aviso?: string; modalidad?: string; sede?: string; dia?: string }>;
}) {
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const { supabase, user } = await getSession();

  const { data: ceData } = await supabase
    .from("curriculum_enrollments")
    .select("id, person_id, curriculum_id, status, formative_year, started_at, paused_at, pause_reason, imported, curriculums(name, description)")
    .eq("id", id)
    .maybeSingle();
  if (!ceData) notFound();
  const ce = ceData as unknown as Row;
  const mine = ce.person_id === user.id;

  const [{ data: prog }, { data: mem }, { data: cyc }, { data: credits }, { data: plans }, personRes] = await Promise.all([
    supabase.rpc("curriculum_progress", { ce: id }),
    supabase
      .from("enrollments")
      .select("id, group_id, status, enrolled_at, closed_at, left_reason")
      .eq("curriculum_enrollment_id", id)
      .order("enrolled_at", { ascending: false }),
    supabase.from("cycles").select("id, number, title, formative_year").eq("curriculum_id", ce.curriculum_id).order("formative_year").order("number"),
    supabase.from("stage_credits").select("id, review_status, cycles(number, title)").eq("person_id", ce.person_id),
    supabase.from("catchup_plans").select("id, status, notes, follow_up_on").eq("curriculum_enrollment_id", id).in("status", ["pendiente", "en_curso"]),
    mine ? Promise.resolve({ data: null }) : supabase.from("profiles").select("full_name").eq("id", ce.person_id).maybeSingle(),
  ]);

  const p: CurriculumProgress = normalizeProgress((prog as Partial<CurriculumProgress>[] | null)?.[0]);
  const memberships = (mem ?? []) as Membership[];
  const modules = (cyc ?? []) as Module[];
  const moduleIds = modules.map((m) => m.id);

  const [{ data: unitsData }, { data: doneData }] = await Promise.all([
    moduleIds.length ? supabase.from("lessons").select("id, title, number, cycle_id").in("cycle_id", moduleIds).order("number") : Promise.resolve({ data: [] }),
    supabase.from("unit_completions").select("unit_id, method, completed_at").eq("curriculum_enrollment_id", id),
  ]);
  const units = (unitsData ?? []) as Unit[];
  const done = new Map(((doneData ?? []) as { unit_id: string; method: string; completed_at: string }[]).map((d) => [d.unit_id, d]));

  const groupIds = Array.from(new Set(memberships.map((m) => m.group_id)));
  const { data: gs } = groupIds.length ? await supabase.from("group_overview").select("*").in("id", groupIds) : { data: [] };
  const groups = new Map(((gs ?? []) as GroupOverview[]).map((g) => [g.id, g]));
  const current = memberships.find((m) => m.status === "preinscrito" || m.status === "en_curso");
  const currentGroup = current ? groups.get(current.group_id) : undefined;

  // Próxima reunión planificada del grupo actual
  const { data: nextMeeting } = current
    ? await supabase
        .from("meetings")
        .select("held_on, season_week")
        .eq("group_id", current.group_id)
        .in("status", ["planificada", "reprogramada"])
        .gte("held_on", todayInChile())
        .order("held_on")
        .limit(1)
        .maybeSingle()
    : { data: null };
  const next = nextMeeting as { held_on: string; season_week: number | null } | null;

  let compatible: CompatibleGroup[] = [];
  if (ce.status === "activo") {
    const { data } = await supabase.rpc("compatible_groups", { ce: id });
    compatible = ((data ?? []) as CompatibleGroup[]).filter((g) => g.group_id !== current?.group_id);
  }
  const tzIds = [...compatible.map((g) => g.group_id), ...(current ? [current.group_id] : [])];
  const { data: tzRows } = tzIds.length ? await supabase.from("groups").select("id, timezone").in("id", tzIds) : { data: [] };
  const zoneOf = new Map(((tzRows ?? []) as { id: string; timezone: string }[]).map((g) => [g.id, g.timezone]));
  const shown = filterGroups(compatible, { modalidad: searchParams.modalidad, sede: searchParams.sede, dia: searchParams.dia });
  const campusOptions = Array.from(new Set(compatible.map((g) => g.campus).filter(Boolean))) as string[];
  const dayOptions = Array.from(new Set(compatible.map((g) => g.weekday).filter((d) => d != null))).sort() as number[];
  const openPlan = ((plans ?? []) as { id: string; status: string; notes: string | null; follow_up_on: string | null }[])[0];
  const stageCredits = (credits ?? []) as unknown as { id: string; review_status: string; cycles: { number: number; title: string | null } | null }[];
  const personName = (personRes.data as { full_name: string } | null)?.full_name;
  // Ruta de varios años y certificados (010_certificados.sql; si falta, la sección simplemente no aparece)
  const [yearsR, gridR, certsR] = await Promise.all([
    supabase.rpc("year_status", { ce: id }),
    supabase.rpc("plan_progress", { ce: id }),
    supabase.from("certificates").select("id, code, kind, formative_year, status, issued_at, curriculum_id, person_id, campus_id").eq("curriculum_enrollment_id", id).order("issued_at", { ascending: false }),
  ]);
  const years: YearStatus[] = yearsR.error ? [] : ((yearsR.data ?? []) as Record<string, unknown>[]).map(normalizeYear);
  const grid = gridR.error ? [] : ((gridR.data ?? []) as { week: number; kind: string; title: string | null; units_total: number; units_done: number; state: string }[]);
  const certs = certsR.error ? [] : ((certsR.data ?? []) as CertificateRow[]);
  const currentYear = years.find((y) => y.is_current);
  const canAdvance = Boolean(currentYear?.met) && years.some((y) => y.formative_year > (currentYear?.formative_year ?? 0)) && ["activo", "pausado"].includes(ce.status);
  const name = ce.curriculums?.name ?? "Programa";
  const back = mine ? "/mi-progreso" : "/grupos";

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <Link href={back} className="text-sm text-brand-teal hover:underline">← {mine ? "Mi progreso" : "Volver"}</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-medium">{name}</h1>
        <span className={`rounded px-2 py-0.5 text-xs ${CE_STYLE[ce.status]}`}>{CE_LABEL[ce.status]}</span>
      </div>
      <p className="mb-5 mt-1 text-sm text-stone-500">
        {personName ? `${personName} · ` : ""}Desde {dateEs(ce.started_at)}
        {ce.formative_year > 1 ? ` · Año ${ce.formative_year}` : ""}
      </p>
      <Flash error={searchParams.error} ok={searchParams.ok} />
      {searchParams.aviso && <p role="status" className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{searchParams.aviso}</p>}

      {/* Avance */}
      <section className="mb-5 rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-medium">Avance</h2>
        {p.units_total > 0 ? (
          <>
            <div className="h-2.5 overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-valuenow={p.units_done} aria-valuemin={0} aria-valuemax={p.units_total} aria-label="Avance">
              <div className="h-full bg-brand-green" style={{ width: `${Math.min(100, Math.round((p.units_done / p.units_total) * 100))}%` }} />
            </div>
            <p className="mt-2 text-sm text-stone-600">
              {progressSummary(p)}
              {p.next_unit_title ? <> · Sigue: <strong className="font-medium">{p.next_unit_title}</strong></> : " · ¡Completaste todas las unidades!"}
            </p>
          </>
        ) : (
          <p className="text-sm text-stone-500">{progressSummary(p)}</p>
        )}
        <p className="mt-2 text-xs text-stone-400">
          Asistir a un encuentro no acredita una unidad por sí solo: la acredita tu líder o coordinador cuando la completas.
        </p>

        {units.length > 0 && (
          <div className="mt-4 space-y-3">
            {modules.map((m) => {
              const list = units.filter((u) => u.cycle_id === m.id);
              if (!list.length) return null;
              return (
                <div key={m.id}>
                  <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-400">
                    Módulo {m.number}
                    {m.title ? ` · ${m.title}` : ""}
                  </h3>
                  <ul className="space-y-1">
                    {list.map((u) => {
                      const d = done.get(u.id);
                      return (
                        <li key={u.id} className="flex items-center gap-2 text-sm">
                          <span aria-hidden="true" className={`flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${d ? "border-brand-green bg-brand-green text-white" : "border-stone-300"}`}>
                            {d ? "✓" : ""}
                          </span>
                          <span className={d ? "text-stone-700" : "text-stone-500"}>
                            {u.number}. {u.title}
                          </span>
                          <span className="sr-only">{d ? "acreditada" : "pendiente"}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Ruta de varios años */}
      {years.length > 1 && (
        <section className="mb-5 rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-medium">Tu ruta</h2>
          <p className="mb-3 text-sm text-stone-600">{routeSummary(years)}</p>
          <ol className="mb-3 grid gap-2 sm:grid-cols-3">
            {years.map((y) => (
              <li key={y.formative_year} className={`rounded-lg border p-3 text-sm ${y.is_current ? "border-brand-teal bg-brand-teal/5" : "border-stone-200"}`}>
                <p className="font-medium">
                  Año {y.formative_year}
                  {y.met && <span className="ml-2 rounded bg-green-50 px-1.5 py-0.5 text-xs font-normal text-green-800">Cumplido</span>}
                  {y.is_current && !y.met && <span className="ml-2 rounded bg-brand-teal/10 px-1.5 py-0.5 text-xs font-normal text-brand-teal">Aquí vas</span>}
                </p>
                {y.items_total > 0 ? (
                  <>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-valuenow={y.items_done} aria-valuemin={0} aria-valuemax={y.items_total} aria-label={`Año ${y.formative_year}`}>
                      <div className="h-full bg-brand-green" style={{ width: `${Math.min(100, Math.round((y.items_done / y.items_total) * 100))}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-stone-500">
                      {y.items_done} de {y.items_total} · se pide {y.min_pct}%
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-xs text-stone-400">Todavía sin contenido cargado</p>
                )}
              </li>
            ))}
          </ol>
          {canAdvance && (
            <form action={avanzarAnio}>
              <input type="hidden" name="ce" value={id} />
              <button className={primaryBtn}>Pasar al año {(currentYear?.formative_year ?? 0) + 1}</button>
            </form>
          )}
          <p className="mt-2 text-xs text-stone-400">Nada avanza solo por el calendario: se pasa de año cuando la etapa está cumplida.</p>
        </section>
      )}

      {grid.length > 0 && (
        <section className="mb-5 rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-medium">Tus encuentros del año {currentYear?.formative_year ?? ce.formative_year}</h2>
          <ol className="grid grid-cols-6 gap-1.5 sm:grid-cols-9">
            {grid.map((g) => (
              <li
                key={g.week}
                title={`Semana ${g.week}${g.title ? ` · ${g.title}` : ""} · ${g.units_done} de ${g.units_total} unidades`}
                className={`flex h-9 items-center justify-center rounded text-xs ${
                  g.state === "hecha" ? "bg-brand-green text-white" : g.state === "parcial" ? "bg-brand-teal/30 text-stone-700" : g.state === "pendiente" ? "border border-stone-300 text-stone-600" : "border border-dashed border-stone-200 text-stone-300"
                }`}
              >
                <span aria-hidden="true">{g.week}</span>
                <span className="sr-only">Semana {g.week}: {g.state === "hecha" ? "completa" : g.state === "parcial" ? "parcial" : g.state === "pendiente" ? "pendiente" : "sin unidades"}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-stone-500">Verde: unidades acreditadas · Azul: parcial · Borde: pendiente · Punteado: encuentro sin unidades.</p>
        </section>
      )}

      {certs.length > 0 && (
        <section className="mb-5 rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-medium">Certificados</h2>
          <ul className="space-y-1.5 text-sm">
            {certs.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/certificados/${c.id}`} className="text-brand-teal hover:underline">
                  {certificateTitle(c, name)}
                </Link>
                <span className="text-xs text-stone-500">
                  {c.status === "revocado" ? "Revocado · " : ""}
                  {formatCode(c.code)} · {dateEs(c.issued_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Créditos de la plataforma anterior */}
      {stageCredits.length > 0 && (
        <section className="mb-5 rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-medium">De la plataforma anterior</h2>
          <p className="mb-2 text-xs text-stone-500">
            Estas etapas figuraban como aprobadas. Tu coordinador las revisará para convertirlas en unidades acreditadas.
          </p>
          <ul className="flex flex-wrap gap-2">
            {stageCredits.map((c) => (
              <li key={c.id} className="rounded bg-stone-100 px-2 py-1 text-xs text-stone-600">
                Etapa {c.cycles?.number}
                {c.cycles?.title ? ` · ${c.cycles.title}` : ""} ·{" "}
                {c.review_status === "validado" ? "validada" : c.review_status === "rechazado" ? "no validada" : "por revisar"}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Mi grupo */}
      <section className="mb-5 rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-medium">Mi grupo</h2>
        {currentGroup ? (
          <div className="text-sm">
            <p className="font-medium">{currentGroup.name}</p>
            <p className="text-stone-500">{scheduleLabel(currentGroup)}</p>
            {currentGroup.modality === "virtual" && <p><LocalTime time={currentGroup.start_time} zone={zoneOf.get(currentGroup.id) ?? null} /></p>}
            {currentGroup.leader_name && <p className="text-stone-500">Líder: {currentGroup.leader_name}</p>}
            {currentGroup.backup_leader_name && <p className="text-stone-500">Respaldo: {currentGroup.backup_leader_name}</p>}
            {currentGroup.campus_name && <p className="text-stone-500">Sede: {currentGroup.campus_name}</p>}
            {currentGroup.address && <p className="text-stone-500">Dirección: {currentGroup.address}</p>}
            {next && (
              <p className="mt-2 rounded-lg bg-brand-teal/10 px-3 py-2 text-brand-teal">
                Próxima reunión: {weekdayName(next.held_on)} {dayMonth(next.held_on)}
                {next.season_week ? ` · semana ${next.season_week}` : ""}
              </p>
            )}
            <Link href={`/grupos/${currentGroup.id}/calendario`} className="mt-2 inline-block text-xs text-brand-teal hover:underline">
              Ver el calendario del grupo
            </Link>
          </div>
        ) : ce.status === "activo" ? (
          <p className="text-sm text-amber-700">Todavía no tienes grupo. Elige uno de la lista de abajo.</p>
        ) : (
          <p className="text-sm text-stone-500">Sin grupo mientras el programa está {CE_LABEL[ce.status].toLowerCase()}.</p>
        )}
      </section>

      {/* Elegir o cambiar de grupo */}
      {ce.status === "activo" && (
        <section className="mb-5 rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-medium">{current ? "Cambiar de grupo, horario o modalidad" : "Elegir un grupo"}</h2>
          <p className="mb-3 text-xs text-stone-500">Tu avance se mantiene. Estos grupos reciben gente de este programa hoy; no aseguramos que coincidan con la unidad que te toca.</p>
          {compatible.length > 1 && (
            <form method="get" className="mb-3 flex flex-wrap items-end gap-2">
              <label className="text-xs text-stone-500">
                Modalidad
                <select name="modalidad" defaultValue={searchParams.modalidad ?? ""} className={`${fieldClass} mt-1`}>
                  <option value="">Todas</option>
                  <option value="presencial">Presencial</option>
                  <option value="virtual">Online</option>
                </select>
              </label>
              {campusOptions.length > 1 && (
                <label className="text-xs text-stone-500">
                  Sede
                  <select name="sede" defaultValue={searchParams.sede ?? ""} className={`${fieldClass} mt-1`}>
                    <option value="">Todas</option>
                    {campusOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              )}
              <label className="text-xs text-stone-500">
                Día
                <select name="dia" defaultValue={searchParams.dia ?? ""} className={`${fieldClass} mt-1`}>
                  <option value="">Todos</option>
                  {dayOptions.map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
                </select>
              </label>
              <button className="h-10 rounded-lg border border-stone-300 px-3 text-sm hover:bg-stone-50">Filtrar</button>
            </form>
          )}
          {compatible.length > 0 && shown.length === 0 && (
            <p className="mb-3 rounded-lg bg-stone-50 p-3 text-sm text-stone-600">Ningún grupo cumple esos filtros. Prueba con otros.</p>
          )}
          {compatible.length === 0 ? (
            <div className="rounded-lg bg-stone-50 p-3 text-sm text-stone-600">
              <p>Ahora no hay otro grupo abierto para este programa.</p>
              {openPlan ? (
                <p className="mt-2 text-xs text-stone-500">Ya pediste ayuda para ponerte al día{openPlan.follow_up_on ? `; te contactarán antes del ${dateEs(openPlan.follow_up_on)}` : ""}.</p>
              ) : (
                <form action={pedirRecuperacion} className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="ce" value={id} />
                  <input name="note" placeholder="Cuéntanos qué horario te acomodaría (opcional)" aria-label="Nota" className={`${fieldClass} md:max-w-sm`} />
                  <button className="h-10 rounded-lg border border-brand-teal px-3 text-sm text-brand-teal hover:bg-brand-teal hover:text-white">Pedir que me ayuden a ponerme al día</button>
                </form>
              )}
            </div>
          ) : (
            <ul className="space-y-2">
              {shown.map((g) => (
                <li key={g.group_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-stone-50 px-3 py-2">
                  <div className="text-sm">
                    <p className="font-medium">{g.name}</p>
                    <p className="text-stone-500">
                      {scheduleLabel(g)}
                      {g.campus ? ` · ${g.campus}` : ""}
                    </p>
                    {g.modality === "virtual" && <p><LocalTime time={g.start_time} zone={zoneOf.get(g.group_id) ?? null} /></p>}
                    <p className="text-xs text-stone-400">
                      {g.leader_name ? `Líder: ${g.leader_name} · ` : ""}
                      {g.capacity_left} {g.capacity_left === 1 ? "cupo" : "cupos"}
                    </p>
                  </div>
                  <form action={cambiarGrupo}>
                    <input type="hidden" name="ce" value={id} />
                    <input type="hidden" name="group_id" value={g.group_id} />
                    <button className={primaryBtn}>{current ? "Cambiarme a este" : "Elegir este"}</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Pausar / reanudar */}
      {ce.status === "activo" && (
        <section className="mb-5 rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-medium">Necesito una pausa</h2>
          <p className="mb-3 text-xs text-stone-500">Se guarda todo lo que llevas. Cuando vuelvas, sigues desde la primera unidad pendiente.</p>
          <form action={pausarInscripcion} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="ce" value={id} />
            <input name="reason" placeholder="Motivo (opcional)" aria-label="Motivo" className={`${fieldClass} md:max-w-xs`} />
            <button className="h-10 rounded-lg border border-stone-300 px-3 text-sm text-stone-600 hover:bg-stone-100">Pausar</button>
          </form>
        </section>
      )}
      {ce.status === "pausado" && (
        <section className="mb-5 rounded-xl bg-amber-50 p-4">
          <h2 className="mb-1 text-sm font-medium text-amber-900">En pausa{ce.paused_at ? ` desde ${dateEs(ce.paused_at)}` : ""}</h2>
          {ce.pause_reason && <p className="mb-2 text-sm text-amber-800">{ce.pause_reason}</p>}
          <form action={reanudarInscripcion}>
            <input type="hidden" name="ce" value={id} />
            <button className={primaryBtn}>Retomar el programa</button>
          </form>
        </section>
      )}

      {/* Historial de grupos */}
      {memberships.length > 0 && (
        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-medium">Historial de grupos</h2>
          <ul className="space-y-1.5 text-sm">
            {memberships.map((m) => {
              const g = groups.get(m.group_id);
              return (
                <li key={m.id} className="flex flex-wrap justify-between gap-2">
                  <span>
                    {g?.name ?? "Grupo"} <span className="text-stone-400">· {g?.season_name}</span>
                  </span>
                  <span className="text-xs text-stone-500">
                    {ENROLLMENT_LABEL[m.status] ?? m.status}
                    {m.left_reason ? ` · ${LEFT_REASON[m.left_reason] ?? m.left_reason}` : ""} · {dateEs(m.enrolled_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
