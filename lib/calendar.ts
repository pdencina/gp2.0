// Calendario de sesiones de un grupo (supabase/v2/008_calendario.sql).

export type SessionStatus = "planificada" | "realizada" | "cancelada" | "reprogramada";

export type Session = {
  id: string;
  held_on: string; // YYYY-MM-DD
  season_week: number | null;
  status: SessionStatus;
  slot_id: string | null;
  facilitator_id: string | null;
  cancel_reason: string | null;
  rescheduled_from: string | null;
  modality: "presencial" | "virtual" | null;
};

export const SESSION_LABEL: Record<SessionStatus, string> = {
  planificada: "Planificada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  reprogramada: "Reprogramada",
};

export const SESSION_STYLE: Record<SessionStatus, string> = {
  planificada: "bg-stone-100 text-stone-600",
  realizada: "bg-green-50 text-green-800",
  cancelada: "bg-red-50 text-red-700",
  reprogramada: "bg-amber-50 text-amber-800",
};

export const isPending = (s: Pick<Session, "status">) => s.status === "planificada" || s.status === "reprogramada";

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export type CalendarSummary = {
  planned: number; // planificadas hasta hoy (sin contar canceladas)
  done: number;
  overdue: number; // pendientes de hace más de 7 días
  cancelled: number;
  upcoming: number;
  next: Session | null;
  withBackup: number;
};

export function summarizeSessions(sessions: Session[], today: string, backupId: string | null = null, leaderId: string | null = null): CalendarSummary {
  const numbered = sessions.filter((s) => s.season_week !== null);
  const sorted = [...numbered].sort((a, b) => a.held_on.localeCompare(b.held_on));
  return {
    planned: numbered.filter((s) => s.status !== "cancelada" && s.held_on <= today).length,
    done: numbered.filter((s) => s.status === "realizada").length,
    overdue: numbered.filter((s) => isPending(s) && s.held_on < addDays(today, -7)).length,
    cancelled: numbered.filter((s) => s.status === "cancelada").length,
    upcoming: numbered.filter((s) => isPending(s) && s.held_on >= today).length,
    next: sorted.find((s) => isPending(s) && s.held_on >= today) ?? null,
    withBackup: backupId
      ? numbered.filter((s) => s.status === "realizada" && s.facilitator_id === backupId && backupId !== leaderId).length
      : 0,
  };
}

// Acepta "2026-05-04" o "04/05/2026", separados por comas, espacios o saltos de línea.
export function parseDates(input: string): { dates: string[]; invalid: string[] } {
  const dates: string[] = [];
  const invalid: string[] = [];
  for (const raw of input.split(/[\s,;]+/).filter(Boolean)) {
    let iso: string | null = null;
    let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) iso = raw;
    else if ((m = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    const valid = iso !== null && !Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) && new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso;
    if (valid && iso) {
      if (!dates.includes(iso)) dates.push(iso);
    } else invalid.push(raw);
  }
  return { dates: dates.sort(), invalid };
}

export const dayMonth = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const WEEKDAY = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export const weekdayName = (iso: string) => WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()];
