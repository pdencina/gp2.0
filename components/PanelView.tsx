import Link from "next/link";
import { ALERT_LABEL, SEVERITY_CLASS, type Alert } from "@/lib/alerts";
import {
  countryName, fmt, num, pct, pointsDelta, ratio, shortDate, shortSeason,
  type Cobertura, type ContinuidadRow, type Formacion, type CurriculumRow, type DistribucionRow, type LiderRow, type Resumen, type Semana, type TemporadaRow,
} from "@/lib/panel";
import { Bar, Card, Kpi, Legend, LineChart, StackedColumns } from "@/components/charts";

const SCOPE: Record<string, string> = {
  admin: "Todo el ecosistema de Grupos Pequeños",
  coordinador: "Los currículums que coordinas",
  monitor: "Los grupos que acompañas",
};

export type PanelData = {
  role: string;
  resumen: Resumen | null;
  semanal: Semana[];
  curriculums: CurriculumRow[];
  temporadas: TemporadaRow[];
  continuidad: ContinuidadRow[];
  lideres: LiderRow[];
  dist: DistribucionRow[];
  alerts: Alert[];
  cobertura?: Cobertura | null;
  formacion?: Formacion | null;
  today: Date;
};

export function PanelView({ role, resumen: r, semanal, curriculums, temporadas, continuidad, lideres, dist, alerts, cobertura, formacion, today }: PanelData) {
  const att = num(r?.asistencia_4s);
  const attPrev = num(r?.asistencia_4s_previa);
  const aprobacion = num(r?.aprobacion_historica);

  // Alertas: personas en riesgo y avisos por tipo
  const atRisk = new Set(alerts.filter((a) => a.kind === "en_riesgo" || a.kind === "excedido").map((a) => a.person_id)).size;
  const urgent = alerts.filter((a) => a.severity === 3).length;
  const byKind = Object.entries(
    alerts.reduce<Record<string, number>>((m, a) => ((m[a.kind] = (m[a.kind] ?? 0) + 1), m), {})
  ).sort((a, b) => {
    // primero lo más urgente; dentro de cada urgencia, lo más numeroso
    const sev = (k: string) => alerts.find((x) => x.kind === k)?.severity ?? 0;
    return sev(b[0]) - sev(a[0]) || b[1] - a[1];
  });
  const groupAlerts = alerts
    .filter((a) => !a.person_id)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 6);

  // Continuidad global: de quienes aprueban un ciclo (que tiene siguiente), cuántos se inscriben en el siguiente
  const contTotal = continuidad.reduce((n, c) => n + c.aprobados, 0);
  const contKept = continuidad.reduce((n, c) => n + c.continuaron, 0);
  const continuity = ratio(contKept, contTotal);

  // Semana a semana (la semana en curso está incompleta)
  const dow = today.getUTCDay() === 0 ? 7 : today.getUTCDay();
  const monday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (dow - 1))).toISOString().slice(0, 10);
  const points = semanal.map((s) => ({
    label: shortDate(s.semana),
    value: ratio(s.asistieron, s.total),
    detail: `${fmt(s.asistieron)} de ${fmt(s.total)} · ${s.grupos} grupos`,
  }));
  const partialLast = semanal.length > 0 && semanal[semanal.length - 1].semana.slice(0, 10) >= monday;

  const active = curriculums.filter((c) => c.personas_activas > 0 || c.aprobados + c.no_completaron > 0);
  const topCurr = active.slice(0, 12);
  const restCurr = active.slice(12);

  const contRows = continuidad
    .filter((c) => c.aprobados >= 20)
    .sort((a, b) => b.aprobados - a.aprobados)
    .slice(0, 10);

  const seasonCols = temporadas.map((t) => ({
    label: shortSeason(t.temporada),
    ok: t.aprobados,
    no: t.no_completaron,
    rest: Math.max(0, t.inscripciones - t.aprobados - t.no_completaron),
  }));
  const lastSeasons = temporadas.slice(-4).reverse();

  // Liderazgo
  const loadBuckets = [1, 2, 3, 4].map((n) => ({
    label: n === 4 ? "4 o más grupos" : n === 1 ? "1 grupo" : `${n} grupos`,
    n: lideres.filter((l) => (n === 4 ? l.grupos >= 4 : l.grupos === n)).length,
  }));
  const maxBucket = Math.max(1, ...loadBuckets.map((b) => b.n));
  const heavy = lideres.slice(0, 6);
  const lowAtt = lideres
    .filter((l) => l.inscritos >= 5 && num(l.asistencia_4s) !== null && num(l.asistencia_4s)! < 50)
    .sort((a, b) => num(a.asistencia_4s)! - num(b.asistencia_4s)!)
    .slice(0, 6);

  // Dónde están
  const modal = dist.filter((d) => d.tipo === "modalidad");
  const modalTotal = modal.reduce((n, d) => n + d.n, 0);
  const countries = dist.filter((d) => d.tipo === "pais").sort((a, b) => b.n - a.n);
  const countryTotal = countries.reduce((n, d) => n + d.n, 0);

  const dateLabel = today.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Santiago" });

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <header className="mb-5">
        <h1 className="text-2xl font-medium">Panel</h1>
        <p className="text-sm text-stone-500">
          {SCOPE[role]} · {dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
        </p>
      </header>

      {/* Pulso */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Personas activas" value={fmt(r?.personas_activas)} sub={`en ${fmt(r?.grupos_activos)} grupos activos`} href="/grupos" />
        <Kpi label="Asistencia, últimas 4 semanas" value={pct(att)} delta={pointsDelta(att, attPrev)} sub="vs las 4 anteriores" />
        <Kpi label="Personas en riesgo" value={fmt(atRisk)} sub="cerca o sobre el límite de ausencias" tone={atRisk > 0 ? "alert" : "stone"} href="/alertas" />
        <Kpi label="Continuidad entre ciclos" value={pct(continuity, 0)} sub="de quienes aprueban siguen al próximo" />
        <Kpi label="Aprobación histórica" value={pct(aprobacion, 0)} sub="de quienes terminan un ciclo" />
        <Kpi label="Inscripciones nuevas" value={fmt(r?.nuevos_30d)} sub="en los últimos 30 días" />
        <Kpi label="Avisos urgentes" value={fmt(urgent)} sub="faltas seguidas o asistencia baja" tone={urgent > 0 ? "alert" : "stone"} href="/alertas" />
        {role !== "monitor" ? (
          <Kpi
            label="Grupos sin responsable"
            value={fmt((r?.sin_lider ?? 0) + (r?.sin_monitor ?? 0))}
            sub={`${fmt(r?.sin_lider)} sin líder · ${fmt(r?.sin_monitor)} sin monitor`}
            tone={(r?.sin_lider ?? 0) + (r?.sin_monitor ?? 0) > 0 ? "alert" : "stone"}
            href="/grupos"
          />
        ) : (
          <Kpi label="Grupos activos" value={fmt(r?.grupos_activos)} sub="a tu cargo" href="/grupos" />
        )}
      </div>

      {/* Tendencia y atención */}
      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Card title="Asistencia semana a semana" subtitle="Porcentaje de inscritos que asistieron (o recuperaron) en las últimas 12 semanas" className="lg:col-span-2">
          <LineChart points={partialLast ? points.slice(0, -1) : points} />
          {partialLast && <p className="mt-1 text-xs text-stone-500">La semana en curso se agrega cuando termina, para no mostrar un número a medias.</p>}
        </Card>

        <Card title="Dónde mirar" subtitle={`${fmt(alerts.length)} avisos en total`} action={{ href: "/alertas", label: "Ver todos →" }}>
          {byKind.length === 0 ? (
            <p className="py-6 text-center text-sm text-stone-500">Todo en orden por ahora.</p>
          ) : (
            <ul className="mb-3 space-y-1.5">
              {byKind.map(([kind, n]) => {
                const sev = alerts.find((a) => a.kind === kind)?.severity ?? 1;
                return (
                  <li key={kind} className="flex items-center justify-between text-sm">
                    <span className={`rounded px-2 py-0.5 text-xs ${SEVERITY_CLASS[sev]}`}>{ALERT_LABEL[kind as Alert["kind"]]}</span>
                    <span className="font-medium">{fmt(n)}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {groupAlerts.length > 0 && (
            <div className="border-t border-stone-100 pt-3">
              <p className="mb-1 text-xs text-stone-500">Grupos que piden atención</p>
              <ul className="space-y-1">
                {groupAlerts.map((a) => (
                  <li key={`${a.kind}-${a.group_id}`} className="text-sm">
                    <Link href={`/grupos/${a.group_id}`} className="font-medium hover:underline">{a.group_name}</Link>
                    <span className="ml-1 text-xs text-stone-500">{a.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      {/* Formación: personas e inscripciones, sin mezclar con asistencia */}
      {formacion && (
        <Card
          title="Formación"
          subtitle="Personas distintas, no inscripciones: una persona cuenta una vez aunque haya cambiado de grupo o de año. La asistencia y el aprendizaje completado se miden aparte."
          className="mb-5"
        >
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-8">
            {[
              { label: "Inscritos únicos", value: fmt(formacion.personas_unicas) },
              { label: "En curso", value: fmt(formacion.activos) },
              { label: "En pausa", value: fmt(formacion.pausados) },
              { label: "Completaron", value: fmt(formacion.completados) },
              { label: "Reincorporados", value: fmt(formacion.reincorporados) },
              { label: "Asistieron (30 días)", value: fmt(formacion.asistentes_30d) },
              { label: "Certif. de programa", value: fmt(formacion.certificados_programa) },
              { label: "Certif. de etapa", value: fmt(formacion.certificados_etapa) },
            ].map((k) => (
              <div key={k.label}>
                <p className="text-xs text-stone-500">{k.label}</p>
                <p className="text-xl font-medium">{k.value}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Calendario y cobertura */}
      {cobertura && cobertura.grupos_activos > 0 && (
        <Card
          title="Calendario y cobertura"
          subtitle="Sesiones realizadas frente a las planificadas, y quién sostiene cada grupo. Es asistencia y operación: no mide aprendizaje completado."
          className="mb-5"
        >
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            {[
              { label: "Sesiones realizadas", value: `${fmt(cobertura.sesiones_realizadas)} de ${fmt(cobertura.sesiones_planificadas)}`, sub: "planificadas hasta hoy", warn: false },
              { label: "Por registrar", value: fmt(cobertura.sesiones_atrasadas), sub: "pasaron hace más de 7 días", warn: cobertura.sesiones_atrasadas > 0 },
              { label: "Grupos con calendario", value: `${fmt(cobertura.con_calendario)} de ${fmt(cobertura.grupos_activos)}`, sub: `${fmt(cobertura.sin_calendario)} sin planificar`, warn: false },
              { label: "Grupos sin respaldo", value: fmt(cobertura.sin_respaldo), sub: `${fmt(cobertura.sin_lider)} sin líder`, warn: cobertura.sin_respaldo > 0 },
              { label: "Dirigidas por respaldo", value: fmt(cobertura.sesiones_con_respaldo), sub: `${fmt(cobertura.sesiones_canceladas)} canceladas`, warn: false },
            ].map((k) => (
              <div key={k.label}>
                <p className="text-xs text-stone-500">{k.label}</p>
                <p className={`text-xl font-medium ${k.warn ? "text-amber-700" : ""}`}>{k.value}</p>
                <p className="text-xs text-stone-400">{k.sub}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Por currículum */}
      <Card title="Cada currículum" subtitle="Personas y grupos activos, asistencia reciente y cuántos aprueban. Un guion (—) significa que no hay asistencia registrada en ese periodo." className="mb-5">
        {topCurr.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-500">Todavía no hay currículums con actividad.</p>
        ) : (
          <>
            <CurriculumTable rows={topCurr} />
            {restCurr.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-brand-teal hover:underline">Ver los otros {restCurr.length} currículums</summary>
                <div className="mt-3"><CurriculumTable rows={restCurr} /></div>
              </details>
            )}
          </>
        )}
      </Card>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card title="¿Siguen al próximo ciclo?" subtitle="De quienes aprobaron un ciclo, cuántos se inscribieron en el siguiente">
          {contRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-stone-500">Aún no hay datos suficientes.</p>
          ) : (
            <ul className="space-y-3">
              {contRows.map((c) => {
                const p = ratio(c.continuaron, c.aprobados);
                return (
                  <li key={`${c.curriculum}-${c.ciclo}`}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span>{c.curriculum} <span className="text-stone-400">· ciclo {c.ciclo} → {c.ciclo + 1}</span></span>
                      <span className="shrink-0 font-medium">{pct(p, 0)}</span>
                    </div>
                    <Bar value={p} tone={p !== null && p < 40 ? "orange" : "green"} label={`${pct(p, 0)} siguen`} />
                    <p className="mt-0.5 text-xs text-stone-500">{fmt(c.continuaron)} de {fmt(c.aprobados)} siguieron</p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Evolución por temporada" subtitle="Inscripciones y cómo terminaron">
          <StackedColumns data={seasonCols} />
          <Legend items={[{ label: "Aprobaron", tone: "green" }, { label: "No completaron", tone: "stone" }, { label: "En curso", tone: "teal" }]} />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-500">
                  <th className="py-1 font-normal">Temporada</th><th className="py-1 text-right font-normal">Personas</th>
                  <th className="py-1 text-right font-normal">Inscripciones</th><th className="py-1 text-right font-normal">Aprobación</th>
                </tr>
              </thead>
              <tbody>
                {lastSeasons.map((t) => (
                  <tr key={t.temporada} className="border-t border-stone-100">
                    <td className="py-1.5">{t.temporada}</td>
                    <td className="py-1.5 text-right">{fmt(t.personas)}</td>
                    <td className="py-1.5 text-right">{fmt(t.inscripciones)}</td>
                    <td className="py-1.5 text-right">{pct(ratio(t.aprobados, t.aprobados + t.no_completaron), 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Liderazgo" subtitle={`${fmt(lideres.length)} líderes con grupos activos`}>
          <p className="mb-2 text-xs text-stone-500">Cuántos grupos lleva cada líder</p>
          <ul className="mb-4 space-y-2">
            {loadBuckets.map((b) => (
              <li key={b.label} className="grid grid-cols-[110px_1fr_40px] items-center gap-2 text-sm">
                <span className="text-stone-600">{b.label}</span>
                <Bar value={b.n} max={maxBucket} tone={b.label.startsWith("4") ? "orange" : "teal"} label={`${b.n} líderes`} />
                <span className="text-right font-medium">{fmt(b.n)}</span>
              </li>
            ))}
          </ul>
          {heavy.length > 0 && heavy[0].grupos > 1 && (
            <div className="border-t border-stone-100 pt-3">
              <p className="mb-1 text-xs text-stone-500">Con más carga</p>
              <ul className="space-y-1 text-sm">
                {heavy.filter((l) => l.grupos > 1).map((l) => (
                  <li key={l.lider_id} className="flex justify-between gap-2">
                    <span className="truncate">{l.nombre}</span>
                    <span className="shrink-0 text-stone-500">{l.grupos} grupos · {fmt(l.inscritos)} personas</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {lowAtt.length > 0 && (
            <div className="mt-3 border-t border-stone-100 pt-3">
              <p className="mb-1 text-xs text-stone-500">Con asistencia baja (menos de 50 %) en sus grupos</p>
              <ul className="space-y-1 text-sm">
                {lowAtt.map((l) => (
                  <li key={l.lider_id} className="flex justify-between gap-2">
                    <span className="truncate">{l.nombre}</span>
                    <span className="shrink-0 text-amber-700">{pct(num(l.asistencia_4s), 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card title="Dónde están" subtitle="Personas con un grupo activo">
          <p className="mb-2 text-xs text-stone-500">Modalidad</p>
          <ul className="mb-4 space-y-2">
            {modal.map((d) => (
              <li key={d.etiqueta} className="grid grid-cols-[90px_1fr_90px] items-center gap-2 text-sm">
                <span className="capitalize text-stone-600">{d.etiqueta}</span>
                <Bar value={d.n} max={Math.max(1, modalTotal)} tone={d.etiqueta === "virtual" ? "teal" : "orange"} label={`${d.n}`} />
                <span className="text-right text-stone-600">{fmt(d.n)} · {pct(ratio(d.n, modalTotal), 0)}</span>
              </li>
            ))}
          </ul>
          <p className="mb-2 text-xs text-stone-500">País de residencia</p>
          <ul className="space-y-2">
            {countries.slice(0, 6).map((d) => (
              <li key={d.etiqueta} className="grid grid-cols-[110px_1fr_90px] items-center gap-2 text-sm">
                <span className="truncate text-stone-600">{countryName(d.etiqueta)}</span>
                <Bar value={d.n} max={Math.max(1, countryTotal)} tone="stone" label={`${d.n}`} />
                <span className="text-right text-stone-600">{fmt(d.n)} · {pct(ratio(d.n, countryTotal), 0)}</span>
              </li>
            ))}
          </ul>
          {countries.length > 6 && (
            <p className="mt-2 text-xs text-stone-500">
              y {countries.length - 6} países más ({fmt(countries.slice(6).reduce((n, d) => n + d.n, 0))} personas)
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

function CurriculumTable({ rows }: { rows: CurriculumRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-left text-xs text-stone-500">
            <th className="py-1 font-normal">Currículum</th>
            <th className="py-1 text-right font-normal">Grupos</th>
            <th className="py-1 text-right font-normal">Personas</th>
            <th className="w-40 py-1 pl-4 font-normal">Asistencia (4 sem.)</th>
            <th className="py-1 text-right font-normal">Aprobación</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const a = num(c.asistencia_4s);
            const ap = ratio(c.aprobados, c.aprobados + c.no_completaron);
            return (
              <tr key={c.curriculum_id} className="border-t border-stone-100">
                <td className="py-2 pr-2">
                  {c.nombre}
                  {!c.activo && <span className="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-500">inactivo</span>}
                </td>
                <td className="py-2 text-right">{fmt(c.grupos_activos)}</td>
                <td className="py-2 text-right font-medium">{fmt(c.personas_activas)}</td>
                <td className="py-2 pl-4">
                  <div className="flex items-center gap-2">
                    <div className="w-20"><Bar value={a} tone={a !== null && a < 60 ? "orange" : "teal"} label={pct(a)} /></div>
                    <span className="text-xs text-stone-600">{pct(a, 0)}</span>
                  </div>
                </td>
                <td className="py-2 text-right text-stone-600">{pct(ap, 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
