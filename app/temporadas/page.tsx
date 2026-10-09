import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { SEASON_LABEL } from "@/lib/format";
import { AppHeader } from "@/components/AppHeader";
import { Flash, fieldClass, primaryBtn } from "@/components/Flash";
import { cambiarEstadoTemporada, crearTemporada } from "@/app/actions/gestion";

export const dynamic = "force-dynamic";

type Season = { id: string; name: string; start_date: string; end_date: string; status: string };

const NEXT: Record<string, { to: string; label: string } | undefined> = {
  borrador: { to: "inscripciones", label: "Abrir inscripciones" },
  inscripciones: { to: "en_curso", label: "Iniciar temporada" },
  en_curso: { to: "cerrada", label: "Cerrar temporada" },
};

const fmt = (d: string) => d.split("-").reverse().join("/");

export default async function TemporadasPage(props: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const searchParams = await props.searchParams;
  const { supabase, role } = await getSession();
  if (role !== "admin") redirect("/inicio");

  const { data } = await supabase.from("seasons").select("id, name, start_date, end_date, status").order("start_date", { ascending: false });
  const seasons = (data ?? []) as Season[];

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <AppHeader role={role} />
      <h1 className="text-2xl font-medium">Temporadas</h1>
      <p className="mb-5 mt-1 text-sm text-stone-500">
        Una temporada pasa de borrador a inscripciones abiertas, luego en curso y finalmente cerrada.
      </p>
      <Flash error={searchParams.error} ok={searchParams.ok} />

      <form action={crearTemporada} className="mb-5 grid gap-2 rounded-xl border border-stone-200 bg-white p-4 md:grid-cols-[2fr_1fr_1fr_auto]">
        <input name="name" placeholder="Nombre (ej. 2026)" aria-label="Nombre" className={fieldClass} />
        <input name="start_date" type="date" aria-label="Inicio" className={fieldClass} />
        <input name="end_date" type="date" aria-label="Término" className={fieldClass} />
        <button className={primaryBtn}>Crear</button>
      </form>

      <section className="space-y-3">
        {seasons.length === 0 && (
          <p className="rounded-xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
            Todavía no hay temporadas. Crea la primera arriba.
          </p>
        )}
        {seasons.map((s) => {
          const next = NEXT[s.status];
          return (
            <article key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4">
              <div>
                <h2 className="font-medium">{s.name}</h2>
                <p className="text-sm text-stone-500">
                  {fmt(s.start_date)} al {fmt(s.end_date)} · {SEASON_LABEL[s.status]}
                </p>
              </div>
              {next && (
                <form action={cambiarEstadoTemporada}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="status" value={next.to} />
                  <button className="h-10 rounded-lg border border-brand-teal px-3 text-sm text-brand-teal hover:bg-brand-teal hover:text-white">
                    {next.label}
                  </button>
                </form>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
