import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { scheduleLabel, todayInChile, type GroupOverview } from "@/lib/format";
import { Flash, fieldClass, primaryBtn } from "@/components/Flash";
import {
  SESSION_LABEL,
  SESSION_STYLE,
  dayMonth,
  isPending,
  summarizeSessions,
  weekdayName,
  type Session,
} from "@/lib/calendar";
import {
  acreditarSesion,
  asignarRespaldo,
  cancelarSesion,
  dirigirSesion,
  planificarGrupo,
  reprogramarSesion,
} from "@/app/actions/calendario";

export const dynamic = "force-dynamic";

type Slot = { id: string; position: number; title: string | null };
type SlotUnit = { slot_id: string; lessons: { number: number; title: string } | null };
type Summary = { id: string; present: number; recovered: number; total: number; justified?: number };
type Candidate = { id: string; full_name: string; role: string };

export default async function CalendarioPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string; aviso?: string; q?: string }>;
}) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const { supabase, user, role } = await getSession();

  const { data } = await supabase.from("group_overview").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const group = data as GroupOverview;

  const { data: coordRow } = await supabase
    .from("curriculum_coordinators")
    .select("coordinator_id")
    .eq("curriculum_id", group.curriculum_id)
    .eq("coordinator_id", user.id);
  const isCoordinator = (coordRow ?? []).length > 0;
  const canManage = role === "admin" || isCoordinator || group.leader_id === user.id || group.monitor_id === user.id;
  const isBackup = group.backup_leader_id === user.id;
  const canRun = canManage || isBackup;

  const { data: rows, error } = await supabase
    .from("meetings")
    .select("id, held_on, season_week, status, slot_id, facilitator_id, cancel_reason, rescheduled_from, modality")
    .eq("group_id", id)
    .order("season_week", { ascending: true, nullsFirst: false })
    .order("held_on");
  if (error) {
    return (
      <div className="enter mx-auto max-w-3xl p-4 pb-16 md:p-8 md:pb-16">
        <h1 className="page-title">Calendario</h1>
        <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          Falta instalar el calendario en la base de datos: ejecuta <code>supabase/v2/008_calendario.sql</code> en el SQL Editor de Supabase.
        </p>
      </div>
    );
  }
  const sessions = (rows ?? []) as Session[];
  const numbered = sessions.filter((s) => s.season_week !== null);
  const extras = sessions.filter((s) => s.season_week === null);
  const today = todayInChile();
  const sum = summarizeSessions(sessions, today, group.backup_leader_id ?? null, group.leader_id);

  // Contenido de cada posición, asistencia y nombres
  const slotIds = Array.from(new Set(numbered.map((s) => s.slot_id).filter(Boolean))) as string[];
  const doneIds = sessions.filter((s) => s.status === "realizada").map((s) => s.id);
  const facIds = Array.from(new Set(sessions.map((s) => s.facilitator_id).filter(Boolean))) as string[];
  const [slotsR, unitsR, sumR, namesR] = await Promise.all([
    slotIds.length ? supabase.from("learning_plan_slots").select("id, position, title").in("id", slotIds) : Promise.resolve({ data: [] }),
    slotIds.length ? supabase.from("learning_plan_slot_units").select("slot_id, lessons(number, title)").in("slot_id", slotIds) : Promise.resolve({ data: [] }),
    doneIds.length && canRun ? supabase.from("meeting_summary").select("id, present, recovered, total").in("id", doneIds) : Promise.resolve({ data: [] }),
    facIds.length ? supabase.from("profiles").select("id, full_name").in("id", facIds) : Promise.resolve({ data: [] }),
  ]);
  const slots = new Map(((slotsR.data ?? []) as Slot[]).map((s) => [s.id, s]));
  const unitsBySlot = new Map<string, string[]>();
  for (const u of (unitsR.data ?? []) as unknown as SlotUnit[]) {
    if (!u.lessons) continue;
    unitsBySlot.set(u.slot_id, [...(unitsBySlot.get(u.slot_id) ?? []), `${u.lessons.number}. ${u.lessons.title}`]);
  }
  const attendance = new Map(((sumR.data ?? []) as Summary[]).map((s) => [s.id, s]));
  const names = new Map(((namesR.data ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]));

  const q = (sp.q ?? "").trim();
  const candidates: Candidate[] =
    canManage && q.length >= 3
      ? (((await supabase.rpc("search_backup_candidates", { gid: id, q })).data ?? []) as Candidate[])
      : [];

  const renderSession = (s: Session) => {
    const slot = s.slot_id ? slots.get(s.slot_id) : undefined;
    const units = s.slot_id ? unitsBySlot.get(s.slot_id) ?? [] : [];
    const att = attendance.get(s.id);
    const canOpenList = canRun && group.status !== "finalizado" && s.status !== "cancelada" && s.held_on <= today;
    return (
      <li key={s.id} className="card p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="text-sm">
            <p className="font-medium">
              {s.season_week ? `Semana ${s.season_week}` : "Reunión extra"}
              <span className="ml-2 font-normal text-stone-500">
                {weekdayName(s.held_on)} {dayMonth(s.held_on)}
              </span>
            </p>
            {(slot?.title || units.length > 0) && (
              <p className="text-stone-500">{[slot?.title, units.length ? units.join(" · ") : null].filter(Boolean).join(" — ")}</p>
            )}
            <p className="text-xs text-stone-400">
              {s.rescheduled_from && s.rescheduled_from !== s.held_on ? `Antes: ${dayMonth(s.rescheduled_from)}. ` : ""}
              {s.cancel_reason ? `Motivo: ${s.cancel_reason}. ` : ""}
              {s.facilitator_id ? `Dirigió: ${names.get(s.facilitator_id) ?? "equipo del grupo"}. ` : ""}
              {att ? `Asistieron ${att.present + att.recovered} de ${att.total}.` : ""}
            </p>
          </div>
          <span className={`chip ${SESSION_STYLE[s.status]}`}>{SESSION_LABEL[s.status]}</span>
        </div>

        {(canOpenList || (canManage && s.status !== "cancelada" && s.status !== "realizada") || (canManage && s.status === "cancelada") || (canManage && s.status === "realizada" && units.length > 0)) && (
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-2 text-sm">
            {canOpenList && (
              <Link href={`/grupos/${id}/lista?fecha=${s.held_on}`} className="btn btn-outline">
                {s.status === "realizada" ? "Corregir lista" : "Pasar lista"}
              </Link>
            )}
            {canManage && s.status === "realizada" && units.length > 0 && (
              <form action={acreditarSesion}>
                <input type="hidden" name="group_id" value={id} />
                <input type="hidden" name="mid" value={s.id} />
                <button className="rounded-lg border border-stone-300 px-3 py-1.5 text-stone-700 hover:bg-stone-50">Acreditar unidades a quienes asistieron</button>
              </form>
            )}
            {canManage && s.status !== "realizada" && (
              <details className="group">
                <summary className="cursor-pointer rounded-lg px-3 py-1.5 text-stone-600 hover:bg-stone-100">Cambiar</summary>
                <div className="mt-2 space-y-2 rounded-lg bg-stone-50 p-3">
                  <form action={reprogramarSesion} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="group_id" value={id} />
                    <input type="hidden" name="mid" value={s.id} />
                    <input type="date" name="new_date" defaultValue={s.held_on} aria-label="Nueva fecha" className={`${fieldClass} w-auto`} />
                    <button className="h-10 rounded-lg border border-stone-300 px-3 text-sm hover:bg-white">Reprogramar</button>
                  </form>
                  {s.status !== "cancelada" && (
                    <form action={cancelarSesion} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="group_id" value={id} />
                      <input type="hidden" name="mid" value={s.id} />
                      <input name="reason" placeholder="Motivo (feriado, retiro…)" aria-label="Motivo" className={`${fieldClass} w-auto md:w-64`} />
                      <button className="btn btn-danger">Cancelar sesión</button>
                    </form>
                  )}
                  {group.backup_leader_id && s.facilitator_id !== group.backup_leader_id && (
                    <form action={dirigirSesion}>
                      <input type="hidden" name="group_id" value={id} />
                      <input type="hidden" name="mid" value={s.id} />
                      <input type="hidden" name="person" value={group.backup_leader_id} />
                      <button className="btn btn-outline">
                        Que la dirija {group.backup_leader_name ?? "el respaldo"}
                      </button>
                    </form>
                  )}
                </div>
              </details>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="enter mx-auto max-w-3xl p-4 pb-16 md:p-8 md:pb-16">
      <Link href={`/grupos/${id}`} className="text-sm link">← {group.name}</Link>
      <h1 className="mt-2 page-title">Calendario</h1>
      <p className="mb-5 mt-1 text-sm text-stone-500">
        {group.name} · {group.curriculum_name} · {scheduleLabel(group)}
      </p>
      <Flash error={sp.error} ok={sp.ok} />
      {sp.aviso && <p role="status" className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{sp.aviso}</p>}

      {numbered.length === 0 ? (
        canManage ? (
          <section className="mb-5 card p-4">
            <h2 className="mb-1 section-title">Planificar las 36 sesiones</h2>
            <p className="mb-3 text-sm text-stone-500">
              Si el administrador ya definió el calendario de la temporada (con sus feriados), se usa tal cual y cae en el día de reunión del grupo. Si no, indica la fecha de la primera reunión y las fechas que se saltan.
            </p>
            <form action={planificarGrupo} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="group_id" value={id} />
              <label className="text-xs text-stone-500">
                Primera reunión (solo si la temporada no tiene calendario)
                <input type="date" name="first_date" className={`${fieldClass} mt-1`} />
              </label>
              <label className="text-xs text-stone-500 md:col-span-2">
                Fechas que se saltan (opcional)
                <textarea name="breaks" rows={2} placeholder="04/05/2026, 29/06/2026" className={`${fieldClass} mt-1 h-auto py-2`} />
              </label>
              <div className="md:col-span-2">
                <button className={primaryBtn}>Planificar</button>
              </div>
            </form>
          </section>
        ) : (
          <p className="empty">Este grupo todavía no tiene su calendario.</p>
        )
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "Realizadas", value: `${sum.done} de ${numbered.length}`, tone: "" },
              { label: "Por registrar", value: String(sum.overdue), tone: sum.overdue > 0 ? "text-amber-700" : "" },
              { label: "Canceladas", value: String(sum.cancelled), tone: "" },
              { label: "Próxima", value: sum.next ? `${dayMonth(sum.next.held_on).slice(0, 5)}` : "—", tone: "" },
            ].map((k) => (
              <div key={k.label} className="card p-3">
                <p className="text-xs text-stone-500">{k.label}</p>
                <p className={`text-lg font-medium ${k.tone}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {sum.withBackup > 0 && (
            <p className="mb-4 text-xs text-stone-500">{sum.withBackup} {sum.withBackup === 1 ? "sesión la dirigió" : "sesiones las dirigió"} el respaldo; la temporada sigue su curso.</p>
          )}

          <ul className="space-y-2">{numbered.map(renderSession)}</ul>
        </>
      )}

      {extras.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 section-title text-stone-600">Reuniones extra</h2>
          <ul className="space-y-2">{extras.map(renderSession)}</ul>
        </section>
      )}

      {/* Líder y respaldo */}
      <section className="mt-6 card p-4">
        <h2 className="mb-1 section-title">Líder y respaldo</h2>
        <p className="mb-3 text-sm text-stone-600">
          Líder: {group.leader_name ?? "Sin asignar"} · Respaldo: {group.backup_leader_name ?? "Sin asignar"}
        </p>
        <p className="mb-3 text-xs text-stone-500">
          El respaldo puede pasar lista y dirigir sesiones cuando falta el líder. No inscribe personas ni acredita unidades. El grupo y la temporada siguen igual.
        </p>
        {canManage && (
          <>
            <form method="get" className="flex flex-wrap items-center gap-2">
              <input name="q" defaultValue={q} placeholder="Buscar por nombre (3 letras o más)" aria-label="Buscar respaldo" className={`${fieldClass} md:max-w-xs`} />
              <button className="btn btn-secondary">Buscar</button>
            </form>
            {q.length >= 3 && candidates.length === 0 && <p className="mt-2 text-sm text-stone-500">Nadie coincide con “{q}”.</p>}
            {candidates.length > 0 && (
              <ul className="mt-2 space-y-1">
                {candidates.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2 text-sm">
                    <span>{c.full_name || "Sin nombre"} <span className="text-xs text-stone-400">· {c.role}</span></span>
                    <form action={asignarRespaldo}>
                      <input type="hidden" name="group_id" value={id} />
                      <input type="hidden" name="person" value={c.id} />
                      <button className="link">Dejar como respaldo</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            {group.backup_leader_id && (
              <form action={asignarRespaldo} className="mt-3">
                <input type="hidden" name="group_id" value={id} />
                <input type="hidden" name="person" value="" />
                <button className="text-sm text-stone-500 hover:text-red-700 hover:underline">Quitar al respaldo</button>
              </form>
            )}
          </>
        )}
      </section>
    </div>
  );
}
