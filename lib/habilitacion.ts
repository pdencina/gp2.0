// Reconciliación de datos y habilitación por sede (supabase/v2/011_habilitacion.sql).

export type ReconRow = {
  area: string;
  chequeo: string;
  esperado: number | string | null;
  actual: number | string | null;
  estado: "ok" | "revisar" | "error" | "info";
  detalle: string;
};

export type CampusRow = {
  campus_id: string | null;
  campus: string;
  gp2_status: "preparacion" | "piloto" | "habilitada" | null;
  gp2_status_at: string | null;
  grupos_activos: number;
  sin_lider: number;
  sin_respaldo: number;
  sin_calendario: number;
  sesiones_atrasadas: number;
  personas: number;
  pastores: number;
  listo: boolean;
  pendientes: string[];
};

export const STAGE_LABEL: Record<NonNullable<CampusRow["gp2_status"]>, string> = {
  preparacion: "En preparación",
  piloto: "Piloto",
  habilitada: "Habilitada",
};

export const STAGE_STYLE: Record<NonNullable<CampusRow["gp2_status"]>, string> = {
  preparacion: "bg-stone-100 text-stone-600",
  piloto: "bg-amber-50 text-amber-800",
  habilitada: "bg-green-100 text-green-900",
};

export const STATE_STYLE: Record<ReconRow["estado"], string> = {
  ok: "bg-green-50 text-green-800",
  revisar: "bg-amber-50 text-amber-800",
  error: "bg-red-50 text-red-700",
  info: "bg-stone-100 text-stone-600",
};

export const STATE_LABEL: Record<ReconRow["estado"], string> = {
  ok: "Bien",
  revisar: "Revisar",
  error: "Problema",
  info: "Para mirar",
};

const num = (v: number | string | null) => (v === null || v === undefined || v === "" ? null : Number(v));
export const fmtNum = (v: number | string | null) => (num(v) === null ? "—" : num(v)!.toLocaleString("es-CL"));

export type ReconSummary = { ok: number; revisar: number; error: number; info: number; clean: boolean };

export function summarize(rows: ReconRow[]): ReconSummary {
  const s = { ok: 0, revisar: 0, error: 0, info: 0 };
  for (const r of rows) s[r.estado] += 1;
  return { ...s, clean: s.error === 0 && s.revisar === 0 };
}

export function groupByArea(rows: ReconRow[]): [string, ReconRow[]][] {
  const map = new Map<string, ReconRow[]>();
  for (const r of rows) map.set(r.area, [...(map.get(r.area) ?? []), r]);
  return Array.from(map.entries());
}

/** Frase para la cabecera de la sede: qué falta, o que está lista. */
export function campusHeadline(c: Pick<CampusRow, "listo" | "pendientes" | "grupos_activos" | "campus_id">): string {
  if (c.campus_id === null) return c.grupos_activos > 0 ? "Hay grupos activos sin sede: asígnales una." : "";
  if (c.grupos_activos === 0) return "Todavía no tiene grupos activos.";
  if (c.listo) return "Lista para habilitarse.";
  return `Falta: ${c.pendientes.join("; ")}.`;
}
