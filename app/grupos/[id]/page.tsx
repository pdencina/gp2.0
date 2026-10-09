import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession, type Person } from "@/lib/session";
import { AppHeader } from "@/components/AppHeader";
import { whatsappLink } from "@/lib/phone";
import { Flash, fieldClass } from "@/components/Flash";
import { agregarAlumno, asignarResponsables, quitarAlumno } from "@/app/actions/gestion";

export const dynamic = "force-dynamic";

type Group = {
  id: string;
  curriculum_id: string;
  name: string;
  meeting_day: string | null;
  meeting_time: string | null;
  location: string | null;
  max_members: number;
  monitor_id: string | null;
  leader_id: string | null;
  curriculums: { name: string } | null;
};

export default async function GrupoPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; ok?: string; lista?: string };
}) {
  const { supabase, role } = await getSession();

  const { data } = await supabase
    .from("groups")
    .select("id, curriculum_id, name, meeting_day, meeting_time, location, max_members, monitor_id, leader_id, curriculums(name)")
    .eq("id", params.id)
    .maybeSingle();
  if (!data) notFound();
  const group = data as unknown as Group;

  const canAssign = role === "admin" || role === "coordinador";
  const canManage = canAssign || role === "monitor" || role === "lider";

  const { data: memberRows } = await supabase
    .from("group_members")
    .select("student_id, profiles(full_name)")
    .eq("group_id", group.id);
  const members = ((memberRows ?? []) as unknown as { student_id: string; profiles: { full_name: string } | null }[])
    .map((m) => ({ id: m.student_id, name: m.profiles?.full_name || "Sin nombre" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Teléfonos de los alumnos, visibles solo para quien gestiona el grupo.
  const { data: phoneRows } =
    canManage && members.length
      ? await supabase.from("profiles").select("id, phone").in("id", members.map((m) => m.id))
      : { data: [] };
  const phoneOf = new Map(
    ((phoneRows ?? []) as { id: string; phone: string | null }[]).map((p) => [p.id, p.phone])
  );

  const ids = [group.monitor_id, group.leader_id].filter(Boolean) as string[];
  const { data: names } = ids.length
    ? await supabase.from("profiles").select("id, full_name").in("id", ids)
    : { data: [] as Person[] };
  const nameOf = (id: string | null) => (names ?? []).find((p) => p.id === id)?.full_name || "Sin asignar";

  let monitors: Person[] = [];
  let leaders: Person[] = [];
  let students: Person[] = [];
  if (canAssign) {
    monitors = ((await supabase.rpc("assignable_people", { r: "monitor" })).data ?? []) as Person[];
    leaders = ((await supabase.rpc("assignable_people", { r: "lider" })).data ?? []) as Person[];
  }
  if (canManage) {
    students = ((await supabase.rpc("assignable_people", { r: "alumno" })).data ?? []) as Person[];
  }

  const full = members.length >= group.max_members;

  const { data: sessionRows } = await supabase
    .from("sessions")
    .select("held_on, lesson_number, attendance(present)")
    .eq("group_id", group.id)
    .order("held_on", { ascending: false })
    .limit(8);
  const sessions = (sessionRows ?? []) as unknown as {
    held_on: string;
    lesson_number: number | null;
    attendance: { present: boolean }[];
  }[];

  // Próxima lección del grupo: la siguiente a la última que se dio.
  const nextLessonNumber = (sessions.find((s) => s.lesson_number)?.lesson_number ?? 0) + 1;
  const { data: nextLesson } = canManage
    ? await supabase
        .from("lessons")
        .select("id, number, title, summary")
        .eq("curriculum_id", group.curriculum_id)
        .eq("number", nextLessonNumber)
        .maybeSingle()
    : { data: null };

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <AppHeader role={role} />
      <Link href="/grupos" className="text-sm text-brand-teal hover:underline">
        ← Grupos
      </Link>
      <h1 className="mt-2 text-2xl font-medium">{group.name}</h1>
      <p className="mb-5 mt-1 text-sm text-stone-500">
        {group.curriculums?.name}
        {group.meeting_day ? ` · ${group.meeting_day} ${group.meeting_time ?? ""}` : ""}
        {group.location ? ` · ${group.location}` : ""}
      </p>
      <Flash error={searchParams.error} ok={searchParams.ok} />
      {searchParams.lista && (
        <p role="status" className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          Lista guardada: {searchParams.lista} {searchParams.lista === "1" ? "presente" : "presentes"}.
        </p>
      )}

      {canManage && (
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
              <span className="text-stone-400">{nextLesson.number}.</span>{" "}
              <span className="font-medium">{nextLesson.title}</span>
              {nextLesson.summary && <span className="block text-stone-500">{nextLesson.summary}</span>}
            </Link>
          ) : (
            <p className="text-sm text-stone-500">
              Todavía no existe la lección {nextLessonNumber} de este currículum.
            </p>
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
                <option value="">Sin asignar</option>
                {group.monitor_id && !monitors.some((p) => p.id === group.monitor_id) && (
                  <option value={group.monitor_id}>{nameOf(group.monitor_id)}</option>
                )}
                {monitors.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || "Sin nombre"}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-stone-500">
              Líder
              <select name="leader_id" defaultValue={group.leader_id ?? ""} className={`${fieldClass} mt-1`}>
                <option value="">Sin asignar</option>
                {group.leader_id && !leaders.some((p) => p.id === group.leader_id) && (
                  <option value={group.leader_id}>{nameOf(group.leader_id)}</option>
                )}
                {leaders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || "Sin nombre"}
                  </option>
                ))}
              </select>
            </label>
            <button className="h-10 rounded-lg border border-brand-teal px-3 text-sm text-brand-teal hover:bg-brand-teal hover:text-white">
              Guardar
            </button>
          </form>
        ) : (
          <p className="text-sm text-stone-600">
            Monitor: {nameOf(group.monitor_id)} · Líder: {nameOf(group.leader_id)}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">Alumnos</h2>
          <span className="text-xs text-stone-500">
            {members.length}/{group.max_members}
          </span>
        </div>

        {canManage && (
          <form action={agregarAlumno} className="mb-3 flex flex-wrap gap-2">
            <input type="hidden" name="group_id" value={group.id} />
            <select name="student_id" defaultValue="" aria-label="Alumno" disabled={full} className={`${fieldClass} max-w-xs`}>
              <option value="" disabled>
                {full ? "El grupo está completo" : "Elige un alumno sin grupo"}
              </option>
              {students.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || "Sin nombre"}
                </option>
              ))}
            </select>
            <button
              disabled={full}
              className="h-10 rounded-lg bg-brand-orange px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              Agregar
            </button>
          </form>
        )}

        {members.length === 0 ? (
          <p className="py-4 text-center text-sm text-stone-500">Este grupo todavía no tiene alumnos.</p>
        ) : (
          <ul>
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between border-b border-stone-100 py-2 text-sm last:border-0">
                <span>
                  {m.name}
                  {phoneOf.get(m.id) && (
                    <a
                      href={whatsappLink(phoneOf.get(m.id)!)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-3 text-xs text-brand-teal hover:underline"
                    >
                      WhatsApp
                    </a>
                  )}
                </span>
                {canManage && (
                  <form action={quitarAlumno}>
                    <input type="hidden" name="group_id" value={group.id} />
                    <input type="hidden" name="student_id" value={m.id} />
                    <button className="text-xs text-stone-500 hover:text-red-700 hover:underline">Quitar</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canManage && (
        <section className="mt-5 rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-medium">Últimas reuniones</h2>
          {sessions.length === 0 ? (
            <p className="py-4 text-center text-sm text-stone-500">Todavía no se ha pasado lista.</p>
          ) : (
            <ul>
              {sessions.map((s) => {
                const total = s.attendance.length;
                const n = s.attendance.filter((a) => a.present).length;
                const pct = total ? Math.round((n / total) * 100) : 0;
                return (
                  <li key={s.held_on} className="border-b border-stone-100 last:border-0">
                    <Link
                      href={`/grupos/${group.id}/lista?fecha=${s.held_on}`}
                      className="flex items-center justify-between py-2.5 text-sm hover:bg-stone-50"
                    >
                      <span>
                        {s.held_on.split("-").reverse().join("/")}
                        {s.lesson_number ? <span className="ml-2 text-stone-400">Lección {s.lesson_number}</span> : null}
                      </span>
                      <span className={pct < 60 ? "text-amber-700" : "text-stone-600"}>
                        {n}/{total} · {pct}%
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
