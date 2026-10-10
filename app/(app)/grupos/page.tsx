import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { GROUP_STATUS_LABEL, WEEKDAYS, scheduleLabel, type GroupOverview } from "@/lib/format";
import { Flash, fieldClass, primaryBtn } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { EmptyState, PageHeader, ProgressBar } from "@/components/ui";
import { crearGrupo } from "@/app/actions/gestion";

export const dynamic = "force-dynamic";

type CycleOption = { id: string; number: number; title: string | null; curriculums: { name: string } | null };
type SeasonOption = { id: string; name: string; status: string };
type ProgramOption = { id: string; name: string; duration_years: number };
type CampusOption = { id: string; name: string };

export default async function GruposPage(props: {
  searchParams: Promise<{ error?: string; ok?: string; ver?: string }>;
}) {
  const searchParams = await props.searchParams;
  const { supabase, role } = await getSession();
  if (role === "alumno") redirect("/inicio");
  const canCreate = role === "admin" || role === "coordinador";
  const showFinished = searchParams.ver === "finalizados";

  let query = supabase.from("group_overview").select("*").order("curriculum_name").order("cycle_number").order("name");
  query = showFinished ? query.eq("status", "finalizado") : query.in("status", ["abierto", "en_curso"]);
  const groups = ((await query).data ?? []) as GroupOverview[];

  let cycles: CycleOption[] = [];
  let seasons: SeasonOption[] = [];
  let programs: ProgramOption[] = [];
  let campuses: CampusOption[] = [];
  if (canCreate) {
    const p = await supabase.from("curriculums").select("id, name, duration_years").eq("active", true).order("name");
    programs = (p.data ?? []) as ProgramOption[];
    const ca = await supabase.from("campuses").select("id, name").eq("active", true).order("name");
    campuses = (ca.data ?? []) as CampusOption[];
    const c = await supabase.from("cycles").select("id, number, title, curriculums(name)").order("number");
    cycles = ((c.data ?? []) as unknown as CycleOption[]).sort((a, b) =>
      (a.curriculums?.name ?? "").localeCompare(b.curriculums?.name ?? "") || a.number - b.number
    );
    const s = await supabase.from("seasons").select("id, name, status").neq("status", "cerrada").order("start_date", { ascending: false });
    seasons = (s.data ?? []) as SeasonOption[];
  }

  return (
    <div className="enter mx-auto max-w-4xl p-4 pb-16 md:p-8 md:pb-16">
      <PageHeader
        title="Grupos"
        subtitle={`${groups.length} ${groups.length === 1 ? "grupo" : "grupos"} ${showFinished ? "finalizados" : "activos"} en tu alcance.`}
        actions={
          <Link href={showFinished ? "/grupos" : "/grupos?ver=finalizados"} className="btn btn-secondary">
            {showFinished ? "Ver los activos" : "Ver los finalizados"}
          </Link>
        }
      />
      <Flash error={searchParams.error} ok={searchParams.ok} />

      {canCreate && !showFinished && (
        <form action={crearGrupo} className="mb-5 card p-4">
          <h2 className="mb-3 section-title">Nuevo grupo</h2>
          {programs.length === 0 || seasons.length === 0 ? (
            <p className="text-sm text-stone-500">
              Antes de crear un grupo necesitas {seasons.length === 0 ? "una temporada" : ""}
              {seasons.length === 0 && programs.length === 0 ? " y " : ""}
              {programs.length === 0 ? "al menos un programa" : ""}.
            </p>
          ) : (
            <>
              <div className="grid gap-2 md:grid-cols-2">
                <select name="season_id" aria-label="Temporada" defaultValue={seasons[0].id} className={fieldClass}>
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <select name="curriculum_id" aria-label="Programa" defaultValue="" className={fieldClass}>
                  <option value="" disabled>
                    Elige el programa
                  </option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <input name="formative_year" type="number" min={1} max={10} defaultValue={1} aria-label="Año formativo" title="Año formativo (AR Hombres: 1 a 3)" className={fieldClass} />
                <select name="campus_id" aria-label="Sede" defaultValue="" className={fieldClass}>
                  <option value="">Sede (opcional)</option>
                  {campuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select name="cycle_id" aria-label="Módulo" defaultValue="" className={fieldClass}>
                  <option value="">Sin módulo (el grupo sigue el plan del año)</option>
                  {cycles.map((c) => (
                    <option key={c.id} value={c.id}>
                      Solo grupos por ciclos: {c.curriculums?.name} · Ciclo {c.number}
                      {c.title ? ` (${c.title})` : ""}
                    </option>
                  ))}
                </select>
                <input name="name" placeholder="Nombre del grupo (ej. Esperanza)" aria-label="Nombre" className={`${fieldClass} md:col-span-2`} />
                <select name="weekday" aria-label="Día" defaultValue="" className={fieldClass}>
                  <option value="">Día de la semana</option>
                  {WEEKDAYS.slice(1).map((d, i) => (
                    <option key={d} value={i + 1}>
                      {d}
                    </option>
                  ))}
                </select>
                <select name="modality" aria-label="Modalidad" defaultValue="virtual" className={fieldClass}>
                  <option value="virtual">Virtual</option>
                  <option value="presencial">Presencial</option>
                </select>
                <input name="start_time" type="time" aria-label="Hora de inicio" className={fieldClass} />
                <input name="end_time" type="time" aria-label="Hora de término" className={fieldClass} />
                <input name="address" placeholder="Dirección (si es presencial)" aria-label="Dirección" className={fieldClass} />
                <input name="capacity" type="number" min={1} placeholder="Cupo (15)" aria-label="Cupo" className={fieldClass} />
              </div>
              <button className={`${primaryBtn} mt-3`}>Crear grupo</button>
            </>
          )}
        </form>
      )}

      {groups.length === 0 ? (
        <EmptyState icon="users" title="Todavía no hay grupos para mostrar">
          {canCreate ? "Crea el primero con el formulario de arriba." : "Cuando haya grupos en tu alcance, aparecerán aquí."}
        </EmptyState>
      ) : (
      <section className="card p-2 md:p-3">
          <ul className="stagger">
            {groups.map((g) => (
              <li key={g.id} className="border-b border-stone-100 last:border-0">
                <Link href={`/grupos/${g.id}`} className="group flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-3 text-sm transition hover:bg-brand-teal-50/50">
                  <span className="flex min-w-0 items-center gap-3">
                    <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-teal-50 text-brand-teal">
                      <Icon name={g.modality === "virtual" ? "video" : "pin"} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{g.name}</span>
                      <span className="block truncate text-xs text-stone-500">
                        {g.curriculum_name}{g.cycle_number != null ? ` · Ciclo ${g.cycle_number}` : g.formative_year && g.formative_year > 1 ? ` · Año ${g.formative_year}` : ""} · {scheduleLabel(g)}
                      </span>
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-3 text-stone-500">
                    {(!g.leader_id || !g.monitor_id) && (
                      <span className="chip bg-amber-50 text-xs text-amber-800">
                        {!g.leader_id ? "Sin líder" : "Sin monitor"}
                      </span>
                    )}
                    <span className="hidden w-24 sm:block">
                      <ProgressBar value={g.capacity ? (g.enrolled / g.capacity) * 100 : 0} label={`Cupos: ${g.enrolled} de ${g.capacity}`} />
                    </span>
                    <span className="tabular text-xs">{g.enrolled}/{g.capacity}</span>
                    <span className={`chip ${g.status === "finalizado" ? "bg-stone-100 text-stone-600" : "bg-brand-green-50 text-brand-green-800"}`}>{GROUP_STATUS_LABEL[g.status]}</span>
                    <Icon name="chevron-right" className="hidden h-4 w-4 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-brand-teal sm:block" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
      </section>
      )}
    </div>
  );
}
