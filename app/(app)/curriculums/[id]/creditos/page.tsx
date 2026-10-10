import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Flash, fieldClass, primaryBtn } from "@/components/Flash";
import { revisarCreditos } from "@/app/actions/certificados";

export const dynamic = "force-dynamic";

type Summary = {
  stage_id: string;
  number: number;
  title: string | null;
  formative_year: number;
  version: number;
  por_revisar: number;
  validado: number;
  rechazado: number;
};
type Person = { person_id: string; full_name: string; review_status: string };

const LABEL: Record<string, string> = { por_revisar: "Por revisar", validado: "Validado", rechazado: "Rechazado" };
const PAGE = 50;

export default async function CreditosPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string; aviso?: string; modulo?: string; estado?: string; pagina?: string }>;
}) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const { supabase, role } = await getSession();
  if (role !== "admin" && role !== "coordinador") redirect("/inicio");

  const { data: curriculum } = await supabase.from("curriculums").select("id, name, duration_years").eq("id", id).maybeSingle();
  if (!curriculum) notFound();

  const { data, error } = await supabase.rpc("stage_credit_summary", { cid: id });
  if (error) {
    return (
      <div className="enter mx-auto max-w-3xl p-4 pb-16 md:p-8 md:pb-16">
        <h1 className="page-title">{curriculum.name}</h1>
        <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          {/permission|permiso/i.test(error.message) ? error.message : <>Falta instalar la revisión en la base de datos: ejecuta <code>supabase/v2/010_certificados.sql</code> en el SQL Editor de Supabase.</>}
        </p>
      </div>
    );
  }
  const rows = (data ?? []) as Summary[];
  const selected = rows.find((r) => r.stage_id === sp.modulo);
  const estado = ["por_revisar", "validado", "rechazado"].includes(sp.estado ?? "") ? sp.estado! : "por_revisar";
  const page = Math.max(0, parseInt(sp.pagina ?? "0", 10) || 0);

  const people: Person[] = selected
    ? (((await supabase.rpc("stage_credit_people", { stage: selected.stage_id, only_status: estado, lim: PAGE, skip: page * PAGE })).data ?? []) as Person[])
    : [];
  const totalFor = (r: Summary) => (estado === "validado" ? r.validado : estado === "rechazado" ? r.rechazado : r.por_revisar);
  const base = `/curriculums/${id}/creditos`;

  return (
    <div className="enter mx-auto max-w-4xl p-4 pb-16 md:p-8 md:pb-16">
      <Link href={`/curriculums/${id}`} className="text-sm link">← {curriculum.name}</Link>
      <h1 className="mt-2 page-title">Créditos de la plataforma anterior</h1>
      <p className="mb-5 mt-1 text-sm text-stone-500">
        La plataforma anterior daba un ciclo por aprobado a quien no pasó del máximo de ausencias: es asistencia, no una equivalencia con el material nuevo. Aquí una persona decide, módulo por módulo, qué créditos valen como etapa cumplida. Lo validado cuenta para pasar de año y certificar; nada se valida solo.
      </p>
      <Flash error={sp.error} ok={sp.ok} />
      {sp.aviso && <p role="status" className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{sp.aviso}</p>}

      <div className="mb-6 overflow-x-auto card">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-stone-50 text-left text-xs text-stone-500">
            <tr>
              <th className="p-3 font-medium">Módulo</th>
              <th className="p-3 font-medium">Año</th>
              <th className="p-3 text-right font-medium">Por revisar</th>
              <th className="p-3 text-right font-medium">Validados</th>
              <th className="p-3 text-right font-medium">Rechazados</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.stage_id} className={`border-t border-stone-100 ${r.stage_id === selected?.stage_id ? "bg-brand-teal/5" : ""}`}>
                <td className="p-3">Versión {r.version} · Módulo {r.number}{r.title ? ` · ${r.title}` : ""}</td>
                <td className="p-3">{r.formative_year}</td>
                <td className="p-3 text-right">{r.por_revisar.toLocaleString("es-CL")}</td>
                <td className="p-3 text-right">{r.validado.toLocaleString("es-CL")}</td>
                <td className="p-3 text-right">{r.rechazado.toLocaleString("es-CL")}</td>
                <td className="p-3 text-right">
                  {r.por_revisar + r.validado + r.rechazado > 0 && (
                    <Link href={`${base}?modulo=${r.stage_id}`} className="link">Revisar →</Link>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-stone-500">Este programa no tiene módulos.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <section className="card p-4">
          <h2 className="mb-1 section-title">Módulo {selected.number}{selected.title ? ` · ${selected.title}` : ""}</h2>

          <nav aria-label="Estado" className="mb-3 flex flex-wrap gap-2 text-sm">
            {(["por_revisar", "validado", "rechazado"] as const).map((e) => (
              <Link key={e} href={`${base}?modulo=${selected.stage_id}&estado=${e}`}
                className={`rounded-lg border px-3 py-1 ${e === estado ? "border-brand-teal bg-brand-teal/10 text-brand-teal" : "border-stone-200 text-stone-600"}`}>
                {LABEL[e]} ({(e === "validado" ? selected.validado : e === "rechazado" ? selected.rechazado : selected.por_revisar).toLocaleString("es-CL")})
              </Link>
            ))}
          </nav>

          <form action={revisarCreditos} className="mb-4 rounded-lg bg-stone-50 p-3">
            <input type="hidden" name="curriculum_id" value={id} />
            <input type="hidden" name="stage_id" value={selected.stage_id} />
            <p className="mb-2 text-xs text-stone-500">
              Marca personas para decidir solo por ellas, o confirma que es para todas las de este módulo que todavía no tengan esa decisión.
            </p>
            <label className="mb-2 flex items-center gap-2 text-sm">
              <input type="checkbox" name="all" value="si" /> Aplicar a todas las de este módulo (si no marco personas)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input name="note" placeholder="Nota (opcional, queda registrada)" aria-label="Nota" className={`${fieldClass} md:max-w-xs`} />
              <button name="decision" value="validado" className={primaryBtn}>Validar</button>
              <button name="decision" value="rechazado" className="btn btn-secondary">Rechazar</button>
              <button name="decision" value="por_revisar" className="h-10 rounded-lg px-3 text-sm text-stone-500 hover:underline">Dejar por revisar</button>
            </div>

            {people.length === 0 ? (
              <p className="mt-3 text-sm text-stone-500">No hay personas en este estado.</p>
            ) : (
              <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto">
                {people.map((p) => (
                  <li key={p.person_id}>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="person" value={p.person_id} /> {p.full_name || "Sin nombre"}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </form>

          <div className="flex justify-between text-sm">
            {page > 0 ? <Link href={`${base}?modulo=${selected.stage_id}&estado=${estado}&pagina=${page - 1}`} className="link">← Anteriores</Link> : <span />}
            {(page + 1) * PAGE < totalFor(selected) && (
              <Link href={`${base}?modulo=${selected.stage_id}&estado=${estado}&pagina=${page + 1}`} className="link">Siguientes →</Link>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
