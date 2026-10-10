import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Flash, fieldClass } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { Callout, EmptyState, PageHeader } from "@/components/ui";
import { Kpi, Bar } from "@/components/charts";
import { AwayCard, type History } from "@/components/AwayCard";
import { registrarReencuentro } from "@/app/actions/reencuentro";
import { MONTH_WINDOWS, STAGES, STAGE_HELP, STAGE_LABEL, type AwayRow, type Stage, type Summary } from "@/lib/reencuentro";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reencuentro" };

const PAGE = 20;
type Sp = { error?: string; ok?: string; meses?: string; programa?: string; sede?: string; etapa?: string; q?: string; pagina?: string; terminados?: string };

export default async function ReencuentroPage(props: { searchParams: Promise<Sp> }) {
  const sp = await props.searchParams;
  const { supabase, user, role, fullName } = await getSession();
  const { data: pastorRows } = await supabase.from("campus_pastors").select("campus_id").eq("person_id", user.id).limit(1);
  const isPastor = (pastorRows ?? []).length > 0;
  if (role === "alumno" && !isPastor) redirect("/inicio");

  const sumR = await supabase.rpc("reengagement_summary");
  if (sumR.error && /Could not find|PGRST202|404/i.test(sumR.error.message + (sumR.error.code ?? ""))) {
    return (
      <div className="enter mx-auto max-w-3xl p-4 pb-16 md:p-8 md:pb-16">
        <PageHeader title="Reencuentro" />
        <Callout tone="warn">
          Falta instalar el reencuentro en la base de datos: ejecuta <code>supabase/v2/014_reencuentro.sql</code> en el SQL Editor de Supabase.
        </Callout>
      </div>
    );
  }
  const s = ((sumR.data ?? [])[0] ?? null) as Summary | null;

  const months = MONTH_WINDOWS.some((m) => String(m.value) === sp.meses) ? Number(sp.meses) : 3;
  const stage = sp.etapa === "todas" || STAGES.includes(sp.etapa as Stage) ? (sp.etapa as string) : "por_contactar";
  const page = Math.max(0, parseInt(sp.pagina ?? "0", 10) || 0);
  const q = (sp.q ?? "").trim();
  const withFinished = sp.terminados === "1";

  const [listR, progR, campR] = await Promise.all([
    supabase.rpc("reengagement_list", {
      p_months: months,
      p_curriculum: sp.programa || null,
      p_campus: sp.sede || null,
      p_stage: stage,
      p_search: q.length >= 3 ? q : null,
      p_limit: PAGE,
      p_skip: page * PAGE,
      p_include_finished: withFinished,
    }),
    supabase.from("curriculums").select("id, name").eq("active", true).order("name"),
    supabase.from("campuses").select("id, name").eq("active", true).order("name"),
  ]);
  const rows = ((listR.data ?? []) as AwayRow[]);
  const total = rows.length ? Number(rows[0].total) : 0;
  const programs = (progR.data ?? []) as { id: string; name: string }[];
  const campuses = (campR.data ?? []) as { id: string; name: string }[];

  // Contactos anteriores, solo de quienes ya los tienen
  const histories = new Map<string, History[]>();
  await Promise.all(
    rows.filter((r) => r.contacts > 0).map(async (r) => {
      const { data } = await supabase.rpc("reengagement_history", { p_ce: r.ce_id });
      histories.set(r.ce_id, ((data ?? []) as History[]).slice(0, 4));
    }),
  );

  // Enlaces que conservan los filtros
  const keep: Record<string, string | undefined> = { meses: String(months), programa: sp.programa, sede: sp.sede, etapa: stage, q: q || undefined, terminados: withFinished ? "1" : undefined };
  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...keep, ...over })) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/reencuentro?${qs}` : "/reencuentro";
  };
  const here = href({ pagina: page ? String(page) : undefined });
  const pages = Math.max(1, Math.ceil(total / PAGE));

  const stageCount = (st: Stage) => (s ? (s[st] as number) : 0);
  const windows = s
    ? [
        { label: "3 a 6 meses", n: s.m3_6, m: 3 },
        { label: "6 meses a 1 año", n: s.m6_12, m: 6 },
        { label: "1 a 2 años", n: s.m12_24, m: 12 },
        { label: "Más de 2 años", n: s.m24_mas, m: 24 },
      ]
    : [];
  const maxWindow = Math.max(1, ...windows.map((w) => w.n));

  return (
    <div className="enter mx-auto max-w-5xl p-4 pb-16 md:p-8 md:pb-16">
      <PageHeader
        eyebrow="Seguimiento"
        title="Reencuentro"
        subtitle="Personas que dejaron su camino a medias. Su avance sigue guardado: una conversación puede ayudarles a retomarlo, sin empezar de cero."
      />
      <Flash error={sp.error} ok={sp.ok} />
      {listR.error && <Callout tone="warn" className="mb-4">{listR.error.message}</Callout>}

      {s && (
        <>
          <div className="stagger mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Se alejaron" value={String(s.total)} icon="users" sub="3 meses o más sin asistir" />
            <Kpi label="Por contactar" value={String(s.por_contactar)} icon="phone" tone={s.por_contactar > 0 ? "alert" : "stone"} sub="aún sin una conversación" />
            <Kpi label="Quieren volver" value={String(s.en_camino)} icon="heart" sub="falta ayudarles con su grupo" />
            <Kpi label="Han vuelto" value={String(s.recuperados)} icon="check-circle" tone="good" sub="asistieron después de contactarlos" />
          </div>

          {s.total > 0 && (
            <section className="card mb-5 p-4" aria-label="Hace cuánto se alejaron">
              <h2 className="section-title mb-3 flex items-center gap-2">
                <Icon name="clock" className="h-4 w-4 text-brand-teal" />
                ¿Hace cuánto?
              </h2>
              <ul className="grid gap-x-8 gap-y-2 md:grid-cols-2">
                {windows.map((w) => (
                  <li key={w.m}>
                    <Link href={href({ meses: String(w.m), pagina: undefined })} className="group block rounded-lg p-1 transition hover:bg-stone-50">
                      <span className="mb-1 flex items-baseline justify-between text-sm">
                        <span className="group-hover:text-brand-teal">{w.label}</span>
                        <span className="font-semibold tabular">{w.n.toLocaleString("es-CL")}</span>
                      </span>
                      <Bar value={w.n} max={maxWindow} tone={w.m >= 12 ? "orange" : "teal"} label={`${w.n} personas`} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* Etapas */}
      <nav aria-label="Etapa del contacto" className="mb-3 flex flex-wrap gap-2">
        {([...STAGES, "todas"] as (Stage | "todas")[]).map((st) => {
          const active = stage === st;
          const n = st === "todas" ? s?.total : stageCount(st);
          return (
            <Link
              key={st}
              href={href({ etapa: st, pagina: undefined })}
              aria-current={active ? "page" : undefined}
              title={st === "todas" ? "Todas las etapas" : STAGE_HELP[st]}
              className={`rounded-xl border px-3 py-1.5 text-sm transition ${
                active ? "border-brand-teal bg-brand-teal-50 font-semibold text-brand-teal-800 shadow-sm" : "border-stone-200 bg-white text-stone-600 hover:border-brand-teal-200 hover:bg-brand-teal-50/40"
              }`}
            >
              {st === "todas" ? "Todas" : STAGE_LABEL[st]}
              {n !== undefined && <span className="ml-1.5 text-xs tabular text-stone-400">{n}</span>}
            </Link>
          );
        })}
      </nav>
      {stage !== "todas" && <p className="mb-4 text-xs text-stone-500">{STAGE_HELP[stage as Stage]}</p>}

      {/* Filtros */}
      <form method="get" className="card mb-5 grid gap-3 p-4 md:grid-cols-[1fr_1fr_1fr_1.2fr_auto] md:items-end">
        <input type="hidden" name="etapa" value={stage} />
        <label className="text-xs text-stone-500">
          Se alejaron hace
          <select name="meses" defaultValue={String(months)} className={`${fieldClass} mt-1`}>
            {MONTH_WINDOWS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-stone-500">
          Programa
          <select name="programa" defaultValue={sp.programa ?? ""} className={`${fieldClass} mt-1`}>
            <option value="">Todos</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-stone-500">
          Sede
          <select name="sede" defaultValue={sp.sede ?? ""} className={`${fieldClass} mt-1`}>
            <option value="">Todas</option>
            {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-stone-500">
          Buscar por nombre
          <input name="q" defaultValue={q} placeholder="3 letras o más" className={`${fieldClass} mt-1`} />
        </label>
        <button className="btn btn-secondary">
          <Icon name="search" className="h-4 w-4" />
          Filtrar
        </button>
        <label className="flex items-center gap-2 text-xs text-stone-500 md:col-span-5">
          <input type="checkbox" name="terminados" value="1" defaultChecked={withFinished} />
          Incluir a quienes probablemente ya terminaron el programa (aprobaron su último módulo)
        </label>
      </form>

      {/* Lista */}
      {rows.length === 0 ? (
        <EmptyState icon={s && s.total === 0 ? "check-circle" : "search"} title={s && s.total === 0 ? "Nadie se ha alejado en tu alcance" : "Nadie coincide con estos filtros"}>
          {s && s.total === 0
            ? "Todas las personas de tus grupos siguen en camino."
            : "Prueba con otra etapa, otra antigüedad o quita algún filtro."}
        </EmptyState>
      ) : (
        <>
          <p className="mb-3 text-sm text-stone-500">
            {total.toLocaleString("es-CL")} {total === 1 ? "persona" : "personas"}
            {pages > 1 ? ` · página ${page + 1} de ${pages}` : ""}
          </p>
          <ul className="stagger space-y-3">
            {rows.map((r) => (
              <AwayCard key={r.ce_id} r={r} history={histories.get(r.ce_id) ?? []} sender={fullName} here={here} action={registrarReencuentro} />
            ))}
          </ul>

          {pages > 1 && (
            <nav aria-label="Páginas" className="mt-5 flex items-center justify-between">
              {page > 0 ? (
                <Link href={href({ pagina: String(page - 1) })} className="btn btn-secondary btn-sm">
                  <Icon name="arrow-left" className="h-4 w-4" />
                  Anteriores
                </Link>
              ) : <span />}
              {page + 1 < pages ? (
                <Link href={href({ pagina: String(page + 1) })} className="btn btn-secondary btn-sm">
                  Siguientes
                  <Icon name="arrow-right" className="h-4 w-4" />
                </Link>
              ) : <span />}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
