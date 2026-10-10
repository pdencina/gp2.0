import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Flash, Notice, fieldClass, primaryBtn } from "@/components/Flash";
import { Callout, PageHeader } from "@/components/ui";
import { Kpi } from "@/components/charts";
import {
  asignarSedeGrupos,
  asignarSedeGruposPorLider,
  asignarSedePersonasCiudad,
  asignarSedePersonasDesdeGrupos,
} from "@/app/actions/habilitacion";
import { fmtNum } from "@/lib/habilitacion";
import { countryName } from "@/lib/panel";

export const dynamic = "force-dynamic";

type Gap = { clave: string; etiqueta: string; n: number | string };
type Bucket = { country: string; city: string; n: number | string };

export default async function SedesPorLotePage(props: {
  searchParams: Promise<{ error?: string; aviso?: string }>;
}) {
  const sp = await props.searchParams;
  const { supabase, role } = await getSession();
  if (role !== "admin") redirect("/inicio");

  const [gapsR, bucketsR, campusR, progR] = await Promise.all([
    supabase.rpc("campus_gaps"),
    supabase.rpc("campus_city_buckets", { lim: 40 }),
    supabase.from("campuses").select("id, name").eq("active", true).order("name"),
    supabase.from("curriculums").select("id, name").eq("active", true).order("name"),
  ]);
  if (gapsR.error) {
    return (
      <div className="enter mx-auto max-w-3xl p-4 pb-16 md:p-8 md:pb-16">
        <PageHeader title="Asignar sedes" back={{ href: "/habilitacion", label: "Habilitación" }} />
        <Callout tone="warn">
          Falta instalar esta herramienta en la base de datos: ejecuta <code>supabase/v2/013_sedes_por_lote.sql</code> en el SQL Editor de Supabase.
        </Callout>
      </div>
    );
  }
  const gaps = new Map(((gapsR.data ?? []) as Gap[]).map((g) => [g.clave, Number(g.n)]));
  const buckets = (bucketsR.data ?? []) as Bucket[];
  const campuses = (campusR.data ?? []) as { id: string; name: string }[];
  const programs = (progR.data ?? []) as { id: string; name: string }[];
  const campusSelect = (name = "campus_id") => (
    <select name={name} defaultValue="" aria-label="Sede" className={`${fieldClass} md:max-w-[12rem]`}>
      <option value="" disabled>Sede…</option>
      {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );

  return (
    <div className="enter mx-auto max-w-4xl p-4 pb-16 md:p-8 md:pb-16">
      <PageHeader
        title="Asignar sedes"
        back={{ href: "/habilitacion", label: "Habilitación" }}
        subtitle="Los grupos y las personas importados no tienen sede, y sin sede solo el administrador puede certificarlos. Aquí se asigna por criterios, no uno por uno. Nunca se cambia una sede que ya está asignada, y cada acción deja una sola anotación en la auditoría."
      />
      <Flash error={sp.error} />
      {sp.aviso && <Notice>{sp.aviso}</Notice>}

      <section className="stagger mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        {Array.from(gaps.entries()).map(([k]) => {
          const g = ((gapsR.data ?? []) as Gap[]).find((x) => x.clave === k)!;
          return (
            <Kpi key={k} label={g.etiqueta} value={fmtNum(g.n)} />
          );
        })}
      </section>

      <section className="mb-6 card p-4">
        <h2 className="mb-1 section-title">Grupos</h2>
        <p className="mb-3 text-xs text-stone-500">Se aplica a los grupos activos que todavía no tienen sede.</p>

        <form action={asignarSedeGruposPorLider} className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-50 p-3">
          <span className="text-sm">
            <strong className="font-medium">Según la sede de su líder.</strong>{" "}
            <span className="text-stone-500">Se puede aplicar a {fmtNum(gaps.get("grupos_con_lider_con_sede") ?? 0)} grupos hoy.</span>
          </span>
          <button className="btn btn-outline">Aplicar</button>
        </form>

        <form action={asignarSedeGrupos} className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-stone-500">
            Programa
            <select name="programa" defaultValue="" className={`${fieldClass} mt-1 md:max-w-[14rem]`}>
              <option value="">Todos</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-stone-500">
            Modalidad
            <select name="modalidad" defaultValue="" className={`${fieldClass} mt-1`}>
              <option value="">Todas</option>
              <option value="virtual">Online</option>
              <option value="presencial">Presencial</option>
            </select>
          </label>
          <label className="text-xs text-stone-500">
            Sede
            <div className="mt-1">{campusSelect()}</div>
          </label>
          <button className={primaryBtn}>Asignar a los que cumplen</button>
        </form>
      </section>

      <section className="card p-4">
        <h2 className="mb-1 section-title">Personas</h2>
        <p className="mb-3 text-xs text-stone-500">Se aplica a las personas activas que todavía no tienen sede.</p>

        <form action={asignarSedePersonasDesdeGrupos} className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-50 p-3">
          <span className="text-sm">
            <strong className="font-medium">Según la sede de su grupo.</strong>{" "}
            <span className="text-stone-500">Se puede aplicar a {fmtNum(gaps.get("personas_con_grupo_con_sede") ?? 0)} personas hoy; conviene hacerlo después de asignar las sedes de los grupos.</span>
          </span>
          <button className="btn btn-outline">Aplicar</button>
        </form>

        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-400">Por país y ciudad</h3>
        {buckets.length === 0 ? (
          <p className="text-sm text-stone-500">Todas las personas activas ya tienen sede.</p>
        ) : (
          <ul className="space-y-1.5">
            {buckets.map((b) => (
              <li key={`${b.country}|${b.city}`}>
                <form action={asignarSedePersonasCiudad} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <input type="hidden" name="country" value={b.country} />
                  <input type="hidden" name="city" value={b.city} />
                  <span>
                    {b.city || "Sin ciudad"} <span className="text-stone-500">· {b.country ? countryName(b.country) : "Sin país"}</span>{" "}
                    <strong className="font-medium">{fmtNum(b.n)}</strong>
                  </span>
                  <span className="flex items-center gap-2">
                    {campusSelect()}
                    <button className="btn btn-secondary">Asignar</button>
                  </span>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
