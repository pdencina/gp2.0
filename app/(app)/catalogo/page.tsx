import Link from "next/link";
import { getSession } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { Icon, type IconName } from "@/components/Icon";
import { Callout, EmptyState } from "@/components/ui";
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

  const VISUAL: Record<Category, { icon: IconName; box: string; bar: string }> = {
    formacion: { icon: "book", box: "bg-brand-teal-50 text-brand-teal", bar: "from-brand-teal-400 to-brand-teal" },
    comunidad: { icon: "users", box: "bg-brand-green-50 text-brand-green", bar: "from-brand-green-400 to-brand-green" },
    experiencia: { icon: "sparkle", box: "bg-brand-orange-50 text-brand-orange", bar: "from-brand-orange-400 to-brand-orange" },
    recreacion: { icon: "heart", box: "bg-rose-50 text-rose-600", bar: "from-rose-300 to-rose-500" },
  };

  return (
    <div className="mx-auto max-w-5xl p-4 pb-16 md:p-8 md:pb-16">
      <header className="enter mb-6">
        <h1 className="page-title">Catálogo</h1>
        <p className="page-sub max-w-2xl">
          Elige tu programa una sola vez. Después puedes cambiar de grupo, horario o modalidad sin perder tu avance.
        </p>
      </header>
      <Flash error={searchParams.error} ok={searchParams.ok} />

      <div className="mb-6 space-y-3 empty:hidden">
        {incomplete && (
          <Callout tone="warn" href="/perfil" action="Completar">
            Para inscribirte, completa tu perfil: género, fecha de nacimiento y aceptar los términos.
          </Callout>
        )}
        {enrolled.size > 0 && (
          <Callout tone="info" href="/mi-progreso" action="Ver mi progreso">
            Tienes {enrolled.size === 1 ? "un programa" : `${enrolled.size} programas`} en curso.
          </Callout>
        )}
      </div>

      {offerings.length === 0 && <EmptyState icon="book" title="Todavía no hay programas publicados">Vuelve pronto: estamos preparando la oferta.</EmptyState>}

      {categories.map((cat) => (
        <section key={cat} className="mb-9">
          <div className="mb-3 flex items-center gap-2.5">
            <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${VISUAL[cat].box}`}>
              <Icon name={VISUAL[cat].icon} className="h-[18px] w-[18px]" />
            </span>
            <h2 className="text-base font-semibold">{CATEGORY_LABEL[cat]}</h2>
          </div>
          <div className="stagger grid gap-4 md:grid-cols-2">
            {offerings
              .filter((o) => o.category === cat)
              .map((o) => {
                const single = o.programs.length === 1;
                return (
                  <article key={o.name} className="card card-hover relative flex flex-col overflow-hidden p-5">
                    <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${VISUAL[cat].bar}`} />
                    <h3 className="text-lg font-semibold tracking-tight">{o.name}</h3>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="chip bg-stone-100 text-stone-600">{KIND_LABEL[o.programs[0].kind]}</span>
                      {o.programs[0].duration_years > 1 && (
                        <span className="chip bg-brand-teal-50 text-brand-teal-800">
                          <Icon name="route" className="h-3 w-3" />
                          {o.programs[0].duration_years} años
                        </span>
                      )}
                      {o.programs[0].certifiable && (
                        <span className="chip bg-brand-orange-50 text-brand-orange-800">
                          <Icon name="award" className="h-3 w-3" />
                          Certificado
                        </span>
                      )}
                    </p>
                    {single && o.programs[0].description && (
                      <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-stone-600">{o.programs[0].description}</p>
                    )}

                    <ul className="mt-4 space-y-2">
                      {o.programs.map((p) => {
                        const mineHere = enrolled.get(p.id);
                        const why = eligibilityError(profile, p);
                        const groups = openBy.get(p.id);
                        return (
                          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-stone-50 px-3.5 py-3">
                            <div className="min-w-0 text-sm">
                              {!single && <div className="font-semibold">{p.name}</div>}
                              <div className="text-xs text-stone-500">{audienceLabel(p)}</div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                                {groups ? (
                                  <>
                                    {groups.presencial > 0 && (
                                      <span className="inline-flex items-center gap-1"><Icon name="pin" className="h-3.5 w-3.5 text-brand-teal" />{groups.presencial} presencial{groups.presencial === 1 ? "" : "es"}</span>
                                    )}
                                    {groups.virtual > 0 && (
                                      <span className="inline-flex items-center gap-1"><Icon name="video" className="h-3.5 w-3.5 text-brand-teal" />{groups.virtual} online</span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-stone-400">Sin grupos abiertos por ahora</span>
                                )}
                              </div>
                            </div>
                            {mineHere ? (
                              <Link href={`/mi-progreso/${mineHere.id}`} className="chip bg-brand-green-50 px-3 py-1.5 text-brand-green-800 hover:brightness-95">
                                <Icon name="check-circle" className="h-3.5 w-3.5" />
                                {mineHere.status === "pausado" ? "Pausado · retomar" : "Inscrito · ver avance"}
                              </Link>
                            ) : incomplete ? (
                              <span className="text-xs text-stone-400">Completa tu perfil</span>
                            ) : why ? (
                              <span className="max-w-[11rem] text-right text-xs text-stone-400">{why}</span>
                            ) : (
                              <form action={inscribirmeAlPrograma}>
                                <input type="hidden" name="curriculum_id" value={p.id} />
                                <button className="btn btn-primary btn-sm">Inscribirme</button>
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
