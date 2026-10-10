import Link from "next/link";
import { getSession } from "@/lib/session";
import { ROLE_VIEWS } from "@/lib/roles";
import { GROUP_STATUS_LABEL, scheduleLabel, todayInChile, type GroupOverview } from "@/lib/format";
import { ALERT_LABEL, SEVERITY_CLASS, type Alert } from "@/lib/alerts";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { Kpi } from "@/components/charts";
import { Avatar, Callout, Dot, EmptyState, ProgressRing } from "@/components/ui";
import { confirmarInscripcion } from "@/app/actions/gestion";
import { dayMonth, weekdayName } from "@/lib/calendar";
import { CE_LABEL, CE_STYLE, normalizeProgress, type CeStatus, type CurriculumProgress } from "@/lib/progress";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inicio" };

type MyRow = { enrollment_id: string; group_id: string; status: string; absences: number; max_absences: number };
type CeRow = { id: string; curriculum_id: string; status: CeStatus; formative_year: number; curriculums: { name: string } | null };

const greeting = () => {
  const h = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "America/Santiago" }));
  return h < 12 ? "Buenos días" : h < 20 ? "Buenas tardes" : "Buenas noches";
};

const groupLabel = (g?: Pick<GroupOverview, "cycle_number" | "formative_year">) =>
  g?.cycle_number != null ? `Ciclo ${g.cycle_number}` : g?.formative_year && g.formative_year > 1 ? `Año ${g.formative_year}` : "";

export default async function InicioPage(props: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const searchParams = await props.searchParams;
  const { supabase, user, role, fullName } = await getSession();
  const view = ROLE_VIEWS[role];
  const isManager = role !== "alumno";
  const firstName = fullName ? fullName.split(" ")[0] : (user.email ?? "").split("@")[0];
  const today = todayInChile();

  // Perfil completo: teléfono, género, nacimiento y términos (necesarios para inscribirse)
  const { data: prof } = await supabase
    .from("profiles")
    .select("phone, gender, birth_date, terms_accepted_at")
    .eq("id", user.id)
    .maybeSingle();
  const p = prof as { phone: string | null; gender: string | null; birth_date: string | null; terms_accepted_at: string | null } | null;
  const profileIncomplete = !p?.terms_accepted_at || !p?.gender || !p?.birth_date;
  const missingPhone = !!p && !p.phone;

  // Mis programas (inscripción continua) y su avance
  const { data: ceData } = await supabase
    .from("curriculum_enrollments")
    .select("id, curriculum_id, status, formative_year, curriculums(name)")
    .eq("person_id", user.id)
    .in("status", ["activo", "pausado"])
    .order("started_at", { ascending: false })
    .limit(8);
  const ces = (ceData ?? []) as unknown as CeRow[];

  const progress = new Map<string, CurriculumProgress>();
  await Promise.all(
    ces.map(async (c) => {
      const { data } = await supabase.rpc("curriculum_progress", { ce: c.id });
      progress.set(c.id, normalizeProgress((data as Partial<CurriculumProgress>[] | null)?.[0]));
    }),
  );

  // Grupo vigente de cada programa y su próxima reunión
  const { data: memData } = ces.length
    ? await supabase
        .from("enrollments")
        .select("curriculum_enrollment_id, group_id")
        .in("curriculum_enrollment_id", ces.map((c) => c.id))
        .in("status", ["preinscrito", "en_curso"])
    : { data: [] };
  const memberships = (memData ?? []) as { curriculum_enrollment_id: string; group_id: string }[];
  const groupIds = Array.from(new Set(memberships.map((m) => m.group_id)));
  const [{ data: gData }, { data: mtgData }] = groupIds.length
    ? await Promise.all([
        supabase.from("group_overview").select("*").in("id", groupIds),
        supabase
          .from("meetings")
          .select("group_id, held_on, season_week")
          .in("group_id", groupIds)
          .in("status", ["planificada", "reprogramada"])
          .gte("held_on", today)
          .order("held_on"),
      ])
    : [{ data: [] }, { data: [] }];
  const myGroups = (gData ?? []) as GroupOverview[];
  const nextMeeting = new Map<string, { held_on: string; season_week: number | null }>();
  for (const m of (mtgData ?? []) as { group_id: string; held_on: string; season_week: number | null }[]) {
    if (!nextMeeting.has(m.group_id)) nextMeeting.set(m.group_id, m);
  }
  const groupOfCe = (ce: string) => {
    const m = memberships.find((x) => x.curriculum_enrollment_id === ce);
    return m ? myGroups.find((g) => g.id === m.group_id) : undefined;
  };

  // La siguiente unidad, solo si esta persona ya puede abrirla
  const nextIds = ces.map((c) => progress.get(c.id)?.next_unit_id).filter(Boolean) as string[];
  const { data: openable } = nextIds.length ? await supabase.from("lessons").select("id").in("id", nextIds) : { data: [] };
  const canOpen = new Set(((openable ?? []) as { id: string }[]).map((l) => l.id));

  // Confirmaciones pendientes del ciclo siguiente (preinscritos)
  const { data: pendingRows } = await supabase
    .from("roster")
    .select("enrollment_id, group_id, status, absences, max_absences")
    .eq("person_id", user.id)
    .eq("status", "preinscrito");
  const pending = (pendingRows ?? []) as MyRow[];
  const { data: pendingGroups } = pending.length
    ? await supabase.from("group_overview").select("*").in("id", pending.map((m) => m.group_id))
    : { data: [] };
  const pendingGroup = (id: string) => ((pendingGroups ?? []) as GroupOverview[]).find((g) => g.id === id);

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
    alerts = ((await supabase.rpc("my_alerts")).data ?? []) as Alert[];

    const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const m = await supabase.from("meeting_summary").select("present, recovered, total").gte("held_on", since);
    const rows = (m.data ?? []) as { present: number; recovered: number; total: number }[];
    const total = rows.reduce((n, r) => n + r.total, 0);
    const attended = rows.reduce((n, r) => n + r.present + r.recovered, 0);
    if (total > 0) attendanceRate = `${Math.round((attended / total) * 100)} %`;
  }

  const led = groups.find((g) => g.leader_id === user.id && g.status === "en_curso");
  const actionHref =
    role === "lider" && led
      ? `/grupos/${led.id}/lista`
      : role === "admin"
        ? "/panel"
        : role === "coordinador" || role === "monitor" || role === "lider"
          ? "/grupos"
          : ces.length
            ? `/mi-progreso/${ces[0].id}`
            : "/catalogo";
  const actionLabel = role === "alumno" ? (ces.length ? "Seguir mi camino" : "Elegir mi programa") : role === "admin" ? "Abrir el panel" : view.action;

  const urgent = alerts.filter((a) => a.severity === 3).length;
  const dateLabel = new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Santiago" });

  return (
    <div className="mx-auto max-w-5xl p-4 pb-16 md:p-8 md:pb-16">
      {/* Encabezado */}
      <section className="enter relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-teal-700 via-brand-teal to-brand-teal-500 p-6 text-white shadow-lift md:p-8">
        <span aria-hidden="true" className="float-slow absolute -right-10 -top-12 h-44 w-44 rounded-full bg-brand-orange-400/80" />
        <span aria-hidden="true" className="float-slower absolute -bottom-14 right-24 h-36 w-36 rounded-full bg-brand-green-400/70" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium capitalize text-white/80">{dateLabel}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
              {greeting()}, {firstName}
            </h1>
            <p className="mt-1.5 text-sm text-white/80">
              {view.label} · {view.scope}
            </p>
          </div>
          <Link href={actionHref} className="btn btn-lg bg-white text-brand-teal-800 shadow-md hover:bg-brand-sand">
            {actionLabel}
            <Icon name="arrow-right" className="h-5 w-5" />
          </Link>
        </div>
      </section>

      <Flash error={searchParams.error} ok={searchParams.ok} />

      <div className="mb-5 space-y-3 empty:hidden">
        {profileIncomplete ? (
          <Callout tone="warn" href="/perfil" action="Completar">
            Completa tu perfil (género, fecha de nacimiento y términos) para poder inscribirte.
          </Callout>
        ) : (
          missingPhone && (
            <Callout tone="info" href="/perfil" action="Agregar">
              Agrega tu teléfono para que tu líder pueda escribirte por WhatsApp.
            </Callout>
          )
        )}
      </div>

      {/* Indicadores de quien acompaña */}
      {isManager && (
        <div className="stagger mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Grupos activos" value={String(groups.length)} icon="grid" href="/grupos" />
          <Kpi label="Personas inscritas" value={String(groups.reduce((n, g) => n + g.enrolled, 0))} icon="users" />
          <Kpi label="Asistencia, 4 semanas" value={attendanceRate} icon="chart" />
          <Kpi
            label="Avisos"
            value={String(alerts.length)}
            sub={urgent > 0 ? `${urgent} urgentes` : "todo en orden"}
            tone={urgent > 0 ? "alert" : "stone"}
            icon="bell"
            href="/alertas"
          />
        </div>
      )}

      {/* Confirmaciones */}
      {pending.length > 0 && (
        <section className="card enter mb-6 border-brand-orange/50 p-4 md:p-5">
          <h2 className="section-title mb-1">Confirma tu lugar en el siguiente ciclo</h2>
          <p className="mb-2 text-xs text-stone-500">Te reservamos un cupo. Confírmalo para seguir.</p>
          <ul>
            {pending.map((m) => {
              const g = pendingGroup(m.group_id);
              return (
                <li key={m.enrollment_id} className="row">
                  <span>
                    <span className="font-semibold">{g?.curriculum_name}</span>
                    <span className="ml-2 text-stone-500">
                      {groupLabel(g)} {g ? `· ${scheduleLabel(g)}` : ""}
                    </span>
                  </span>
                  <span className="flex gap-2">
                    <form action={confirmarInscripcion}>
                      <input type="hidden" name="enrollment_id" value={m.enrollment_id} />
                      <input type="hidden" name="accept" value="si" />
                      <button className="btn btn-primary btn-sm">Confirmar</button>
                    </form>
                    <form action={confirmarInscripcion}>
                      <input type="hidden" name="enrollment_id" value={m.enrollment_id} />
                      <input type="hidden" name="accept" value="no" />
                      <button className="btn btn-secondary btn-sm">No esta vez</button>
                    </form>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Mi camino */}
      {ces.length > 0 && (
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">{isManager ? "Los programas que curso" : "Tu camino"}</h2>
            <Link href="/mi-progreso" className="link text-sm">
              Ver todo
            </Link>
          </div>
          <ul className="stagger grid gap-3 md:grid-cols-2">
            {ces.map((c) => {
              const pr = progress.get(c.id)!;
              const g = groupOfCe(c.id);
              const nm = g ? nextMeeting.get(g.id) : undefined;
              const pct = pr.units_total > 0 ? (pr.units_done / pr.units_total) * 100 : 0;
              return (
                <li key={c.id}>
                  <Link href={`/mi-progreso/${c.id}`} className="card card-hover group block p-4 md:p-5">
                    <div className="flex items-start gap-4">
                      <ProgressRing value={pct} label={`Avance de ${c.curriculums?.name ?? "tu programa"}`}>
                        {pr.units_total > 0 ? `${Math.round(pct)}%` : <Icon name="route" className="h-5 w-5 text-stone-400" />}
                      </ProgressRing>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="truncate font-semibold">{c.curriculums?.name}</h3>
                          <span className={`chip shrink-0 ${CE_STYLE[c.status]}`}>{CE_LABEL[c.status]}</span>
                        </div>
                        <p className="mt-0.5 text-sm text-stone-500">
                          {pr.units_total > 0 ? (
                            pr.next_unit_title ? (
                              <>
                                Sigue: <span className="font-medium text-stone-700">{pr.next_unit_title}</span>
                              </>
                            ) : (
                              "Completaste todas las unidades"
                            )
                          ) : c.formative_year > 1 ? (
                            `Año ${c.formative_year}`
                          ) : (
                            "Tu avance aparecerá aquí"
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3 text-sm">
                      {g ? (
                        <span className="flex min-w-0 items-center gap-1.5 text-stone-600">
                          <Icon name={g.modality === "virtual" ? "video" : "pin"} className="h-4 w-4 text-brand-teal" />
                          <span className="truncate">
                            {g.name} · {scheduleLabel(g)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-amber-700">{c.status === "activo" ? "Elige tu grupo" : "En pausa"}</span>
                      )}
                      {nm && (
                        <span className="chip bg-brand-teal-50 text-brand-teal-800">
                          <Icon name="calendar-check" className="h-3.5 w-3.5" />
                          {weekdayName(nm.held_on)} {dayMonth(nm.held_on).slice(0, 5)}
                        </span>
                      )}
                    </div>
                  </Link>
                  {pr.next_unit_id && canOpen.has(pr.next_unit_id) && (
                    <Link href={`/lecciones/${pr.next_unit_id}`} className="mt-1.5 flex items-center gap-1.5 px-2 text-xs font-medium text-brand-teal hover:underline">
                      <Icon name="book" className="h-3.5 w-3.5" />
                      Abrir la unidad que sigue
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Avisos */}
      {alerts.length > 0 && (
        <section className="card enter mb-6 p-4 md:p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="section-title">Necesitan tu atención</h2>
            <Link href="/alertas" className="link inline-flex items-center gap-1 text-sm">
              Ver las {alerts.length}
              <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
          </div>
          <ul className="stagger">
            {alerts.slice(0, 5).map((a, i) => (
              <li key={`${a.kind}-${a.group_id}-${a.person_id ?? i}`} className="row">
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar name={a.person_name || a.group_name} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{a.person_name || a.group_name}</span>
                    <span className="block truncate text-xs text-stone-500">{a.detail}</span>
                  </span>
                </span>
                <span className={`chip shrink-0 ${SEVERITY_CLASS[a.severity]}`}>
                  <Dot tone={a.severity === 3 ? "red" : a.severity === 2 ? "amber" : "stone"} />
                  {ALERT_LABEL[a.kind]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Grupos */}
      {isManager ? (
        <section className="card enter p-4 md:p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="section-title">{view.listTitle}</h2>
            <Link href="/grupos" className="link inline-flex items-center gap-1 text-sm">
              Ver todos
              <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
          </div>
          {groups.length === 0 ? (
            <EmptyState icon="grid" title="Todavía no hay grupos para mostrar">
              Cuando haya grupos activos en tu alcance, los verás aquí.
            </EmptyState>
          ) : (
            <ul className="stagger">
              {groups.slice(0, 8).map((g) => (
                <li key={g.id} className="row">
                  <span className="min-w-0">
                    <Link href={`/grupos/${g.id}`} className="font-semibold hover:text-brand-teal">
                      {g.name}
                    </Link>
                    <span className="ml-2 text-stone-400">
                      {g.curriculum_name} {groupLabel(g) && `· ${groupLabel(g)}`}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-stone-500">
                    <span className="tabular">
                      {g.enrolled}/{g.capacity}
                    </span>
                    <span>{scheduleLabel(g)}</span>
                    <span className="chip bg-stone-100 text-stone-600">{GROUP_STATUS_LABEL[g.status]}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        ces.length === 0 &&
        pending.length === 0 && (
          <EmptyState icon="route" title="Aún no estás en un programa" action={{ href: "/catalogo", label: "Ver los programas" }}>
            Elige el programa que quieres cursar. Después podrás escoger tu grupo, el horario y si prefieres presencial u online.
          </EmptyState>
        )
      )}
    </div>
  );
}
