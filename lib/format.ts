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

// Zonas horarias que se ofrecen para los grupos (los online reúnen a personas de varios países)
export const TIMEZONES: [string, string][] = [
  ["America/Santiago", "Chile continental"],
  ["America/Punta_Arenas", "Punta Arenas"],
  ["America/Montevideo", "Uruguay"],
  ["America/Caracas", "Venezuela"],
  ["America/Bogota", "Colombia"],
  ["America/Lima", "Perú"],
  ["America/Argentina/Buenos_Aires", "Argentina"],
  ["America/Mexico_City", "México (centro)"],
  ["America/New_York", "Este de EE. UU. (Miami)"],
  ["America/Chicago", "Centro de EE. UU. (Katy)"],
  ["Europe/Madrid", "España"],
];

export const timezoneLabel = (tz: string | null | undefined) =>
  TIMEZONES.find(([v]) => v === tz)?.[1] ?? tz ?? "";

/** La hora de una reunión (HH:MM, en la zona del grupo) vista en otra zona, en el día de referencia dado. */
export function inZone(hhmm: string, fromZone: string, toZone: string, day = new Date()): string {
  if (!hhmm || fromZone === toZone) return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  const y = day.getUTCFullYear();
  const mo = String(day.getUTCMonth() + 1).padStart(2, "0");
  const d = String(day.getUTCDate()).padStart(2, "0");
  // Se busca el instante UTC que en la zona de origen marca esa hora, y se muestra en la zona de destino
  const wanted = Date.parse(`${y}-${mo}-${d}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
  const fmt = (zone: string, t: number) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date(t)).reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {});
  const asUtc = (p: Record<string, string>) => Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}:00Z`);
  const offsetFrom = asUtc(fmt(fromZone, wanted)) - wanted;
  const instant = wanted - offsetFrom;
  const to = fmt(toZone, instant);
  return `${to.hour === "24" ? "00" : to.hour}:${to.minute}`;
}
