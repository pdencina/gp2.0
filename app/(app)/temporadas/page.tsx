import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { SEASON_LABEL } from "@/lib/format";
import { Flash, Notice, fieldClass, primaryBtn } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { EmptyState, PageHeader } from "@/components/ui";
import { cambiarEstadoTemporada, crearTemporada } from "@/app/actions/gestion";
import { definirCalendarioTemporada } from "@/app/actions/calendario";

export const dynamic = "force-dynamic";

type Season = { id: string; name: string; start_date: string; end_date: string; status: string };

const NEXT: Record<string, { to: string; label: string } | undefined> = {
  borrador: { to: "inscripciones", label: "Abrir inscripciones" },
  inscripciones: { to: "en_curso", label: "Iniciar temporada" },
  en_curso: { to: "cerrada", label: "Cerrar temporada" },
};

const fmt = (d: string) => d.split("-").reverse().join("/");

export default async function TemporadasPage(props: {
  searchParams: Promise<{ error?: string; ok?: string; aviso?: string }>;
}) {
  const searchParams = await props.searchParams;
  const { supabase, role } = await getSession();
  if (role !== "admin") redirect("/inicio");

  const { data } = await supabase.from("seasons").select("id, name, start_date, end_date, status").order("start_date", { ascending: false });
  const seasons = (data ?? []) as Season[];

  // Semanas ya definidas de cada temporada (posiciones 1 a 36 y pausas)
  const { data: weekRows } = await supabase.from("season_weeks").select("season_id, position, week_start, is_break").order("week_start");
  const weeks = new Map<string, { first: string; last: string; n: number; breaks: number }>();
  for (const w of (weekRows ?? []) as { season_id: string; position: number | null; week_start: string; is_break: boolean }[]) {
    const cur = weeks.get(w.season_id) ?? { first: w.week_start, last: w.week_start, n: 0, breaks: 0 };
    cur.last = w.week_start;
    if (w.is_break) cur.breaks += 1;
    else cur.n += 1;
    weeks.set(w.season_id, cur);
  }

  return (
    <div className="enter mx-auto max-w-3xl p-4 pb-16 md:p-8 md:pb-16">
      <PageHeader
        title="Temporadas"
        subtitle="Una temporada pasa de borrador a inscripciones abiertas, luego en curso y finalmente cerrada."
      />
      <Flash error={searchParams.error} ok={searchParams.ok} />
      {searchParams.aviso && <Notice>{searchParams.aviso}</Notice>}

      <form action={crearTemporada} className="mb-5 grid gap-2 card p-4 md:grid-cols-[2fr_1fr_1fr_auto]">
        <input name="name" placeholder="Nombre (ej. 2026)" aria-label="Nombre" className={fieldClass} />
        <input name="start_date" type="date" aria-label="Inicio" className={fieldClass} />
        <input name="end_date" type="date" aria-label="Término" className={fieldClass} />
        <button className={primaryBtn}>Crear</button>
      </form>

      <section className="stagger space-y-3">
        {seasons.length === 0 && (
          <EmptyState icon="calendar" title="Todavía no hay temporadas">
            Crea la primera con el formulario de arriba.
          </EmptyState>
        )}
        {seasons.map((s) => {
          const next = NEXT[s.status];
          return (
            <article key={s.id} className="card card-hover p-4">
             <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-semibold">
                  <Icon name="calendar" className="h-4 w-4 text-brand-teal" />
                  {s.name}
                  <span className={`chip font-normal ${s.status === "en_curso" ? "bg-brand-green-50 text-brand-green-800" : s.status === "inscripciones" ? "bg-brand-teal-50 text-brand-teal-800" : "bg-stone-100 text-stone-600"}`}>{SEASON_LABEL[s.status]}</span>
                </h2>
                <p className="text-sm text-stone-500">
                  {fmt(s.start_date)} al {fmt(s.end_date)}
                </p>
                <p className="text-xs text-stone-400">
                  {weeks.get(s.id)
                    ? `Calendario: ${weeks.get(s.id)!.n} semanas desde el ${fmt(weeks.get(s.id)!.first)}${weeks.get(s.id)!.breaks ? ` (${weeks.get(s.id)!.breaks} de pausa)` : ""}`
                    : "Sin calendario de 36 semanas"}
                </p>
              </div>
              {next && (
                <form action={cambiarEstadoTemporada}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="status" value={next.to} />
                  <button className="btn btn-outline">
                    {next.label}
                  </button>
                </form>
              )}
             </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-brand-teal">{weeks.get(s.id) ? "Rehacer el calendario" : "Definir el calendario de 36 semanas"}</summary>
                <form action={definirCalendarioTemporada} className="mt-2 grid gap-2 md:grid-cols-2">
                  <input type="hidden" name="season_id" value={s.id} />
                  <label className="text-xs text-stone-500">
                    Primera semana (cualquier día de esa semana)
                    <input type="date" name="first_week" defaultValue={s.start_date} className={`${fieldClass} mt-1`} />
                  </label>
                  <label className="text-xs text-stone-500">
                    Semanas de pausa o feriado (opcional)
                    <textarea name="breaks" rows={2} placeholder="04/05/2026, 29/06/2026" className={`${fieldClass} mt-1 h-auto py-2`} />
                  </label>
                  <p className="text-xs text-stone-500 md:col-span-2">
                    Se numeran 36 semanas saltando las pausas. Los grupos que se planifiquen después usan estas fechas en su día de reunión; los ya planificados no cambian.
                  </p>
                  <div className="md:col-span-2"><button className={primaryBtn}>Guardar calendario</button></div>
                </form>
              </details>
            </article>
          );
        })}
      </section>
    </div>
  );
}
