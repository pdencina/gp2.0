import type { Row, Tables } from "./mysqldump";
import type { Rpc } from "./apply";

// Archivo histórico: guarda cada fila de la plataforma anterior tal cual, para no perder nada de lo que el modelo
// nuevo no recoge (ver supabase/v2/015_archivo_historico.sql).

/** Tablas que se guardan siempre: lo operativo y las copias fieles de lo que se tradujo. */
export const CORE_TABLES = [
  "users", "liders", "monitors", "coordinadors", "admins",
  "grupospequenos", "ciclos", "temporadas", "semanas", "gpequenoliders", "in_person_addresses",
  "inscripcions", "attendance_weeks", "recursos",
];
/** Datos que el modelo nuevo todavía no tiene (segunda etapa): se guardan para poder recuperarlos. */
export const UNMODELED_TABLES = ["matrimonios", "evaluations", "additional_ar_futbol", "tickets", "campus", "estados", "nacionalidads", "paises", "constants"];
/** Aportes económicos: solo si se pide expresamente. */
export const FINANCIAL_TABLES = ["loveofhouses", "banckings", "accounts"];
/** Las marcas de asistencia crudas (más de 500 mil filas, ya importadas en su forma útil): solo si se pide. */
export const RAW_ATTENDANCE_TABLES = ["asistencias"];

/** Nunca se guardan (sin valor histórico o con riesgo): claves de acceso y datos de sesión. */
const NEVER_COLUMNS = ["password", "remember_token", "api_token", "two_factor_secret", "two_factor_recovery_codes"];
const NEVER_TABLES = ["password_resets", "failed_jobs", "migrations", "personal_access_tokens", "sessions", "password_reset_tokens"];

export type ArchiveOptions = {
  /** Incluir aportes económicos (loveofhouses, banckings, accounts) */
  financial?: boolean;
  /** Incluir las marcas de asistencia sin procesar (muy pesado) */
  rawAttendance?: boolean;
  /** Incluir el documento de identidad (dni). Por defecto se omite: el modelo nuevo no lo usa. */
  dni?: boolean;
};

export type ArchiveBatch = { table: string; rows: Row[] };

export function tablesToArchive(opts: ArchiveOptions = {}): string[] {
  return [
    ...CORE_TABLES,
    ...UNMODELED_TABLES,
    ...(opts.financial ? FINANCIAL_TABLES : []),
    ...(opts.rawAttendance ? RAW_ATTENDANCE_TABLES : []),
  ].filter((t) => !NEVER_TABLES.includes(t));
}

/** Quita lo que nunca se guarda (claves de acceso y, por defecto, el documento de identidad). */
export function sanitize(row: Row, opts: ArchiveOptions = {}): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (NEVER_COLUMNS.includes(k)) continue;
    if (k === "dni" && !opts.dni) continue;
    out[k] = v;
  }
  return out;
}

/** Qué se va a guardar: una entrada por tabla presente en el respaldo. */
export function archivePlan(tables: Tables, opts: ArchiveOptions = {}): ArchiveBatch[] {
  const out: ArchiveBatch[] = [];
  for (const t of tablesToArchive(opts)) {
    const rows = tables[t];
    if (!rows || rows.length === 0) continue;
    out.push({ table: t, rows: rows.map((r) => sanitize(r, opts)) });
  }
  return out;
}

export type ArchiveResult = { table: string; leidas: number; nuevas: number }[];

/** Guarda el plan por lotes. Repetirlo no cambia nada (lo ya archivado no se sobrescribe). */
export async function archiveAll(plan: ArchiveBatch[], rpc: Rpc, log: (m: string) => void = () => {}, size = 500): Promise<ArchiveResult> {
  const result: ArchiveResult = [];
  // Antes de enviar datos: ¿está instalada la función de archivo? (se prueba con una lista vacía)
  try {
    await rpc("archive_legacy_rows", { p_table: "_prueba", p_rows: [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/404|PGRST202|Could not find/i.test(msg)) {
      throw new Error("Falta instalar el archivo histórico: ejecuta supabase/v2/015_archivo_historico.sql en el SQL Editor de Supabase y vuelve a intentar. No se envió ningún dato.");
    }
    throw e;
  }
  for (const { table, rows } of plan) {
    let nuevas = 0;
    for (let i = 0; i < rows.length; i += size) {
      const n = await rpc("archive_legacy_rows", { p_table: table, p_rows: rows.slice(i, i + size) });
      nuevas += typeof n === "number" ? n : 0;
      if (rows.length > size && (i / size) % 20 === 19) log(`  ${table} ${Math.min(i + size, rows.length)}/${rows.length}`);
    }
    log(`${table}: ${rows.length} leídas, ${nuevas} nuevas`);
    result.push({ table, leidas: rows.length, nuevas });
  }
  return result;
}
