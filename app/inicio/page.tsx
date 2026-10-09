import Link from "next/link";
import { getSession } from "@/lib/session";
import { ROLE_VIEWS } from "@/lib/roles";
import { ENROLLMENT_LABEL, GROUP_STATUS_LABEL, scheduleLabel, type GroupOverview } from "@/lib/format";
import { ALERT_LABEL, SEVERITY_CLASS, type Alert } from "@/lib/alerts";
import { AppHeader } from "@/components/AppHeader";
import { Flash } from "@/components/Flash";
import { cancelarInscripcion, confirmarInscripcion } from "@/app/actions/gestion";

export const dynamic = "force-dynamic";

type MyRow = {
  enrollment_id: string;
  group_id: string;
  status: string;
  meetings_held: number;
  absences: number;
  max_absences: number;
};

export default async function InicioPage(props: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const searchParams = await props.searchParams;
  const { supabase, user, role, fullName } = await getSession();
  const view = ROLE_VIEWS[role];
  const isManager = role !== "alumno";
  const firstName = fullName ? fullName.split(" ")[0] : (user.email ?? "").split("@")[0];

  // Perfil completo: teléfono, género, nacimiento y términos (necesarios para inscribirse)
  const { data: prof } = await supabase
    .from("profiles")
    .select("phone, gender, birth_date, terms_accepted_at")
    .eq("id", user.id)
    .maybeSingle();
  const p = prof as { phone: string | null; gender: string | null; birth_date: string | null; terms_accepted_at: string | null } | null;
  const profileIncomplete = !p?.terms_accepted_at || !p?.gender || !p?.birth_date;
  const missingPhone = !!p && !p.phone;

  // Mis inscripciones como participante (también los líderes pueden estar cursando)
  const { data: mineRows } = await supabase
    .from("roster")
    .select("enrollment_id, group_id, status, meetings_held, absences, max_absences")
    .eq("person_id", user.id)
    .in("status", ["preinscrito", "en_curso", "aprobado"]);
  const mine = (mineRows ?? []) as MyRow[];
  const { data: mineGroups } = mine.length
    ? await supabase.from("group_overview").select("*").in("id", mine.map((m) => m.group_id))
    : { data: [] };
  const groupOf = (id: string) => ((mineGroups ?? []) as GroupOverview[]).find((g) => g.id === id);

  // Lección actual del primer grupo en curso (la última a la que ya tienes acceso)
  const current = mine.find((m) => m.status === "en_curso");
  let currentLesson: { id: string; number: number; title: string } | null = null;
  if (current) {
    const g = groupOf(current.group_id);
    if (g) {
      const { data: l } = await supabase
        .from("lessons")
        .select("id, number, title")
        .eq("cycle_id", g.cycle_id)
        .order("number", { ascending: false })
        .limit(1);
      currentLesson = ((l ?? [])[0] as { id: string; number: number; title: string } | undefined) ?? null;
    }
  }

  // Vista de quien acompaña grupos
  let groups: GroupOverview[] = [];
  let alerts: Alert[] = [];
  let attendanceRate = "—";
  if (isManager) {
    const g = await supabase
      .from("group_overview")
      .select("*")
      .in("status", ["abierto", "en_curso"])
      .order("curriculum_name")
      .order("name");
    groups = (g.data ?? []) as GroupOverview[];
    alerts = (((await supabase.rpc("my_alerts")).data ?? []) as Alert[]);

    const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const m = await supabase.from("meeting_summary").select("present, recovered, total").gte("held_on", since);
    const rows = (m.data ?? []) as { present: number; recovered: number; total: number }[];
    const total = rows.reduce((n, r) => n + r.total, 0);
    const attended = rows.reduce((n, r) => n + r.present + r.recovered, 0);
    if (total > 0) attendanceRate = `${Math.round((attended / total) * 100)}%`;
  }

  const led = groups.find((g) => g.leader_id === user.id && g.status === "en_curso");
  const actionHref =
    role === "lider" && led
      ? `/grupos/${led.id}/lista`
      : role === "admin"
        ? "/curriculums"
        : role === "coordinador" || role === "monitor" || role === "lider"
          ? "/grupos"
          : currentLesson
            ? `/lecciones/${currentLesson.id}`
            : "/inscripcion";
  const actionLabel =
    role === "alumno" ? (currentLesson ? "Ver lección de hoy" : "Inscribirme a un grupo") : view.action;

  const metrics: [string, string | number][] = isManager
    ? [
        ["Grupos activos", groups.length],
        ["Inscritos", groups.reduce((n, g) => n + g.enrolled, 0)],
        ["Asistencia (4 sem.)", attendanceRate],
      ]
    : [
        ["Mis grupos", mine.length],
        ["Lección actual", currentLesson?.number ?? "—"],
        [
          "Mis ausencias",
          current ? `${current.absences} de ${current.max_absences}` : "—",
        ],
      ];

  const pending = mine.filter((m) => m.status === "preinscrito");

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <AppHeader role={role} />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium">Hola, {firstName}</h1>
          <p className="text-sm text-stone-500">
            {view.label} · {view.scope}
          </p>
        </div>
        <Link href={actionHref} className="rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-medium text-white hover:brightness-95">
          {actionLabel}
        </Link>
      </div>
      <Flash error={searchParams.error} ok={searchParams.ok} />

      {profileIncomplete ? (
        <Link
          href="/perfil"
          className="mb-5 flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:brightness-95"
        >
          <span>Completa tu perfil (género, fecha de nacimiento y términos) para poder inscribirte.</span>
          <span className="font-medium">Completar →</span>
        </Link>
      ) : (
        missingPhone && (
          <Link
            href="/perfil"
            className="mb-5 flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:brightness-95"
          >
            <span>Agrega tu teléfono para que tu líder pueda escribirte por WhatsApp.</span>
            <span className="font-medium">Completar →</span>
          </Link>
        )
      )}

      <div className="mb-5 grid grid-cols-3 gap-3">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="text-xs text-stone-500">{label}</div>
            <div className="text-2xl font-medium">{value}</div>
          </div>
        ))}
      </div>

      {pending.length > 0 && (
        <section className="mb-5 rounded-xl border border-brand-orange bg-white p-4">
          <h2 className="mb-2 text-sm font-medium">Confirma tu lugar en el siguiente ciclo</h2>
          <ul>
            {pending.map((m) => {
              const g = groupOf(m.group_id);
              return (
                <li key={m.enrollment_id} className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 py-2.5 text-sm last:border-0">
                  <span>
                    <span className="font-medium">{g?.curriculum_name}</span>
                    <span className="ml-2 text-stone-500">
                      Ciclo {g?.cycle_number} · {g ? scheduleLabel(g) : ""}
                    </span>
                  </span>
                  <span className="flex gap-2">
                    <form action={confirmarInscripcion}>
                      <input type="hidden" name="enrollment_id" value={m.enrollment_id} />
                      <input type="hidden" name="accept" value="si" />
                      <button className="rounded-lg bg-brand-orange px-3 py-1.5 text-sm font-medium text-white hover:brightness-95">Confirmar</button>
                    </form>
                    <form action={confirmarInscripcion}>
                      <input type="hidden" name="enrollment_id" value={m.enrollment_id} />
                      <input type="hidden" name="accept" value="no" />
                      <button className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50">No esta vez</button>
                    </form>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {alerts.length > 0 && (
        <section className="mb-5 rounded-xl border border-stone-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium">Necesitan tu atención</h2>
            <Link href="/alertas" className="text-sm text-brand-teal hover:underline">
              Ver las {alerts.length} →
            </Link>
          </div>
          <ul>
            {alerts.slice(0, 4).map((a, i) => (
              <li key={`${a.kind}-${a.group_id}-${a.person_id ?? i}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 py-2.5 text-sm last:border-0">
                <span>
                  <span className="font-medium">{a.person_name || a.group_name}</span>
                  <span className="ml-2 text-stone-500">{a.detail}</span>
                </span>
                <span className={`rounded px-2 py-0.5 text-xs ${SEVERITY_CLASS[a.severity]}`}>{ALERT_LABEL[a.kind]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {mine.length > 0 && (
        <section className="mb-5 rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-medium">{isManager ? "Los grupos donde participo" : "Mis grupos"}</h2>
          <ul>
            {mine
              .filter((m) => m.status !== "preinscrito")
              .map((m) => {
                const g = groupOf(m.group_id);
                return (
                  <li key={m.enrollment_id} className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 py-2.5 text-sm last:border-0">
                    <span>
                      <Link href={`/grupos/${m.group_id}`} className="font-medium hover:underline">
                        {g?.curriculum_name}
                      </Link>
                      <span className="ml-2 text-stone-500">
                        Ciclo {g?.cycle_number} · {g ? scheduleLabel(g) : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-3 text-stone-500">
                      <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">{ENROLLMENT_LABEL[m.status]}</span>
                      {m.status === "en_curso" && (
                        <form action={cancelarInscripcion}>
                          <input type="hidden" name="enrollment_id" value={m.enrollment_id} />
                          <input type="hidden" name="back" value="/inicio" />
                          <button className="text-xs hover:text-red-700 hover:underline">Dejar el grupo</button>
                        </form>
                      )}
                    </span>
                  </li>
                );
              })}
          </ul>
          {currentLesson && (
            <Link href={`/lecciones/${currentLesson.id}`} className="mt-3 block rounded-lg bg-stone-50 px-3 py-2 text-sm hover:bg-stone-100">
              <span className="text-stone-500">Tu lección:</span> {currentLesson.number}. {currentLesson.title} →
            </Link>
          )}
        </section>
      )}

      {isManager ? (
        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium">{view.listTitle}</h2>
            <Link href="/grupos" className="text-sm text-brand-teal hover:underline">
              Ver todos →
            </Link>
          </div>
          {groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-stone-500">Todavía no hay grupos para mostrar.</p>
          ) : (
            <ul>
              {groups.slice(0, 8).map((g) => (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 py-2.5 text-sm last:border-0">
                  <span>
                    <Link href={`/grupos/${g.id}`} className="font-medium hover:underline">
                      {g.name}
                    </Link>
                    <span className="ml-2 text-stone-400">
                      {g.curriculum_name} · Ciclo {g.cycle_number}
                    </span>
                  </span>
                  <span className="text-stone-500">
                    {g.enrolled}/{g.capacity} · {scheduleLabel(g)} · {GROUP_STATUS_LABEL[g.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        mine.length === 0 && (
          <section className="rounded-xl border border-stone-200 bg-white p-6 text-center">
            <h2 className="font-medium">Aún no estás en un grupo</h2>
            <p className="mt-1 text-sm text-stone-500">Mira los grupos que están abiertos y elige el que mejor te acomode.</p>
            <Link href="/inscripcion" className="mt-4 inline-block rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-medium text-white hover:brightness-95">
              Ver grupos disponibles
            </Link>
          </section>
        )
      )}
    </div>
  );
}
