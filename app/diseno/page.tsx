import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { navFor } from "@/lib/nav";
import { Kpi, Card, LineChart, StackedColumns, Legend, Bar } from "@/components/charts";
import { Avatar, Callout, Dot, EmptyState, PageHeader, ProgressBar, ProgressRing } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { AttendanceList } from "@/components/AttendanceList";
import { Flash, Notice } from "@/components/Flash";

// Galería del sistema de diseño: solo en desarrollo (en producción responde 404).
export const dynamic = "force-dynamic";

const GRID = Array.from({ length: 36 }, (_, i) => ({
  week: i + 1,
  state: i < 9 ? "hecha" : i === 9 ? "parcial" : i < 12 ? "pendiente" : i % 7 === 0 ? "sin_unidades" : "pendiente",
}));

export default function Diseno() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="min-h-screen md:flex">
      <Sidebar sections={navFor("admin", { pastor: true })} userName="Pablo Encina" roleLabel="Gran administrador" />
      <div className="min-w-0 flex-1">
        <div className="enter mx-auto max-w-5xl p-4 pb-16 md:p-8">
          <PageHeader
            eyebrow="Sistema de diseño"
            title="Mi progreso"
            subtitle="Tu camino en cada programa. Se conserva aunque cambies de grupo, de horario o de modalidad."
            back={{ href: "/inicio", label: "Inicio" }}
            actions={
              <>
                <button className="btn btn-secondary">
                  <Icon name="plus" className="h-4 w-4" />
                  Otro programa
                </button>
                <button className="btn btn-primary">Guardar</button>
              </>
            }
          />

          <Flash error="No tienes permiso para hacer este cambio." />
          <Notice>Certificado emitido.</Notice>

          <div className="stagger mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Grupos activos" value="256" icon="grid" href="/grupos" />
            <Kpi label="Personas inscritas" value="2.004" icon="users" delta={{ text: "+4,2 pts", tone: "up" }} sub="vs 4 semanas" />
            <Kpi label="Asistencia, 4 semanas" value="78,4 %" icon="chart" delta={{ text: "−1,1 pts", tone: "down" }} />
            <Kpi label="Avisos" value="24" sub="6 urgentes" tone="alert" icon="bell" href="/alertas" />
          </div>

          <div className="mb-6 space-y-3">
            <Callout tone="warn" href="/perfil" action="Completar">Completa tu perfil para poder inscribirte.</Callout>
            <Callout tone="info">Los certificados ya emitidos guardan la regla con la que se emitieron.</Callout>
            <Callout tone="success">Tu inscripción quedó confirmada.</Callout>
            <Callout tone="danger">Hay 3 problemas en la reconciliación de datos.</Callout>
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-2">
            <section className="card p-5">
              <h2 className="section-title mb-4">Botones y etiquetas</h2>
              <div className="mb-4 flex flex-wrap gap-2">
                <button className="btn btn-primary">Principal</button>
                <button className="btn btn-outline">Contorno</button>
                <button className="btn btn-secondary">Secundario</button>
                <button className="btn btn-ghost">Discreto</button>
                <button className="btn btn-danger">Peligro</button>
                <button className="btn btn-primary btn-sm">Pequeño</button>
                <button className="btn btn-primary" disabled>Deshabilitado</button>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="chip bg-brand-green-50 text-brand-green-800"><Dot tone="green" />Cumplido</span>
                <span className="chip bg-amber-50 text-amber-800"><Dot tone="amber" />Pausado</span>
                <span className="chip bg-red-50 text-red-700"><Dot tone="red" />Urgente</span>
                <span className="chip bg-brand-teal-50 text-brand-teal-800">En revisión</span>
                <span className="chip bg-stone-100 text-stone-600">Archivado</span>
              </div>
            </section>

            <section className="card p-5">
              <h2 className="section-title mb-4">Formulario</h2>
              <div className="space-y-3">
                <div>
                  <label className="label">Correo</label>
                  <input className="input" placeholder="nombre@correo.com" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Modalidad</label>
                    <select className="input" defaultValue="virtual">
                      <option value="virtual">Online</option>
                      <option value="presencial">Presencial</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Día</label>
                    <input className="input" type="date" />
                  </div>
                </div>
                <textarea className="input" rows={2} placeholder="Una nota para tu líder" />
              </div>
            </section>
          </div>

          <section className="mb-6">
            <h2 className="section-title mb-3">Tu camino</h2>
            <ul className="stagger grid gap-3 md:grid-cols-2">
              {[
                { name: "AR Hombres", pct: 64, state: "En curso", next: "Sigue: Identidad en Cristo", group: "Grupo Esperanza · Martes 19:00" },
                { name: "Libro Morado", pct: 100, state: "Completado", next: "Completaste todas las unidades", group: "Grupo Online · Jueves 20:00" },
              ].map((p) => (
                <li key={p.name} className="card card-hover p-5">
                  <div className="flex items-start gap-4">
                    <ProgressRing value={p.pct} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold">{p.name}</h3>
                        <span className="chip bg-brand-green-50 text-brand-green-800">{p.state}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-stone-500">{p.next}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3 text-sm">
                    <span className="flex items-center gap-1.5 text-stone-600"><Icon name="video" className="h-4 w-4 text-brand-teal" />{p.group}</span>
                    <span className="chip bg-brand-teal-50 text-brand-teal-800"><Icon name="calendar-check" className="h-3.5 w-3.5" />martes 14/10</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <div className="mb-6 grid gap-4 md:grid-cols-2">
            <section className="card p-5">
              <h2 className="section-title mb-1">Tus encuentros del año 1</h2>
              <p className="mb-3 text-xs text-stone-500">Verde: acreditadas · Azul: parcial · Borde: pendiente · Punteado: sin unidades</p>
              <ol className="grid grid-cols-6 gap-1.5 sm:grid-cols-9">
                {GRID.map((g) => (
                  <li
                    key={g.week}
                    className={`flex h-9 items-center justify-center rounded-lg text-xs font-medium transition hover:scale-110 ${
                      g.state === "hecha" ? "bg-brand-green text-white" : g.state === "parcial" ? "bg-brand-teal/25 text-brand-teal-800" : g.state === "pendiente" ? "border border-stone-300 text-stone-600" : "border border-dashed border-stone-200 text-stone-300"
                    }`}
                  >
                    {g.week}
                  </li>
                ))}
              </ol>
              <div className="mt-4 space-y-2.5">
                <ProgressBar value={72} label="Año 1" />
                <Bar value={45} tone="orange" />
                <Bar value={88} tone="teal" />
              </div>
            </section>
            <section className="space-y-4">
              <EmptyState icon="route" title="Aún no estás en un programa" action={{ href: "/catalogo", label: "Ver los programas" }}>
                Elige el programa que quieres cursar y después tu grupo.
              </EmptyState>
              <div className="card p-5">
                <h2 className="section-title mb-3">Cargando…</h2>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3 border-b border-stone-100 py-3 last:border-0">
                    <div className="skeleton h-9 w-9 !rounded-full" />
                    <div className="flex-1"><div className="skeleton mb-2 h-3.5 w-1/3" /><div className="skeleton h-3 w-1/2" /></div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <Card title="Asistencia semana a semana" subtitle="Porcentaje de inscritos que asistieron">
              <LineChart
                points={Array.from({ length: 12 }, (_, i) => ({ label: `${i + 1} mar`, value: 62 + Math.round(Math.sin(i / 1.6) * 12) + i, detail: "120 de 190 · 24 grupos" }))}
              />
            </Card>
            <Card title="Evolución por temporada" subtitle="Inscripciones y cómo terminaron">
              <StackedColumns data={Array.from({ length: 8 }, (_, i) => ({ label: `${20 + i} T${(i % 3) + 1}`, ok: 120 + i * 18, no: 60 + (i % 3) * 14, rest: 20 + i * 6 }))} />
              <Legend items={[{ label: "Aprobaron", tone: "green" }, { label: "No completaron", tone: "stone" }, { label: "En curso", tone: "teal" }]} />
            </Card>
          </div>

          <section className="mb-6">
            <h2 className="section-title mb-3">Pasar lista</h2>
            <AttendanceList
              members={[{ id: "1", name: "Ana Pérez" }, { id: "2", name: "Luis Soto" }, { id: "3", name: "Camila Rojas" }, { id: "4", name: "Matías Vera" }]}
              initial={{ "1": "presente", "3": "justificado" }}
            />
          </section>

          <div className="flex items-center gap-3">
            <Avatar name="Ana Pérez" size="lg" />
            <Avatar name="Luis Soto" />
            <Avatar name="Camila Rojas" size="sm" />
            <Avatar name="Matías Vera" />
          </div>
        </div>
      </div>
    </div>
  );
}
