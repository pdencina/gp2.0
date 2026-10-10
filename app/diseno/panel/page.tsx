import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { PanelView } from "@/components/PanelView";
import { navFor } from "@/lib/nav";
import type { Alert } from "@/lib/alerts";

// Panel con datos de ejemplo para revisar el diseño: solo en desarrollo (en producción responde 404).
export const dynamic = "force-dynamic";

const WEEKS = Array.from({ length: 12 }, (_, i) => {
  const total = 190 + i * 3;
  return { semana: new Date(Date.UTC(2026, 6, 6 + i * 7)).toISOString(), asistieron: Math.round(total * (0.62 + Math.sin(i / 2) * 0.08 + i * 0.006)), total, grupos: 24 };
});

const ALERTS = [
  { kind: "en_riesgo", severity: 3, person_id: "p1", person_name: "Ana Pérez", group_id: "g1", group_name: "Esperanza", detail: "3 ausencias de 3 permitidas" },
  { kind: "en_riesgo", severity: 2, person_id: "p2", person_name: "Luis Soto", group_id: "g1", group_name: "Esperanza", detail: "2 ausencias seguidas" },
  { kind: "nuevo", severity: 1, person_id: "p3", person_name: "Camila Rojas", group_id: "g2", group_name: "Fe Viva", detail: "Se inscribió hace 3 días" },
  { kind: "sin_lider", severity: 3, person_id: null, person_name: null, group_id: "g3", group_name: "Online Jueves", detail: "No tiene líder asignado" },
] as unknown as Alert[];

export default function DisenoPanel() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="min-h-screen md:flex">
      <Sidebar sections={navFor("admin", { pastor: true })} userName="Pablo Encina" roleLabel="Gran administrador" />
      <div className="min-w-0 flex-1">
        <PanelView
          role="admin"
          today={new Date("2026-10-10T12:00:00Z")}
          resumen={{ grupos_activos: 256, personas_activas: 2004, inscritos_activos: 2110, asistencia_4s: 78.4, asistencia_4s_previa: 79.5, sin_lider: 3, sin_monitor: 11, nuevos_30d: 142, aprobacion_historica: 83 }}
          semanal={WEEKS}
          curriculums={[
            { curriculum_id: "1", nombre: "AR Hombres", activo: true, grupos_activos: 40, personas_activas: 410, aprobados: 300, no_completaron: 60, asistencia_4s: 81 },
            { curriculum_id: "2", nombre: "Libro Morado", activo: true, grupos_activos: 22, personas_activas: 230, aprobados: 150, no_completaron: 70, asistencia_4s: 55 },
            { curriculum_id: "3", nombre: "Raíces", activo: false, grupos_activos: 0, personas_activas: 12, aprobados: 40, no_completaron: 8, asistencia_4s: null },
          ]}
          temporadas={Array.from({ length: 6 }, (_, i) => ({ temporada: `202${i} T1`, inicio: `202${i}-03-01`, grupos: 100 + i * 20, inscripciones: 900 + i * 150, personas: 800 + i * 120, aprobados: 500 + i * 70, no_completaron: 200 + i * 20 }))}
          continuidad={[
            { curriculum: "AR Hombres", ciclo: 1, aprobados: 120, continuaron: 90 },
            { curriculum: "Libro Morado", ciclo: 2, aprobados: 80, continuaron: 25 },
          ]}
          lideres={[
            { lider_id: "l1", nombre: "María González", grupos: 4, inscritos: 52, asistencia_4s: 40 },
            { lider_id: "l2", nombre: "Pedro Muñoz", grupos: 2, inscritos: 25, asistencia_4s: 82 },
            { lider_id: "l3", nombre: "Sofía Vera", grupos: 1, inscritos: 12, asistencia_4s: 70 },
          ]}
          dist={[
            { tipo: "modalidad", etiqueta: "virtual", n: 1300 },
            { tipo: "modalidad", etiqueta: "presencial", n: 704 },
            { tipo: "pais", etiqueta: "CL", n: 1200 },
            { tipo: "pais", etiqueta: "VE", n: 400 },
            { tipo: "pais", etiqueta: "UY", n: 200 },
          ]}
          alerts={ALERTS}
          cobertura={{ grupos_activos: 256, con_calendario: 180, sin_calendario: 76, sin_lider: 3, sin_respaldo: 140, sesiones_planificadas: 3200, sesiones_realizadas: 2900, sesiones_atrasadas: 18, sesiones_canceladas: 40, sesiones_con_respaldo: 33 }}
          formacion={{ personas_unicas: 5100, activos: 2004, pausados: 130, completados: 2200, reincorporados: 85, asistentes_30d: 1650, certificados_programa: 320, certificados_etapa: 410 }}
        />
      </div>
    </div>
  );
}
