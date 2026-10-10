import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession, type Person } from "@/lib/session";
import { ENROLLMENT_LABEL, GROUP_STATUS_LABEL, scheduleLabel, type GroupOverview } from "@/lib/format";
import { whatsappLink } from "@/lib/phone";
import { Flash, Notice, fieldClass } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { Avatar, EmptyState, PageHeader, ProgressBar } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { TIMEZONES, timezoneLabel } from "@/lib/format";
import {
  asignarResponsables,
  asignarSede,
  asignarZonaHoraria,
  cancelarInscripcion,
  cerrarGrupo,
  crearContinuacion,
  inscribirPersona,
} from "@/app/actions/gestion";

export const dynamic = "force-dynamic";

type RosterRow = {
  enrollment_id: string;
  person_id: string;
  status: string;
  person_name: string;
  phone: string | null;
  meetings_held: number;
  present: number;
  recovered: number;
  absences: number;
  max_absences: number;
};

type MeetingRow = { id: string; held_on: string; lesson_number: number | null; present: number; recovered: number; total: number };

export default async function GrupoPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string; lista?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { supabase, user, role } = await getSession();

  const { data } = await supabase.from("group_overview").select("*").eq("id", params.id).maybeSingle();
  if (!data) notFound();
  const group = data as GroupOverview;

  const isLeaderOrMonitor = group.leader_id === user.id || group.monitor_id === user.id;
  const { data: coordRow } = await supabase
    .from("curriculum_coordinators")
    .select("coordinator_id")
    .eq("curriculum_id", group.curriculum_id)
    .eq("coordinator_id", user.id);
  const isCoordinator = (coordRow ?? []).length > 0;
  const canAssign = role === "admin" || isCoordinator;
  const canManage = canAssign || isLeaderOrMonitor;
  // El respaldo dirige sesiones y pasa lista, pero no administra el grupo
  const isBackup = group.backup_leader_id === user.id;
  const canRun = canManage || isBackup;

  const { data: rosterRows } = await supabase
    .from("roster")
    .select("enrollment_id, person_id, status, person_name, phone, meetings_held, present, recovered, absences, max_absences")
    .eq("group_id", group.id)
    .order("person_name");
  const roster = (rosterRows ?? []) as RosterRow[];
  const active = roster.filter((r) => r.status !== "cancelado");

  const { data: meetingRows } = canRun
    ? await supabase
        .from("meeting_summary")
        .select("id, held_on, lesson_number, present, recovered, total")
        .eq("group_id", group.id)
        .order("held_on", { ascending: false })
        .limit(10)
    : { data: [] };
  const meetings = (meetingRows ?? []) as MeetingRow[];

  // Próxima lección: la siguiente a la última dada
  const lastLesson = meetings.find((m) => m.lesson_number)?.lesson_number ?? 0;
  const { data: nextLesson } = canManage && group.cycle_id
    ? await supabase
        .from("lessons")
        .select("id, number, title, summary")
        .eq("cycle_id", group.cycle_id)
        .eq("number", lastLesson + 1)
        .maybeSingle()
    : { data: null };

  const { data: tzRow } = await supabase.from("groups").select("timezone").eq("id", group.id).maybeSingle();
  const timezone = (tzRow as { timezone: string } | null)?.timezone ?? "America/Santiago";
  let campusOptions: { id: string; name: string }[] = [];
  if (canAssign) {
    const { data: ca } = await supabase.from("campuses").select("id, name").eq("active", true).order("name");
    campusOptions = (ca ?? []) as typeof campusOptions;
  }
  let monitors: Person[] = [];
  let leaders: Person[] = [];
  if (canAssign) {
    monitors = ((await supabase.rpc("assignable_people", { r: "monitor" })).data ?? []) as Person[];
    leaders = ((await supabase.rpc("assignable_people", { r: "lider" })).data ?? []) as Person[];
  }
  let candidates: Person[] = [];
  if (canManage && group.status !== "finalizado") {
    candidates = ((await supabase.rpc("enrollment_candidates", { gid: group.id })).data ?? []) as Person[];
  }

  const full = group.enrolled >= group.capacity;
  const options = (list: Person[], currentId: string | null, currentName: string | null) => (
    <>
      <option value="">Sin asignar</option>
      {currentId && !list.some((p) => p.id === currentId) && <option value={currentId}>{currentName}</option>}
      {list.map((p) => (
        <option key={p.id} value={p.id}>
          {p.full_name || "Sin nombre"}
        </option>
      ))}
    </>
  );

  return (
    <div className="enter mx-auto max-w-4xl p-4 pb-16 md:p-8 md:pb-16">
      <PageHeader
        title={group.name}
        back={{ href: "/grupos", label: "Grupos" }}
        subtitle={
          <>
            {group.curriculum_name}
            {group.cycle_number != null ? ` · Ciclo ${group.cycle_number}` : ""}
            {group.cycle_title ? ` (${group.cycle_title})` : ""}
          </>
        }
      />
      <div className="enter -mt-3 mb-5 flex flex-wrap items-center gap-2 text-sm">
        <span className="chip bg-stone-100 px-3 py-1.5 text-stone-700">
          <Icon name="clock" className="h-3.5 w-3.5 text-brand-teal" />
          {scheduleLabel(group)}
        </span>
        <span className="chip bg-stone-100 px-3 py-1.5 text-stone-700">
          <Icon name={group.modality === "virtual" ? "video" : "pin"} className="h-3.5 w-3.5 text-brand-teal" />
          {group.modality === "virtual" ? "Online" : group.address ?? "Presencial"}
        </span>
        <span className={`chip px-3 py-1.5 ${group.status === "finalizado" ? "bg-stone-100 text-stone-600" : "bg-brand-green-50 text-brand-green-800"}`}>
          {GROUP_STATUS_LABEL[group.status]}
        </span>
        <span className="chip bg-brand-teal-50 px-3 py-1.5 text-brand-teal-800">
          <Icon name="users" className="h-3.5 w-3.5" />
          {group.enrolled}/{group.capacity}
        </span>
      </div>
      <Flash error={searchParams.error} ok={searchParams.ok} />
      {searchParams.lista && (
        <Notice>
          Lista guardada: {searchParams.lista} {searchParams.lista === "1" ? "asistente" : "asistentes"}.
        </Notice>
      )}

      {canRun && group.status !== "finalizado" && (
        <Link
          href={`/grupos/${group.id}/lista`}
          className="mb-3 flex h-12 items-center justify-center gap-2 btn btn-primary"
        >
          <Icon name="check-circle" className="h-5 w-5" />
          Pasar lista
        </Link>
      )}
      <Link
        href={`/grupos/${group.id}/calendario`}
        className="group mb-5 flex items-center gap-3 card card-hover px-4 py-3 text-sm"
      >
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-teal-50 text-brand-teal">
          <Icon name="calendar" className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-semibold">Calendario de sesiones</span>
          <span className="block text-xs text-stone-500">Fechas, cancelaciones, quién dirige cada sesión y unidades de cada semana</span>
        </span>
        <Icon name="chevron-right" className="h-5 w-5 shrink-0 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-brand-teal" />
      </Link>

      {canManage && (
        <section className="mb-5 card p-4">
          <h2 className="mb-2 section-title flex items-center gap-2"><Icon name="book" className="h-4 w-4 text-brand-teal" />Próxima lección</h2>
          {nextLesson ? (
            <Link href={`/lecciones/${nextLesson.id}`} className="block text-sm hover:underline">
              <span className="text-stone-400">{nextLesson.number}.</span> <span className="font-medium">{nextLesson.title}</span>
              {nextLesson.summary && <span className="block text-stone-500">{nextLesson.summary}</span>}
            </Link>
          ) : (
            <p className="text-sm text-stone-500">Todavía no existe la lección {lastLesson + 1} de este ciclo.</p>
          )}
        </section>
      )}

      <section className="mb-5 card p-4">
        <h2 className="mb-3 section-title flex items-center gap-2"><Icon name="user" className="h-4 w-4 text-brand-teal" />Responsables</h2>
        {canAssign ? (
          <form action={asignarResponsables} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <input type="hidden" name="id" value={group.id} />
            <label className="text-xs text-stone-500">
              Monitor
              <select name="monitor_id" defaultValue={group.monitor_id ?? ""} className={`${fieldClass} mt-1`}>
                {options(monitors, group.monitor_id, group.monitor_name)}
              </select>
            </label>
            <label className="text-xs text-stone-500">
              Líder
              <select name="leader_id" defaultValue={group.leader_id ?? ""} className={`${fieldClass} mt-1`}>
                {options(leaders, group.leader_id, group.leader_name)}
              </select>
            </label>
            <button className="btn btn-outline">
              Guardar
            </button>
          </form>
        ) : (
          <p className="text-sm text-stone-600">
            Monitor: {group.monitor_name ?? "Sin asignar"} · Líder: {group.leader_name ?? "Sin asignar"}
          </p>
        )}
        {canAssign ? (
          <form action={asignarSede} className="mt-3 flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={group.id} />
            <label className="text-xs text-stone-500">
              Sede
              <select name="campus_id" defaultValue={group.campus_id ?? ""} className={`${fieldClass} mt-1`}>
                <option value="">Sin sede</option>
                {campusOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <button className="mt-5 btn btn-outline">Guardar sede</button>
          </form>
        ) : (
          group.campus_name && <p className="mt-2 text-sm text-stone-600">Sede: {group.campus_name}</p>
        )}
        {group.modality === "virtual" && (
          <div className="mt-2 text-sm text-stone-600">
            <LocalTime time={group.start_time} zone={timezone} />
          </div>
        )}
        {canAssign && (
          <form action={asignarZonaHoraria} className="mt-3 flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={group.id} />
            <label className="text-xs text-stone-500">
              Zona horaria del grupo
              <select name="timezone" defaultValue={timezone} className={`${fieldClass} mt-1`}>
                {TIMEZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                {!TIMEZONES.some(([v]) => v === timezone) && <option value={timezone}>{timezoneLabel(timezone)}</option>}
              </select>
            </label>
            <button className="mt-5 btn btn-outline">Guardar zona</button>
          </form>
        )}
        <p className="mt-2 text-sm text-stone-600">
          Respaldo: {group.backup_leader_name ?? "Sin asignar"}
          {canManage && (
            <Link href={`/grupos/${group.id}/calendario`} className="ml-2 text-xs link">
              {group.backup_leader_name ? "Cambiar" : "Asignar"}
            </Link>
          )}
        </p>
      </section>

      {canManage && (
        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title flex items-center gap-2"><Icon name="users" className="h-4 w-4 text-brand-teal" />Inscritos</h2>
            <span className="w-28">
              <ProgressBar value={group.capacity ? (group.enrolled / group.capacity) * 100 : 0} label={`Cupos: ${group.enrolled} de ${group.capacity}`} />
              <span className="mt-1 block text-right text-xs text-stone-500 tabular">{group.enrolled}/{group.capacity}</span>
            </span>
          </div>

          {group.status !== "finalizado" && (
            <form action={inscribirPersona} className="mb-3 flex flex-wrap gap-2">
              <input type="hidden" name="group_id" value={group.id} />
              <select name="person" defaultValue="" aria-label="Persona" disabled={full} className={`${fieldClass} max-w-xs`}>
                <option value="" disabled>
                  {full ? "El grupo está completo" : "Elige a quién inscribir"}
                </option>
                {candidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || "Sin nombre"}
                  </option>
                ))}
              </select>
              <button disabled={full} className="btn btn-primary">
                Inscribir
              </button>
            </form>
          )}

          {active.length === 0 ? (
            <EmptyState icon="users" title="Este grupo todavía no tiene inscritos">
              Elige a una persona en la lista de arriba para inscribirla.
            </EmptyState>
          ) : (
            <ul>
              {active.map((r) => (
                <li key={r.enrollment_id} className="row flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 py-2.5 text-sm last:border-0">
                  <span className="flex items-center gap-3">
                    <Avatar name={r.person_name || "Sin nombre"} size="sm" />
                    <span>{r.person_name || "Sin nombre"}</span>
                    <span className="chip bg-stone-100 text-xs text-stone-600">
                      {ENROLLMENT_LABEL[r.status]}
                    </span>
                    {r.phone && (
                      <a
                        href={whatsappLink(r.phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-3 text-xs link"
                      >
                        WhatsApp
                      </a>
                    )}
                  </span>
                  <span className="flex items-center gap-3 text-xs text-stone-500">
                    <span className={r.absences > r.max_absences ? "text-red-700" : r.absences >= r.max_absences - 1 && r.meetings_held > 0 ? "text-amber-700" : ""}>
                      {r.absences} {r.absences === 1 ? "ausencia" : "ausencias"} de {r.max_absences}
                    </span>
                    {["preinscrito", "en_curso"].includes(r.status) && (
                      <form action={cancelarInscripcion}>
                        <input type="hidden" name="enrollment_id" value={r.enrollment_id} />
                        <input type="hidden" name="back" value={`/grupos/${group.id}`} />
                        <button className="rounded-lg px-2 py-1 transition hover:bg-red-50 hover:text-red-700">Quitar</button>
                      </form>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {canRun && (
        <section className="mt-5 card p-4">
          <h2 className="mb-3 section-title flex items-center gap-2"><Icon name="chart" className="h-4 w-4 text-brand-teal" />Últimas reuniones</h2>
          {meetings.length === 0 ? (
            <EmptyState icon="check-circle" title="Todavía no se ha pasado lista">
              Cuando registres la primera reunión, verás aquí la asistencia.
            </EmptyState>
          ) : (
            <ul>
              {meetings.map((m) => {
                const attended = m.present + m.recovered;
                const pct = m.total ? Math.round((attended / m.total) * 100) : 0;
                return (
                  <li key={m.id} className="border-b border-stone-100 last:border-0">
                    <Link
                      href={`/grupos/${group.id}/lista?fecha=${m.held_on}`}
                      className="flex items-center justify-between gap-4 rounded-lg px-1 py-2.5 text-sm transition hover:bg-stone-50"
                    >
                      <span>
                        {m.held_on.split("-").reverse().join("/")}
                        {m.lesson_number ? <span className="ml-2 text-stone-400">Lección {m.lesson_number}</span> : null}
                      </span>
                      <span className="flex w-40 items-center gap-2">
                        <ProgressBar value={pct} label={`Asistencia ${pct}%`} className="flex-1" />
                        <span className={`w-20 text-right text-xs tabular ${pct < 60 ? "font-semibold text-amber-700" : "text-stone-600"}`}>
                          {attended}/{m.total} · {pct}%
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {(role === "admin" || isCoordinator) && group.status !== "finalizado" && (
        <section className="mt-5 card p-4">
          <h2 className="mb-1 section-title">Cerrar el ciclo</h2>
          <p className="mb-3 text-sm text-stone-500">
            Quien tenga más ausencias que las permitidas queda como "No completó"; el resto, como "Aprobado". Esto no se puede deshacer.
          </p>
          <form action={cerrarGrupo}>
            <input type="hidden" name="group_id" value={group.id} />
            <button className="btn btn-outline">Cerrar el ciclo del grupo</button>
          </form>
        </section>
      )}

      {(role === "admin" || isCoordinator) && group.status === "finalizado" && (
        <section className="mt-5 card p-4">
          <h2 className="mb-1 section-title">Ciclo siguiente</h2>
          <p className="mb-3 text-sm text-stone-500">
            Crea el grupo del ciclo siguiente con las mismas personas a cargo y preinscribe a quienes aprobaron. Cada persona
            confirma su lugar.
          </p>
          <form action={crearContinuacion}>
            <input type="hidden" name="group_id" value={group.id} />
            <button className="btn btn-primary">
              Crear grupo del ciclo siguiente
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
