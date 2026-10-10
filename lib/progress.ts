// Tipos y utilidades de "Mi progreso" (inscripción curricular continua).

export type CeStatus = "activo" | "pausado" | "completado" | "cancelado";

export const CE_LABEL: Record<CeStatus, string> = {
  activo: "En curso",
  pausado: "Pausado",
  completado: "Completado",
  cancelado: "Cancelado",
};

export const CE_STYLE: Record<CeStatus, string> = {
  activo: "bg-green-50 text-green-800",
  pausado: "bg-amber-50 text-amber-800",
  completado: "bg-brand-teal/10 text-brand-teal",
  cancelado: "bg-stone-100 text-stone-500",
};

export type CurriculumProgress = {
  units_total: number;
  units_done: number;
  pct: number | null;
  next_unit_id: string | null;
  next_unit_title: string | null;
  last_unit_title: string | null;
  stage_credits: number;
};

export type CurriculumEnrollment = {
  id: string;
  curriculum_id: string;
  status: CeStatus;
  formative_year: number;
  started_at: string;
  paused_at: string | null;
  pause_reason: string | null;
  imported: boolean;
};

export type CompatibleGroup = {
  group_id: string;
  name: string;
  modality: "presencial" | "virtual";
  campus: string | null;
  weekday: number | null;
  start_time: string | null;
  end_time: string | null;
  capacity_left: number;
  leader_name: string | null;
};

// El porcentaje llega como número o como texto según el driver; se normaliza.
export function normalizeProgress(row: Partial<CurriculumProgress> | null | undefined): CurriculumProgress {
  const r = row ?? {};
  return {
    units_total: Number(r.units_total ?? 0),
    units_done: Number(r.units_done ?? 0),
    pct: r.pct == null ? null : Number(r.pct),
    next_unit_id: r.next_unit_id ?? null,
    next_unit_title: r.next_unit_title ?? null,
    last_unit_title: r.last_unit_title ?? null,
    stage_credits: Number(r.stage_credits ?? 0),
  };
}

export function progressSummary(p: CurriculumProgress): string {
  if (p.units_total === 0) return "Este programa todavía no tiene unidades cargadas.";
  return `${p.units_done} de ${p.units_total} unidades`;
}
