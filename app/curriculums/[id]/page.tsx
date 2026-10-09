import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppHeader } from "@/components/AppHeader";
import { Flash, fieldClass, primaryBtn } from "@/components/Flash";
import { crearCiclo } from "@/app/actions/gestion";

export const dynamic = "force-dynamic";

type Cycle = {
  id: string;
  number: number;
  title: string | null;
  classes: number;
  prerequisite_cycle_id: string | null;
};

export default async function CurriculumPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { supabase, role } = await getSession();
  if (role !== "admin" && role !== "coordinador") redirect("/inicio");

  const { data: curriculum } = await supabase
    .from("curriculums")
    .select("id, name, description")
    .eq("id", params.id)
    .maybeSingle();
  if (!curriculum) notFound();

  const { data } = await supabase
    .from("cycles")
    .select("id, number, title, classes, prerequisite_cycle_id")
    .eq("curriculum_id", curriculum.id)
    .order("number");
  const cycles = (data ?? []) as Cycle[];
  const nextNumber = (cycles[cycles.length - 1]?.number ?? 0) + 1;

  const { data: lessonRows } = cycles.length
    ? await supabase.from("lessons").select("cycle_id").in("cycle_id", cycles.map((c) => c.id))
    : { data: [] as { cycle_id: string }[] };
  const lessonCount = (cid: string) => (lessonRows ?? []).filter((l) => l.cycle_id === cid).length;

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <AppHeader role={role} />
      <Link href="/curriculums" className="text-sm text-brand-teal hover:underline">
        ← Currículums
      </Link>
      <h1 className="mt-2 text-2xl font-medium">{curriculum.name}</h1>
      <p className="mb-5 mt-1 text-sm text-stone-500">
        {curriculum.description || "Ciclos del currículum"} · {cycles.length} {cycles.length === 1 ? "ciclo" : "ciclos"}
      </p>
      <Flash error={searchParams.error} ok={searchParams.ok} />

      <section className="mb-6 rounded-xl border border-stone-200 bg-white p-4">
        {cycles.length === 0 ? (
          <p className="py-4 text-center text-sm text-stone-500">Todavía no hay ciclos. Crea el primero abajo.</p>
        ) : (
          <ul>
            {cycles.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 border-b border-stone-100 py-3 text-sm last:border-0">
                <span>
                  <span className="font-medium">Ciclo {c.number}</span>
                  {c.title && <span className="ml-2 text-stone-600">{c.title}</span>}
                  <span className="ml-2 text-stone-400">
                    {c.classes} clases · {lessonCount(c.id)} lecciones escritas
                  </span>
                  {c.prerequisite_cycle_id && (
                    <span className="ml-2 text-xs text-stone-400">
                      (requiere ciclo {cycles.find((x) => x.id === c.prerequisite_cycle_id)?.number})
                    </span>
                  )}
                </span>
                <Link href={`/ciclos/${c.id}`} className="shrink-0 text-brand-teal hover:underline">
                  Lecciones →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form action={crearCiclo} className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-medium">Nuevo ciclo</h2>
        <input type="hidden" name="curriculum_id" value={curriculum.id} />
        <div className="grid gap-2 md:grid-cols-4">
          <input name="number" type="number" min={1} defaultValue={nextNumber} aria-label="Número" className={fieldClass} />
          <input name="title" placeholder="Título (opcional)" aria-label="Título" className={`${fieldClass} md:col-span-2`} />
          <input name="classes" type="number" min={1} defaultValue={11} aria-label="Clases" className={fieldClass} />
        </div>
        {cycles.length > 0 && (
          <label className="mt-2 block text-xs text-stone-500">
            Ciclo que debe aprobarse antes (opcional)
            <select name="prerequisite_cycle_id" defaultValue="" className={`${fieldClass} mt-1`}>
              <option value="">Ninguno</option>
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  Ciclo {c.number}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className={`${primaryBtn} mt-3`}>Crear ciclo</button>
      </form>
    </div>
  );
}
