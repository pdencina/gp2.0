import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_VIEWS, type Role } from "@/lib/roles";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

type GroupRow = {
  id: string;
  name: string;
  meeting_day: string | null;
  meeting_time: string | null;
  max_members: number;
  curriculums: { name: string } | null;
  group_members: { count: number }[];
};

export default async function InicioPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? "alumno") as Role;
  const view = ROLE_VIEWS[role];
  const firstName = profile?.full_name
    ? profile.full_name.split(" ")[0]
    : (user.email ?? "").split("@")[0];

  // RLS ya limita los grupos a lo que cada rol puede ver.
  const { data } = await supabase
    .from("groups")
    .select("id, name, meeting_day, meeting_time, max_members, curriculums(name), group_members(count)")
    .order("name");
  const groups = (data ?? []) as unknown as GroupRow[];

  const students = groups.reduce((n, g) => n + (g.group_members[0]?.count ?? 0), 0);

  // Asistencia de las últimas 4 semanas (RLS limita a lo que cada rol puede ver).
  const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: recent } = await supabase
    .from("sessions")
    .select("attendance(present)")
    .gte("held_on", since);
  const marks = ((recent ?? []) as unknown as { attendance: { present: boolean }[] }[]).flatMap((s) => s.attendance);
  const attendancePct = marks.length
    ? `${Math.round((marks.filter((a) => a.present).length / marks.length) * 100)}%`
    : "—";

  const metrics: [string, string | number][] =
    role === "alumno"
      ? [["Mi grupo", groups[0]?.name ?? "—"], ["Compañeros", students || "—"], ["Próximo", groups[0]?.meeting_day ?? "—"]]
      : [["Grupos", groups.length], ["Alumnos", students], ["Asistencia (4 sem.)", attendancePct]];

  const actionHref =
    role === "lider" && groups[0]
      ? `/grupos/${groups[0].id}/lista`
      : role === "admin"
        ? "/curriculums"
        : role === "coordinador" || role === "monitor"
          ? "/grupos"
          : null;

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
        {actionHref && (
          <Link href={actionHref} className="rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-medium text-white hover:brightness-95">
            {view.action}
          </Link>
        )}
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="text-xs text-stone-500">{label}</div>
            <div className="text-2xl font-medium">{value}</div>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-medium">{view.listTitle}</h2>
        {groups.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-500">
            Todavía no hay grupos para mostrar.
          </p>
        ) : (
          <ul>
            {groups.map((g) => (
              <li key={g.id} className="flex items-center justify-between border-b border-stone-100 py-2.5 text-sm last:border-0">
                <span>
                  <Link href={`/grupos/${g.id}`} className="hover:underline">
                    {g.name}
                  </Link>
                  <span className="ml-2 text-stone-400">{g.curriculums?.name}</span>
                </span>
                <span className="text-stone-500">
                  {g.group_members[0]?.count ?? 0}/{g.max_members} alumnos
                  {g.meeting_day ? ` · ${g.meeting_day} ${g.meeting_time ?? ""}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
