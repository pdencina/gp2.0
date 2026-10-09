import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { todayInChile } from "@/lib/format";
import { AttendanceList } from "@/components/AttendanceList";
import { Flash, fieldClass } from "@/components/Flash";
import { guardarAsistencia } from "@/app/actions/gestion";

export const dynamic = "force-dynamic";

type Mark = "presente" | "ausente" | "recuperado";

export default async function ListaPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fecha?: string; error?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { supabase, role } = await getSession();

  const { data: group } = await supabase
    .from("group_overview")
    .select("id, name, status, cycle_id, curriculum_name, cycle_number")
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
    .select("id, lesson_number")
    .eq("group_id", group.id)
    .eq("held_on", fecha)
    .maybeSingle();

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
    lesson = last?.lesson_number ? last.lesson_number + 1 : 1;
  }

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <Link href={`/grupos/${group.id}`} className="text-sm text-brand-teal hover:underline">
        ← {group.name}
      </Link>
      <h1 className="mt-2 text-2xl font-medium">Pasar lista</h1>
      <p className="mb-4 mt-1 text-sm text-stone-500">
        {group.name} · {group.curriculum_name} · Ciclo {group.cycle_number}
      </p>
      <Flash error={searchParams.error} />

      <form method="get" className="mb-4 flex items-end gap-2">
        <label className="text-xs text-stone-500">
          Fecha
          <input type="date" name="fecha" defaultValue={fecha} max={todayInChile()} className={`${fieldClass} mt-1`} />
        </label>
        <button className="h-10 rounded-lg border border-stone-300 px-3 text-sm hover:bg-stone-50">Cambiar</button>
      </form>

      {meeting && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Ya pasaste lista este día. Si guardas, se corrige la asistencia.
        </p>
      )}

      {members.length === 0 ? (
        <p className="rounded-xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
          Este grupo todavía no tiene inscritos en curso. Inscríbelos desde el detalle del grupo.
        </p>
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

          <AttendanceList members={members} initial={initial} />

          <div className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white/95 p-3 backdrop-blur md:left-64">
            <div className="mx-auto max-w-2xl">
              <button className="h-12 w-full rounded-xl bg-brand-orange text-base font-medium text-white hover:brightness-95">
                Guardar lista
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
