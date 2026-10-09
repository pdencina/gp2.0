import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppHeader } from "@/components/AppHeader";
import { Flash, fieldClass, primaryBtn } from "@/components/Flash";
import { crearGrupo } from "@/app/actions/gestion";

export const dynamic = "force-dynamic";

type GroupRow = {
  id: string;
  name: string;
  meeting_day: string | null;
  meeting_time: string | null;
  max_members: number;
  monitor_id: string | null;
  leader_id: string | null;
  curriculums: { name: string } | null;
  group_members: { count: number }[];
};

export default async function GruposPage({
  searchParams,
}: {
  searchParams: { error?: string; ok?: string };
}) {
  const { supabase, role } = await getSession();
  if (role === "alumno") redirect("/inicio");
  const canCreate = role === "admin" || role === "coordinador";

  const { data } = await supabase
    .from("groups")
    .select("id, name, meeting_day, meeting_time, max_members, monitor_id, leader_id, curriculums(name), group_members(count)")
    .order("name");
  const groups = (data ?? []) as unknown as GroupRow[];

  const { data: curr } = canCreate
    ? await supabase.from("curriculums").select("id, name").order("name")
    : { data: [] as { id: string; name: string }[] };

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <AppHeader role={role} />
      <h1 className="text-2xl font-medium">Grupos pequeños</h1>
      <p className="mb-5 mt-1 text-sm text-stone-500">
        {groups.length} {groups.length === 1 ? "grupo" : "grupos"} en tu alcance.
      </p>
      <Flash error={searchParams.error} ok={searchParams.ok} />

      {canCreate && (
        <form action={crearGrupo} className="mb-5 rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-medium">Nuevo grupo</h2>
          <div className="grid gap-2 md:grid-cols-2">
            <select name="curriculum_id" aria-label="Currículum" defaultValue="" className={fieldClass}>
              <option value="" disabled>
                Elige un currículum
              </option>
              {(curr ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input name="name" placeholder="Nombre del grupo (ej. Esperanza)" aria-label="Nombre" className={fieldClass} />
            <input name="meeting_day" placeholder="Día (ej. Jueves)" aria-label="Día" className={fieldClass} />
            <input name="meeting_time" placeholder="Hora (ej. 19:30)" aria-label="Hora" className={fieldClass} />
            <input name="location" placeholder="Lugar (ej. Casa de Marta)" aria-label="Lugar" className={`${fieldClass} md:col-span-2`} />
          </div>
          <button className={`${primaryBtn} mt-3`}>Crear grupo</button>
        </form>
      )}

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        {groups.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-500">Todavía no hay grupos para mostrar.</p>
        ) : (
          <ul>
            {groups.map((g) => {
              const n = g.group_members[0]?.count ?? 0;
              return (
                <li key={g.id} className="border-b border-stone-100 last:border-0">
                  <Link href={`/grupos/${g.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm hover:bg-stone-50">
                    <span>
                      <span className="font-medium">{g.name}</span>
                      <span className="ml-2 text-stone-400">{g.curriculums?.name}</span>
                    </span>
                    <span className="flex items-center gap-3 text-stone-500">
                      {(!g.monitor_id || !g.leader_id) && (
                        <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                          {!g.leader_id ? "Sin líder" : "Sin monitor"}
                        </span>
                      )}
                      {n}/{g.max_members} alumnos
                      {g.meeting_day ? ` · ${g.meeting_day} ${g.meeting_time ?? ""}` : ""}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
