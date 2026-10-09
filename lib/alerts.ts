export type Alert = {
  kind: "ausente" | "nuevo" | "asistencia_baja" | "sin_reunion" | "sin_lider" | "sin_monitor";
  severity: number;
  group_id: string;
  group_name: string;
  student_id: string | null;
  student_name: string | null;
  detail: string;
  since: string;
};

export const ALERT_LABEL: Record<Alert["kind"], string> = {
  ausente: "Faltas seguidas",
  nuevo: "Persona nueva",
  asistencia_baja: "Asistencia baja",
  sin_reunion: "Sin reunión",
  sin_lider: "Sin líder",
  sin_monitor: "Sin monitor",
};

// Color del chip según la urgencia (3 alta, 2 media, 1 baja).
export const SEVERITY_CLASS: Record<number, string> = {
  3: "bg-red-50 text-red-700",
  2: "bg-amber-50 text-amber-800",
  1: "bg-stone-100 text-stone-600",
};
