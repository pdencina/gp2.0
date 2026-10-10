import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { todayInChile } from "@/lib/format";
import { AttendanceList } from "@/components/AttendanceList";
import { Flash, fieldClass } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { Callout, EmptyState, PageHeader } from "@/components/ui";
import { guardarAsistencia } from "@/app/actions/gestion";

export const dynamic = "force-dynamic";

type Mark = "presente" | "ausente" | "recuperado" | "justificado";
type Planned = { id: string; held_on: string; season_week: number | null };

export default async function ListaPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fecha?: string; error?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { supabase, role } = await getSession();

  const { data: group } = await supabase
    .from("group_overview")
    .select("id, name, status, cycle_id, curriculum_name, cycle_number, modality")
    .eq("id", params.id)
    .maybeSingle();
  if (!group) notFound();
  if (group.status === "finalizado") redirect(`/grupos/${group.id}`);

  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.fecha ?? "") ? searchParams.fecha! : todayInChile();

  // Quienes participan hoy (en curso). Si no puedes administrar el grupo, la lista llega vacía.
  const { data: rosterRows } = await supabase
    .from("roster")
    .select("enrollment_id, person_name")
    .eq("group_id", group.id)
    .eq("status", "en_curso")
    .order("person_name");
  const members = ((rosterRows ?? []) as { enrollment_id: string; person_name: string }[]).map((r) => ({
    id: r.enrollment_id,
    name: r.person_name || "Sin nombre",
  }));
  if (!["admin", "coordinador", "monitor", "lider"].includes(role)) redirect(`/grupos/${group.id}`);

  // ¿Ya se pasó lista ese día? Se muestra para poder corregirla.
  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, lesson_number, status, season_week, modality")
    .eq("group_id", group.id)
    .eq("held_on", fecha)
    .maybeSingle();

  // Si no hay reunión ese día, la lista ocupa la sesión planificada más cercana (hasta 3 días de diferencia)
  let claimed: Planned | null = null;
  if (!meeting) {
    const shift = (days: number) => new Date(Date.parse(`${fecha}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
    const { data: near } = await supabase
      .from("meetings")
      .select("id, held_on, season_week")
      .eq("group_id", group.id)
      .in("status", ["planificada", "reprogramada"])
      .gte("held_on", shift(-3))
      .lte("held_on", shift(3));
    const list = (near ?? []) as Planned[];
    const gap = (p: Planned) => Math.abs(Date.parse(p.held_on) - Date.parse(fecha));
    claimed = list.sort((a, b) => gap(a) - gap(b) || (a.season_week ?? 99) - (b.season_week ?? 99))[0] ?? null;
  }

  const initial: Record<string, Mark> = {};
  let lesson = meeting?.lesson_number ?? null;
  if (meeting) {
    const { data: att } = await supabase.from("attendance").select("enrollment_id, status").eq("meeting_id", meeting.id);
    for (const a of (att ?? []) as { enrollment_id: string; status: Mark }[]) initial[a.enrollment_id] = a.status;
  } else {
    const { data: last } = await supabase
      .from("meetings")
      .select("lesson_number")
      .eq("group_id", group.id)
      .not("lesson_number", "is", null)
      .order("held_on", { ascending: false })
      .limit(1)
      .maybeSingle();
    lesson = claimed?.season_week ?? (last?.lesson_number ? last.lesson_number + 1 : 1);
  }

  return (
    <div className="enter mx-auto max-w-2xl p-4 pb-16 md:p-8 md:pb-16">
      <PageHeader
        title="Pasar lista"
        back={{ href: `/grupos/${group.id}`, label: group.name }}
        subtitle={`${group.name} · ${group.curriculum_name}${group.cycle_number != null ? ` · Ciclo ${group.cycle_number}` : ""}`}
      />
      <Flash error={searchParams.error} />

      <form method="get" className="mb-4 flex items-end gap-2">
        <label className="text-xs text-stone-500">
          Fecha
          <input type="date" name="fecha" defaultValue={fecha} max={todayInChile()} className={`${fieldClass} mt-1`} />
        </label>
        <button className="btn btn-secondary">
          <Icon name="calendar" className="h-4 w-4" />
          Cambiar
        </button>
      </form>

      {meeting && (
        <Callout tone="warn" className="mb-4">
          {meeting.status === "realizada" ? "Ya pasaste lista este día. Si guardas, se corrige la asistencia." : "Esta sesión estaba sin registrar. Al guardar queda como realizada."}
          {meeting.season_week ? ` Es la semana ${meeting.season_week} del calendario.` : ""}
        </Callout>
      )}
      {claimed && (
        <Callout tone="info" className="mb-4">
          Esta lista ocupará la sesión de la semana {claimed.season_week} del calendario (planificada para el {claimed.held_on.split("-").reverse().join("/")}).
        </Callout>
      )}

      {members.length === 0 ? (
        <EmptyState icon="users" title="Este grupo todavía no tiene inscritos en curso" action={{ href: `/grupos/${group.id}`, label: "Ir al detalle del grupo" }}>
          Inscríbelos desde el detalle del grupo para poder pasar lista.
        </EmptyState>
      ) : (
        <form action={guardarAsistencia}>
          <input type="hidden" name="group_id" value={group.id} />
          <input type="hidden" name="held_on" value={fecha} />

          <label className="mb-4 flex items-center gap-3 text-sm">
            <span className="text-stone-600">Lección</span>
            <input
              type="number"
              name="lesson_number"
              min={1}
              defaultValue={lesson ?? 1}
              inputMode="numeric"
              className={`${fieldClass} w-24`}
            />
          </label>

          <label className="mb-4 flex items-center gap-3 text-sm">
            <span className="text-stone-600">Modalidad de hoy</span>
            <select name="mode" defaultValue={meeting?.modality ?? ""} className={`${fieldClass} w-auto`}>
              <option value="">Igual que el grupo ({group.modality === "virtual" ? "virtual" : "presencial"})</option>
              <option value="presencial">Presencial</option>
              <option value="virtual">Virtual</option>
            </select>
          </label>

          <AttendanceList members={members} initial={initial} />

          <div className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white/95 p-3 backdrop-blur md:left-64">
            <div className="mx-auto max-w-2xl">
              <button className="h-12 w-full gap-2 btn btn-primary">
                <Icon name="check" className="h-5 w-5" strokeWidth={3} />
                Guardar lista
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
