import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { AwayCard } from "@/components/AwayCard";
import { Kpi, Bar } from "@/components/charts";
import { PageHeader } from "@/components/ui";
import { navFor } from "@/lib/nav";
import type { AwayRow } from "@/lib/reencuentro";

// Reencuentro con datos de ejemplo: solo en desarrollo (en producción responde 404).
export const dynamic = "force-dynamic";

async function noop() {
  "use server";
}

const base: AwayRow = {
  ce_id: "c1", person_id: "p1", person_name: "Ana María Pérez", phone: "+56912345678", guardian_phone: null, is_minor: false, accepts_comms: true,
  campus: "Puente Alto", curriculum_id: "x", curriculum: "AR Mujeres", formative_year: 1, last_activity: "2026-01-20", months_away: 8,
  last_result: "no_completo", last_cycle_no: 4, cycles_total: 11, last_group: "Esperanza", last_leader: "Marta Soto",
  modules_done: 3, modules_total: 11, units_done: 0, units_total: 36, finished_guess: false,
  contacts: 0, last_contact: null, last_outcome: null, follow_up_on: null, stage: "por_contactar", total: 5,
};

const ROWS: AwayRow[] = [
  base,
  { ...base, ce_id: "c2", person_name: "Luis Soto Vera", curriculum: "AR Hombres", formative_year: 2, campus: "Santiago centro", months_away: 14, last_result: "aprobado", last_cycle_no: 7, cycles_total: 13, modules_done: 7, modules_total: 13, units_done: 9, units_total: 36, last_group: "Roca", last_leader: "Pedro Muñoz", accepts_comms: false, contacts: 2, stage: "esperando", follow_up_on: null },
  { ...base, ce_id: "c3", person_name: "Camila Rojas", curriculum: "Libro Morado", months_away: 30, campus: null, phone: null, last_result: "no_completo", modules_done: 0, modules_total: 1, units_done: 0, units_total: 12, stage: "por_contactar" },
  { ...base, ce_id: "c4", person_name: "Matías Vera", curriculum: "AR Jóvenes", months_away: 5, is_minor: true, guardian_phone: "+56998765432", contacts: 1, stage: "en_camino", last_result: "aprobado", last_cycle_no: 2, cycles_total: 11 },
];

export default function DisenoReencuentro() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="min-h-screen md:flex">
      <Sidebar sections={navFor("admin", { pastor: true })} userName="Pablo Encina" roleLabel="Gran administrador" />
      <div className="min-w-0 flex-1">
        <div className="enter mx-auto max-w-5xl p-4 pb-16 md:p-8">
          <PageHeader
            eyebrow="Seguimiento"
            title="Reencuentro"
            subtitle="Personas que dejaron su camino a medias. Su avance sigue guardado: una conversación puede ayudarles a retomarlo, sin empezar de cero."
          />
          <div className="stagger mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Se alejaron" value="9.322" icon="users" sub="3 meses o más sin asistir" />
            <Kpi label="Por contactar" value="9.100" icon="phone" tone="alert" sub="aún sin una conversación" />
            <Kpi label="Quieren volver" value="42" icon="heart" sub="falta ayudarles con su grupo" />
            <Kpi label="Han vuelto" value="118" icon="check-circle" tone="good" sub="asistieron después de contactarlos" />
          </div>
          <section className="card mb-5 p-4">
            <h2 className="section-title mb-3">¿Hace cuánto?</h2>
            <ul className="grid gap-x-8 gap-y-2 md:grid-cols-2">
              {[["3 a 6 meses", 1329], ["6 meses a 1 año", 1108], ["1 a 2 años", 2468], ["Más de 2 años", 4293]].map(([l, n]) => (
                <li key={String(l)} className="p-1">
                  <span className="mb-1 flex items-baseline justify-between text-sm"><span>{l}</span><span className="font-semibold tabular">{Number(n).toLocaleString("es-CL")}</span></span>
                  <Bar value={Number(n)} max={4293} tone={Number(n) > 2000 ? "orange" : "teal"} />
                </li>
              ))}
            </ul>
          </section>
          <ul className="stagger space-y-3">
            {ROWS.map((r) => (
              <AwayCard
                key={r.ce_id}
                r={r}
                sender="Pablo Encina"
                here="/diseno/reencuentro"
                action={noop}
                history={r.contacts > 0 ? [{ id: "h" + r.ce_id, created_at: "2026-09-20T15:00:00Z", kind: "mensaje", outcome: r.stage === "en_camino" ? "quiere_volver" : "sin_respuesta", note: r.stage === "en_camino" ? "Quiere volver en marzo, con su papá" : null, follow_up_on: null, by_name: "Marta Soto" }] : []}
              />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
