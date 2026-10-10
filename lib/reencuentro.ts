import { whatsappLink } from "./phone";

// Reencuentro: recuperar a quienes dejaron su camino a medias (014_reencuentro.sql)

export type Stage = "por_contactar" | "esperando" | "agendado" | "en_camino" | "cerrado" | "dato_incorrecto";
export type Outcome = "sin_respuesta" | "quiere_volver" | "mas_adelante" | "no_continuara" | "dato_incorrecto";
export type Kind = "mensaje" | "llamada" | "visita" | "correo";

export type AwayRow = {
  ce_id: string;
  person_id: string;
  person_name: string;
  phone: string | null;
  guardian_phone: string | null;
  is_minor: boolean;
  accepts_comms: boolean;
  campus: string | null;
  curriculum_id: string;
  curriculum: string;
  formative_year: number;
  last_activity: string;
  months_away: number;
  last_result: string | null;
  last_cycle_no: number | null;
  cycles_total: number | null;
  last_group: string | null;
  last_leader: string | null;
  modules_done: number;
  modules_total: number;
  units_done: number;
  units_total: number;
  finished_guess: boolean;
  contacts: number;
  last_contact: string | null;
  last_outcome: Outcome | null;
  follow_up_on: string | null;
  stage: Stage;
  total: number | string;
};

export type Summary = {
  total: number;
  por_contactar: number;
  esperando: number;
  agendado: number;
  en_camino: number;
  cerrado: number;
  dato_incorrecto: number;
  m3_6: number;
  m6_12: number;
  m12_24: number;
  m24_mas: number;
  contactados_30d: number;
  recuperados: number;
};

export const STAGES: Stage[] = ["por_contactar", "esperando", "agendado", "en_camino", "dato_incorrecto", "cerrado"];

export const STAGE_LABEL: Record<Stage, string> = {
  por_contactar: "Por contactar",
  esperando: "Esperando respuesta",
  agendado: "Con seguimiento agendado",
  en_camino: "Quiere volver",
  dato_incorrecto: "Datos por corregir",
  cerrado: "No continuará",
};

export const STAGE_HELP: Record<Stage, string> = {
  por_contactar: "Nadie los ha contactado, o ya pasó el tiempo de espera.",
  esperando: "Se les escribió hace poco y todavía no responden.",
  agendado: "Pidieron más tiempo: hay una fecha para volver a escribirles.",
  en_camino: "Dijeron que quieren retomar: falta ayudarles a elegir su grupo.",
  dato_incorrecto: "El teléfono o el correo no funcionó: hay que corregirlo.",
  cerrado: "Dijeron que no continuarán. No se les insiste.",
};

export const STAGE_STYLE: Record<Stage, string> = {
  por_contactar: "bg-amber-50 text-amber-800",
  esperando: "bg-stone-100 text-stone-600",
  agendado: "bg-brand-teal-50 text-brand-teal-800",
  en_camino: "bg-brand-green-50 text-brand-green-800",
  dato_incorrecto: "bg-red-50 text-red-700",
  cerrado: "bg-stone-100 text-stone-500",
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  sin_respuesta: "No respondió",
  quiere_volver: "Quiere volver",
  mas_adelante: "Más adelante",
  no_continuara: "No continuará",
  dato_incorrecto: "El dato no sirve",
};

export const KIND_LABEL: Record<Kind, string> = {
  mensaje: "Mensaje",
  llamada: "Llamada",
  visita: "Visita",
  correo: "Correo",
};

export const MONTH_WINDOWS: { value: number; label: string }[] = [
  { value: 3, label: "3 meses o más" },
  { value: 6, label: "6 meses o más" },
  { value: 12, label: "1 año o más" },
  { value: 24, label: "2 años o más" },
];

export function awayLabel(months: number): string {
  if (months < 1) return "Menos de un mes";
  if (months < 12) return `Hace ${months} ${months === 1 ? "mes" : "meses"}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (rest === 0) return `Hace ${years} ${years === 1 ? "año" : "años"}`;
  return `Hace ${years} ${years === 1 ? "año" : "años"} y ${rest} ${rest === 1 ? "mes" : "meses"}`;
}

export const RESULT_LABEL: Record<string, string> = {
  aprobado: "Aprobó su último módulo",
  no_completo: "No alcanzó a completar su último módulo",
  en_curso: "Estaba en curso",
  preinscrito: "Estaba preinscrito",
  no_participo: "No llegó a participar",
};

/** Cuánto avanzó, en palabras: unidades acreditadas, o módulos aprobados en la plataforma anterior. */
export function progressLine(r: Pick<AwayRow, "units_done" | "units_total" | "modules_done" | "modules_total">): string {
  if (r.units_done > 0 && r.units_total > 0) return `${r.units_done} de ${r.units_total} unidades acreditadas`;
  if (r.modules_done > 0 && r.modules_total > 0) {
    const unit = r.modules_total === 1 ? "módulo aprobado" : "módulos aprobados";
    return `${r.modules_done} de ${r.modules_total} ${unit} (plataforma anterior)`;
  }
  return "Sin avance acreditado todavía";
}

const first = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

/** A quién se escribe: a una persona menor de edad, a su tutor si hay teléfono; si no, a la propia persona. */
export function contactNumber(r: Pick<AwayRow, "is_minor" | "phone" | "guardian_phone">): { phone: string | null; toGuardian: boolean } {
  if (r.is_minor && r.guardian_phone) return { phone: r.guardian_phone, toGuardian: true };
  return { phone: r.phone ?? null, toGuardian: false };
}

/** Mensaje de partida para WhatsApp: cálido, sin presión y recordando que el avance se conserva. */
export function outreachMessage(r: Pick<AwayRow, "person_name" | "curriculum" | "is_minor" | "guardian_phone">, sender: string): string {
  const who = first(r.person_name);
  const me = first(sender);
  const intro = me ? `Soy ${me} de Grupos Pequeños.` : "Te escribo de Grupos Pequeños.";
  if (r.is_minor && r.guardian_phone) {
    return `Hola, ¿cómo está? ${intro} Le escribo por ${who}, que participaba en ${r.curriculum}. Su avance sigue guardado y puede retomarlo cuando quiera, sin empezar de cero. ¿Le parece si conversamos?`;
  }
  return `Hola ${who}, ¿cómo estás? ${intro} Hace un tiempo caminabas en ${r.curriculum} y te recordamos con cariño. Tu avance sigue guardado: puedes retomarlo cuando quieras, sin empezar de cero. ¿Te gustaría que conversemos?`;
}

export function whatsappFor(r: AwayRow, sender: string): string | null {
  const { phone } = contactNumber(r);
  return phone ? whatsappLink(phone, outreachMessage(r, sender)) : null;
}
