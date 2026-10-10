import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Flash, fieldClass } from "@/components/Flash";
import { aplicarSugerencias, clasificarPrograma } from "@/app/actions/programa";
import { CATEGORY_LABEL, KIND_LABEL, LIFE_STAGE_LABEL, groupOfferings, suggestOffering, type CatalogProgram } from "@/lib/programs";

export const dynamic = "force-dynamic";

export default async function ClasificarPage(props: {
  searchParams: Promise<{ error?: string; ok?: string; n?: string }>;
}) {
  const searchParams = await props.searchParams;
  const { supabase, role } = await getSession();
  if (role !== "admin") redirect("/curriculums");

  const { data } = await supabase
    .from("curriculums")
    .select("id, name, description, audience, age_min, age_max, active, category, kind, life_stage, duration_years, certifiable, visibility, offering")
    .order("name");
  const programs = (data ?? []) as CatalogProgram[];
  const pending = programs.filter((p) => !p.offering && suggestOffering(p.name).offering !== p.name).length;
  const offerings = groupOfferings(programs);

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <Link href="/curriculums" className="text-sm text-brand-teal hover:underline">← Currículums</Link>
      <h1 className="mt-2 text-2xl font-medium">Clasificar el catálogo</h1>
      <p className="mb-5 mt-1 text-sm text-stone-500">
        Decide qué se ofrece y cómo se agrupa. Las variantes de una misma oferta (por ejemplo, AR Jóvenes por edades) se muestran juntas y cada persona ve la que le corresponde. Nada de esto cambia grupos ni inscripciones.
      </p>
      <Flash error={searchParams.error} ok={searchParams.ok} />
      {searchParams.n && <p className="mb-4 text-sm text-stone-600">Se actualizaron {searchParams.n} programas con la propuesta.</p>}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4">
        <p className="text-sm text-stone-600">
          Hoy hay <strong>{programs.length}</strong> programas y <strong>{offerings.length}</strong> ofertas visibles en el catálogo.
          {pending > 0 && ` Hay ${pending} con una agrupación sugerida sin aplicar.`}
        </p>
        <form action={aplicarSugerencias}>
          <button className="h-10 rounded-lg border border-brand-teal px-3 text-sm text-brand-teal hover:bg-brand-teal hover:text-white">
            Aplicar la propuesta a los que no tienen oferta
          </button>
        </form>
      </div>

      <ul className="space-y-3">
        {programs.map((p) => {
          const s = suggestOffering(p.name);
          const hint = !p.offering && s.offering !== p.name ? s.offering : null;
          return (
            <li key={p.id} className="rounded-xl border border-stone-200 bg-white p-4">
              <form action={clasificarPrograma} className="grid gap-2 md:grid-cols-6">
                <input type="hidden" name="id" value={p.id} />
                <div className="md:col-span-6 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-medium">
                    {p.name}
                    {!p.active && <span className="ml-2 rounded bg-stone-100 px-2 py-0.5 text-xs font-normal text-stone-500">inactivo</span>}
                    {s.internal && p.visibility === "publico" && <span className="ml-2 rounded bg-amber-50 px-2 py-0.5 text-xs font-normal text-amber-800">parece interno</span>}
                  </h2>
                  {hint && <span className="text-xs text-stone-400">Sugerido: {hint}</span>}
                </div>

                <label className="text-xs text-stone-500 md:col-span-2">
                  Oferta (agrupa variantes)
                  <input name="offering" defaultValue={p.offering ?? ""} placeholder={hint ?? p.name} className={`${fieldClass} mt-1`} />
                </label>
                <label className="text-xs text-stone-500">
                  Categoría
                  <select name="category" defaultValue={p.category} className={`${fieldClass} mt-1`}>
                    {Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <label className="text-xs text-stone-500">
                  Tipo
                  <select name="kind" defaultValue={p.kind} className={`${fieldClass} mt-1`}>
                    {Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <label className="text-xs text-stone-500">
                  Etapa de vida
                  <select name="life_stage" defaultValue={p.life_stage ?? ""} className={`${fieldClass} mt-1`}>
                    <option value="">—</option>
                    {Object.entries(LIFE_STAGE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <label className="text-xs text-stone-500">
                  Años de ruta
                  <input name="duration_years" type="number" min={1} max={10} defaultValue={p.duration_years} className={`${fieldClass} mt-1`} />
                </label>

                <div className="flex flex-wrap items-center gap-4 text-sm md:col-span-6">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="certifiable" defaultChecked={p.certifiable} /> Da certificado
                  </label>
                  <label className="flex items-center gap-2">
                    Visibilidad
                    <select name="visibility" defaultValue={p.visibility} className="h-9 rounded-lg border border-stone-300 bg-white px-2 text-sm">
                      <option value="publico">En el catálogo</option>
                      <option value="privado">Oculto (interno)</option>
                    </select>
                  </label>
                  <button className="ml-auto h-9 rounded-lg bg-brand-orange px-4 text-sm font-medium text-white hover:brightness-95">Guardar</button>
                </div>
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
