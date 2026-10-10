import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Flash, fieldClass } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { Callout, EmptyState, PageHeader } from "@/components/ui";
import { cambiarEtapaSede } from "@/app/actions/habilitacion";
import {
  STAGE_LABEL,
  STAGE_STYLE,
  STATE_LABEL,
  STATE_STYLE,
  campusHeadline,
  fmtNum,
  groupByArea,
  summarize,
  type CampusRow,
  type ReconRow,
} from "@/lib/habilitacion";

export const dynamic = "force-dynamic";

const dateEs = (iso: string) => new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });

export default async function HabilitacionPage(props: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const sp = await props.searchParams;
  const { supabase, user, role } = await getSession();
  const isAdmin = role === "admin";
  const { data: pastorRows } = await supabase.from("campus_pastors").select("campus_id").eq("person_id", user.id).limit(1);
  const isPastor = (pastorRows ?? []).length > 0;
  if (!isAdmin && !isPastor) redirect("/inicio");

  const [reconR, campusR, archiveR] = await Promise.all([
    isAdmin ? supabase.rpc("reconciliacion") : Promise.resolve({ data: [], error: null }),
    supabase.rpc("campus_readiness"),
    isAdmin ? supabase.rpc("legacy_archive_summary") : Promise.resolve({ data: [], error: null }),
  ]);
  // Si falta instalar 015, la tarjeta del archivo simplemente no se muestra
  const archiveMissing = !!archiveR.error;
  const archive = ((archiveR.data ?? []) as { source_table: string; filas: number | string }[]);
  const archiveTotal = archive.reduce((n, a) => n + Number(a.filas), 0);
  if (campusR.error && /Could not find|PGRST202|404/i.test(campusR.error.message + (campusR.error.code ?? ""))) {
    return (
      <div className="enter mx-auto max-w-3xl p-4 pb-16 md:p-8 md:pb-16">
        <PageHeader title="Habilitación" />
        <Callout tone="warn">
          Falta instalar la habilitación en la base de datos: ejecuta <code>supabase/v2/011_habilitacion.sql</code> en el SQL Editor de Supabase.
        </Callout>
      </div>
    );
  }
  const recon = (reconR.data ?? []) as ReconRow[];
  const campuses = (campusR.data ?? []) as CampusRow[];
  const sum = summarize(recon.filter((r) => r.estado !== "info"));

  return (
    <div className="enter mx-auto max-w-5xl p-4 pb-16 md:p-8 md:pb-16">
      <PageHeader
        title="Habilitación"
        subtitle="Cómo va cada sede para usar GP 2.0 y si los datos cuadran con lo que trajo la importación. La etapa de cada sede es un registro del avance: no bloquea ninguna función."
      />
      <Flash error={sp.error} ok={sp.ok} />

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title flex items-center gap-2"><Icon name="globe" className="h-4 w-4 text-brand-teal" />Sedes</h2>
          {isAdmin && (
            <Link href="/habilitacion/sedes" className="btn btn-secondary btn-sm">
              Asignar sedes por lote
              <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
          )}
        </div>
        {campuses.length === 0 ? (
          <EmptyState icon="globe" title="Todavía no hay sedes con grupos" />
        ) : (
          <ul className="stagger space-y-3">
            {campuses.map((c) => (
              <li key={c.campus_id ?? "sin-sede"} className="card card-hover p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">
                    {c.campus}
                    {c.gp2_status && <span className={`ml-2 chip font-normal ${STAGE_STYLE[c.gp2_status]}`}>{STAGE_LABEL[c.gp2_status]}</span>}
                    {c.gp2_status_at && <span className="ml-2 text-xs font-normal text-stone-400">desde el {dateEs(c.gp2_status_at)}</span>}
                  </h3>
                  <span className={`flex items-center gap-1.5 text-sm ${c.listo ? "font-medium text-brand-green-800" : "text-stone-500"}`}>
                    {c.listo && <Icon name="check-circle" className="h-4 w-4" />}
                    {campusHeadline(c)}
                  </span>
                </div>

                <dl className="mt-3 grid grid-cols-3 gap-3 text-sm md:grid-cols-6">
                  {[
                    ["Grupos activos", c.grupos_activos, false],
                    ["Sin líder", c.sin_lider, c.sin_lider > 0],
                    ["Sin respaldo", c.sin_respaldo, false],
                    ["Sin calendario", c.sin_calendario, c.sin_calendario > 0],
                    ["Sesiones por registrar", c.sesiones_atrasadas, c.sesiones_atrasadas > 0],
                    ["Personas", c.personas, false],
                  ].map(([label, value, warn]) => (
                    <div key={String(label)}>
                      <dt className="text-xs text-stone-500">{label}</dt>
                      <dd className={`text-lg font-medium ${warn ? "text-amber-700" : ""}`}>{fmtNum(value as number)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-xs text-stone-500">
                  {c.campus_id === null ? "" : c.pastores === 0 ? "Sin pastor designado." : `${c.pastores} ${c.pastores === 1 ? "pastor designado" : "pastores designados"}.`}
                </p>

                {isAdmin && c.campus_id && (
                  <form action={cambiarEtapaSede} className="mt-3 flex flex-wrap items-end gap-2 border-t border-stone-100 pt-3">
                    <input type="hidden" name="campus_id" value={c.campus_id} />
                    <label className="text-xs text-stone-500">
                      Etapa
                      <select name="stage" defaultValue={c.gp2_status ?? "preparacion"} className={`${fieldClass} mt-1`}>
                        {Object.entries(STAGE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </label>
                    <input name="notes" placeholder="Nota (opcional)" aria-label="Nota" className={`${fieldClass} md:max-w-xs`} />
                    <label className="flex items-center gap-2 text-xs text-stone-500">
                      <input type="checkbox" name="force" value="si" /> Habilitar aunque haya pendientes
                    </label>
                    <button className="btn btn-outline">Guardar</button>
                  </form>
                )}
                {c.campus_id === null && c.grupos_activos > 0 && (
                  <p className="mt-2 text-xs text-stone-500">
                    Asigna la sede de cada grupo desde su detalle (<Link href="/grupos" className="link">Grupos</Link>).
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isAdmin && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title flex items-center gap-2"><Icon name="shield" className="h-4 w-4 text-brand-teal" />Reconciliación de datos</h2>
            <span className={`chip ${sum.clean ? STATE_STYLE.ok : STATE_STYLE.error}`}>
              {sum.clean ? "Todo cuadra" : `${sum.error} problemas · ${sum.revisar} por revisar`}
            </span>
          </div>
          {reconR.error ? (
            <Callout tone="warn">{reconR.error.message}</Callout>
          ) : (
            groupByArea(recon).map(([area, rows]) => (
              <div key={area} className="mb-4 overflow-x-auto card">
                <table className="w-full min-w-[560px] text-sm">
                  <caption className="px-3 pt-3 text-left text-xs font-medium uppercase tracking-wide text-stone-400">{area}</caption>
                  <thead className="text-left text-xs text-stone-500">
                    <tr>
                      <th className="p-3 font-medium">Chequeo</th>
                      <th className="p-3 text-right font-medium">Esperado</th>
                      <th className="p-3 text-right font-medium">Hoy</th>
                      <th className="p-3 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.chequeo} className="border-t border-stone-100 align-top">
                        <td className="p-3">
                          {r.chequeo}
                          {r.detalle && <span className="block text-xs text-stone-400">{r.detalle}</span>}
                        </td>
                        <td className="p-3 text-right">{fmtNum(r.esperado)}</td>
                        <td className="p-3 text-right">{fmtNum(r.actual)}</td>
                        <td className="p-3"><span className={`chip ${STATE_STYLE[r.estado]}`}>{STATE_LABEL[r.estado]}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
          <p className="text-xs text-stone-500">
            “Esperado” en Importación es lo que trajo la importación del 9 de octubre de 2026: hoy debe haber al menos eso. Un “Problema” en Modelo es algo que no debería existir y conviene revisar antes de habilitar sedes.
          </p>
        </section>
      )}

      {isAdmin && !archiveMissing && (
        <section className="mt-8 card p-4" aria-label="Archivo histórico">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title flex items-center gap-2"><Icon name="library" className="h-4 w-4 text-brand-teal" />Archivo histórico</h2>
            <span className={`chip ${archive.length > 0 ? STATE_STYLE.ok : "bg-amber-50 text-amber-800"}`}>
              {archive.length > 0 ? `${fmtNum(archiveTotal)} filas guardadas` : "Todavía vacío"}
            </span>
          </div>
          <p className="mb-3 text-sm text-stone-600">
            Cada fila de la plataforma anterior se guarda tal cual, aunque GP 2.0 aún no tenga dónde usarla (matrimonios, evaluaciones, fútbol, columnas sin equivalente). Solo el administrador la ve y nada se modifica ni se borra.
          </p>
          {archive.length === 0 ? (
            <Callout tone="warn">
              Aún no se ha archivado el respaldo. Desde tu computador: <code>npm run migrar:archivar -- --respaldo migracion/datos/respaldo.sql --aplicar --si-estoy-seguro</code>
            </Callout>
          ) : (
            <details>
              <summary className="cursor-pointer text-sm text-brand-teal">Ver por tabla ({archive.length})</summary>
              <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {archive.map((a) => (
                  <li key={a.source_table} className="flex justify-between gap-2 border-b border-stone-100 py-1">
                    <span className="text-stone-600">{a.source_table}</span>
                    <span className="tabular font-medium">{fmtNum(Number(a.filas))}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
