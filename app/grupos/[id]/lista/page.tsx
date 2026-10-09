import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppHeader } from "@/components/AppHeader";
import { AttendanceList } from "@/components/AttendanceList";
import { Flash, fieldClass } from "@/components/Flash";
import { guardarAsistencia } from "@/app/actions/gestion";

export const dynamic = "force-dynamic";

const todayInChile = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });

export default async function ListaPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { fecha?: string; error?: string };
}) {
  const { supabase, role } = await getSession();
  if (!["admin", "coordinador", "monitor", "lider"].includes(role)) redirect(`/grupos/${params.id}`);

  const { data: group } = await supabase
    .from("groups")
    .select("id, name, curriculums(name)")
    .eq("id", params.id)
    .maybeSingle();
  if (!group) notFound();

  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.fecha ?? "") ? searchParams.fecha! : todayInChile();

  const { data: memberRows } = await supabase
    .from("group_members")
    .select("student_id, profiles(full_name)")
    .eq("group_id", group.id);
  const members = ((memberRows ?? []) as unknown as { student_id: string; profiles: { full_name: string } | null }[])
    .map((m) => ({ id: m.student_id, name: m.profiles?.full_name || "Sin nombre" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // ¿Ya se pasó lista ese día? Se muestra para poder corregirla.
  const { data: session } = await supabase
    .from("sessions")
    .select("id, lesson_number")
    .eq("group_id", group.id)
    .eq("held_on", fecha)
    .maybeSingle();

  let initial: string[] = [];
  let lesson = session?.lesson_number ?? null;
  if (session) {
    const { data: att } = await supabase
      .from("attendance")
      .select("student_id")
      .eq("session_id", session.id)
      .eq("present", true);
    initial = (att ?? []).map((a) => a.student_id as string);
  } else {
    const { data: last } = await supabase
      .from("sessions")
      .select("lesson_number")
      .eq("group_id", group.id)
      .not("lesson_number", "is", null)
      .order("held_on", { ascending: false })
      .limit(1)
      .maybeSingle();
    lesson = last?.lesson_number ? last.lesson_number + 1 : 1;
  }

  const curriculum = (group as unknown as { curriculums: { name: string } | null }).curriculums?.name;

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <AppHeader role={role} />
      <Link href={`/grupos/${group.id}`} className="text-sm text-brand-teal hover:underline">
        ← {group.name}
      </Link>
      <h1 className="mt-2 text-2xl font-medium">Pasar lista</h1>
      <p className="mb-4 mt-1 text-sm text-stone-500">
        {group.name}
        {curriculum ? ` · ${curriculum}` : ""}
      </p>
      <Flash error={searchParams.error} />

      <form method="get" className="mb-4 flex items-end gap-2">
        <label className="text-xs text-stone-500">
          Fecha
          <input type="date" name="fecha" defaultValue={fecha} max={todayInChile()} className={`${fieldClass} mt-1`} />
        </label>
        <button className="h-10 rounded-lg border border-stone-300 px-3 text-sm hover:bg-stone-50">Cambiar</button>
      </form>

      {session && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Ya pasaste lista este día. Si guardas, se corrige la asistencia.
        </p>
      )}

      {members.length === 0 ? (
        <p className="rounded-xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
          Este grupo todavía no tiene alumnos. Agrégalos desde el detalle del grupo.
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

          <div className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white/95 p-3 backdrop-blur">
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
