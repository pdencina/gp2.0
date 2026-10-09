import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession, type Person } from "@/lib/session";
import { ENROLLMENT_LABEL, GROUP_STATUS_LABEL, scheduleLabel, type GroupOverview } from "@/lib/format";
import { whatsappLink } from "@/lib/phone";
import { Flash, fieldClass } from "@/components/Flash";
import {
  asignarResponsables,
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

  const { data: rosterRows } = await supabase
    .from("roster")
    .select("enrollment_id, person_id, status, person_name, phone, meetings_held, present, recovered, absences, max_absences")
    .eq("group_id", group.id)
    .order("person_name");
  const roster = (rosterRows ?? []) as RosterRow[];
  const active = roster.filter((r) => r.status !== "cancelado");

  const { data: meetingRows } = canManage
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
  const { data: nextLesson } = canManage
    ? await supabase
        .from("lessons")
        .select("id, number, title, summary")
        .eq("cycle_id", group.cycle_id)
        .eq("number", lastLesson + 1)
        .maybeSingle()
    : { data: null };

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
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <Link href="/grupos" className="text-sm text-brand-teal hover:underline">
        ← Grupos
      </Link>
      <h1 className="mt-2 text-2xl font-medium">{group.name}</h1>
      <p className="mb-5 mt-1 text-sm text-stone-500">
        {group.curriculum_name} · Ciclo {group.cycle_number}
        {group.cycle_title ? ` (${group.cycle_title})` : ""} · {scheduleLabel(group)} · {GROUP_STATUS_LABEL[group.status]}
        {group.address ? ` · ${group.address}` : ""}
      </p>
      <Flash error={searchParams.error} ok={searchParams.ok} />
      {searchParams.lista && (
        <p role="status" className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          Lista guardada: {searchParams.lista} {searchParams.lista === "1" ? "asistente" : "asistentes"}.
        </p>
      )}

      {canManage && group.status !== "finalizado" && (
        <Link
          href={`/grupos/${group.id}/lista`}
          className="mb-5 flex h-12 items-center justify-center rounded-xl bg-brand-orange font-medium text-white hover:brightness-95"
        >
          Pasar lista
        </Link>
      )}

      {canManage && (
        <section className="mb-5 rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-medium">Próxima lección</h2>
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

      <section className="mb-5 rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-medium">Responsables</h2>
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
            <button className="h-10 rounded-lg border border-brand-teal px-3 text-sm text-brand-teal hover:bg-brand-teal hover:text-white">
              Guardar
            </button>
          </form>
        ) : (
          <p className="text-sm text-stone-600">
            Monitor: {group.monitor_name ?? "Sin asignar"} · Líder: {group.leader_name ?? "Sin asignar"}
          </p>
        )}
      </section>

      {canManage && (
        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">Inscritos</h2>
            <span className="text-xs text-stone-500">
              {group.enrolled}/{group.capacity}
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
              <button disabled={full} className="h-10 rounded-lg bg-brand-orange px-4 text-sm font-medium text-white disabled:opacity-50">
                Inscribir
              </button>
            </form>
          )}

          {active.length === 0 ? (
            <p className="py-4 text-center text-sm text-stone-500">Este grupo todavía no tiene inscritos.</p>
          ) : (
            <ul>
              {active.map((r) => (
                <li key={r.enrollment_id} className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 py-2.5 text-sm last:border-0">
                  <span>
                    {r.person_name || "Sin nombre"}
                    <span className="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">
                      {ENROLLMENT_LABEL[r.status]}
                    </span>
                    {r.phone && (
                      <a
                        href={whatsappLink(r.phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-3 text-xs text-brand-teal hover:underline"
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
                        <button className="hover:text-red-700 hover:underline">Quitar</button>
                      </form>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {canManage && (
        <section className="mt-5 rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-medium">Últimas reuniones</h2>
          {meetings.length === 0 ? (
            <p className="py-4 text-center text-sm text-stone-500">Todavía no se ha pasado lista.</p>
          ) : (
            <ul>
              {meetings.map((m) => {
                const attended = m.present + m.recovered;
                const pct = m.total ? Math.round((attended / m.total) * 100) : 0;
                return (
                  <li key={m.id} className="border-b border-stone-100 last:border-0">
                    <Link
                      href={`/grupos/${group.id}/lista?fecha=${m.held_on}`}
                      className="flex items-center justify-between py-2.5 text-sm hover:bg-stone-50"
                    >
                      <span>
                        {m.held_on.split("-").reverse().join("/")}
                        {m.lesson_number ? <span className="ml-2 text-stone-400">Lección {m.lesson_number}</span> : null}
                      </span>
                      <span className={pct < 60 ? "text-amber-700" : "text-stone-600"}>
                        {attended}/{m.total} · {pct}%
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
        <section className="mt-5 rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-medium">Cerrar el ciclo</h2>
          <p className="mb-3 text-sm text-stone-500">
            Quien tenga más ausencias que las permitidas queda como "No completó"; el resto, como "Aprobado". Esto no se puede deshacer.
          </p>
          <form action={cerrarGrupo}>
            <input type="hidden" name="group_id" value={group.id} />
            <button className="h-10 rounded-lg border border-stone-400 px-4 text-sm hover:bg-stone-50">Cerrar el ciclo del grupo</button>
          </form>
        </section>
      )}

      {(role === "admin" || isCoordinator) && group.status === "finalizado" && (
        <section className="mt-5 rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-medium">Ciclo siguiente</h2>
          <p className="mb-3 text-sm text-stone-500">
            Crea el grupo del ciclo siguiente con las mismas personas a cargo y preinscribe a quienes aprobaron. Cada persona
            confirma su lugar.
          </p>
          <form action={crearContinuacion}>
            <input type="hidden" name="group_id" value={group.id} />
            <button className="h-10 rounded-lg bg-brand-orange px-4 text-sm font-medium text-white hover:brightness-95">
              Crear grupo del ciclo siguiente
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
