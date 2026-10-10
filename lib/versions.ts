// Versiones de un currículum y su flujo editorial (supabase/v2/009_biblioteca.sql).
// cargado → en adaptación → en revisión pastoral → aprobado → publicado → archivado

export type EditorialStatus =
  | "cargado"
  | "en_adaptacion"
  | "en_revision_pastoral"
  | "aprobado"
  | "publicado"
  | "archivado";

export type VersionRow = {
  id: string;
  curriculum_id: string;
  version: number;
  label: string | null;
  status: EditorialStatus;
  is_current: boolean;
  content_frozen: boolean;
  source_note: string | null;
  approved_at: string | null;
  published_at: string | null;
};

export const STATUS_LABEL: Record<EditorialStatus, string> = {
  cargado: "Cargado",
  en_adaptacion: "En adaptación",
  en_revision_pastoral: "En revisión pastoral",
  aprobado: "Aprobado",
  publicado: "Publicado",
  archivado: "Archivado",
};

export const STATUS_STYLE: Record<EditorialStatus, string> = {
  cargado: "bg-stone-100 text-stone-600",
  en_adaptacion: "bg-amber-50 text-amber-800",
  en_revision_pastoral: "bg-brand-teal/10 text-brand-teal",
  aprobado: "bg-green-50 text-green-800",
  publicado: "bg-green-100 text-green-900",
  archivado: "bg-stone-100 text-stone-400",
};

// Mismo criterio que version_is_editable() en la base de datos
export const isEditable = (v: Pick<VersionRow, "status" | "content_frozen">) =>
  !v.content_frozen && ["cargado", "en_adaptacion", "publicado"].includes(v.status);

// Una versión publicada que nunca pasó por el flujo (la que trajo la migración)
export const isLegacy = (v: Pick<VersionRow, "status" | "content_frozen">) => v.status === "publicado" && !v.content_frozen;

export type Step = { to: EditorialStatus; label: string; tone: "primary" | "neutral" | "warn"; needsNote: boolean };

export function availableSteps(
  status: EditorialStatus,
  who: { isAdmin: boolean; isCoordinator: boolean; isReviewer: boolean },
): Step[] {
  const editor = who.isAdmin || who.isCoordinator || who.isReviewer;
  const approver = who.isAdmin || who.isReviewer;
  const steps: Step[] = [];
  if (status === "cargado" && editor) steps.push({ to: "en_adaptacion", label: "Empezar la adaptación", tone: "primary", needsNote: false });
  if (status === "en_adaptacion" && editor) steps.push({ to: "en_revision_pastoral", label: "Enviar a revisión pastoral", tone: "primary", needsNote: false });
  if (status === "en_revision_pastoral" && approver) {
    steps.push({ to: "aprobado", label: "Aprobar", tone: "primary", needsNote: false });
    steps.push({ to: "en_adaptacion", label: "Devolver a adaptación", tone: "warn", needsNote: true });
  }
  if (status === "aprobado" && approver) {
    steps.push({ to: "publicado", label: "Publicar", tone: "primary", needsNote: false });
    steps.push({ to: "en_adaptacion", label: "Devolver a adaptación", tone: "warn", needsNote: true });
  }
  if (status === "publicado" && who.isAdmin) steps.push({ to: "archivado", label: "Archivar", tone: "neutral", needsNote: false });
  return steps;
}

export type Issue = { level: "error" | "aviso"; code: string; detail: string };
export const hasErrors = (issues: Issue[]) => issues.some((i) => i.level === "error");
