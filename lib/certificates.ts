// Certificados y avance por año (supabase/v2/010_certificados.sql).

export type YearStatus = {
  formative_year: number;
  items_total: number;
  items_done: number;
  pct: number | null;
  min_pct: number;
  met: boolean;
  is_current: boolean;
};

export type CertificateRow = {
  id: string;
  code: string;
  kind: "etapa" | "programa";
  formative_year: number | null;
  status: "emitido" | "revocado";
  issued_at: string;
  curriculum_id: string;
  person_id: string;
  campus_id: string | null;
};

/** PostgREST entrega los decimales como número o como texto: se normaliza. */
export function normalizeYear(r: Record<string, unknown>): YearStatus {
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  return {
    formative_year: Number(r.formative_year),
    items_total: Number(r.items_total ?? 0),
    items_done: Number(r.items_done ?? 0),
    pct: num(r.pct),
    min_pct: Number(r.min_pct ?? 100),
    met: Boolean(r.met),
    is_current: Boolean(r.is_current),
  };
}

/** "A1B2C3D4E5F6" -> "A1B2-C3D4-E5F6" */
export const formatCode = (code: string) => (code.match(/.{1,4}/g) ?? [code]).join("-");

/** Acepta el código con o sin guiones, en cualquier mayúscula. */
export const cleanCode = (input: string) => input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

export const isValidCode = (input: string) => /^[A-F0-9]{12}$/.test(cleanCode(input));

export function certificateTitle(c: Pick<CertificateRow, "kind" | "formative_year">, program: string): string {
  return c.kind === "programa" ? `Programa completo · ${program}` : `${program} · Año ${c.formative_year}`;
}

/** Estado de la ruta de varios años en una frase. */
export function routeSummary(years: YearStatus[]): string {
  if (years.length === 0) return "";
  const metCount = years.filter((y) => y.met).length;
  if (metCount === years.length) return "Cumpliste todas las etapas.";
  const current = years.find((y) => y.is_current) ?? years.find((y) => !y.met) ?? years[0];
  return `Vas en el año ${current.formative_year} de ${years.length}; ${metCount} ${metCount === 1 ? "etapa cumplida" : "etapas cumplidas"}.`;
}

/** Quién puede abrir la pantalla de certificados. */
export const canOpenCertificates = (role: string, isPastor: boolean) => role === "admin" || role === "coordinador" || isPastor;
