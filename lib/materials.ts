// Biblioteca de materiales (supabase/v2/009_biblioteca.sql). Se amplía "resources": no hay otra tabla.

export const MATERIAL_KINDS = [
  { value: "libro", label: "Libro" },
  { value: "guia_participante", label: "Guía del participante" },
  { value: "guia_lider", label: "Guía del líder" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "presentacion", label: "Presentación" },
  { value: "actividad", label: "Actividad" },
  { value: "otro", label: "Otro" },
] as const;

export const AUDIENCES = [
  { value: "equipo", label: "Solo el equipo (líderes y coordinación)" },
  { value: "participantes", label: "También los participantes" },
] as const;

export const isValidKind = (v: string) => MATERIAL_KINDS.some((k) => k.value === v) || v === "pdf" || v === "";
export const isValidAudience = (v: string) => AUDIENCES.some((a) => a.value === v);
export const kindLabel = (v: string | null) => MATERIAL_KINDS.find((k) => k.value === v)?.label ?? v ?? "Otro";

/** Nombre apto para una ruta de Storage: sin tildes, espacios ni símbolos, conservando la extensión. */
export function safeFileName(name: string): string {
  const clean = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  const dot = clean.lastIndexOf(".");
  const ext = dot > 0 ? clean.slice(dot).slice(0, 8) : "";
  const stem = (dot > 0 ? clean.slice(0, dot) : clean).slice(0, 80).replace(/-+$/, "") || "archivo";
  return `${stem}${ext}`;
}

export function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
