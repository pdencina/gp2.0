export const WEEKDAYS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export type GroupOverview = {
  id: string;
  name: string;
  status: "abierto" | "en_curso" | "finalizado";
  season_id: string;
  season_name: string;
  season_status: string;
  cycle_id: string | null;
  cycle_number: number | null;
  cycle_title: string | null;
  curriculum_id: string;
  curriculum_name: string;
  leader_id: string | null;
  leader_name: string | null;
  monitor_id: string | null;
  monitor_name: string | null;
  weekday: number | null;
  start_time: string | null;
  end_time: string | null;
  modality: "presencial" | "virtual";
  address: string | null;
  capacity: number;
  continues_from: string | null;
  enrolled: number;
  version_id?: string | null;
  formative_year?: number;
  campus_id?: string | null;
  campus_name?: string | null;
  backup_leader_id?: string | null;
  backup_leader_name?: string | null;
};

const hm = (t: string | null) => (t ? t.slice(0, 5) : "");

export function scheduleLabel(g: Pick<GroupOverview, "weekday" | "start_time" | "end_time" | "modality">): string {
  const day = g.weekday ? WEEKDAYS[g.weekday] : "";
  const hours = g.start_time ? `${hm(g.start_time)}${g.end_time ? `–${hm(g.end_time)}` : ""}` : "";
  const parts = [[day, hours].filter(Boolean).join(" "), g.modality === "virtual" ? "Virtual" : "Presencial"];
  return parts.filter(Boolean).join(" · ");
}

export const GROUP_STATUS_LABEL: Record<GroupOverview["status"], string> = {
  abierto: "Abierto",
  en_curso: "En curso",
  finalizado: "Finalizado",
};

export const ENROLLMENT_LABEL: Record<string, string> = {
  preinscrito: "Preinscrito",
  en_curso: "En curso",
  aprobado: "Aprobado",
  no_completo: "No completó",
  cancelado: "Cancelado",
  no_participo: "No participó",
};

export const SEASON_LABEL: Record<string, string> = {
  borrador: "Borrador",
  inscripciones: "Inscripciones abiertas",
  en_curso: "En curso",
  cerrada: "Cerrada",
};

export const AUDIENCE_LABEL: Record<string, string> = {
  todos: "Todos",
  hombres: "Hombres",
  mujeres: "Mujeres",
  parejas: "Parejas",
};

export const todayInChile = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
