import Link from "next/link";
import { getSession } from "@/lib/session";
import { scheduleLabel, type GroupOverview } from "@/lib/format";
import { Flash } from "@/components/Flash";
import { inscribirme } from "@/app/actions/gestion";

export const dynamic = "force-dynamic";

export default async function InscripcionPage(props: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const searchParams = await props.searchParams;
  const { supabase, user, role } = await getSession();

  const { data: prof } = await supabase
    .from("profiles")
    .select("terms_accepted_at, gender, birth_date")
    .eq("id", user.id)
    .maybeSingle();
  const profile = prof as { terms_accepted_at: string | null; gender: string | null; birth_date: string | null } | null;
  const incomplete = !profile?.terms_accepted_at || !profile?.gender || !profile?.birth_date;

  const { data } = await supabase
    .from("group_overview")
    .select("*")
    .eq("status", "abierto")
    .in("season_status", ["inscripciones", "en_curso"])
    .order("curriculum_name")
    .order("cycle_number");
  const groups = (data ?? []) as GroupOverview[];

  // Grupos en los que ya estoy inscrito o preinscrito
  const { data: mine } = await supabase
    .from("roster")
    .select("group_id, status")
    .eq("person_id", user.id)
    .in("status", ["preinscrito", "en_curso", "aprobado"]);
  const mineIds = new Set(((mine ?? []) as { group_id: string }[]).map((m) => m.group_id));

  const byCurriculum = new Map<string, GroupOverview[]>();
  for (const g of groups) {
    byCurriculum.set(g.curriculum_name, [...(byCurriculum.get(g.curriculum_name) ?? []), g]);
  }

  return (
    <div className="enter mx-auto max-w-3xl p-4 pb-16 md:p-8 md:pb-16">
      <h1 className="page-title">Inscripción</h1>
      <p className="mb-5 mt-1 text-sm text-stone-500">Elige un grupo con cupo, el día y la modalidad que mejor te acomoden.</p>
      <Flash error={searchParams.error} ok={searchParams.ok} />

      {incomplete && (
        <Link
          href="/perfil"
          className="mb-5 flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:brightness-95"
        >
          <span>Para inscribirte, completa tu perfil: género, fecha de nacimiento y aceptar los términos.</span>
          <span className="font-medium">Completar →</span>
        </Link>
      )}

      {groups.length === 0 ? (
        <p className="empty">
          Por ahora no hay grupos abiertos a inscripción. Vuelve pronto.
        </p>
      ) : (
        <div className="space-y-6">
          {Array.from(byCurriculum.entries()).map(([name, list]) => (
            <section key={name}>
              <h2 className="mb-2 section-title text-stone-600">{name}</h2>
              <ul className="space-y-2">
                {list.map((g) => {
                  const free = g.capacity - g.enrolled;
                  const joined = mineIds.has(g.id);
                  return (
                    <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 card p-4">
                      <div className="text-sm">
                        <div className="font-medium">
                          {g.name} {g.cycle_number != null && <span className="font-normal text-stone-400">· Ciclo {g.cycle_number}</span>}
                        </div>
                        <div className="text-stone-500">{scheduleLabel(g)}</div>
                        {g.address && <div className="text-stone-500">{g.address}</div>}
                        <div className={free <= 3 && free > 0 ? "text-amber-700" : "text-stone-500"}>
                          {free > 0 ? `${free} ${free === 1 ? "cupo" : "cupos"}` : "Completo"}
                        </div>
                      </div>
                      {joined ? (
                        <span className="rounded bg-green-50 px-2 py-1 text-xs text-green-800">Ya estás inscrito</span>
                      ) : free > 0 ? (
                        <form action={inscribirme}>
                          <input type="hidden" name="group_id" value={g.id} />
                          <button className="btn btn-primary">
                            Inscribirme
                          </button>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
