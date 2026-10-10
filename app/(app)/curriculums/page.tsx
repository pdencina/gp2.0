import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, type Person } from "@/lib/session";
import { AUDIENCE_LABEL } from "@/lib/format";
import { Flash, fieldClass, primaryBtn } from "@/components/Flash";
import { agregarCoordinador, crearCurriculum, quitarCoordinador } from "@/app/actions/gestion";

export const dynamic = "force-dynamic";

type Curriculum = {
  id: string;
  name: string;
  description: string | null;
  audience: string;
  age_min: number | null;
  age_max: number | null;
  default_capacity: number;
  max_absences: number;
  active: boolean;
};

export default async function CurriculumsPage(props: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const searchParams = await props.searchParams;
  const { supabase, role } = await getSession();
  if (role !== "admin" && role !== "coordinador") redirect("/inicio");
  const isAdmin = role === "admin";

  const { data } = await supabase
    .from("curriculums")
    .select("id, name, description, audience, age_min, age_max, default_capacity, max_absences, active")
    .order("name");
  const curriculums = (data ?? []) as Curriculum[];

  const { data: links } = await supabase.from("curriculum_coordinators").select("curriculum_id, coordinator_id");
  const pairs = (links ?? []) as { curriculum_id: string; coordinator_id: string }[];
  const ids = Array.from(new Set(pairs.map((p) => p.coordinator_id)));
  const { data: names } = ids.length
    ? await supabase.from("profiles").select("id, full_name").in("id", ids)
    : { data: [] as Person[] };
  const nameOf = (id: string) => (names ?? []).find((p) => p.id === id)?.full_name || "Sin nombre";

  const candidates: Person[] = isAdmin
    ? (((await supabase.rpc("assignable_people", { r: "coordinador" })).data ?? []) as Person[])
    : [];

  return (
    <div className="enter mx-auto max-w-4xl p-4 pb-16 md:p-8 md:pb-16">
      <h1 className="page-title">Currículums</h1>
      <p className="mb-5 mt-1 text-sm text-stone-500">
        Cada currículum tiene uno o más coordinadores, ciclos con sus lecciones y grupos.
      </p>
      <Flash error={searchParams.error} ok={searchParams.ok} />

      {isAdmin && (
        <Link href="/curriculums/clasificar" className="mb-4 flex items-center justify-between rounded-xl bg-brand-teal/10 px-4 py-3 text-sm text-brand-teal hover:brightness-95">
          <span>Clasifica el catálogo: ofertas, categorías, años de ruta y visibilidad.</span>
          <span className="font-medium">Clasificar →</span>
        </Link>
      )}

      {isAdmin && (
        <form action={crearCurriculum} className="mb-5 card p-4">
          <h2 className="mb-3 section-title">Nuevo currículum</h2>
          <div className="grid gap-2 md:grid-cols-2">
            <input name="name" placeholder="Nombre (ej. Hombres)" aria-label="Nombre" className={fieldClass} />
            <select name="audience" aria-label="Audiencia" defaultValue="todos" className={fieldClass}>
              <option value="todos">Para todos</option>
              <option value="hombres">Solo hombres</option>
              <option value="mujeres">Solo mujeres</option>
              <option value="parejas">Parejas</option>
            </select>
            <input name="description" placeholder="Descripción (opcional)" aria-label="Descripción" className={`${fieldClass} md:col-span-2`} />
            <input name="age_min" type="number" min={0} placeholder="Edad mínima (opcional)" aria-label="Edad mínima" className={fieldClass} />
            <input name="age_max" type="number" min={0} placeholder="Edad máxima (opcional)" aria-label="Edad máxima" className={fieldClass} />
            <input name="default_capacity" type="number" min={1} placeholder="Cupo por grupo (15)" aria-label="Cupo por grupo" className={fieldClass} />
            <input name="max_absences" type="number" min={0} placeholder="Ausencias permitidas (3)" aria-label="Ausencias permitidas" className={fieldClass} />
          </div>
          <button className={`${primaryBtn} mt-3`}>Crear currículum</button>
        </form>
      )}

      <section className="space-y-3">
        {curriculums.length === 0 && (
          <p className="empty">
            Todavía no hay currículums.
          </p>
        )}
        {curriculums.map((c) => {
          const coords = pairs.filter((p) => p.curriculum_id === c.id);
          return (
            <article key={c.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-medium">{c.name}</h2>
                  <p className="text-sm text-stone-500">
                    {AUDIENCE_LABEL[c.audience]}
                    {c.age_min != null || c.age_max != null ? ` · ${c.age_min ?? 0} a ${c.age_max ?? "…"} años` : ""} · Cupo{" "}
                    {c.default_capacity} · {c.max_absences} ausencias permitidas
                  </p>
                  {c.description && <p className="text-sm text-stone-500">{c.description}</p>}
                </div>
                <Link href={`/curriculums/${c.id}`} className="text-sm link">
                  Ciclos y lecciones →
                </Link>
              </div>

              <div className="mt-3 border-t border-stone-100 pt-3 text-sm">
                <span className="text-stone-500">Coordinadores: </span>
                {coords.length === 0 && <span className="text-stone-400">Sin asignar</span>}
                {coords.map((p) => (
                  <span key={p.coordinator_id} className="mr-2 inline-flex items-center gap-1 chip bg-stone-100">
                    {nameOf(p.coordinator_id)}
                    {isAdmin && (
                      <form action={quitarCoordinador} className="inline">
                        <input type="hidden" name="curriculum_id" value={c.id} />
                        <input type="hidden" name="coordinator_id" value={p.coordinator_id} />
                        <button className="text-xs text-stone-500 hover:text-red-700" aria-label={`Quitar a ${nameOf(p.coordinator_id)}`}>
                          ×
                        </button>
                      </form>
                    )}
                  </span>
                ))}

                {isAdmin && (
                  <form action={agregarCoordinador} className="mt-2 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="curriculum_id" value={c.id} />
                    <select name="coordinator_id" defaultValue="" aria-label="Agregar coordinador" className={`${fieldClass} max-w-xs`}>
                      <option value="" disabled>
                        Agregar coordinador…
                      </option>
                      {candidates
                        .filter((p) => !coords.some((x) => x.coordinator_id === p.id))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.full_name || "Sin nombre"}
                          </option>
                        ))}
                    </select>
                    <button className="btn btn-outline">
                      Agregar
                    </button>
                  </form>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
