import Link from "next/link";
import { getSession } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { inscribirmeAlPrograma } from "@/app/actions/programa";
import {
  CATEGORY_LABEL,
  KIND_LABEL,
  audienceLabel,
  eligibilityError,
  groupOfferings,
  type CatalogProgram,
  type Category,
} from "@/lib/programs";

export const dynamic = "force-dynamic";

type OpenGroup = { curriculum_id: string; modality: "presencial" | "virtual" };

export default async function CatalogoPage(props: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const searchParams = await props.searchParams;
  const { supabase, user } = await getSession();

  const [{ data: prof }, { data: progs }, { data: mine }, { data: open }] = await Promise.all([
    supabase.from("profiles").select("terms_accepted_at, gender, birth_date").eq("id", user.id).maybeSingle(),
    supabase
      .from("curriculums")
      .select("id, name, description, audience, age_min, age_max, active, category, kind, life_stage, duration_years, certifiable, visibility, offering")
      .eq("active", true),
    supabase.from("curriculum_enrollments").select("id, curriculum_id, status").eq("person_id", user.id).in("status", ["activo", "pausado"]),
    supabase
      .from("group_overview")
      .select("curriculum_id, modality")
      .eq("status", "abierto")
      .in("season_status", ["inscripciones", "en_curso"]),
  ]);

  const profile = prof as { terms_accepted_at: string | null; gender: string | null; birth_date: string | null } | null;
  const incomplete = !profile?.terms_accepted_at || !profile?.gender || !profile?.birth_date;
  const enrolled = new Map(((mine ?? []) as { id: string; curriculum_id: string; status: string }[]).map((m) => [m.curriculum_id, m]));

  const openBy = new Map<string, { presencial: number; virtual: number }>();
  for (const g of (open ?? []) as OpenGroup[]) {
    const c = openBy.get(g.curriculum_id) ?? { presencial: 0, virtual: 0 };
    c[g.modality] += 1;
    openBy.set(g.curriculum_id, c);
  }

  const offerings = groupOfferings((progs ?? []) as CatalogProgram[]);
  const categories = Array.from(new Set(offerings.map((o) => o.category))) as Category[];

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <h1 className="text-2xl font-medium">Catálogo</h1>
      <p className="mb-5 mt-1 text-sm text-stone-500">
        Elige tu programa una sola vez. Después puedes cambiar de grupo, horario o modalidad sin perder tu avance.
      </p>
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

      {enrolled.size > 0 && (
        <Link href="/mi-progreso" className="mb-5 flex items-center justify-between rounded-xl bg-brand-teal/10 px-4 py-3 text-sm text-brand-teal hover:brightness-95">
          <span>Tienes {enrolled.size === 1 ? "un programa" : `${enrolled.size} programas`} en curso.</span>
          <span className="font-medium">Ver mi progreso →</span>
        </Link>
      )}

      {offerings.length === 0 && (
        <p className="rounded-xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
          Todavía no hay programas publicados.
        </p>
      )}

      {categories.map((cat) => (
        <section key={cat} className="mb-8">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-400">{CATEGORY_LABEL[cat]}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {offerings
              .filter((o) => o.category === cat)
              .map((o) => {
                const single = o.programs.length === 1;
                return (
                  <article key={o.name} className="flex flex-col rounded-xl border border-stone-200 bg-white p-4">
                    <h3 className="font-medium">{o.name}</h3>
                    <p className="mt-0.5 text-xs text-stone-400">
                      {KIND_LABEL[o.programs[0].kind]}
                      {o.programs[0].duration_years > 1 ? ` · ${o.programs[0].duration_years} años` : ""}
                    </p>
                    {single && o.programs[0].description && (
                      <p className="mt-2 line-clamp-4 text-sm text-stone-500">{o.programs[0].description}</p>
                    )}

                    <ul className="mt-3 space-y-2">
                      {o.programs.map((p) => {
                        const mineHere = enrolled.get(p.id);
                        const why = eligibilityError(profile, p);
                        const groups = openBy.get(p.id);
                        return (
                          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2">
                            <div className="min-w-0 text-sm">
                              {!single && <div className="font-medium">{p.name}</div>}
                              <div className="text-xs text-stone-500">{audienceLabel(p)}</div>
                              <div className="text-xs text-stone-400">
                                {groups
                                  ? [groups.presencial ? `${groups.presencial} presencial${groups.presencial === 1 ? "" : "es"}` : "", groups.virtual ? `${groups.virtual} virtual${groups.virtual === 1 ? "" : "es"}` : ""]
                                      .filter(Boolean)
                                      .join(" · ")
                                  : "Sin grupos abiertos por ahora"}
                              </div>
                            </div>
                            {mineHere ? (
                              <Link href={`/mi-progreso/${mineHere.id}`} className="rounded bg-green-50 px-2 py-1 text-xs text-green-800 hover:brightness-95">
                                {mineHere.status === "pausado" ? "Pausado · retomar" : "Inscrito · ver avance"}
                              </Link>
                            ) : incomplete ? (
                              <span className="text-xs text-stone-400">Completa tu perfil</span>
                            ) : why ? (
                              <span className="max-w-[10rem] text-right text-xs text-stone-400">{why}</span>
                            ) : (
                              <form action={inscribirmeAlPrograma}>
                                <input type="hidden" name="curriculum_id" value={p.id} />
                                <button className="h-9 rounded-lg bg-brand-orange px-3 text-sm font-medium text-white hover:brightness-95">Inscribirme</button>
                              </form>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </article>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
