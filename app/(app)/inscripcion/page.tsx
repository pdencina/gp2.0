import { getSession } from "@/lib/session";
import { scheduleLabel, type GroupOverview } from "@/lib/format";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { Callout, EmptyState, PageHeader, ProgressBar } from "@/components/ui";
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
      <PageHeader title="Inscripción" subtitle="Elige un grupo con cupo, el día y la modalidad que mejor te acomoden." />
      <Flash error={searchParams.error} ok={searchParams.ok} />

      {incomplete && (
        <Callout tone="warn" href="/perfil" action="Completar" className="mb-5">
          Para inscribirte, completa tu perfil: género, fecha de nacimiento y aceptar los términos.
        </Callout>
      )}

      {groups.length === 0 ? (
        <EmptyState icon="users" title="Por ahora no hay grupos abiertos a inscripción">
          Vuelve pronto: cuando se abran, los verás aquí.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {Array.from(byCurriculum.entries()).map(([name, list]) => (
            <section key={name}>
              <h2 className="mb-2 section-title text-stone-600">{name}</h2>
              <ul className="stagger space-y-2.5">
                {list.map((g) => {
                  const free = g.capacity - g.enrolled;
                  const joined = mineIds.has(g.id);
                  return (
                    <li key={g.id} className="card card-hover flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="flex items-start gap-3 text-sm">
                        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-teal-50 text-brand-teal">
                          <Icon name={g.modality === "virtual" ? "video" : "pin"} className="h-5 w-5" />
                        </span>
                        <div>
                          <div className="font-semibold">
                            {g.name} {g.cycle_number != null && <span className="font-normal text-stone-400">· Ciclo {g.cycle_number}</span>}
                          </div>
                          <div className="text-stone-500">{scheduleLabel(g)}</div>
                          {g.address && <div className="text-stone-500">{g.address}</div>}
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className="w-20"><ProgressBar value={g.capacity ? (g.enrolled / g.capacity) * 100 : 0} label={`Cupos ocupados: ${g.enrolled} de ${g.capacity}`} /></span>
                            <span className={`text-xs ${free <= 3 && free > 0 ? "font-semibold text-amber-700" : "text-stone-500"}`}>
                              {free > 0 ? `${free} ${free === 1 ? "cupo" : "cupos"}` : "Completo"}
                            </span>
                          </div>
                        </div>
                      </div>
                      {joined ? (
                        <span className="chip bg-brand-green-50 text-brand-green-800"><Icon name="check-circle" className="h-3.5 w-3.5" />Ya estás inscrito</span>
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
