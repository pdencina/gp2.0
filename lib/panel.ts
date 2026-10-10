// Tipos y formato para el panel de seguimiento (consultas de supabase/v2/005_panel.sql).

export type Resumen = {
  grupos_activos: number;
  personas_activas: number;
  inscritos_activos: number;
  asistencia_4s: number | null;
  asistencia_4s_previa: number | null;
  sin_lider: number;
  sin_monitor: number;
  nuevos_30d: number;
  aprobacion_historica: number | null;
};
export type Semana = { semana: string; asistieron: number; total: number; grupos: number };
export type CurriculumRow = {
  curriculum_id: string; nombre: string; activo: boolean;
  grupos_activos: number; personas_activas: number; aprobados: number; no_completaron: number; asistencia_4s: number | null;
};
export type TemporadaRow = {
  temporada: string; inicio: string; grupos: number; inscripciones: number; personas: number; aprobados: number; no_completaron: number;
};
export type ContinuidadRow = { curriculum: string; ciclo: number; aprobados: number; continuaron: number };
export type LiderRow = { lider_id: string; nombre: string; grupos: number; inscritos: number; asistencia_4s: number | null };
export type DistribucionRow = { tipo: "modalidad" | "pais"; etiqueta: string; n: number };

/** PostgREST entrega los decimales como número o como texto según la versión: se normaliza. */
export const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("es-CL"));
export const pct = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined ? "—" : `${n.toFixed(digits).replace(".", ",")} %`;

/** Porcentaje entero de a sobre b (null si b es 0). */
export const ratio = (a: number, b: number): number | null => (b > 0 ? (100 * a) / b : null);

/** Diferencia en puntos porcentuales entre dos valores, con signo y coma decimal. */
export function pointsDelta(now: number | null, before: number | null): { text: string; tone: "up" | "down" | "flat" } | null {
  if (now === null || before === null) return null;
  const d = Math.round((now - before) * 10) / 10;
  if (d === 0) return { text: "igual que antes", tone: "flat" };
  return { text: `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1).replace(".", ",")} pts`, tone: d > 0 ? "up" : "down" };
}

const COUNTRY_NAMES: Record<string, string> = {
  CL: "Chile", VE: "Venezuela", UY: "Uruguay", US: "Estados Unidos", CO: "Colombia", AR: "Argentina", PE: "Perú",
  MX: "México", BR: "Brasil", EC: "Ecuador", BO: "Bolivia", PY: "Paraguay", ES: "España", DO: "R. Dominicana",
  NI: "Nicaragua", PA: "Panamá", CR: "Costa Rica", GT: "Guatemala", HN: "Honduras", SV: "El Salvador", CU: "Cuba",
};
export const countryName = (code: string) => (code === "sin dato" ? "Sin dato" : COUNTRY_NAMES[code] ?? code);

/** "2026-07-13" -> "13 jul" */
export function shortDate(iso: string): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

/** "2023 · T2" -> "23 T2"; "2026" -> "2026" */
export function shortSeason(name: string): string {
  const m = name.match(/^(\d{4}) · T(\d)$/);
  return m ? `${m[1].slice(2)} T${m[2]}` : name;
}
