import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, type Person } from "@/lib/session";
import { AppHeader } from "@/components/AppHeader";
import { Flash, fieldClass, primaryBtn } from "@/components/Flash";
import { asignarCoordinador, crearCurriculum } from "@/app/actions/gestion";

export const dynamic = "force-dynamic";

type Curriculum = {
  id: string;
  name: string;
  description: string | null;
  coordinator_id: string | null;
  groups: { count: number }[];
};

export default async function CurriculumsPage({
  searchParams,
}: {
  searchParams: { error?: string; ok?: string };
}) {
  const { supabase, role } = await getSession();
  if (role !== "admin" && role !== "coordinador") redirect("/inicio");
  const isAdmin = role === "admin";

  const { data } = await supabase
    .from("curriculums")
    .select("id, name, description, coordinator_id, groups(count)")
    .order("name");
  const curriculums = (data ?? []) as unknown as Curriculum[];

  let coordinators: Person[] = [];
  if (isAdmin) {
    const res = await supabase.rpc("assignable_people", { r: "coordinador" });
    coordinators = (res.data ?? []) as Person[];
  }
  const ids = curriculums.map((c) => c.coordinator_id).filter(Boolean) as string[];
  const { data: names } = ids.length
    ? await supabase.from("profiles").select("id, full_name").in("id", ids)
    : { data: [] as Person[] };
  const nameOf = (id: string | null) => (names ?? []).find((p) => p.id === id)?.full_name || "Sin asignar";

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <AppHeader role={role} />
      <h1 className="text-2xl font-medium">Currículums</h1>
      <p className="mb-5 mt-1 text-sm text-stone-500">
        Cada currículum tiene un coordinador y varios grupos pequeños.
      </p>
      <Flash error={searchParams.error} ok={searchParams.ok} />

      {isAdmin && (
        <form action={crearCurriculum} className="mb-5 grid gap-2 rounded-xl border border-stone-200 bg-white p-4 md:grid-cols-[1fr_2fr_auto]">
          <input name="name" placeholder="Nombre (ej. Hombres)" aria-label="Nombre" className={fieldClass} />
          <input name="description" placeholder="Descripción (opcional)" aria-label="Descripción" className={fieldClass} />
          <button className={primaryBtn}>Crear currículum</button>
        </form>
      )}

      <section className="space-y-3">
        {curriculums.length === 0 && (
          <p className="rounded-xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
            Todavía no hay currículums.
          </p>
        )}
        {curriculums.map((c) => (
          <article key={c.id} className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-medium">{c.name}</h2>
                {c.description && <p className="text-sm text-stone-500">{c.description}</p>}
              </div>
              <div className="flex gap-4 text-sm">
                <Link href={`/curriculums/${c.id}`} className="text-brand-teal hover:underline">
                  Lecciones
                </Link>
                <Link href="/grupos" className="text-brand-teal hover:underline">
                  {c.groups[0]?.count ?? 0} grupos →
                </Link>
              </div>
            </div>

            {isAdmin ? (
              <form action={asignarCoordinador} className="mt-3 flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={c.id} />
                <label className="text-sm text-stone-500" htmlFor={`coord-${c.id}`}>
                  Coordinador
                </label>
                <select id={`coord-${c.id}`} name="coordinator_id" defaultValue={c.coordinator_id ?? ""} className={`${fieldClass} max-w-xs`}>
                  <option value="">Sin asignar</option>
                  {c.coordinator_id && !coordinators.some((p) => p.id === c.coordinator_id) && (
                    <option value={c.coordinator_id}>{nameOf(c.coordinator_id)}</option>
                  )}
                  {coordinators.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || "Sin nombre"}
                    </option>
                  ))}
                </select>
                <button className="h-10 rounded-lg border border-brand-teal px-3 text-sm text-brand-teal hover:bg-brand-teal hover:text-white">
                  Guardar
                </button>
              </form>
            ) : (
              <p className="mt-3 text-sm text-stone-500">Coordinador: {nameOf(c.coordinator_id)}</p>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
